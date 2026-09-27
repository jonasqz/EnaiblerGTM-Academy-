import {
  FileText,
  Globe,
  Library,
  MessageSquareQuote,
  RefreshCw,
  Trash,
  Video,
} from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  deleteSourceAction,
  recheckSourceAction,
} from "@/app/studio/courses/[courseId]/sources/actions";
import { AddSource } from "@/app/studio/courses/[courseId]/sources/add-source";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { SourceStatusBadge } from "@/components/studio/status-badges";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatClock } from "@/core/authoring/transcript";
import { isLocale } from "@/core/i18n/locales";
import type { StudioKey } from "@/core/i18n/studio/index";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { listSources } from "@/server/authoring/sources";
import { getCourseEditor } from "@/server/studio/course-context";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("lessons.sources.title") };
}

const ICONS = { recording: Video, document: FileText, url: Globe, interview: MessageSquareQuote };

const CHECKED: Record<
  string,
  { tone: "good" | "warning" | "critical" | "info"; title: StudioKey }
> = {
  changed: { tone: "warning", title: "lessons.sources.checked.changed" },
  unchanged: { tone: "good", title: "lessons.sources.checked.unchanged" },
  failed: { tone: "critical", title: "lessons.sources.checked.failed" },
  skipped: { tone: "info", title: "lessons.sources.checked.skipped" },
  limit: { tone: "critical", title: "lessons.sources.checked.limit" },
};

const KIND_LABELS = {
  recording: "lessons.sources.kind.recording",
  document: "lessons.sources.kind.document",
  url: "lessons.sources.kind.url",
  interview: "lessons.sources.kind.interview",
} satisfies Record<keyof typeof ICONS, StudioKey>;

export default async function SourcesPage({
  params,
  searchParams,
}: PageProps<"/studio/courses/[courseId]/sources">) {
  const { courseId } = await params;
  const { interview, checked } = await searchParams;
  const { tenant } = await requireCapability("courses.edit", `/studio/courses/${courseId}/sources`);
  const editor = await getCourseEditor(tenant.id, courseId);
  if (!editor) notFound();
  const rows = await listSources(getDb(), tenant.id, courseId);
  const busy = rows.some((row) => row.status === "pending" || row.status === "processing");
  const ready = rows.filter((row) => row.status === "ready").length;
  const t = await getStudioText();
  // The Lessons link sits inside the sentence, wherever the language puts it.
  const [draftingBefore, draftingAfter] = (
    ready > 0 ? t.n("lessons.sources.draftingReady", ready) : t.t("lessons.sources.drafting")
  ).split("{lessons}");

  return (
    <div className="space-y-6">
      <AutoRefresh active={busy} />
      <div className="max-w-3xl space-y-1">
        <h2 className="text-xl font-semibold">{t.t("lessons.sources.title")}</h2>
        <p className="text-muted">
          {t.t("lessons.sources.intro")} {draftingBefore}
          <Link href={`/studio/courses/${courseId}/lessons` as Route} className="underline">
            {t.t("lessons.list.title")}
          </Link>
          {draftingAfter}
        </p>
      </div>
      {interview === "1" && <Notice tone="good" title={t.t("lessons.sources.interviewSaved")} />}
      {typeof checked === "string" && CHECKED[checked] && (
        <Notice tone={CHECKED[checked].tone} title={t.t(CHECKED[checked].title)} />
      )}

      <AddSource courseId={courseId} languages={editor.course.languages.filter(isLocale)} />

      {rows.length === 0 ? (
        <EmptyState
          icon={Library}
          title={t.t("lessons.sources.empty")}
          body={t.t("lessons.sources.emptyBody")}
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const Icon = ICONS[row.kind];
            const topics = row.topics?.length ?? 0;
            const duration = row.topics?.at(-1)?.endSec;
            return (
              <li key={row.id} className="card-flat flex flex-wrap items-center gap-4 p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-control bg-primary-soft">
                  <Icon aria-hidden size={20} />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <Link
                    href={`/studio/courses/${courseId}/sources/${row.id}` as Route}
                    className="block truncate font-semibold hover:underline"
                  >
                    {row.title}
                  </Link>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                    <SourceStatusBadge status={row.status} />
                    <span>{t.t(KIND_LABELS[row.kind])}</span>
                    {topics > 0 && (
                      <span>
                        {t.n("lessons.sources.steps", topics)}
                        {duration ? ` · ${formatClock(duration)}` : ""}
                      </span>
                    )}
                    {row.kind !== "recording" && row.contentLength > 0 && (
                      <span>{t.n("lessons.sources.words", Math.round(row.contentLength / 6))}</span>
                    )}
                    {row.kind === "url" && row.checkedAt && (
                      <span>
                        {t.t("lessons.sources.checkedDaily", {
                          date: t.date(row.checkedAt, "dateTime"),
                        })}
                      </span>
                    )}
                    {row.changedAt && (
                      <span>
                        {t.t("lessons.sources.changed", {
                          date: t.date(row.changedAt, "dateTime"),
                        })}
                      </span>
                    )}
                  </p>
                  {row.error && (
                    <p
                      className="text-sm font-semibold"
                      style={{ color: "var(--status-critical)" }}
                    >
                      {row.error}
                    </p>
                  )}
                </div>
                {row.kind === "url" && row.status === "ready" && (
                  <form action={recheckSourceAction}>
                    <input type="hidden" name="courseId" value={courseId} />
                    <input type="hidden" name="sourceId" value={row.id} />
                    <SubmitButton
                      className="btn btn-ghost btn-sm"
                      pendingLabel={t.t("lessons.sources.checking")}
                    >
                      <RefreshCw aria-hidden size={16} /> {t.t("lessons.sources.checkNow")}
                    </SubmitButton>
                  </form>
                )}
                <form action={deleteSourceAction}>
                  <input type="hidden" name="courseId" value={courseId} />
                  <input type="hidden" name="sourceId" value={row.id} />
                  <SubmitButton
                    className="btn btn-ghost btn-sm"
                    title={t.t("lessons.sources.delete", { title: row.title })}
                    confirm={t.t("lessons.sources.deleteConfirm")}
                  >
                    <Trash aria-hidden size={16} />
                  </SubmitButton>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
