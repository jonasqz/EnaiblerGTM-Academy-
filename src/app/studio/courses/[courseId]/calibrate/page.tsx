import { CircleCheck, CircleX, Scale, Trash, TriangleAlert } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  deleteExemplarAction,
  runCalibrationAction,
} from "@/app/studio/courses/[courseId]/calibrate/actions";
import { ExemplarForm } from "@/app/studio/courses/[courseId]/calibrate/exemplar-form";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { isLocale, localize } from "@/core/i18n/locales";
import { STUDIO_MESSAGES, type StudioKey } from "@/core/i18n/studio/index";
import type { StudioText } from "@/core/i18n/studio/translator";
import { GOOD_AGREEMENT, readyToCalibrate, summarizeCalibration } from "@/core/review/calibration";
import { rubricSchema, scoreRange } from "@/core/review/rubric";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { listCalibrationRuns } from "@/server/review/calibration";
import { getCourseEditor } from "@/server/studio/course-context";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("authoring.calibrate.title") };
}

const usd = (t: StudioText, microUsd: number) =>
  t.number(microUsd / 1_000_000, {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });

/**
 * The calibration job stores its errors in English, the same words as these
 * keys: the ones it knows are shown in the team member's language.
 */
const JOB_ERRORS = [
  "authoring.calibrate.error.gateway",
  "authoring.calibrate.error.noAnswer",
  "authoring.calibrate.error.invalid",
] as const satisfies readonly StudioKey[];

function jobError(t: StudioText, error: string | null | undefined) {
  const key = JOB_ERRORS.find((candidate) => STUDIO_MESSAGES.en[candidate] === error);
  return key ? t.t(key) : error;
}

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
  const t = await getStudioText();
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
  // The link to the rubric sits inside the sentence, wherever the language puts it.
  const [introStart, introEnd] = t.t("authoring.calibrate.intro").split("{rubric}");

  return (
    <div className="space-y-8">
      <AutoRefresh active={active} />
      <div className="max-w-3xl space-y-1">
        <h2 className="text-xl font-semibold">{t.t("authoring.calibrate.heading")}</h2>
        <p className="text-muted">
          {introStart}
          <Link href={`/studio/courses/${courseId}/outcome#rubric` as Route} className="underline">
            {t.t("authoring.calibrate.introRubric")}
          </Link>
          {introEnd}
        </p>
      </div>
      {!aiAvailable && (
        <Notice tone="warning" title={t.t("authoring.calibrate.noGateway.title")}>
          {t.t("authoring.calibrate.noGateway.body")}
        </Notice>
      )}
      {error === "examples" && (
        <Notice tone="critical" title={t.t("authoring.calibrate.needExamples")} />
      )}
      {error === "limit" && (
        <Notice tone="critical" title={t.t("authoring.calibrate.rateLimited")} />
      )}

      <section aria-labelledby="run-heading" className="card-flat space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 id="run-heading" className="font-semibold">
              {active
                ? t.t("authoring.calibrate.running")
                : summary?.agreement != null
                  ? t.t("authoring.calibrate.agreement", {
                      agreed: summary.agreed,
                      total: summary.total,
                      percent: Math.round(summary.agreement * 100),
                    })
                  : t.t("authoring.calibrate.notYet")}
            </h3>
            {latest && (
              <p className="text-sm text-muted">
                {t.t("authoring.calibrate.rubricVersion", { version: latest.rubricVersion })}
                {latest.rubricVersion !== editor.rubric.version
                  ? ` · ${t.t("authoring.calibrate.rubricChanged", { version: editor.rubric.version })}`
                  : ""}
                {latest.costMicroUsd != null
                  ? ` · ${t.t("authoring.calibrate.cost", { cost: usd(t, latest.costMicroUsd) })}`
                  : ""}
              </p>
            )}
            {summary?.agreement != null && (
              <p>
                {summary.agreement >= GOOD_AGREEMENT ? (
                  <Badge tone="good" icon={CircleCheck}>
                    {t.t("authoring.calibrate.ready")}
                  </Badge>
                ) : (
                  <Badge tone="warning" icon={TriangleAlert}>
                    {t.t("authoring.calibrate.sharpen")}
                  </Badge>
                )}
              </p>
            )}
          </div>
          <form action={runCalibrationAction}>
            <input type="hidden" name="courseId" value={courseId} />
            <SubmitButton
              disabled={!aiAvailable || !ready || active}
              pendingLabel={t.t("authoring.calibrate.starting")}
              title={ready ? undefined : t.t("authoring.calibrate.needBoth")}
            >
              <Scale aria-hidden size={18} /> {t.t("authoring.calibrate.run")}
            </SubmitButton>
          </form>
        </div>
        {summary && summary.criterionGaps.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">{t.t("authoring.calibrate.gaps.caption")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.t("authoring.calibrate.gaps.criterion")}</th>
                  <th scope="col">{t.t("authoring.calibrate.gaps.difference")}</th>
                  <th scope="col">{t.t("authoring.calibrate.gaps.compared")}</th>
                </tr>
              </thead>
              <tbody>
                {summary.criterionGaps.map((gap) => (
                  <tr key={gap.criterionId}>
                    <td className="font-semibold">{label(gap.criterionId)}</td>
                    <td className="tabular-nums">
                      {t.n("authoring.calibrate.gaps.points", gap.meanDifference)}
                    </td>
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
            {jobError(t, runs.find((run) => run.status === "failed")?.error)}
          </p>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]">
        <section aria-labelledby="examples-heading" className="space-y-3">
          <h3 id="examples-heading" className="font-semibold">
            {t.t("authoring.calibrate.examples", { n: rubric.exemplars.length })}
          </h3>
          {rubric.exemplars.length === 0 ? (
            <EmptyState
              icon={Scale}
              title={t.t("authoring.calibrate.empty.title")}
              body={t.t("authoring.calibrate.empty.body")}
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
                            {t.t(
                              exemplar.expected_pass
                                ? "authoring.calibrate.you.pass"
                                : "authoring.calibrate.you.fail",
                            )}
                          </Badge>
                          {result?.aiPass != null && (
                            <Badge
                              tone={agrees ? "good" : "critical"}
                              icon={agrees ? CircleCheck : CircleX}
                            >
                              {t.t(
                                result.aiPass
                                  ? "authoring.calibrate.ai.pass"
                                  : "authoring.calibrate.ai.fail",
                                { percent: result.aiPercent },
                              )}
                            </Badge>
                          )}
                          {result?.error && (
                            <Badge tone="warning">{jobError(t, result.error)}</Badge>
                          )}
                        </p>
                      </div>
                      <form action={deleteExemplarAction}>
                        <input type="hidden" name="courseId" value={courseId} />
                        <input type="hidden" name="exemplarId" value={exemplar.id} />
                        <SubmitButton
                          className="btn btn-ghost btn-sm"
                          title={t.t("authoring.calibrate.remove")}
                          confirm={t.t("authoring.calibrate.removeConfirm")}
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
                              {t.t("authoring.calibrate.aiScore", {
                                criterion: label(criterion.id),
                                score: ai ?? "–",
                                max,
                              })}
                              {mine !== undefined
                                ? ` · ${t.t("authoring.calibrate.yourScore", { score: mine })}`
                                : ""}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {result?.summary && (
                      <p className="text-sm">
                        {t.t("authoring.calibrate.aiSummary", { summary: result.summary })}
                      </p>
                    )}
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
