import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { assertTenantKey, tenantPrefix } from "@/core/storage/keys";
import { env } from "@/server/env";

/**
 * S3-compatible object storage, self-hosted on Coolify (MinIO, Garage or
 * SeaweedFS: open decision #3). Files are private; browsers get short-lived
 * signed URLs. Keys come from core/storage/keys.ts.
 */
let client: S3Client | null = null;

function s3(): { client: S3Client; bucket: string } {
  const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env();
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    throw new Error("Object storage is not configured (S3_* variables)");
  }
  client ??= new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
  });
  return { client, bucket: S3_BUCKET };
}

export async function putObject(
  tenantId: string,
  key: string,
  body: Uint8Array | string,
  contentType: string,
): Promise<void> {
  assertTenantKey(tenantId, key);
  const { client, bucket } = s3();
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
  );
}

export async function signedDownloadUrl(
  tenantId: string,
  key: string,
  options: { expiresInSeconds?: number; downloadName?: string } = {},
): Promise<string> {
  assertTenantKey(tenantId, key);
  const { client, bucket } = s3();
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
  const { client, bucket } = s3();
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    {
      expiresIn: expiresInSeconds,
    },
  );
}

/** Deletes everything under a tenant sub-prefix, e.g. a learner's submissions (data rights, brief §9). */
export async function deleteUnderPrefix(tenantId: string, subPrefix: string): Promise<number> {
  const prefix = `${tenantPrefix(tenantId)}${subPrefix}`;
  assertTenantKey(tenantId, prefix);
  const { client, bucket } = s3();
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
