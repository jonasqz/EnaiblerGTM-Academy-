import "server-only";

import { cache } from "react";
import { z } from "zod";

import { getDb } from "@/db/client";
import { loadCourseEditor } from "@/server/studio/courses";

/** The course being edited, loaded once per request for the Studio layout and its page. */
export const getCourseEditor = cache(async (tenantId: string, courseId: string) => {
  if (!z.uuid().safeParse(courseId).success) return null;
  return loadCourseEditor(getDb(), tenantId, courseId);
});
