import { bigint, index, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { FILE_PURPOSES } from "@/core/files/policy";
import { createdAt, tenantIsolation } from "@/db/schema/_shared";
import { user } from "@/db/schema/auth";
import { tenants } from "@/db/schema/tenancy";

export const filePurpose = pgEnum("file_purpose", FILE_PURPOSES);
export const fileStatus = pgEnum("file_status", ["pending", "attached"]);

/**
 * Every object in storage (brief §11). The row decides who may read the file
 * (see core/files/policy.ts); the object itself is never public. Uploads that
 * still wait for their form (a learner's hand-in) are `pending` and removed
 * after a day if nothing claims them.
 */
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    purpose: filePurpose("purpose").notNull(),
    status: fileStatus("status").notNull().default("attached"),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    /** Cleaned original name, used for downloads. */
    name: text("name").notNull(),
    sha256: text("sha256").notNull(),
    /** The learner a file belongs to (hand-ins, showcase, exports); deleted with them. */
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    /** When a pending upload was claimed. */
    attachedAt: timestamp("attached_at", { withTimezone: true }),
  },
  (table) => [
    unique("files_tenant_id").on(table.tenantId, table.id),
    unique("files_storage_key").on(table.storageKey),
    index("files_pending_idx").on(table.tenantId, table.status, table.createdAt),
    tenantIsolation(),
  ],
).enableRLS();
