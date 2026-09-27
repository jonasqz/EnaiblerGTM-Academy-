"use server";

import { revalidatePath } from "next/cache";

import { text } from "@/app/studio/form-data";
import { credentialImportSchema } from "@/core/credentials/import";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { createApiKey, revokeApiKey } from "@/server/api-keys";
import { importCredentials, type ImportOutcome } from "@/server/credentials/import";

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
