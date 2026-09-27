import { Award, Download, Users, X } from "lucide-react";
import type { Metadata } from "next";

import { grantLevelAction, revokeGrantAction } from "@/app/studio/paths/actions";
import { LearnerName } from "@/components/studio/learner-name";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { SubmitButton } from "@/components/ui/submit-button";
import { can } from "@/core/access/roles";
import { localize } from "@/core/i18n/locales";
import { createTranslator } from "@/core/i18n/translator";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { countContacts } from "@/server/consent";
import { listPeople } from "@/server/studio/insights";
import { listLevelGrants, listStudioPaths, loadLevels } from "@/server/studio/paths";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("team.people.title") };
}

/** Everyone learning in this academy, private by default (brief §9). */
export default async function PeoplePage() {
  const { tenant, roles } = await requireCapability("people.view", "/studio/people");
  const t = await getStudioText();
  const people = await listPeople(getDb(), tenant.id);
  const paths = tenant.settings.features.paths;
  const locale = tenant.settings.default_locale;
  // Levels granted by the team (rule "manual grant", e.g. Mentor): only with paths and levels on.
  const granting = paths && tenant.settings.features.levels && can(roles, "courses.edit");
  const [levels, pathRows, grants] = granting
    ? await Promise.all([
        loadLevels(getDb(), tenant.id),
        listStudioPaths(getDb(), tenant.id),
        listLevelGrants(getDb(), tenant.id),
      ])
    : [[], [], []];
  const manual = levels.filter((level) => level.rule.type === "manual_grant");
  const pathTitle = (id: string) =>
    localize(pathRows.find((row) => row.path.id === id)?.path.title, locale);
  const pathTerm = createTranslator({ locale: t.locale, termOverrides: tenant.terminology }).term(
    "path",
  );
  const contactable = people.filter((person) => person.contactEmail).length;
  const contacts = can(roles, "contacts.export") ? await countContacts(getDb(), tenant.id) : null;
  const finished = people.filter((person) => person.completed > 0).length;

  return (
    <div className="space-y-8">
      <PageHeader title={t.t("team.people.title")} description={t.t("team.people.description")} />
      <section
        aria-label={t.t("overview.totals")}
        className="grid grid-cols-2 gap-3 lg:grid-cols-3"
      >
        <StatTile label={t.t("overview.stat.learners")} value={people.length} />
        <StatTile label={t.t("team.people.completedCourse")} value={finished} />
        <StatTile label={t.t("team.people.openToContact")} value={contactable} />
      </section>

      {people.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t.t("team.people.empty")}
          body={t.t("team.people.emptyBody")}
        />
      ) : (
        <div className="card-flat table-wrap">
          <table className="table">
            <caption className="sr-only">{t.t("overview.stat.learners")}</caption>
            <thead>
              <tr>
                <th scope="col">{t.t("common.learners.learner")}</th>
                {paths && <th scope="col">{pathTerm}</th>}
                <th scope="col" className="num">
                  {t.t("team.people.started")}
                </th>
                <th scope="col" className="num">
                  {t.t("team.people.completed")}
                </th>
                <th scope="col" className="num">
                  {t.t("team.people.certificates")}
                </th>
                <th scope="col">{t.t("team.people.joined")}</th>
                {manual.length > 0 && <th scope="col">{t.t("team.people.grantedLevels")}</th>}
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.userId}>
                  <td>
                    <LearnerName
                      alias={person.alias}
                      displayName={person.displayName}
                      contactEmail={person.contactEmail}
                    />
                  </td>
                  {paths && (
                    <td className="text-sm">
                      {person.pathTitle ? (
                        localize(person.pathTitle, tenant.settings.default_locale)
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  )}
                  <td className="num">{person.started}</td>
                  <td className="num">{person.completed}</td>
                  <td className="num">{person.credentials}</td>
                  <td className="whitespace-nowrap text-sm text-muted">
                    {t.date(person.joinedAt)}
                  </td>
                  {manual.length > 0 && (
                    <td className="min-w-56 space-y-2 text-sm">
                      {grants
                        .filter((grant) => grant.userId === person.userId)
                        .map((grant) => (
                          <form
                            key={grant.id}
                            action={revokeGrantAction}
                            className="flex items-center gap-1"
                          >
                            <input type="hidden" name="grantId" value={grant.id} />
                            <Award aria-hidden size={14} />
                            <span>
                              {localize(
                                levels.find((level) => level.n === grant.levelN)?.name,
                                locale,
                              )}{" "}
                              · {pathTitle(grant.pathId)}
                            </span>
                            <SubmitButton
                              className="btn btn-ghost btn-sm"
                              title={t.t("team.people.revoke")}
                              confirm={t.t("team.people.revokeConfirm")}
                            >
                              <X aria-hidden size={14} />
                            </SubmitButton>
                          </form>
                        ))}
                      {pathRows.length > 0 && (
                        <details>
                          <summary className="cursor-pointer font-semibold">
                            {t.t("team.people.grant")}
                          </summary>
                          <form action={grantLevelAction} className="mt-2 space-y-2">
                            <input type="hidden" name="userId" value={person.userId} />
                            <select
                              name="levelN"
                              aria-label={t.t("team.people.level")}
                              className="select"
                            >
                              {manual.map((level) => (
                                <option key={level.n} value={level.n}>
                                  {level.n} · {localize(level.name, locale)}
                                </option>
                              ))}
                            </select>
                            <select
                              name="pathId"
                              aria-label={pathTerm}
                              className="select"
                              defaultValue={person.pathId ?? pathRows[0]!.path.id}
                            >
                              {pathRows.map((row) => (
                                <option key={row.path.id} value={row.path.id}>
                                  {localize(row.path.title, locale)}
                                </option>
                              ))}
                            </select>
                            <input
                              name="reason"
                              aria-label={t.t("team.people.reason")}
                              className="input"
                              placeholder={t.t("team.people.reasonPlaceholder")}
                              maxLength={200}
                            />
                            <SubmitButton
                              className="btn btn-secondary btn-sm"
                              pendingLabel={t.t("team.people.granting")}
                            >
                              {t.t("team.people.grantButton")}
                            </SubmitButton>
                          </form>
                        </details>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {contacts && (
        <section aria-labelledby="contacts-heading" className="card-flat space-y-4 p-5">
          <div>
            <h2 id="contacts-heading" className="text-lg font-semibold">
              {t.t("team.people.contacts")}
            </h2>
            <p className="text-sm text-muted">{t.t("team.people.contactsBody")}</p>
          </div>
          <ul className="divide-y divide-line">
            {[
              {
                list: "news",
                title: t.t("team.people.newsletter"),
                hint: t.t("team.people.newsletterHint"),
                n: contacts.tenant_marketing,
              },
              {
                list: "contact",
                title: t.t("team.people.openToContact"),
                hint: t.t("team.people.contactHint"),
                n: contacts.lead_handoff,
              },
            ].map((row) => (
              <li key={row.list} className="flex flex-wrap items-center gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {row.title} <span className="font-normal text-muted">· {row.n}</span>
                  </p>
                  <p className="text-sm text-muted">{row.hint}</p>
                </div>
                {row.n > 0 && (
                  <a
                    href={`/studio/people/contacts?list=${row.list}`}
                    className="btn btn-secondary btn-sm"
                  >
                    <Download aria-hidden size={16} /> CSV
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
