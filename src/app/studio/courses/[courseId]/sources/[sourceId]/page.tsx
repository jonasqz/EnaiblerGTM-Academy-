import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FaqPanel } from "@/app/studio/courses/[courseId]/sources/[sourceId]/faq-panel";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { SourceStatusBadge } from "@/components/studio/status-badges";
import { qaPairs } from "@/core/authoring/qa";
import { formatClock } from "@/core/authoring/transcript";
import { isLocale } from "@/core/i18n/locales";
import { jobErrorText } from "@/core/i18n/studio/helpers";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { loadSource } from "@/server/authoring/sources";
import { getCourseEditor } from "@/server/studio/course-context";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("lessons.source.title") };
}

/** What the AI will read from a source: the steps of a recording, or the text of a document. */
export default async function SourcePage({
  params,
}: PageProps<"/studio/courses/[courseId]/sources/[sourceId]">) {
  const { courseId, sourceId } = await params;
  const { tenant } = await requireCapability(
    "courses.edit",
    `/studio/courses/${courseId}/sources/${sourceId}`,
  );
  const source = await loadSource(getDb(), tenant.id, sourceId);
  if (!source || source.courseId !== courseId) notFound();
  const editor = await getCourseEditor(tenant.id, courseId);
  const languages = editor?.course.languages.filter(isLocale) ?? [];
  const pairs = source.kind === "qa" ? qaPairs(source.content ?? "") : [];
  const busy = source.status === "pending" || source.status === "processing";
  const keyframesPending =
    source.kind === "recording" &&
    source.status === "ready" &&
    (source.transcript ?? []).every((topic) => !topic.keyframeFileId);
  const t = await getStudioText();

  return (
    <div className="space-y-6">
      <AutoRefresh active={busy} />
      <Link
        href={`/studio/courses/${courseId}/sources` as Route}
        className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        <ArrowLeft aria-hidden size={16} /> {t.t("lessons.source.back")}
      </Link>
      <header className="space-y-2">
        <h2 className="text-xl font-semibold">{source.title}</h2>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <SourceStatusBadge status={source.status} />
          {source.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline"
            >
              {source.url} <ExternalLink aria-hidden size={14} />
            </a>
          )}
        </p>
        {source.error && (
          <p className="font-semibold" style={{ color: "var(--status-critical)" }}>
            {jobErrorText(t, source.error)}
          </p>
        )}
      </header>

      {source.kind === "recording" && source.fileId && (
        <video
          src={`/files/${source.fileId}`}
          controls
          preload="metadata"
          className="aspect-video w-full max-w-3xl rounded-card bg-[var(--tenant-ink)]"
        />
      )}

      {source.kind === "qa" ? (
        <div className="space-y-6">
          {source.status === "ready" && languages.length > 0 && (
            <FaqPanel
              courseId={courseId}
              sourceId={source.id}
              languages={languages}
              locale={
                isLocale(source.locale) && languages.includes(source.locale)
                  ? source.locale
                  : languages[0]!
              }
              aiAvailable={Boolean(process.env.LLM_BASE_URL?.trim())}
            />
          )}
          <section aria-labelledby="qa-heading" className="space-y-3">
            <h3 id="qa-heading" className="font-semibold">
              {t.t("drafts.qa.questions")}{" "}
              <span className="font-normal text-muted">
                ({t.n("drafts.qa.count", pairs.length)})
              </span>
            </h3>
            <ol className="space-y-3">
              {pairs.map((pair, index) => (
                <li key={index} className="card-flat space-y-1 p-4">
                  <p className="font-semibold">{pair.question}</p>
                  <p className={`text-sm ${pair.answer ? "" : "text-muted italic"}`}>
                    {pair.answer ?? t.t("drafts.qa.noAnswer")}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      ) : source.transcript && source.transcript.length > 0 ? (
        <section aria-labelledby="steps-heading" className="space-y-3">
          <h3 id="steps-heading" className="font-semibold">
            {t.t(keyframesPending ? "lessons.source.stepsPending" : "lessons.source.steps")}
          </h3>
          <ol className="space-y-3">
            {source.transcript.map((topic, index) => (
              <li
                key={index}
                className="card-flat grid gap-4 p-4 md:grid-cols-[16rem_minmax(0,1fr)]"
              >
                {topic.keyframeFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element -- screenshots of any size
                  <img
                    src={`/files/${topic.keyframeFileId}`}
                    alt={t.t("lessons.source.screenshot", {
                      title: topic.title ?? t.t("lessons.source.stepInline", { n: index + 1 }),
                    })}
                    className="w-full rounded-control border border-line"
                  />
                ) : (
                  <div className="hidden md:block" />
                )}
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold">
                    {index + 1}. {topic.title ?? t.t("lessons.source.step", { n: index + 1 })}
                    <span className="ml-2 text-sm font-normal text-muted tabular-nums">
                      {formatClock(topic.startSec)}–{formatClock(topic.endSec)}
                    </span>
                  </p>
                  <p className="text-sm">{topic.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        source.content && (
          <section aria-labelledby="text-heading" className="space-y-2">
            <h3 id="text-heading" className="font-semibold">
              {t.t("lessons.source.text")}
            </h3>
            <pre className="max-h-[40rem] overflow-y-auto whitespace-pre-wrap rounded-card bg-subtle p-4 text-sm">
              {source.content.slice(0, 20_000)}
              {source.content.length > 20_000 ? "\n\n…" : ""}
            </pre>
          </section>
        )
      )}
    </div>
  );
}
