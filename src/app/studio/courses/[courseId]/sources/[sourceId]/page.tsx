import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/components/ui/auto-refresh";
import { SourceStatusBadge } from "@/components/studio/status-badges";
import { formatClock } from "@/core/authoring/transcript";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { loadSource } from "@/server/authoring/sources";

export const metadata: Metadata = { title: "Source" };

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
  const busy = source.status === "pending" || source.status === "processing";
  const keyframesPending =
    source.kind === "recording" &&
    source.status === "ready" &&
    (source.transcript ?? []).every((topic) => !topic.keyframeFileId);

  return (
    <div className="space-y-6">
      <AutoRefresh active={busy} />
      <Link
        href={`/studio/courses/${courseId}/sources` as Route}
        className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        <ArrowLeft aria-hidden size={16} /> All sources
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
            {source.error}
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

      {source.transcript && source.transcript.length > 0 ? (
        <section aria-labelledby="steps-heading" className="space-y-3">
          <h3 id="steps-heading" className="font-semibold">
            Steps{keyframesPending ? " (screenshots are being taken…)" : ""}
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
                    alt={`Screenshot: ${topic.title ?? `step ${index + 1}`}`}
                    className="w-full rounded-control border border-line"
                  />
                ) : (
                  <div className="hidden md:block" />
                )}
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold">
                    {index + 1}. {topic.title ?? `Step ${index + 1}`}
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
              Text the AI reads
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
