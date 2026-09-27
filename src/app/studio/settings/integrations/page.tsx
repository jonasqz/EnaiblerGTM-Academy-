import { CircleCheck, CircleX, Clock, KeyRound, Pause, Webhook } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

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
  webhookEventLabel,
} from "@/app/studio/settings/integrations/webhook-labels";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { languageName } from "@/core/i18n/studio/helpers";
import type { StudioText } from "@/core/i18n/studio/translator";
import { tenantTranslator } from "@/core/i18n/tenant-translator";
import { isWebhookEvent, MAX_DELIVERY_ATTEMPTS, MAX_WEBHOOKS } from "@/core/webhooks/events";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { listApiKeys } from "@/server/api-keys";
import { academyOrigin, academyUrl } from "@/server/platform/config";
import { getStudioText } from "@/server/studio-text";
import { listWebhooks, type StudioWebhook } from "@/server/webhooks";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("settings.tab.integrations") };
}

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

/** A catalogue text with its {placeholders} shown as code: header and field names stay literal. */
function withCode(text: string, code: Record<string, string>): ReactNode[] {
  return text
    .split(/\{(\w+)\}/)
    .map((part, index) =>
      index % 2 === 0 ? part : <code key={index}>{code[part] ?? `{${part}}`}</code>,
    );
}

function DeliveryState(props: { t: StudioText; delivery: StudioWebhook["recent"][number] }) {
  const { t, delivery } = props;
  if (delivery.status === "delivered") {
    return (
      <Badge tone="good" icon={CircleCheck}>
        {describeWebhookResult(t, delivery.lastResult)}
      </Badge>
    );
  }
  if (delivery.status === "failed") {
    return (
      <Badge tone="critical" icon={CircleX}>
        {describeWebhookResult(t, delivery.lastResult)}
      </Badge>
    );
  }
  return (
    <Badge tone="info" icon={Clock}>
      {delivery.attempts === 0
        ? t.t("settings.webhooks.queued")
        : t.t("settings.webhooks.retry", {
            result: describeWebhookResult(t, delivery.lastResult),
            attempt: delivery.attempts + 1,
            max: MAX_DELIVERY_ATTEMPTS,
            time: t.date(delivery.nextAttemptAt, "dateTime"),
          })}
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
  const t = await getStudioText();
  const [keys, webhooks] = await Promise.all([
    listApiKeys(getDb(), tenant.id),
    listWebhooks(getDb(), tenant.id),
  ]);
  const endpoint = academyUrl(tenant, "/api/credentials/import");
  const embedLanguages = tenant.settings.locales.map((code) => {
    // The embed speaks to the academy's visitors: its title comes from the learner messages.
    const learnerText = tenantTranslator(tenant, code);
    const academy = tenant.settings.author_display_name;
    return {
      code,
      label: languageName(t, code),
      title: tenant.settings.features.paths
        ? learnerText.t("embed.title", { academy })
        : learnerText.t("embed.coursesTitle", { academy }),
    };
  });

  return (
    <div className="max-w-3xl space-y-6">
      <section aria-labelledby="import-heading" className="card-flat space-y-4 p-5 sm:p-6">
        <div>
          <h2 id="import-heading" className="text-lg font-semibold">
            {t.t("settings.import.heading")}
          </h2>
          <p className="text-sm text-muted">{t.t("settings.import.intro")}</p>
        </div>
        <ImportForm />
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">
            {t.t("settings.import.format")}
          </summary>
          <div className="mt-3 space-y-3">
            <p>
              {withCode(t.t("settings.import.formatBody"), {
                path: "path_slug",
                level: "level_at_issue",
                publicId: "public_id",
              })}
            </p>
            <pre className="overflow-auto rounded-control bg-subtle p-3 font-mono text-xs">
              {JSON.stringify(EXAMPLE, null, 2)}
            </pre>
            <p>{t.t("settings.import.api")}</p>
            <pre className="overflow-auto rounded-control bg-subtle p-3 font-mono text-xs">
              {`curl -X POST ${endpoint} \\\n  -H "Authorization: Bearer enk_…" \\\n  -H "Content-Type: application/json" \\\n  --data @certificates.json`}
            </pre>
          </div>
        </details>
      </section>

      <section aria-labelledby="keys-heading" className="card-flat space-y-4 p-5 sm:p-6">
        <div>
          <h2 id="keys-heading" className="text-lg font-semibold">
            {t.t("settings.keys.heading")}
          </h2>
          <p className="text-sm text-muted">{t.t("settings.keys.intro")}</p>
        </div>
        {keys.length > 0 && (
          <ul className="divide-y divide-line">
            {keys.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <KeyRound aria-hidden size={18} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{key.name}</span>
                  <span className="text-muted">
                    <code>{key.prefix}…</code> ·{" "}
                    {t.t("settings.keys.created", { date: t.date(key.createdAt) })} ·{" "}
                    {key.lastUsedAt
                      ? t.t("settings.keys.lastUsed", { date: t.date(key.lastUsedAt) })
                      : t.t("settings.keys.notUsed")}
                  </span>
                </span>
                <form action={revokeApiKeyAction}>
                  <input type="hidden" name="id" value={key.id} />
                  <SubmitButton
                    className="btn btn-ghost btn-sm"
                    confirm={t.t("settings.keys.revokeConfirm", { name: key.name })}
                  >
                    {t.t("settings.keys.revoke")}
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
            {t.t("settings.embed.heading")}
          </h2>
          <p className="text-sm text-muted">
            {t.t(
              tenant.settings.features.paths
                ? "settings.embed.showPaths"
                : "settings.embed.showCourses",
            )}{" "}
            {t.t("settings.embed.intro")}
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
            {t.t("settings.webhooks.heading")}
          </h2>
          <p className="text-sm text-muted">{t.t("settings.webhooks.intro")}</p>
        </div>
        {webhooks.map((hook) => (
          <article
            key={hook.id}
            aria-label={t.t("settings.webhooks.label", { url: hook.url })}
            className="space-y-3 rounded-card border border-line p-4"
          >
            <div className="flex flex-wrap items-center gap-3">
              <Webhook aria-hidden size={18} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold">
                {hook.url}
              </span>
              {hook.enabled ? (
                <Badge tone="good" icon={CircleCheck}>
                  {t.t("settings.webhooks.active")}
                </Badge>
              ) : (
                <Badge tone="warning" icon={Pause}>
                  {t.t("settings.webhooks.paused")}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted">
              {hook.events
                .filter(isWebhookEvent)
                .map((event) => webhookEventLabel(t, event))
                .join(" · ")}
            </p>
            {hook.recent.length > 0 && (
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{t.t("settings.webhooks.deliveries")}</caption>
                <thead className="text-xs text-muted">
                  <tr>
                    <th scope="col" className="py-1 pr-3 font-semibold">
                      {t.t("settings.webhooks.column.event")}
                    </th>
                    <th scope="col" className="py-1 pr-3 font-semibold">
                      {t.t("settings.webhooks.column.time")}
                    </th>
                    <th scope="col" className="py-1 font-semibold">
                      {t.t("settings.webhooks.column.result")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {hook.recent.map((delivery) => (
                    <tr key={delivery.id}>
                      <td className="py-2 pr-3">
                        {isWebhookEvent(delivery.event)
                          ? webhookEventLabel(t, delivery.event)
                          : delivery.event}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-muted">
                        {t.date(delivery.createdAt, "dateTime")}
                      </td>
                      <td className="py-2">
                        <span className="flex flex-wrap items-center gap-2">
                          <DeliveryState t={t} delivery={delivery} />
                          {delivery.status === "failed" && delivery.event !== "ping" && (
                            <form action={retryDeliveryAction}>
                              <input type="hidden" name="id" value={delivery.id} />
                              <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="…">
                                {t.t("settings.webhooks.sendAgain")}
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
                  {hook.enabled ? t.t("settings.webhooks.pause") : t.t("settings.webhooks.resume")}
                </SubmitButton>
              </form>
              <form action={deleteWebhookAction}>
                <input type="hidden" name="id" value={hook.id} />
                <SubmitButton
                  className="btn btn-ghost btn-sm"
                  confirm={t.t("settings.webhooks.deleteConfirm", { url: hook.url })}
                >
                  {t.t("common.delete")}
                </SubmitButton>
              </form>
            </div>
          </article>
        ))}
        <NewWebhookForm startOpen={webhooks.length === 0} full={webhooks.length >= MAX_WEBHOOKS} />
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">
            {t.t("settings.webhooks.docs")}
          </summary>
          <div className="mt-3 space-y-3">
            <p>
              {withCode(t.t("settings.webhooks.docsBody"), {
                post: "POST",
                event: "X-Enaibler-Event",
                delivery: "X-Enaibler-Delivery",
              })}
            </p>
            <pre className="overflow-auto rounded-control bg-subtle p-3 font-mono text-xs">
              {JSON.stringify(PAYLOAD_EXAMPLE, null, 2)}
            </pre>
            <p>
              {withCode(t.t("settings.webhooks.docsSignature"), {
                signature: "X-Enaibler-Signature",
                format: "t=<unix time>,v1=<hex>",
                signed: "<t>.<body>",
              })}
            </p>
            <pre className="overflow-auto rounded-control bg-subtle p-3 font-mono text-xs">
              {VERIFY_EXAMPLE}
            </pre>
            <p>{t.t("settings.webhooks.docsRetries")}</p>
          </div>
        </details>
      </section>
    </div>
  );
}
