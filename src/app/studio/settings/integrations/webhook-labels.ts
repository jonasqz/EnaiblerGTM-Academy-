import type { StudioText } from "@/core/i18n/studio/translator";
import type { WEBHOOK_EVENT_GROUPS, WebhookEvent } from "@/core/webhooks/events";

export function webhookGroupLabel(t: StudioText, group: keyof typeof WEBHOOK_EVENT_GROUPS): string {
  return t.t(`settings.webhooks.group.${group}`);
}

export function webhookEventLabel(t: StudioText, event: WebhookEvent): string {
  return t.t(`settings.webhooks.event.${event}`);
}

/** What the receiving side answered (see server/webhooks.ts). */
export function describeWebhookResult(t: StudioText, result: string | null): string {
  if (!result) return t.t("settings.webhooks.result.waiting");
  if (result === "blocked") return t.t("settings.webhooks.result.blocked");
  if (result === "unreachable") return t.t("settings.webhooks.result.unreachable");
  if (result === "paused") return t.t("settings.webhooks.result.paused");
  const code = Number(result);
  if (code >= 200 && code < 300) {
    return t.t("settings.webhooks.result.delivered", { code: String(code) });
  }
  return t.t("settings.webhooks.result.answered", { code: result });
}
