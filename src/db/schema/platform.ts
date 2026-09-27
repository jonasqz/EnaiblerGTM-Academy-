import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { tenantIsolation } from "@/db/schema/_shared";
import { user } from "@/db/schema/auth";
import { tenants } from "@/db/schema/tenancy";

export const agreementKind = pgEnum("agreement_kind", ["terms", "dpa"]);

/**
 * What the customer accepted when creating a self-serve academy: enaibler's
 * terms and the data processing agreement (enaibler processes the academy's
 * learner data on its behalf). The wording shown is kept with the version.
 */
export const tenantAgreements = pgTable(
  "tenant_agreements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kind: agreementKind("kind").notNull(),
    version: text("version").notNull(),
    wording: text("wording").notNull(),
    acceptedBy: text("accepted_by").references(() => user.id, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [tenantIsolation()],
).enableRLS();
