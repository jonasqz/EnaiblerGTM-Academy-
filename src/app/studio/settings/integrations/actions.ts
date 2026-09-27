"use server";

import { revalidatePath } from "next/cache";

import { text } from "@/app/studio/form-data";
import { credentialImportSchema } from "@/core/credentials/import";
import {
  isWebhookEvent,
  MAX_WEBHOOKS,
  webhookUrlIssue,
  type WebhookEvent,
} from "@/core/webhooks/events";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { createApiKey, revokeApiKey } from "@/server/api-keys";
import { isAllowedTestHost } from "@/server/brand/safe-fetch";
import { importCredentials, type ImportOutcome } from "@/server/credentials/import";
import {
  createWebhook,
  deleteWebhook,
  retryDelivery,
  sendTestWebhook,
  setWebhookEnabled,
} from "@/server/webhooks";

const PAGE = "/studio/settings/integrations";

export type NewKeyState = { key?: string; errors?: string[] };

export async function createApiKeyAction(_: NewKeyState, formData: FormData): Promise<NewKeyState> {
  const { tenant, viewer } = await requireCapability("academy.manage", PAGE);
  const name = text(formData, "name");
  if (!name) return { errors: ["Give the key a name, e.g. the tool that uses it."] };
  const { key } = await createApiKey(getDb(), tenant.id, {
    name,
    scopes: ["credentials.import"],
    createdBy: viewer.userId,
  });
  revalidatePath(PAGE);
  return { key };
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const { tenant } = await requireCapability("academy.manage", PAGE);
  await revokeApiKey(getDb(), tenant.id, text(formData, "id"));
  revalidatePath(PAGE);
}

export type ImportState = {
  errors?: string[];
  results?: Array<{ external_id: string } & ImportOutcome>;
};

/** The same import as the API, from a JSON file uploaded in the Studio. */
export async function importCredentialsAction(
  _: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const { tenant } = await requireCapability("academy.manage", PAGE);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { errors: ["Choose a JSON file."] };
  let body: unknown;
  try {
    body = JSON.parse(await file.text());
  } catch {
    return { errors: ["The file is not valid JSON."] };
  }
  const parsed = credentialImportSchema.safeParse(body);
  if (!parsed.success) {
    return {
      errors: parsed.error.issues
        .slice(0, 8)
        .map((issue) => `${issue.path.join(".") || "file"}: ${issue.message}`),
    };
  }
  return { results: await importCredentials(getDb(), tenant, parsed.data.credentials) };
}

export type NewWebhookState = { secret?: string; errors?: string[] };

export async function createWebhookAction(
  _: NewWebhookState,
  formData: FormData,
): Promise<NewWebhookState> {
  const { tenant, viewer } = await requireCapability("academy.manage", PAGE);
  const url = text(formData, "url");
  const events = formData
    .getAll("events")
    .map(String)
    .filter((name): name is WebhookEvent => isWebhookEvent(name) && name !== "ping");
  const errors: string[] = [];
  const issue = webhookUrlIssue(url, { allowHttp: isAllowedTestHost(url) });
  if (issue === "invalid") {
    errors.push("Enter the full address of your endpoint, e.g. https://hooks.example.com/academy.");
  }
  if (issue === "https") errors.push("Use an https address: deliveries carry learner data.");
  if (events.length === 0) errors.push("Choose at least one event.");
  if (errors.length > 0) return { errors };
  const created = await createWebhook(getDb(), tenant.id, {
    url,
    events,
    createdBy: viewer.userId,
  });
  if (!created.ok) return { errors: [`An academy can have up to ${MAX_WEBHOOKS} webhooks.`] };
  revalidatePath(PAGE);
  return { secret: created.secret };
}

export async function setWebhookEnabledAction(formData: FormData): Promise<void> {
  const { tenant } = await requireCapability("academy.manage", PAGE);
  await setWebhookEnabled(
    getDb(),
    tenant.id,
    text(formData, "id"),
    text(formData, "enabled") === "1",
  );
  revalidatePath(PAGE);
}

export async function deleteWebhookAction(formData: FormData): Promise<void> {
  const { tenant } = await requireCapability("academy.manage", PAGE);
  await deleteWebhook(getDb(), tenant.id, text(formData, "id"));
  revalidatePath(PAGE);
}

export type TestWebhookState = { delivered?: boolean; result?: string };

export async function testWebhookAction(
  _: TestWebhookState,
  formData: FormData,
): Promise<TestWebhookState> {
  const { tenant } = await requireCapability("academy.manage", PAGE);
  const sent = await sendTestWebhook(getDb(), tenant.id, text(formData, "id"));
  revalidatePath(PAGE);
  return sent ?? {};
}

export async function retryDeliveryAction(formData: FormData): Promise<void> {
  const { tenant } = await requireCapability("academy.manage", PAGE);
  await retryDelivery(getDb(), tenant.id, text(formData, "id"));
  revalidatePath(PAGE);
}
