import { CircleCheck, Clock, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getStudioWebinar } from "@/app/studio/webinars/[webinarId]/load";
import { AttendanceImportForm } from "@/app/studio/webinars/[webinarId]/registrants/import-form";
import { setAttendanceAction } from "@/app/studio/webinars/actions";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SubmitButton } from "@/components/ui/submit-button";
import { can } from "@/core/access/roles";
import type { StudioKey } from "@/core/i18n/studio/index";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { getStudioText } from "@/server/studio-text";
import { listRegistrants, registrationDigest } from "@/server/webinars/studio";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("webinars.registrants.title") };
}

/**
 * Who registered and who came (webinar brief §3): aliases, names only with
 * consent to be contacted, questions as an anonymous digest, and attendance
 * from the check-in code, a file or by hand.
 */
export default async function WebinarRegistrantsPage({
  params,
}: PageProps<"/studio/webinars/[webinarId]/registrants">) {
  const { webinarId } = await params;
  const { tenant, roles } = await requireCapability(
    "people.view",
    `/studio/webinars/${webinarId}/registrants`,
  );
  const t = await getStudioText();
  const loaded = await getStudioWebinar(tenant.id, webinarId);
  if (!loaded) notFound();
  const { webinar } = loaded;
  const [registrants, digest] = await Promise.all([
    listRegistrants(getDb(), tenant.id, webinar.id),
    registrationDigest(getDb(), tenant.id, webinar.id),
  ]);
  const editor = can(roles, "courses.edit");
  const labelOf = (fieldId: string) =>
    fieldId === "name"
      ? t.t("webinars.presenters.name")
      : (webinar.form.fields.find((field) => field.id === fieldId)?.label ?? fieldId);

  return (
    <div className="space-y-8">
      <section className="space-y-3" aria-labelledby="registrants-heading">
        <h2 id="registrants-heading" className="text-lg font-semibold">
          {t.t("webinars.registrants.title")}
        </h2>
        <p className="text-sm text-muted">{t.t("webinars.registrants.intro")}</p>
        {registrants.length === 0 ? (
          <EmptyState icon={UsersRound} title={t.t("webinars.registrants.empty")} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{t.t("webinars.registrants.learner")}</th>
                  <th scope="col">{t.t("webinars.registrants.status")}</th>
                  <th scope="col">{t.t("webinars.registrants.attendance")}</th>
                  <th scope="col">{t.t("webinars.registrants.source")}</th>
                </tr>
              </thead>
              <tbody>
                {registrants.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="font-mono font-semibold">{row.alias}</span>
                      {row.contact && (
                        <span className="block text-sm">
                          {[row.contact.name, row.contact.email].filter(Boolean).join(" · ")}
                        </span>
                      )}
                      {row.contact &&
                        Object.entries(row.contact.answers)
                          .filter(([key]) => key !== "name")
                          .map(([key, value]) => (
                            <span key={key} className="block text-xs text-muted">
                              {labelOf(key)}: {value}
                            </span>
                          ))}
                    </td>
                    <td>
                      <Badge
                        tone={
                          row.status === "registered"
                            ? "good"
                            : row.status === "waitlist"
                              ? "info"
                              : "neutral"
                        }
                        icon={row.status === "registered" ? CircleCheck : Clock}
                      >
                        {t.t(`webinars.registrants.status.${row.status}` as StudioKey)}
                      </Badge>
                      {row.status === "cancelled" && row.cancelledAt ? (
                        <span className="block text-xs text-muted">
                          {t.t("webinars.registrants.cancelledOn", {
                            date: t.date(row.cancelledAt, "dateTime"),
                          })}
                        </span>
                      ) : (
                        row.confirmedAt && (
                          <span className="block text-xs text-muted">
                            {t.t("webinars.registrants.since")}{" "}
                            {t.date(row.confirmedAt, "dateTime")}
                          </span>
                        )
                      )}
                      {row.promotedAt && (
                        <span className="block text-xs text-muted">
                          {t.t("webinars.registrants.promoted", {
                            date: t.date(row.promotedAt, "dateTime"),
                          })}
                        </span>
                      )}
                    </td>
                    <td>
                      {row.attendance ? (
                        <span className="block text-sm">
                          {t.t(
                            `webinars.registrants.attended.${row.attendance.source}` as StudioKey,
                          )}
                          {row.attendance.durationMinutes !== null &&
                            ` · ${t.t("webinars.registrants.minutes", {
                              n: row.attendance.durationMinutes,
                            })}`}
                        </span>
                      ) : (
                        <span className="block text-sm text-muted">
                          {t.t("webinars.registrants.notAttended")}
                        </span>
                      )}
                      {editor && row.status !== "cancelled" && (
                        <form action={setAttendanceAction}>
                          <input type="hidden" name="webinarId" value={webinar.id} />
                          <input type="hidden" name="registrationId" value={row.id} />
                          <input type="hidden" name="attended" value={row.attendance ? "0" : "1"} />
                          <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="…">
                            {t.t(
                              row.attendance
                                ? "webinars.registrants.unmark"
                                : "webinars.registrants.mark",
                            )}
                          </SubmitButton>
                        </form>
                      )}
                    </td>
                    <td className="text-sm text-muted">{row.utmSource ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {digest && (digest.questions.length > 0 || digest.choices.length > 0) && (
        <section className="grid gap-4 lg:grid-cols-2">
          {digest.questions.map((question) => (
            <div key={question.fieldId} className="card-flat space-y-3 p-5">
              <h2 className="font-semibold">{t.t("webinars.digest.title")}</h2>
              <p className="text-sm text-muted">
                <span lang={webinar.locale}>{question.label}</span> · {t.t("webinars.digest.intro")}
              </p>
              {question.answers.length === 0 ? (
                <p className="text-sm">{t.t("webinars.digest.none")}</p>
              ) : (
                <ul className="space-y-2">
                  {question.answers.map((answer, index) => (
                    <li
                      key={index}
                      className="whitespace-pre-line rounded-control bg-subtle p-3 text-sm"
                    >
                      {answer}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {digest.choices.length > 0 && (
            <div className="card-flat space-y-4 p-5">
              <h2 className="font-semibold">{t.t("webinars.digest.choices")}</h2>
              {digest.choices.map((choice) => (
                <div key={choice.fieldId} className="space-y-2">
                  <p className="text-sm font-semibold" lang={webinar.locale}>
                    {choice.label}
                  </p>
                  <ul className="space-y-1 text-sm">
                    {choice.counts.map((count) => (
                      <li key={count.option} className="flex justify-between gap-3">
                        <span lang={webinar.locale}>{count.option}</span>
                        <span className="font-semibold tabular-nums">{t.number(count.n)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {editor && (
        <section className="card-flat space-y-3 p-5 sm:p-6" aria-labelledby="import-heading">
          <h2 id="import-heading" className="text-lg font-semibold">
            {t.t("webinars.import.title")}
          </h2>
          <p className="text-sm text-muted">{t.t("webinars.import.intro")}</p>
          <AttendanceImportForm webinarId={webinar.id} />
        </section>
      )}
    </div>
  );
}
