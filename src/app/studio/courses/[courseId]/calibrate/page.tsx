import { CircleCheck, CircleX, Scale, Trash, TriangleAlert } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  deleteExemplarAction,
  runCalibrationAction,
} from "@/app/studio/courses/[courseId]/calibrate/actions";
import { ExemplarForm } from "@/app/studio/courses/[courseId]/calibrate/exemplar-form";
import { AutoRefresh } from "@/components/studio/auto-refresh";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { isLocale, localize } from "@/core/i18n/locales";
import { GOOD_AGREEMENT, readyToCalibrate, summarizeCalibration } from "@/core/review/calibration";
import { rubricSchema, scoreRange } from "@/core/review/rubric";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { listCalibrationRuns } from "@/server/review/calibration";
import { getCourseEditor } from "@/server/studio/course-context";

export const metadata: Metadata = { title: "Calibrate" };

const percent = (value: number) => `${Math.round(value * 100)} %`;

/** "Calibrate the review" (brief §7, step 5). */
export default async function CalibratePage({
  params,
  searchParams,
}: PageProps<"/studio/courses/[courseId]/calibrate">) {
  const { courseId } = await params;
  const { error } = await searchParams;
  const { tenant } = await requireCapability(
    "courses.edit",
    `/studio/courses/${courseId}/calibrate`,
  );
  const editor = await getCourseEditor(tenant.id, courseId);
  if (!editor?.rubric) notFound();
  const rubric = rubricSchema.parse(editor.rubric.definition);
  const languages = editor.course.languages.filter(isLocale);
  const locale = languages[0] ?? tenant.settings.default_locale;
  const label = (id: string) =>
    localize(rubric.criteria.find((criterion) => criterion.id === id)?.label, locale, languages) ||
    id;
  const runs = await listCalibrationRuns(getDb(), tenant.id, courseId);
  const active = runs.some((run) => run.status === "queued" || run.status === "running");
  const latest = runs.find((run) => run.status === "done") ?? null;
  const summary = latest ? summarizeCalibration(latest.results) : null;
  const resultFor = new Map(latest?.results.map((result) => [result.exemplarId, result]));
  const aiAvailable = Boolean(process.env.LLM_BASE_URL?.trim());
  const ready = readyToCalibrate(rubric.exemplars);

  return (
    <div className="space-y-8">
      <AutoRefresh active={active} />
      <div className="max-w-3xl space-y-1">
        <h2 className="text-xl font-semibold">Calibrate the review</h2>
        <p className="text-muted">
          Before learners hand in, check that the AI judges like you do. Add a few examples you
          would pass and a few you would not, then let the AI review them. Where it disagrees,
          sharpen the{" "}
          <Link href={`/studio/courses/${courseId}/outcome#rubric` as Route} className="underline">
            rubric
          </Link>
          . Live reviews also see up to two examples of each kind.
        </p>
      </div>
      {!aiAvailable && (
        <Notice tone="warning" title="The AI gateway is not set up">
          Calibration runs the AI review, which needs LLM_BASE_URL on the server.
        </Notice>
      )}
      {error === "examples" && (
        <Notice
          tone="critical"
          title="Add at least one example you would pass and one you would not."
        />
      )}
      {error === "limit" && (
        <Notice tone="critical" title="Too many runs this hour. Try again later." />
      )}

      <section aria-labelledby="run-heading" className="card-flat space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 id="run-heading" className="font-semibold">
              {active
                ? "The AI is reviewing your examples…"
                : summary?.agreement != null
                  ? `The AI agreed with you on ${summary.agreed} of ${summary.total} examples (${percent(summary.agreement)})`
                  : "Not calibrated yet"}
            </h3>
            {latest && (
              <p className="text-sm text-muted">
                On rubric version {latest.rubricVersion}
                {latest.rubricVersion !== editor.rubric.version
                  ? ` · the rubric is at version ${editor.rubric.version} now: run it again`
                  : ""}
                {latest.costMicroUsd != null
                  ? ` · cost $${(latest.costMicroUsd / 1_000_000).toFixed(3)}`
                  : ""}
              </p>
            )}
            {summary?.agreement != null && (
              <p>
                {summary.agreement >= GOOD_AGREEMENT ? (
                  <Badge tone="good" icon={CircleCheck}>
                    Ready: the AI judges like you
                  </Badge>
                ) : (
                  <Badge tone="warning" icon={TriangleAlert}>
                    Sharpen the level descriptions where it differs
                  </Badge>
                )}
              </p>
            )}
          </div>
          <form action={runCalibrationAction}>
            <input type="hidden" name="courseId" value={courseId} />
            <SubmitButton
              disabled={!aiAvailable || !ready || active}
              pendingLabel="Starting…"
              title={ready ? undefined : "Add a passing and a failing example first"}
            >
              <Scale aria-hidden size={18} /> Run calibration
            </SubmitButton>
          </form>
        </div>
        {summary && summary.criterionGaps.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Where the AI’s scores differ from yours</caption>
              <thead>
                <tr>
                  <th scope="col">Criterion</th>
                  <th scope="col">Average difference to your scores</th>
                  <th scope="col">Examples compared</th>
                </tr>
              </thead>
              <tbody>
                {summary.criterionGaps.map((gap) => (
                  <tr key={gap.criterionId}>
                    <td className="font-semibold">{label(gap.criterionId)}</td>
                    <td className="tabular-nums">{gap.meanDifference} points</td>
                    <td className="tabular-nums">{gap.compared}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {runs.find(
          (run) => run.status === "failed" && run.createdAt > (latest?.createdAt ?? new Date(0)),
        ) && (
          <p className="text-sm font-semibold" style={{ color: "var(--status-critical)" }}>
            {runs.find((run) => run.status === "failed")?.error}
          </p>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]">
        <section aria-labelledby="examples-heading" className="space-y-3">
          <h3 id="examples-heading" className="font-semibold">
            Examples ({rubric.exemplars.length})
          </h3>
          {rubric.exemplars.length === 0 ? (
            <EmptyState
              icon={Scale}
              title="No examples yet"
              body="Two to six examples are enough to see whether the AI applies your rubric the way you would."
            />
          ) : (
            <ul className="space-y-3">
              {rubric.exemplars.map((exemplar) => {
                const result = resultFor.get(exemplar.id);
                const agrees = result?.aiPass != null && result.aiPass === exemplar.expected_pass;
                return (
                  <li key={exemplar.id} className="card-flat space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="font-semibold">
                          {exemplar.title ?? exemplar.content.split("\n")[0]!.slice(0, 80)}
                        </p>
                        <p className="flex flex-wrap items-center gap-2 text-sm">
                          <Badge tone={exemplar.expected_pass ? "good" : "neutral"}>
                            You: {exemplar.expected_pass ? "pass" : "not pass"}
                          </Badge>
                          {result?.aiPass != null && (
                            <Badge
                              tone={agrees ? "good" : "critical"}
                              icon={agrees ? CircleCheck : CircleX}
                            >
                              AI: {result.aiPass ? "pass" : "not pass"} ({result.aiPercent} %)
                            </Badge>
                          )}
                          {result?.error && <Badge tone="warning">{result.error}</Badge>}
                        </p>
                      </div>
                      <form action={deleteExemplarAction}>
                        <input type="hidden" name="courseId" value={courseId} />
                        <input type="hidden" name="exemplarId" value={exemplar.id} />
                        <SubmitButton
                          className="btn btn-ghost btn-sm"
                          title="Remove example"
                          confirm="Remove this example?"
                        >
                          <Trash aria-hidden size={16} />
                        </SubmitButton>
                      </form>
                    </div>
                    <p className="line-clamp-3 text-sm text-muted">{exemplar.content}</p>
                    {result && Object.keys(result.aiScores).length > 0 && (
                      <ul className="flex flex-wrap gap-2 text-xs">
                        {rubric.criteria.map((criterion) => {
                          const ai = result.aiScores[criterion.id];
                          const mine = exemplar.expected_scores?.[criterion.id];
                          const { max } = scoreRange(criterion);
                          return (
                            <li
                              key={criterion.id}
                              className="rounded-control bg-subtle px-2 py-1 tabular-nums"
                            >
                              {label(criterion.id)}: AI {ai ?? "–"}/{max}
                              {mine !== undefined ? ` · you ${mine}` : ""}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {result?.summary && <p className="text-sm">“{result.summary}”</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <ExemplarForm
          courseId={courseId}
          criteria={rubric.criteria.map((criterion) => {
            const { min, max } = scoreRange(criterion);
            return {
              id: criterion.id,
              label: localize(criterion.label, locale, languages),
              scores: Array.from({ length: max - min + 1 }, (_, index) => min + index),
            };
          })}
        />
      </div>
    </div>
  );
}
