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
import type { StudioKey } from "@/core/i18n/studio/index";
import type { StudioText } from "@/core/i18n/studio/translator";
import { getDb } from "@/db/client";
import { requireCapability } from "@/server/access";
import { domainSetup, listStudioDomains, type StudioDomain } from "@/server/domains/claims";
import { hostAddresses } from "@/server/domains/dns";
import { academyOrigin } from "@/server/platform/config";
import { getStudioText } from "@/server/studio-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStudioText();
  return { title: t.t("settings.tab.domains") };
}

const MISSING: Record<string, StudioKey> = {
  txt: "settings.domains.missing.txt",
  routing: "settings.domains.missing.routing",
};

function lastResult(t: StudioText, row: StudioDomain): string | null {
  if (!row.lastCheckedAt) return null;
  if (row.state === "failed") {
    return row.lastResult === "taken"
      ? t.t("settings.domains.taken")
      : t.t("settings.domains.expired", { days: CLAIM_TTL_DAYS });
  }
  const missing = (row.lastResult ?? "").split(",").filter(Boolean);
  return t.t("settings.domains.checked", {
    when: t.date(row.lastCheckedAt, "dateTime"),
    missing: t.list(missing.map((key) => (MISSING[key] ? t.t(MISSING[key]) : key))),
  });
}

/** The academy's addresses: its main one, the others, and custom domains waiting for DNS. */
export default async function DomainsPage() {
  const { tenant } = await requireCapability("academy.manage", "/studio/settings/domains");
  const t = await getStudioText();
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
            {t.t("settings.domains.addresses")}
          </h2>
          <p className="text-sm text-muted">{t.t("settings.domains.addressesIntro")}</p>
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
                  {t.t("settings.domains.main")}
                </Badge>
              ) : (
                <>
                  <form action={makePrimaryAction}>
                    <input type="hidden" name="domain" value={row.domain} />
                    <SubmitButton
                      className="btn btn-secondary btn-sm"
                      pendingLabel={t.t("settings.domains.switching")}
                      confirm={t.t("settings.domains.makeMainConfirm", { domain: row.domain })}
                    >
                      {t.t("settings.domains.makeMain")}
                    </SubmitButton>
                  </form>
                  {row.custom && (
                    <form action={removeDomainAction}>
                      <input type="hidden" name="domain" value={row.domain} />
                      <SubmitButton
                        className="btn btn-ghost btn-sm"
                        confirm={t.t("settings.domains.removeConfirm", { domain: row.domain })}
                      >
                        {t.t("common.remove")}
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
        const result = lastResult(t, row);
        return (
          <section
            key={row.domain}
            aria-label={t.t("settings.domains.settingUp", { domain: row.domain })}
            className="card-flat space-y-4 p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="min-w-0 flex-1 truncate font-mono text-base font-semibold">
                {row.domain}
              </h2>
              {row.state === "pending" ? (
                <Badge tone="info" icon={Clock}>
                  {t.t("settings.domains.waiting")}
                </Badge>
              ) : (
                <Badge tone="critical" icon={TriangleAlert}>
                  {t.t("settings.domains.notVerified")}
                </Badge>
              )}
            </div>
            {row.state === "pending" && setup && (
              <>
                <p className="text-sm">{t.t("settings.domains.instructions")}</p>
                <div className="table-wrap">
                  <table className="table">
                    <caption className="sr-only">
                      {t.t("settings.domains.recordsCaption", { domain: row.domain })}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">{t.t("settings.domains.type")}</th>
                        <th scope="col">{t.t("settings.domains.name")}</th>
                        <th scope="col">{t.t("settings.domains.value")}</th>
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
                  {t.t(
                    targetAddresses.length > 0
                      ? "settings.domains.apexAddresses"
                      : "settings.domains.apexTarget",
                    {
                      types: targetAddresses.some((address) => address.includes(":"))
                        ? "A/AAAA"
                        : "A",
                      addresses: targetAddresses.join(", "),
                      target: setup.target,
                    },
                  )}
                </p>
              </>
            )}
            {result && <p className="text-sm text-muted">{result}</p>}
            <div className="flex flex-wrap gap-2">
              {row.state === "pending" && (
                <form action={checkDomainAction}>
                  <input type="hidden" name="claimId" value={row.claimId} />
                  <SubmitButton
                    className="btn btn-secondary btn-sm"
                    pendingLabel={t.t("settings.domains.checking")}
                  >
                    {t.t("settings.domains.checkNow")}
                  </SubmitButton>
                </form>
              )}
              <form action={removeDomainAction}>
                <input type="hidden" name="domain" value={row.domain} />
                <SubmitButton className="btn btn-ghost btn-sm">{t.t("common.remove")}</SubmitButton>
              </form>
            </div>
          </section>
        );
      })}

      {setup ? (
        <AddDomainForm />
      ) : (
        <Notice tone="info" title={t.t("settings.domains.unavailable")}>
          {t.t("settings.domains.unavailableBody")}
        </Notice>
      )}
    </div>
  );
}
