import { CircleCheck, CircleX, Clock, KeyRound, Pause, Webhook } from "lucide-react";
import type { Metadata } from "next";

import {
  deleteWebhookAction,
  retryDeliveryAction,
  revokeApiKeyAction,
  setWebhookEnabledAction,
} from "@/app/studio/settings/integrations/actions";
import { EmbedSnippet } from "@/app/studio/settings/integrations/embed-snippet";
import {
  ImportForm,
  NewApiKeyForm,
  NewWebhookForm,
  TestWebhookButton,
} from "@/app/studio/settings/integrations/forms";
import {
  describeWebhookResult,
  WEBHOOK_EVENT_LABELS,
} from "@/app/studio/settings/integrations/webhook-labels";
import { LANGUAGE_NAMES } from "@/components/studio/language-names";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { tenantTranslator } from "@/core/i18n/tenant-translator";
import { isWebhookEvent, MAX_DELIVERY_ATTEMPTS, MAX_WEBHOOKS } from "@/core/webhooks/events";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { listApiKeys } from "@/server/api-keys";
import { academyOrigin, academyUrl } from "@/server/platform/config";
import { listWebhooks, type StudioWebhook } from "@/server/webhooks";

export const metadata: Metadata = { title: "Integrations" };

const when = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const at = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

const PAYLOAD_EXAMPLE = {
  id: "5b0c9a4e-6f1d-4c1e-9d3a-2f7c1b8e0a11",
  type: "course_completed",
  created_at: "2026-09-27T08:15:00.000Z",
  academy: { slug: "acme", name: "Acme Academy" },
  learner: { id: "3f9e2d7a-0b8c-5e41-a6f2-9c1d4b7e3a50" },
  course: { id: "c1a5e0f2-7d3b-4f9a-8e6c-0b2d4f6a8c10", slug: "validation-lab" },
  locale: "de",
  utm: { utm_source: "linkedin", utm_campaign: "autumn" },
};

const VERIFY_EXAMPLE = `import { createHmac, timingSafeEqual } from "node:crypto";

// rawBody: the request body exactly as received, before JSON parsing.
export function isFromAcademy(signatureHeader, rawBody, secret) {
  const parts = Object.fromEntries(signatureHeader.split(",").map((part) => part.split("=")));
  const expected = createHmac("sha256", secret).update(\`\${parts.t}.\${rawBody}\`).digest();
  const given = Buffer.from(parts.v1 ?? "", "hex");
  const fresh = Math.abs(Date.now() / 1000 - Number(parts.t)) < 300;
  return fresh && given.length === expected.length && timingSafeEqual(given, expected);
}`;

function DeliveryState(props: { delivery: StudioWebhook["recent"][number] }) {
  const { delivery } = props;
  if (delivery.status === "delivered") {
    return (
      <Badge tone="good" icon={CircleCheck}>
        {describeWebhookResult(delivery.lastResult)}
      </Badge>
    );
  }
  if (delivery.status === "failed") {
    return (
      <Badge tone="critical" icon={CircleX}>
        {describeWebhookResult(delivery.lastResult)}
      </Badge>
    );
  }
  return (
    <Badge tone="info" icon={Clock}>
      {delivery.attempts === 0
        ? "Queued"
        : `${describeWebhookResult(delivery.lastResult)}, retry ${delivery.attempts + 1} of ${MAX_DELIVERY_ATTEMPTS} at ${at.format(delivery.nextAttemptAt)}`}
    </Badge>
  );
}

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

/** Connecting other tools: the credential import and API keys (brief §6), webhooks (§10). */
export default async function IntegrationsPage() {
  const { tenant } = await requireCapability("academy.manage", "/studio/settings/integrations");
  const [keys, webhooks] = await Promise.all([
    listApiKeys(getDb(), tenant.id),
    listWebhooks(getDb(), tenant.id),
  ]);
  const endpoint = academyUrl(tenant, "/api/credentials/import");
  const embedLanguages = tenant.settings.locales.map((code) => {
    const t = tenantTranslator(tenant, code);
    const academy = tenant.settings.author_display_name;
    return {
      code,
      label: LANGUAGE_NAMES[code],
      title: tenant.settings.features.paths
        ? t.t("embed.title", { academy })
        : t.t("embed.coursesTitle", { academy }),
    };
  });

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

      <section aria-labelledby="embed-heading" className="card-flat space-y-4 p-5 sm:p-6">
        <div>
          <h2 id="embed-heading" className="text-lg font-semibold">
            Embed on your website
          </h2>
          <p className="text-sm text-muted">
            Show your {tenant.settings.features.paths ? "paths" : "courses"} on your own website.
            Visitors pick one and continue in the academy in a new tab. The language and utm_*
            values come along, so the dashboard shows where sign-ups come from. Nothing is stored in
            the visitor&apos;s browser.
          </p>
        </div>
        <EmbedSnippet
          origin={academyOrigin(tenant.primaryDomain).origin}
          languages={embedLanguages}
        />
      </section>

      <section aria-labelledby="webhooks-heading" className="card-flat space-y-4 p-5 sm:p-6">
        <div>
          <h2 id="webhooks-heading" className="text-lg font-semibold">
            Webhooks
          </h2>
          <p className="text-sm text-muted">
            Tell your own tools (a CRM, a newsletter tool, n8n or Zapier) what happens in the
            academy, within a minute. Learners appear under a stable pseudonymous id. Their e-mail
            address and name are only included once they agreed to be contacted, and in consent
            events.
          </p>
        </div>
        {webhooks.map((hook) => (
          <article
            key={hook.id}
            aria-label={`Webhook to ${hook.url}`}
            className="space-y-3 rounded-card border border-line p-4"
          >
            <div className="flex flex-wrap items-center gap-3">
              <Webhook aria-hidden size={18} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold">
                {hook.url}
              </span>
              {hook.enabled ? (
                <Badge tone="good" icon={CircleCheck}>
                  Active
                </Badge>
              ) : (
                <Badge tone="warning" icon={Pause}>
                  Paused
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted">
              {hook.events
                .filter(isWebhookEvent)
                .map((event) => WEBHOOK_EVENT_LABELS[event])
                .join(" · ")}
            </p>
            {hook.recent.length > 0 && (
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Latest deliveries</caption>
                <thead className="text-xs text-muted">
                  <tr>
                    <th scope="col" className="py-1 pr-3 font-semibold">
                      Event
                    </th>
                    <th scope="col" className="py-1 pr-3 font-semibold">
                      Time
                    </th>
                    <th scope="col" className="py-1 font-semibold">
                      Result
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {hook.recent.map((delivery) => (
                    <tr key={delivery.id}>
                      <td className="py-2 pr-3">
                        {isWebhookEvent(delivery.event)
                          ? WEBHOOK_EVENT_LABELS[delivery.event]
                          : delivery.event}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-muted">
                        {at.format(delivery.createdAt)}
                      </td>
                      <td className="py-2">
                        <span className="flex flex-wrap items-center gap-2">
                          <DeliveryState delivery={delivery} />
                          {delivery.status === "failed" && delivery.event !== "ping" && (
                            <form action={retryDeliveryAction}>
                              <input type="hidden" name="id" value={delivery.id} />
                              <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="…">
                                Send again
                              </SubmitButton>
                            </form>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <TestWebhookButton id={hook.id} />
              <form action={setWebhookEnabledAction}>
                <input type="hidden" name="id" value={hook.id} />
                <input type="hidden" name="enabled" value={hook.enabled ? "0" : "1"} />
                <SubmitButton className="btn btn-ghost btn-sm">
                  {hook.enabled ? "Pause" : "Resume"}
                </SubmitButton>
              </form>
              <form action={deleteWebhookAction}>
                <input type="hidden" name="id" value={hook.id} />
                <SubmitButton
                  className="btn btn-ghost btn-sm"
                  confirm={`Delete the webhook to ${hook.url}? Deliveries still waiting are dropped.`}
                >
                  Delete
                </SubmitButton>
              </form>
            </div>
          </article>
        ))}
        <NewWebhookForm startOpen={webhooks.length === 0} full={webhooks.length >= MAX_WEBHOOKS} />
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">
            What arrives and how to check it
          </summary>
          <div className="mt-3 space-y-3">
            <p>
              A <code>POST</code> with a JSON body like this. <code>X-Enaibler-Event</code> names
              the event and <code>X-Enaibler-Delivery</code> is unique per delivery: the same event
              can arrive twice, so skip ids you have seen.
            </p>
            <pre className="overflow-auto rounded-control bg-subtle p-3 font-mono text-xs">
              {JSON.stringify(PAYLOAD_EXAMPLE, null, 2)}
            </pre>
            <p>
              <code>X-Enaibler-Signature</code> is <code>t=&lt;unix time&gt;,v1=&lt;hex&gt;</code>:
              an HMAC-SHA256 of <code>&lt;t&gt;.&lt;body&gt;</code> with the webhook&apos;s signing
              secret. For example in Node.js:
            </p>
            <pre className="overflow-auto rounded-control bg-subtle p-3 font-mono text-xs">
              {VERIFY_EXAMPLE}
            </pre>
            <p>
              Answer with a 2xx status within 10 seconds. Otherwise we try again after 1 and 5
              minutes, half an hour, then 2, 6, 12 and 24 hours. Delivery logs are kept for 30 days.
            </p>
          </div>
        </details>
      </section>
    </div>
  );
}
