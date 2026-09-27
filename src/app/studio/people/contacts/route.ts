import { can } from "@/core/access/roles";
import { toCsv } from "@/core/shared/csv";
import { getDb } from "@/db/client";
import { getSession } from "@/server/access";
import { listContacts, type ContactList } from "@/server/consent";

const LISTS: Record<string, { list: ContactList; file: string }> = {
  news: { list: "tenant_marketing", file: "newsletter" },
  contact: { list: "lead_handoff", file: "open-to-contact" },
};

/**
 * Learners who agreed to hear from the academy, as CSV for its own tools
 * (brief §9 and §11: the academy decides where its marketing mail comes
 * from). Only confirmed, unrevoked consents; export again before each send.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session || !can(session.roles, "contacts.export")) {
    return new Response("Not found", { status: 404 });
  }
  const chosen = LISTS[new URL(request.url).searchParams.get("list") ?? ""];
  if (!chosen) return new Response("Not found", { status: 404 });
  const contacts = await listContacts(getDb(), session.tenant.id, chosen.list);
  const csv = toCsv([
    ["email", "name", "language", "agreed_to", "asked_at", "confirmed_at"],
    ...contacts.map((contact) => [
      contact.email,
      contact.name,
      contact.locale,
      contact.wording,
      contact.requestedAt.toISOString(),
      contact.confirmedAt.toISOString(),
    ]),
  ]);
  const day = new Date().toISOString().slice(0, 10);
  // The BOM makes spreadsheet apps read UTF-8 (umlauts in names).
  return new Response(`﻿${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${session.tenant.slug}-${chosen.file}-${day}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
