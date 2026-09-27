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

export const metadata: Metadata = { title: "People" };

const dates = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });

/** Everyone learning in this academy, private by default (brief §9). */
export default async function PeoplePage() {
  const { tenant, roles } = await requireCapability("people.view", "/studio/people");
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
  const pathTerm = createTranslator({ locale: "en", termOverrides: tenant.terminology }).term(
    "path",
  );
  const contactable = people.filter((person) => person.contactEmail).length;
  const contacts = can(roles, "contacts.export") ? await countContacts(getDb(), tenant.id) : null;
  const finished = people.filter((person) => person.completed > 0).length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="People"
        description="Learners appear under an alias that is stable within this academy. Names and e-mail addresses only show for learners who agreed to be contacted."
      />
      <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Learners" value={people.length} />
        <StatTile label="Completed a course" value={finished} />
        <StatTile label="Open to contact" value={contactable} />
      </section>

      {people.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No learners yet"
          body="Share a course link: learners sign in with their e-mail address."
        />
      ) : (
        <div className="card-flat table-wrap">
          <table className="table">
            <caption className="sr-only">Learners</caption>
            <thead>
              <tr>
                <th scope="col">Learner</th>
                {paths && <th scope="col">{pathTerm}</th>}
                <th scope="col" className="num">
                  Started
                </th>
                <th scope="col" className="num">
                  Completed
                </th>
                <th scope="col" className="num">
                  Certificates
                </th>
                <th scope="col">Joined</th>
                {manual.length > 0 && <th scope="col">Granted levels</th>}
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
                    {dates.format(person.joinedAt)}
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
                              title="Take the level back"
                              confirm="Take this level back?"
                            >
                              <X aria-hidden size={14} />
                            </SubmitButton>
                          </form>
                        ))}
                      {pathRows.length > 0 && (
                        <details>
                          <summary className="cursor-pointer font-semibold">Grant a level</summary>
                          <form action={grantLevelAction} className="mt-2 space-y-2">
                            <input type="hidden" name="userId" value={person.userId} />
                            <select name="levelN" aria-label="Level" className="select">
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
                              aria-label="Reason"
                              className="input"
                              placeholder="Reason (optional)"
                              maxLength={200}
                            />
                            <SubmitButton
                              className="btn btn-secondary btn-sm"
                              pendingLabel="Granting…"
                            >
                              Grant
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
              Contacts
            </h2>
            <p className="text-sm text-muted">
              Learners who agreed to hear from you, for your newsletter or CRM. Only confirmed
              consents; people can withdraw here at any time, so export again before each mailing.
            </p>
          </div>
          <ul className="divide-y divide-line">
            {[
              {
                list: "news",
                title: "Newsletter",
                hint: "Confirmed by double opt-in (the learner clicked the link we mailed).",
                n: contacts.tenant_marketing,
              },
              {
                list: "contact",
                title: "Open to contact",
                hint: "Agreed that you may contact them about your offers.",
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
