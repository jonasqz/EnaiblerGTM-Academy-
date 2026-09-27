import { KeyRound } from "lucide-react";
import type { Metadata } from "next";

import { revokeApiKeyAction } from "@/app/studio/settings/integrations/actions";
import { ImportForm, NewApiKeyForm } from "@/app/studio/settings/integrations/forms";
import { SubmitButton } from "@/components/ui/submit-button";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { listApiKeys } from "@/server/api-keys";
import { academyUrl } from "@/server/platform/config";

export const metadata: Metadata = { title: "Integrations" };

const when = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

const EXAMPLE = {
  credentials: [
    {
      external_id: "lw-1042",
      source_platform: "learnworlds",
      learner_email: "ada@example.com",
      display_name: "Ada Lovelace",
      course_slug: "validation-lab",
      artifact_name: "Validated idea brief",
      issued_at: "2026-05-14",
      visibility: "private",
    },
  ],
};

/** Moving in from another platform: API keys and the credential import (brief §6). */
export default async function IntegrationsPage() {
  const { tenant } = await requireCapability("academy.manage", "/studio/settings/integrations");
  const keys = await listApiKeys(getDb(), tenant.id);
  const endpoint = academyUrl(tenant, "/api/credentials/import");

  return (
    <div className="max-w-3xl space-y-6">
      <section aria-labelledby="import-heading" className="card-flat space-y-4 p-5 sm:p-6">
        <div>
          <h2 id="import-heading" className="text-lg font-semibold">
            Import certificates from another platform
          </h2>
          <p className="text-sm text-muted">
            Learners keep what they earned before: each certificate keeps its date, stays private
            unless it was public before, and shows where it was issued. Running the same file again
            changes nothing. Courses must exist here first (same slug).
          </p>
        </div>
        <ImportForm />
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">File format and API</summary>
          <div className="mt-3 space-y-3">
            <p>
              A JSON file like this (up to 1,000 per file). Optional: <code>path_slug</code>,{" "}
              <code>level_at_issue</code>, and <code>public_id</code> to keep links that were
              already shared working.
            </p>
            <pre className="overflow-auto rounded-control bg-subtle p-3 font-mono text-xs">
              {JSON.stringify(EXAMPLE, null, 2)}
            </pre>
            <p>The same body can be sent by a script with an API key:</p>
            <pre className="overflow-auto rounded-control bg-subtle p-3 font-mono text-xs">
              {`curl -X POST ${endpoint} \\\n  -H "Authorization: Bearer enk_…" \\\n  -H "Content-Type: application/json" \\\n  --data @certificates.json`}
            </pre>
          </div>
        </details>
      </section>

      <section aria-labelledby="keys-heading" className="card-flat space-y-4 p-5 sm:p-6">
        <div>
          <h2 id="keys-heading" className="text-lg font-semibold">
            API keys
          </h2>
          <p className="text-sm text-muted">
            For your own tools. A key works only for this academy and only for importing
            certificates.
          </p>
        </div>
        {keys.length > 0 && (
          <ul className="divide-y divide-line">
            {keys.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <KeyRound aria-hidden size={18} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{key.name}</span>
                  <span className="text-muted">
                    <code>{key.prefix}…</code> · created {when.format(key.createdAt)} ·{" "}
                    {key.lastUsedAt ? `last used ${when.format(key.lastUsedAt)}` : "not used yet"}
                  </span>
                </span>
                <form action={revokeApiKeyAction}>
                  <input type="hidden" name="id" value={key.id} />
                  <SubmitButton
                    className="btn btn-ghost btn-sm"
                    confirm={`Revoke "${key.name}"? Tools using it stop working.`}
                  >
                    Revoke
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
        <NewApiKeyForm />
      </section>
    </div>
  );
}
