import "server-only";

import { and, eq } from "drizzle-orm";

import { can } from "@/core/access/roles";
import { fileRules } from "@/core/assignments/submission-types";
import { requiresWork } from "@/core/courses/completion";
import { FILE_PURPOSES, type FilePurpose } from "@/core/files/policy";
import { getDb } from "@/db/client";
import { assignments, courses, credentials, enrollments } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import type { Session } from "@/server/access";
import type { StoreFileInput } from "@/server/files";

/**
 * Who may upload what (the route in app/api/uploads calls this before
 * reading the body). Learners upload hand-ins for courses they are enrolled
 * in and showcase images for their own credentials; everything else is
 * Studio work behind a capability.
 */

const MB = 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type UploadGrant = Pick<
  StoreFileInput,
  "purpose" | "ownerUserId" | "createdBy" | "status" | "maxBytes" | "allowedMimes"
>;

export type UploadDenied = { status: 400 | 403 | 404; error: string };

const STUDIO_PURPOSES: Partial<Record<FilePurpose, "courses.edit" | "academy.manage">> = {
  lesson_media: "courses.edit",
  source: "courses.edit",
  exemplar: "courses.edit",
  path_visual: "courses.edit",
  brand_logo: "academy.manage",
  brand_font: "academy.manage",
};

export function isUploadPurpose(value: string | null): value is FilePurpose {
  return (
    value !== null &&
    (FILE_PURPOSES as readonly string[]).includes(value) &&
    value !== "keyframe" &&
    value !== "export"
  );
}

export async function authorizeUpload(
  session: Session,
  purpose: FilePurpose,
  params: URLSearchParams,
): Promise<UploadGrant | UploadDenied> {
  const { tenant, viewer, roles } = session;
  const studioCapability = STUDIO_PURPOSES[purpose];
  if (studioCapability) {
    if (!can(roles, studioCapability)) return { status: 403, error: "forbidden" };
    const courseId = params.get("course");
    if (courseId) {
      if (!UUID.test(courseId)) return { status: 400, error: "invalid_course" };
      const [course] = await withTenant(getDb(), tenant.id, (tx) =>
        tx.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)),
      );
      if (!course) return { status: 404, error: "course_not_found" };
    }
    return { purpose, createdBy: viewer.userId, status: "attached" };
  }

  if (purpose === "submission") {
    const slug = params.get("course") ?? "";
    const [row] = await withTenant(getDb(), tenant.id, (tx) =>
      tx
        .select({
          submissionTypes: assignments.submissionTypes,
          completionMode: courses.completionMode,
        })
        .from(enrollments)
        .innerJoin(courses, eq(courses.id, enrollments.courseId))
        .innerJoin(assignments, eq(assignments.courseId, courses.id))
        .where(
          and(
            eq(courses.slug, slug),
            eq(courses.status, "published"),
            eq(enrollments.userId, viewer.userId),
          ),
        ),
    );
    if (!row) return { status: 404, error: "not_enrolled" };
    // A course that ends with the test alone takes no hand-ins, even if it kept its assignment.
    if (!requiresWork(row.completionMode)) return { status: 400, error: "files_not_accepted" };
    const rules = fileRules(row.submissionTypes);
    if (!rules) return { status: 400, error: "files_not_accepted" };
    return {
      purpose,
      ownerUserId: viewer.userId,
      createdBy: viewer.userId,
      status: "pending",
      maxBytes: rules.maxMb * MB,
      allowedMimes: rules.mimeTypes,
    };
  }

  if (purpose === "showcase") {
    const publicId = params.get("credential") ?? "";
    const [credential] = await withTenant(getDb(), tenant.id, (tx) =>
      tx
        .select({ id: credentials.id })
        .from(credentials)
        .where(and(eq(credentials.publicId, publicId), eq(credentials.userId, viewer.userId))),
    );
    if (!credential) return { status: 404, error: "credential_not_found" };
    return {
      purpose,
      ownerUserId: viewer.userId,
      createdBy: viewer.userId,
      status: "pending",
    };
  }

  return { status: 400, error: "purpose_not_uploadable" };
}
