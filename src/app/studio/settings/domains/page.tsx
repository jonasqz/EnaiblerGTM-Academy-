import { CircleCheck, Clock, Globe, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";

import { AddDomainForm } from "@/app/studio/settings/domains/add-domain-form";
import {
  checkDomainAction,
  makePrimaryAction,
  removeDomainAction,
} from "@/app/studio/settings/domains/actions";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { CLAIM_TTL_DAYS, verificationRecord } from "@/core/domains/rules";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { domainSetup, listStudioDomains, type StudioDomain } from "@/server/domains/claims";
import { hostAddresses } from "@/server/domains/dns";
import { academyOrigin } from "@/server/platform/config";

export const metadata: Metadata = { title: "Domains" };

const when = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

const MISSING: Record<string, string> = {
  txt: "the TXT record is not there yet",
  routing: "the domain does not point to your academy yet",
};

function lastResult(row: StudioDomain): string | null {
  if (!row.lastCheckedAt) return null;
  if (row.state === "failed") {
    return row.lastResult === "taken"
      ? "Another academy verified this domain first."
      : `DNS was not set up within ${CLAIM_TTL_DAYS} days. Remove it and add it again to get a new record.`;
  }
  const missing = (row.lastResult ?? "").split(",").filter(Boolean);
  return `Checked ${when.format(row.lastCheckedAt)}: ${missing.map((key) => MISSING[key] ?? key).join(" and ")}.`;
}

/** The academy's addresses: its main one, the others, and custom domains waiting for DNS. */
export default async function DomainsPage() {
  const { tenant } = await requireCapability("academy.manage", "/studio/settings/domains");
  const setup = domainSetup(tenant);
  const [domains, targetAddresses] = await Promise.all([
    listStudioDomains(getDb(), tenant.id),
    setup ? hostAddresses(setup.target) : Promise.resolve([]),
  ]);
  const live = domains.filter((row) => row.state === "primary" || row.state === "active");
  const claims = domains.filter((row) => row.state === "pending" || row.state === "failed");

  return (
    <div className="max-w-3xl space-y-6">
      <section aria-labelledby="live-heading" className="card-flat space-y-3 p-5 sm:p-6">
        <div>
          <h2 id="live-heading" className="text-lg font-semibold">
            Addresses
          </h2>
          <p className="text-sm text-muted">
            Links in mails and on certificates use the main address; the others redirect to it.
          </p>
        </div>
        <ul className="divide-y divide-line">
          {live.map((row) => (
            <li key={row.domain} className="flex flex-wrap items-center gap-3 py-3">
              <Globe aria-hidden size={18} className="shrink-0 text-muted" />
              <a
                href={academyOrigin(row.domain).origin}
                className="min-w-0 flex-1 truncate font-mono text-sm font-semibold hover:underline"
              >
                {row.domain}
              </a>
              {row.state === "primary" ? (
                <Badge tone="good" icon={CircleCheck}>
                  Main address
                </Badge>
              ) : (
                <>
                  <form action={makePrimaryAction}>
                    <input type="hidden" name="domain" value={row.domain} />
                    <SubmitButton
                      className="btn btn-secondary btn-sm"
                      pendingLabel="Switching…"
                      confirm={`Make ${row.domain} the main address? You will sign in again there; learners do too, once.`}
                    >
                      Make main address
                    </SubmitButton>
                  </form>
                  {row.custom && (
                    <form action={removeDomainAction}>
                      <input type="hidden" name="domain" value={row.domain} />
                      <SubmitButton
                        className="btn btn-ghost btn-sm"
                        confirm={`Remove ${row.domain}? Links to it stop working.`}
                      >
                        Remove
                      </SubmitButton>
                    </form>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      {claims.map((row) => {
        const txt = verificationRecord(row.domain, row.token!);
        const result = lastResult(row);
        return (
          <section
            key={row.domain}
            aria-label={`Setting up ${row.domain}`}
            className="card-flat space-y-4 p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="min-w-0 flex-1 truncate font-mono text-base font-semibold">
                {row.domain}
              </h2>
              {row.state === "pending" ? (
                <Badge tone="info" icon={Clock}>
                  Waiting for DNS
                </Badge>
              ) : (
                <Badge tone="critical" icon={TriangleAlert}>
                  Not verified
                </Badge>
              )}
            </div>
            {row.state === "pending" && setup && (
              <>
                <p className="text-sm">
                  Add these two records where your domain’s DNS is managed. We check every ten
                  minutes; the domain goes live, with its certificate, once both are found.
                </p>
                <div className="table-wrap">
                  <table className="table">
                    <caption className="sr-only">DNS records for {row.domain}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Type</th>
                        <th scope="col">Name</th>
                        <th scope="col">Value</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-xs">
                      <tr>
                        <td>CNAME</td>
                        <td className="break-all">{row.domain}</td>
                        <td className="break-all">{setup.target}</td>
                      </tr>
                      <tr>
                        <td>TXT</td>
                        <td className="break-all">{txt.name}</td>
                        <td className="break-all">{txt.value}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="hint">
                  A domain without a subdomain (like your-company.com) cannot have a CNAME: use A
                  {targetAddresses.some((address) => address.includes(":")) ? "/AAAA" : ""} records
                  {targetAddresses.length > 0
                    ? ` to ${targetAddresses.join(", ")}`
                    : ` with the addresses of ${setup.target}`}{" "}
                  instead.
                </p>
              </>
            )}
            {result && <p className="text-sm text-muted">{result}</p>}
            <div className="flex flex-wrap gap-2">
              {row.state === "pending" && (
                <form action={checkDomainAction}>
                  <input type="hidden" name="claimId" value={row.claimId} />
                  <SubmitButton className="btn btn-secondary btn-sm" pendingLabel="Checking DNS…">
                    Check now
                  </SubmitButton>
                </form>
              )}
              <form action={removeDomainAction}>
                <input type="hidden" name="domain" value={row.domain} />
                <SubmitButton className="btn btn-ghost btn-sm">Remove</SubmitButton>
              </form>
            </div>
          </section>
        );
      })}

      {setup ? (
        <AddDomainForm />
      ) : (
        <Notice tone="info" title="Own domains are not set up on this server yet">
          The operator sets CUSTOM_DOMAIN_TARGET or ACADEMY_DOMAIN to enable them.
        </Notice>
      )}
    </div>
  );
}
