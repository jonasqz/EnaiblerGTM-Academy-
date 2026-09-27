import { z } from "zod";

import { can } from "@/core/access/roles";
import { localize } from "@/core/i18n/locales";
import { CONTACT_COLUMNS, LEAD_COLUMNS, leadCsvRow } from "@/core/people/leads";
import { toCsv } from "@/core/shared/csv";
import { getDb } from "@/db/client";
import { getSession } from "@/server/access";
import { listContacts } from "@/server/consent";
import { exportLeads } from "@/server/studio/leads";

const FILES = { news: "newsletter", contact: "open-to-contact" } as const;

/**
 * Learners who agreed to hear from the academy, as CSV for its own tools
 * (brief §9 and §11: the academy decides where its marketing mail comes
 * from). Only confirmed, unrevoked consents; export again before each send.
 * Leads come with what they completed and where they came from, for a CRM.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session || !can(session.roles, "contacts.export")) {
    return new Response("Not found", { status: 404 });
  }
  const params = new URL(request.url).searchParams;
  const list = params.get("list");
  if (list !== "news" && list !== "contact") return new Response("Not found", { status: 404 });
  const { tenant } = session;
  let rows: Array<ReadonlyArray<string | boolean | null>>;
  if (list === "contact") {
    const course = z.uuid().safeParse(params.get("course"));
    const leads = await exportLeads(getDb(), tenant.id, {
      courseId: course.success ? course.data : null,
    });
    const locale = tenant.settings.default_locale;
    rows = [
      LEAD_COLUMNS,
      ...leads.map((lead) => leadCsvRow(lead, (title) => localize(title, locale))),
    ];
  } else {
    const contacts = await listContacts(getDb(), tenant.id, "tenant_marketing");
    rows = [
      CONTACT_COLUMNS,
      ...contacts.map((contact) => [
        contact.email,
        contact.name,
        contact.locale,
        contact.wording,
        contact.requestedAt.toISOString(),
        contact.confirmedAt.toISOString(),
      ]),
    ];
  }
  const day = new Date().toISOString().slice(0, 10);
  // The BOM makes spreadsheet apps read UTF-8 (umlauts in names).
  return new Response(`﻿${toCsv(rows)}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${tenant.slug}-${FILES[list]}-${day}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
