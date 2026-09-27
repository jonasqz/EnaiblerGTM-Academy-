import { Users } from "lucide-react";
import type { Metadata } from "next";

import { LearnerName } from "@/components/studio/learner-name";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { localize } from "@/core/i18n/locales";
import { createTranslator } from "@/core/i18n/translator";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { listPeople } from "@/server/studio/insights";

export const metadata: Metadata = { title: "People" };

const dates = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });

/** Everyone learning in this academy, private by default (brief §9). */
export default async function PeoplePage() {
  const { tenant } = await requireCapability("people.view", "/studio/people");
  const people = await listPeople(getDb(), tenant.id);
  const paths = tenant.settings.features.paths;
  const pathTerm = createTranslator({ locale: "en", termOverrides: tenant.terminology }).term(
    "path",
  );
  const contactable = people.filter((person) => person.contactEmail).length;
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
