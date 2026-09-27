import {
  ArrowLeft,
  ArrowRight,
  Award,
  Download,
  Globe,
  Handshake,
  Lock,
  Share2,
} from "lucide-react";
import type { Metadata, Route } from "next";
import Form from "next/form";
import Link from "next/link";
import { z } from "zod";

import { LearnerName } from "@/components/studio/learner-name";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/core/access/roles";
import { localize, type LocalizedText } from "@/core/i18n/locales";
import type { StudioText } from "@/core/i18n/studio/translator";
import type { Lead } from "@/core/people/leads";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { leadCourses, listLeads } from "@/server/studio/leads";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("team.leads.title") };
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function Source(props: { t: StudioText; lead: Lead; title: (text: LocalizedText) => string }) {
  const { t, lead } = props;
  if (!lead.source) return <span className="text-muted">{t.t("team.leads.noCourseYet")}</span>;
  const { utm, viaCertificate } = lead.source;
  const values = (["source", "medium", "campaign"] as const).flatMap((key) =>
    utm[key] ? [{ key, value: utm[key] }] : [],
  );
  return (
    <div className="space-y-1.5">
      {viaCertificate && (
        <p>
          <span className="flex items-center gap-1.5 font-semibold">
            <Award aria-hidden size={14} className="shrink-0" />
            {t.t("team.leads.viaCertificate")}
          </span>
          {viaCertificate.courseTitle && (
            <span className="block text-xs text-muted">
              {t.t("team.leads.certificateCourse", {
                course: props.title(viaCertificate.courseTitle),
              })}
            </span>
          )}
        </p>
      )}
      {values.length > 0 ? (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-2 text-xs">
          {values.map(({ key, value }) => (
            <div key={key} className="contents">
              <dt className="text-muted">{t.t(`team.leads.utm.${key}`)}</dt>
              <dd className="font-mono break-all">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        !viaCertificate && <span className="text-muted">{t.t("team.leads.direct")}</span>
      )}
    </div>
  );
}

/**
 * Learners who agreed to be contacted (brief §9, lead handoff), with what they
 * completed and where they came from: the loop's result for the academy.
 */
export default async function LeadsPage({ searchParams }: PageProps<"/studio/people/leads">) {
  const { tenant, roles } = await requireCapability("people.view", "/studio/people/leads");
  const t = await getStudioText();
  const params = await searchParams;
  const course = z.uuid().safeParse(first(params.course));
  const courseId = course.success ? course.data : null;
  const requested = Number(first(params.page));
  const courses = await leadCourses(getDb(), tenant.id);
  const { leads, total, page, pages } = await listLeads(getDb(), tenant.id, {
    courseId,
    page: Number.isInteger(requested) ? requested : 1,
  });
  const locale = tenant.settings.default_locale;
  const title = (text: LocalizedText) => localize(text, locale);
  const query = (target: number) =>
    new URLSearchParams({
      ...(courseId ? { course: courseId } : {}),
      ...(target > 1 ? { page: String(target) } : {}),
    }).toString();
  const pageHref = (target: number) =>
    `/studio/people/leads${query(target) ? `?${query(target)}` : ""}` as Route;
  const exportHref = `/studio/people/contacts?list=contact${courseId ? `&course=${courseId}` : ""}`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href="/studio/people" className="hover:underline">
            {t.t("team.people.title")}
          </Link>
        }
        title={t.t("team.leads.title")}
        description={t.t("team.leads.description")}
        actions={
          can(roles, "contacts.export") &&
          total > 0 && (
            <a href={exportHref} className="btn btn-secondary">
              <Download aria-hidden size={18} /> {t.t("team.leads.export")}
            </a>
          )
        }
      />
      <p className="max-w-2xl text-sm text-muted">{t.t("team.leads.privacy")}</p>

      {(courses.length > 1 || courseId) && (
        <Form action="/studio/people/leads" className="flex flex-wrap items-end gap-2">
          <div className="field">
            <label htmlFor="leads-course" className="label">
              {t.t("team.leads.filter.course")}
            </label>
            {/* Keyed by the filter shown, so going back never leaves another course selected. */}
            <select
              key={courseId ?? "all"}
              id="leads-course"
              name="course"
              defaultValue={courseId ?? ""}
              className="select w-auto max-w-full"
            >
              <option value="">{t.t("team.leads.filter.all")}</option>
              {courses
                .map((option) => ({ id: option.id, label: title(option.title) }))
                .sort((a, b) => a.label.localeCompare(b.label, t.locale))
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
            </select>
          </div>
          <button type="submit" className="btn btn-secondary">
            {t.t("team.leads.filter.show")}
          </button>
        </Form>
      )}

      {leads.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title={courseId ? t.t("team.leads.emptyFiltered") : t.t("team.leads.empty")}
          body={courseId ? undefined : t.t("team.leads.emptyBody")}
        />
      ) : (
        <>
          <p className="text-sm font-semibold">{t.n("team.leads.count", total)}</p>
          <div className="card-flat table-wrap">
            <table className="table">
              <caption className="sr-only">{t.t("team.leads.caption")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.t("team.leads.column.lead")}</th>
                  <th scope="col">{t.t("team.leads.column.agreed")}</th>
                  <th scope="col">{t.t("team.leads.column.completed")}</th>
                  <th scope="col">{t.t("team.leads.column.source")}</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.userId} className="*:align-top">
                    <td className="min-w-48">
                      <LearnerName
                        alias={lead.alias}
                        displayName={lead.name}
                        contactEmail={lead.email}
                      />
                      {lead.locale && (
                        <span className="block text-xs text-muted">
                          {lead.locale.toUpperCase()}
                        </span>
                      )}
                    </td>
                    <td className="min-w-44 text-sm">
                      <span className="whitespace-nowrap">{t.date(lead.agreedAt)}</span>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs font-semibold">
                          {t.t("team.leads.wording")}
                        </summary>
                        <p className="mt-1 max-w-64 text-xs text-muted">
                          {t.t("team.leads.quote", { wording: lead.wording })}
                        </p>
                      </details>
                    </td>
                    <td className="min-w-64 text-sm">
                      {lead.completed.length === 0 ? (
                        <span className="text-muted">{t.t("team.leads.noCourses")}</span>
                      ) : (
                        <ul className="space-y-3">
                          {lead.completed.map((done) => (
                            <li key={done.courseId}>
                              <span className="block font-semibold">{title(done.title)}</span>
                              <span className="block text-xs text-muted">
                                {t.date(done.completedAt)} · {t.t(`team.leads.basis.${done.basis}`)}
                              </span>
                              <span className="mt-1 flex flex-wrap gap-1">
                                {done.visibility === "public" ? (
                                  <Badge tone="good" icon={Globe}>
                                    {t.t("common.learners.public")}
                                  </Badge>
                                ) : (
                                  <Badge icon={Lock}>{t.t("common.learners.private")}</Badge>
                                )}
                                {done.sharedOn.map((channel) => (
                                  <Badge key={channel} tone="info" icon={Share2}>
                                    {t.t(`team.leads.shared.${channel}`)}
                                  </Badge>
                                ))}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {lead.inProgress.length > 0 && (
                        <p className="mt-2 text-xs text-muted">
                          {t.t("team.leads.inProgress", {
                            courses: t.list(lead.inProgress.map((started) => title(started.title))),
                          })}
                        </p>
                      )}
                    </td>
                    <td className="min-w-56 text-sm">
                      <Source t={t} lead={lead} title={title} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav
              aria-label={t.t("team.leads.pages")}
              className="flex items-center justify-between gap-3"
            >
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="btn btn-secondary btn-sm">
                  <ArrowLeft aria-hidden size={16} /> {t.t("team.leads.previous")}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-muted">{t.t("team.leads.page", { page, pages })}</span>
              {page < pages ? (
                <Link href={pageHref(page + 1)} className="btn btn-secondary btn-sm">
                  {t.t("team.leads.next")} <ArrowRight aria-hidden size={16} />
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
