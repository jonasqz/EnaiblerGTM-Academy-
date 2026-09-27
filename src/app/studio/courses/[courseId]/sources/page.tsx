import { FileText, Globe, Library, MessageSquareQuote, Trash, Video } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { deleteSourceAction } from "@/app/studio/courses/[courseId]/sources/actions";
import { AddSource } from "@/app/studio/courses/[courseId]/sources/add-source";
import { AutoRefresh } from "@/components/studio/auto-refresh";
import { SourceStatusBadge } from "@/components/studio/status-badges";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatClock } from "@/core/authoring/transcript";
import { isLocale } from "@/core/i18n/locales";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { listSources } from "@/server/authoring/sources";
import { getCourseEditor } from "@/server/studio/course-context";

export const metadata: Metadata = { title: "Sources" };

const ICONS = { recording: Video, document: FileText, url: Globe, interview: MessageSquareQuote };
const KIND_LABELS = {
  recording: "Recording",
  document: "Document",
  url: "Web page",
  interview: "Interview",
};

export default async function SourcesPage({
  params,
  searchParams,
}: PageProps<"/studio/courses/[courseId]/sources">) {
  const { courseId } = await params;
  const { interview } = await searchParams;
  const { tenant } = await requireCapability("courses.edit", `/studio/courses/${courseId}/sources`);
  const editor = await getCourseEditor(tenant.id, courseId);
  if (!editor) notFound();
  const rows = await listSources(getDb(), tenant.id, courseId);
  const busy = rows.some((row) => row.status === "pending" || row.status === "processing");
  const ready = rows.filter((row) => row.status === "ready").length;

  return (
    <div className="space-y-6">
      <AutoRefresh active={busy} />
      <div className="max-w-3xl space-y-1">
        <h2 className="text-xl font-semibold">Sources</h2>
        <p className="text-muted">
          What the AI drafts your lessons from: screen recordings with narration, documents, your
          web pages and an interview with you. Drafting starts on the{" "}
          <Link href={`/studio/courses/${courseId}/lessons` as Route} className="underline">
            Lessons
          </Link>{" "}
          tab{ready > 0 ? ` and uses the ${ready} ready source${ready === 1 ? "" : "s"}` : ""}.
        </p>
      </div>
      {interview === "1" && <Notice tone="good" title="Interview saved as a source" />}

      <AddSource courseId={courseId} languages={editor.course.languages.filter(isLocale)} />

      {rows.length === 0 ? (
        <EmptyState
          icon={Library}
          title="No sources yet"
          body="Lessons can be drafted without sources too, but they will be generic. A ten-minute recording of you doing the work is the best source."
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
                    <span>{KIND_LABELS[row.kind]}</span>
                    {topics > 0 && (
                      <span>
                        {topics} step{topics === 1 ? "" : "s"}
                        {duration ? ` · ${formatClock(duration)}` : ""}
                      </span>
                    )}
                    {row.kind !== "recording" && row.contentLength > 0 && (
                      <span>{Math.round(row.contentLength / 6).toLocaleString("en")} words</span>
                    )}
                    {row.changedAt && <span>Changed since the lessons were written</span>}
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
                <form action={deleteSourceAction}>
                  <input type="hidden" name="courseId" value={courseId} />
                  <input type="hidden" name="sourceId" value={row.id} />
                  <SubmitButton
                    className="btn btn-ghost btn-sm"
                    title={`Delete ${row.title}`}
                    confirm="Delete this source? Lessons already written stay as they are."
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
