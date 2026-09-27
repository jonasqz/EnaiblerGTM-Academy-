import type { Readable } from "node:stream";

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { assertTenantKey, tenantPrefix } from "@/core/storage/keys";
import { isProduction } from "@/server/env";

/**
 * S3-compatible object storage, self-hosted on Coolify (MinIO, Garage or
 * SeaweedFS: open decision #3). Files are private; browsers get short-lived
 * signed URLs. Keys come from core/storage/keys.ts.
 */
let client: S3Client | null = null;
let bucketReady: Promise<void> | null = null;

/**
 * Read by name rather than through env(): the worker uses storage too, and it
 * has no auth secret (env() requires one).
 */
function storageEnv() {
  const value = (name: string) => process.env[name]?.trim() || undefined;
  return {
    endpoint: value("S3_ENDPOINT"),
    region: value("S3_REGION") ?? "eu-central-1",
    bucket: value("S3_BUCKET"),
    accessKeyId: value("S3_ACCESS_KEY_ID"),
    secretAccessKey: value("S3_SECRET_ACCESS_KEY"),
  };
}

export function storageConfigured(): boolean {
  const config = storageEnv();
  return Boolean(config.endpoint && config.bucket && config.accessKeyId && config.secretAccessKey);
}

/** Development and tests create the bucket on first use; production buckets are set up once (docs/deployment.md). */
async function ready(): Promise<{ client: S3Client; bucket: string }> {
  const storage = s3();
  if (!isProduction() && process.env.S3_CREATE_BUCKET !== "false") {
    bucketReady ??= storage.client
      .send(new HeadBucketCommand({ Bucket: storage.bucket }))
      .then(
        () => undefined,
        async () => {
          await storage.client.send(new CreateBucketCommand({ Bucket: storage.bucket }));
        },
      )
      .catch((error: unknown) => {
        bucketReady = null;
        throw error;
      });
    await bucketReady;
  }
  return storage;
}

function s3(): { client: S3Client; bucket: string } {
  const { endpoint, region, bucket, accessKeyId, secretAccessKey } = storageEnv();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("Object storage is not configured (S3_* variables)");
  }
  client ??= new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  return { client, bucket };
}

export async function putObject(
  tenantId: string,
  key: string,
  body: Uint8Array | string,
  contentType: string,
): Promise<void> {
  assertTenantKey(tenantId, key);
  const { client, bucket } = await ready();
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
  );
}

/** Streams large uploads (recordings) in parts instead of holding them in memory. */
export async function putObjectStream(
  tenantId: string,
  key: string,
  body: Readable,
  contentType: string,
): Promise<void> {
  assertTenantKey(tenantId, key);
  const { client, bucket } = await ready();
  await new Upload({
    client,
    params: { Bucket: bucket, Key: key, Body: body, ContentType: contentType },
    queueSize: 2,
    partSize: 8 * 1024 * 1024,
  }).done();
}

export interface StoredObject {
  body: ReadableStream<Uint8Array>;
  contentLength: number | null;
  /** Set for range requests, e.g. "bytes 0-1023/4096". */
  contentRange: string | null;
}

/** Reads an object, or one byte range of it (video seeking). */
export async function getObject(
  tenantId: string,
  key: string,
  range?: string,
): Promise<StoredObject> {
  assertTenantKey(tenantId, key);
  const { client, bucket } = await ready();
  const result = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key, ...(range ? { Range: range } : {}) }),
  );
  if (!result.Body) throw new Error(`Object ${key} has no body`);
  return {
    body: result.Body.transformToWebStream() as ReadableStream<Uint8Array>,
    contentLength: result.ContentLength ?? null,
    contentRange: result.ContentRange ?? null,
  };
}

export async function getObjectBytes(tenantId: string, key: string): Promise<Uint8Array> {
  assertTenantKey(tenantId, key);
  const { client, bucket } = await ready();
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!result.Body) throw new Error(`Object ${key} has no body`);
  return result.Body.transformToByteArray();
}

export async function deleteObject(tenantId: string, key: string): Promise<void> {
  assertTenantKey(tenantId, key);
  const { client, bucket } = await ready();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function signedDownloadUrl(
  tenantId: string,
  key: string,
  options: { expiresInSeconds?: number; downloadName?: string } = {},
): Promise<string> {
  assertTenantKey(tenantId, key);
  const { client, bucket } = await ready();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(options.downloadName
      ? {
          ResponseContentDisposition: `attachment; filename="${options.downloadName.replace(/["\\\r\n]/g, "")}"`,
        }
      : {}),
  });
  return getSignedUrl(client, command, { expiresIn: options.expiresInSeconds ?? 300 });
}

export async function signedUploadUrl(
  tenantId: string,
  key: string,
  contentType: string,
  expiresInSeconds = 300,
): Promise<string> {
  assertTenantKey(tenantId, key);
  const { client, bucket } = await ready();
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    {
      expiresIn: expiresInSeconds,
    },
  );
}

/** Every object key under a tenant sub-prefix, page by page (an academy's export). */
export async function* listUnderPrefix(
  tenantId: string,
  subPrefix: string,
): AsyncGenerator<string> {
  const prefix = `${tenantPrefix(tenantId)}${subPrefix}`;
  assertTenantKey(tenantId, prefix);
  const { client, bucket } = await ready();
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const item of page.Contents ?? []) if (item.Key) yield item.Key;
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
}

/** Deletes everything under a tenant sub-prefix, e.g. a learner's submissions (data rights, brief §9). */
export async function deleteUnderPrefix(tenantId: string, subPrefix: string): Promise<number> {
  const prefix = `${tenantPrefix(tenantId)}${subPrefix}`;
  assertTenantKey(tenantId, prefix);
  const { client, bucket } = await ready();
  let deleted = 0;
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    const keys = (page.Contents ?? []).flatMap((item) => (item.Key ? [{ Key: item.Key }] : []));
    if (keys.length > 0) {
      await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys } }));
      deleted += keys.length;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return deleted;
}
