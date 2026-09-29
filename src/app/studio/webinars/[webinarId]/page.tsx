import { CircleSlash, Rocket, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WebinarEmbedCode } from "@/app/studio/webinars/[webinarId]/embed-code";
import { getStudioWebinar } from "@/app/studio/webinars/[webinarId]/load";
import { ReliveNumbersView } from "@/app/studio/webinars/[webinarId]/recording/relive-numbers";
import {
  cancelWebinarAction,
  deleteWebinarAction,
  publishWebinarAction,
} from "@/app/studio/webinars/actions";
import { Funnel } from "@/components/ui/funnel";
import { Notice } from "@/components/ui/notice";
import { StatTile } from "@/components/ui/stat-tile";
import { SubmitButton } from "@/components/ui/submit-button";
import { can } from "@/core/access/roles";
import { wordingText } from "@/core/i18n/studio/helpers";
import type { StudioText } from "@/core/i18n/studio/translator";
import { formatCheckinCode } from "@/core/webinars/checkin";
import { webinarPhase } from "@/core/webinars/phase";
import type { WebinarPublishIssue } from "@/core/webinars/setup";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { academyOrigin } from "@/server/platform/config";
import { getStudioText } from "@/server/studio-text";
import { reliveNumbers } from "@/server/webinars/recording";
import { webinarChecklist, webinarFunnel } from "@/server/webinars/studio";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("webinars.tab.overview") };
}

function issueText(t: StudioText, issue: WebinarPublishIssue): string {
  return issue.code === "wording" && issue.finding
    ? wordingText(t, issue.finding)
    : t.t(`webinars.publish.${issue.code as Exclude<WebinarPublishIssue["code"], "wording">}`);
}

/** The host's page: the check-in code to show, publishing, the funnel and the widget. */
export default async function StudioWebinarOverview({
  params,
}: PageProps<"/studio/webinars/[webinarId]">) {
  const { webinarId } = await params;
  const { tenant, roles } = await requireCapability("studio.view", `/studio/webinars/${webinarId}`);
  const t = await getStudioText();
  const loaded = await getStudioWebinar(tenant.id, webinarId);
  if (!loaded) notFound();
  const { webinar, counts } = loaded;
  const now = new Date();
  const phase = webinarPhase(webinar, now);
  const [issues, funnel, relive] = await Promise.all([
    webinarChecklist(getDb(), tenant, webinar.id, now),
    webinarFunnel(getDb(), tenant, webinar.id),
    reliveNumbers(getDb(), tenant, webinar.id),
  ]);
  const errors = (issues ?? []).filter((issue) => issue.severity === "error");
  const warnings = (issues ?? []).filter((issue) => issue.severity === "warning");
  const publisher = can(roles, "courses.publish");
  const hidden = <input type="hidden" name="webinarId" value={webinar.id} />;

  return (
    <div className="space-y-8">
      {webinar.status === "cancelled" && webinar.cancelledAt && (
        <Notice
          tone="warning"
          title={t.t("webinars.overview.cancelled", {
            date: t.date(webinar.cancelledAt, "dateTime"),
          })}
        />
      )}
      {webinar.status !== "cancelled" && phase !== "ended" && !webinar.joinUrl && (
        <Notice tone="warning" title={t.t("webinars.overview.joinMissing")} />
      )}

      <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="card space-y-3 p-5 sm:p-6" aria-labelledby="checkin-heading">
          <h2 id="checkin-heading" className="text-lg font-semibold">
            {t.t("webinars.overview.checkin")}
          </h2>
          {/* Big enough to read off a shared screen at the back of the room. */}
          <p className="font-mono text-5xl font-bold tracking-[0.2em] sm:text-6xl">
            {formatCheckinCode(webinar.checkinCode)}
          </p>
          <p className="hint">{t.t("webinars.overview.checkinHint")}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 self-start">
          <StatTile
            label={t.t("webinars.overview.registered")}
            value={counts.registered}
            locale={t.locale}
            hint={webinar.capacity ? `/ ${t.number(webinar.capacity)}` : undefined}
          />
          <StatTile
            label={t.t("webinars.overview.waitlist")}
            value={counts.waitlist}
            locale={t.locale}
          />
          <StatTile
            label={t.t("webinars.overview.attended")}
            value={counts.attended}
            locale={t.locale}
          />
          <StatTile
            label={t.t("webinars.overview.pending")}
            value={counts.pending}
            locale={t.locale}
          />
        </div>
      </section>

      {webinar.status === "draft" && (
        <section className="card-flat space-y-4 p-5 sm:p-6" aria-labelledby="publish-heading">
          <h2 id="publish-heading" className="text-lg font-semibold">
            {t.t("webinars.overview.publish")}
          </h2>
          <p className="text-sm text-muted">{t.t("webinars.overview.publishHint")}</p>
          {errors.length > 0 && (
            <Notice tone="critical" title={t.t("webinars.overview.blocked")}>
              <ul className="list-disc space-y-1 pl-4">
                {errors.map((issue, index) => (
                  <li key={index}>{issueText(t, issue)}</li>
                ))}
              </ul>
            </Notice>
          )}
          {warnings.length > 0 && (
            <Notice tone="warning" title={t.t("webinars.overview.worthALook")}>
              <ul className="list-disc space-y-1 pl-4">
                {warnings.map((issue, index) => (
                  <li key={index}>{issueText(t, issue)}</li>
                ))}
              </ul>
            </Notice>
          )}
          <div className="flex flex-wrap gap-2">
            {publisher && (
              <form action={publishWebinarAction}>
                {hidden}
                <SubmitButton
                  disabled={errors.length > 0}
                  pendingLabel={t.t("webinars.overview.publishing")}
                >
                  <Rocket aria-hidden size={18} /> {t.t("webinars.overview.publish")}
                </SubmitButton>
              </form>
            )}
            {can(roles, "courses.edit") && (
              <form action={deleteWebinarAction}>
                {hidden}
                <SubmitButton
                  className="btn btn-ghost"
                  confirm={t.t("webinars.overview.deleteConfirm")}
                >
                  <Trash2 aria-hidden size={16} /> {t.t("webinars.overview.delete")}
                </SubmitButton>
              </form>
            )}
          </div>
        </section>
      )}

      {webinar.status === "published" && (
        <section className="card-flat flex flex-wrap items-center justify-between gap-4 p-5">
          <p className="font-semibold">
            {phase === "ended"
              ? t.t("webinars.overview.publishedEnded")
              : t.t("webinars.overview.published")}
          </p>
          {publisher && phase !== "ended" && (
            <form action={cancelWebinarAction}>
              {hidden}
              <SubmitButton
                className="btn btn-danger btn-sm"
                confirm={t.t("webinars.overview.cancelConfirm")}
              >
                <CircleSlash aria-hidden size={16} /> {t.t("webinars.overview.cancel")}
              </SubmitButton>
            </form>
          )}
        </section>
      )}

      {funnel && (
        <section className="card-flat space-y-4 p-5 sm:p-6" aria-labelledby="funnel-heading">
          <h2 id="funnel-heading" className="text-lg font-semibold">
            {t.t("webinars.overview.funnel")}
          </h2>
          <Funnel
            caption={t.t("webinars.overview.funnel")}
            locale={t.locale}
            rateTitle={t.t("webinars.overview.funnelRate", { rate: "{rate}" })}
            rows={funnel.map((row) => ({
              label: t.t(`webinars.funnel.${row.step}`),
              count: row.count,
            }))}
          />
          {webinar.courseId && <p className="hint">{t.t("webinars.overview.funnelHint")}</p>}
        </section>
      )}

      {relive && (
        <section className="card-flat space-y-4 p-5 sm:p-6" aria-labelledby="relive-heading">
          <div className="space-y-1">
            <h2 id="relive-heading" className="text-lg font-semibold">
              {t.t("webinars.recording.title")}
            </h2>
            <p className="text-sm text-muted">
              {t.t("webinars.recording.numbersIntro", {
                percent: tenant.settings.video.watched_percent,
              })}
            </p>
          </div>
          <ReliveNumbersView
            t={t}
            numbers={relive}
            percent={tenant.settings.video.watched_percent}
            editor={can(roles, "courses.edit")}
            settings={`/studio/webinars/${webinar.id}/recording`}
          />
        </section>
      )}

      {webinar.status !== "cancelled" && (
        <section className="card-flat space-y-4 p-5 sm:p-6" aria-labelledby="embed-heading">
          <div>
            <h2 id="embed-heading" className="text-lg font-semibold">
              {t.t("webinars.overview.embed")}
            </h2>
            <p className="text-sm text-muted">{t.t("webinars.overview.embedIntro")}</p>
          </div>
          <WebinarEmbedCode
            origin={academyOrigin(tenant.primaryDomain).origin}
            slug={webinar.slug}
            lang={webinar.locale}
            title={webinar.title}
            preview={webinar.status === "published"}
          />
        </section>
      )}
    </div>
  );
}
