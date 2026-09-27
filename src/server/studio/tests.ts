import { eq } from "drizzle-orm";

import { courseTestSchema, type CourseTestDefinition } from "@/core/questions/questions";
import { sameJson } from "@/core/shared/json";
import type { Database } from "@/db/client";
import { courseTests, courses } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";

/*
 * The final test of a course, as authors edit it in the Studio. Callers
 * check capabilities; everything runs inside withTenant.
 */

export interface SavedTest {
  changed: boolean;
  /** The test's version after saving; attempts record the one they were graded on. */
  version: number;
}

/**
 * Saves the questions, the pass mark and whether learners see their
 * mistakes. The version goes up only when something changed, so an attempt
 * graded on version 3 still means the same test. A course whose mode never
 * asked for a test (e.g. created from a manifest) gets its row here.
 */
export async function saveCourseTest(
  db: Database,
  tenantId: string,
  courseId: string,
  input: CourseTestDefinition,
): Promise<SavedTest> {
  const test = courseTestSchema.parse(input);
  return withTenant(db, tenantId, async (tx) => {
    const [course] = await tx
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.id, courseId))
      .for("update");
    if (!course) throw new Error("Course not found");
    const [current] = await tx.select().from(courseTests).where(eq(courseTests.courseId, courseId));
    const saved = current
      ? {
          questions: current.questions,
          passPercent: current.passPercent,
          showMistakes: current.showMistakes,
        }
      : null;
    if (current && sameJson(saved, test)) return { changed: false, version: current.version };
    const [row] = current
      ? await tx
          .update(courseTests)
          .set({ ...test, version: current.version + 1 })
          .where(eq(courseTests.id, current.id))
          .returning({ version: courseTests.version })
      : await tx
          .insert(courseTests)
          .values({ tenantId, courseId, ...test })
          .returning({ version: courseTests.version });
    await tx.update(courses).set({ updatedAt: new Date() }).where(eq(courses.id, courseId));
    return { changed: true, version: row!.version };
  });
}
