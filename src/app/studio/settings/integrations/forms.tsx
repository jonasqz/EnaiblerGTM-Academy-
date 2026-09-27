"use client";

import { CircleCheck, CircleX, KeyRound, Send, Upload, Webhook } from "lucide-react";

import {
  createApiKeyAction,
  createWebhookAction,
  importCredentialsAction,
  testWebhookAction,
  type ImportState,
  type NewKeyState,
  type NewWebhookState,
  type TestWebhookState,
} from "@/app/studio/settings/integrations/actions";
import {
  describeWebhookResult,
  webhookEventLabel,
  webhookGroupLabel,
} from "@/app/studio/settings/integrations/webhook-labels";
import { FormFeedback } from "@/components/studio/form-feedback";
import { useStudioText } from "@/components/studio/studio-text";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import { WEBHOOK_EVENT_GROUPS } from "@/core/webhooks/events";

export function NewApiKeyForm() {
  const t = useStudioText();
  const { state, pending, onSubmit } = useActionForm<NewKeyState>(createApiKeyAction, {});
  return (
    <div className="space-y-3">
      <form onSubmit={onSubmit} className="flex flex-wrap gap-2">
        <label htmlFor="key-name" className="sr-only">
          {t.t("settings.keys.nameLabel")}
        </label>
        <input
          id="key-name"
          name="name"
          className="input min-w-60 flex-1"
          placeholder={t.t("settings.keys.namePlaceholder")}
          maxLength={80}
        />
        <SubmitButton
          pending={pending}
          pendingLabel={t.t("settings.keys.creating")}
          className="btn btn-secondary"
        >
          <KeyRound aria-hidden size={18} /> {t.t("settings.keys.create")}
        </SubmitButton>
      </form>
      <FormFeedback state={{ errors: state.errors }} />
      {state.key && (
        <Notice tone="good" title={t.t("settings.keys.copyNow")}>
          <code className="block break-all rounded-control bg-subtle p-2 font-mono text-sm">
            {state.key}
          </code>
        </Notice>
      )}
    </div>
  );
}

export function ImportForm() {
  const t = useStudioText();
  const { state, pending, onSubmit } = useActionForm<ImportState>(importCredentialsAction, {});
  const results = state.results ?? [];
  const count = (status: string) => results.filter((result) => result.status === status).length;
  return (
    <div className="space-y-3">
      <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
        <label htmlFor="import-file" className="sr-only">
          {t.t("settings.import.fileLabel")}
        </label>
        <input
          id="import-file"
          name="file"
          type="file"
          accept=".json,application/json"
          className="input min-w-60 flex-1"
          required
        />
        <SubmitButton
          pending={pending}
          pendingLabel={t.t("settings.import.importing")}
          className="btn btn-secondary"
        >
          <Upload aria-hidden size={18} /> {t.t("settings.import.submit")}
        </SubmitButton>
      </form>
      <FormFeedback state={{ errors: state.errors }} />
      {results.length > 0 && (
        <Notice
          tone={count("failed") > 0 ? "warning" : "good"}
          title={t.t("settings.import.summary", {
            imported: count("imported"),
            exists: count("exists"),
            failed: count("failed"),
          })}
        >
          {count("failed") > 0 && (
            <ul className="list-disc space-y-1 pl-4">
              {results
                .filter((result) => result.status === "failed")
                .slice(0, 20)
                .map((result) => (
                  <li key={result.external_id}>
                    <span className="font-mono">{result.external_id}</span>:{" "}
                    {result.status === "failed"
                      ? t.t(`settings.import.reason.${result.reason}`)
                      : ""}
                  </li>
                ))}
            </ul>
          )}
        </Notice>
      )}
    </div>
  );
}

/**
 * Adding a webhook. The secret is shown outside the collapsible form: adding
 * one re-renders the page, and a closed form must not hide it.
 */
export function NewWebhookForm(props: { startOpen: boolean; full: boolean }) {
  const t = useStudioText();
  const { state, pending, onSubmit } = useActionForm<NewWebhookState>(createWebhookAction, {});
  return (
    <div className="space-y-3">
      {state.secret && (
        <Notice tone="good" title={t.t("settings.webhooks.copySecret")}>
          <code className="block break-all rounded-control bg-subtle p-2 font-mono text-sm">
            {state.secret}
          </code>
        </Notice>
      )}
      {props.full ? (
        <p className="text-sm text-muted">{t.t("settings.webhooks.full")}</p>
      ) : (
        <details open={props.startOpen}>
          <summary className="cursor-pointer text-sm font-semibold">
            {t.t("settings.webhooks.add")}
          </summary>
          <form onSubmit={onSubmit} className="space-y-4 pt-3">
            <div className="space-y-1">
              <label htmlFor="webhook-url" className="text-sm font-semibold">
                {t.t("settings.webhooks.url")}
              </label>
              <input
                id="webhook-url"
                name="url"
                type="url"
                inputMode="url"
                className="input w-full"
                placeholder="https://hooks.example.com/academy"
                maxLength={2000}
                required
              />
            </div>
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">{t.t("settings.webhooks.events")}</legend>
              <div className="grid gap-4 sm:grid-cols-3">
                {(
                  Object.keys(WEBHOOK_EVENT_GROUPS) as Array<keyof typeof WEBHOOK_EVENT_GROUPS>
                ).map((group) => (
                  <div key={group} className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {webhookGroupLabel(t, group)}
                    </p>
                    {WEBHOOK_EVENT_GROUPS[group].map((event) => (
                      <label key={event} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="events"
                          value={event}
                          defaultChecked={group !== "credentials"}
                          className="mt-1"
                        />
                        <span>{webhookEventLabel(t, event)}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </fieldset>
            <SubmitButton
              pending={pending}
              pendingLabel={t.t("common.adding")}
              className="btn btn-secondary"
            >
              <Webhook aria-hidden size={18} /> {t.t("settings.webhooks.submit")}
            </SubmitButton>
            <FormFeedback state={{ errors: state.errors }} />
          </form>
        </details>
      )}
    </div>
  );
}

export function TestWebhookButton(props: { id: string }) {
  const t = useStudioText();
  const { state, pending, onSubmit } = useActionForm<TestWebhookState>(testWebhookAction, {});
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={props.id} />
      <SubmitButton
        pending={pending}
        pendingLabel={t.t("settings.webhooks.sending")}
        className="btn btn-secondary btn-sm"
      >
        <Send aria-hidden size={16} /> {t.t("settings.webhooks.test")}
      </SubmitButton>
      {state.result && (
        <span aria-live="polite">
          <Badge
            tone={state.delivered ? "good" : "critical"}
            icon={state.delivered ? CircleCheck : CircleX}
          >
            {describeWebhookResult(t, state.result)}
          </Badge>
        </span>
      )}
    </form>
  );
}
