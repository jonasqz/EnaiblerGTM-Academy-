import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { JobError } from "@/core/authoring/job-errors";
import { sectionLabel, sectionsWithinBudget } from "@/core/authoring/sections";
import {
  buildSourceCoveragePrompt,
  coverageBasis,
  coverageIsCurrent,
  parseSourceCoverage,
  SOURCE_COVERAGE_JSON_SCHEMA,
  SOURCE_COVERAGE_PROMPT_VERSION,
  type CoverageBasis,
  type CoverageSection,
  type SourceCoverageEntry,
} from "@/core/authoring/source-coverage";
import { isLocale, localize } from "@/core/i18n/locales";
import { rubricSchema } from "@/core/review/rubric";
import type { Database } from "@/db/client";
import { assignments, courses, rubrics, sourceCoverage, sources } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { askForJson, draftFailure, loadSourceSections } from "@/server/authoring/drafting";
import { meteredModel, type AuthoringModel } from "@/server/authoring/model";

/*
 * The source coverage map (core/authoring/source-coverage): run when the
 * author asks, stored per course, shown next to the lessons coverage.
 */

const SECTION_BUDGET = { total: 50_000, each: 1_500 };

async function currentBasis(db: Database, tenantId: string, courseId: string) {
  return withTenant(db, tenantId, async (tx) => {
    const [course] = await tx.select().from(courses).where(eq(courses.id, courseId));
    const [row] = await tx
      .select({ rubric: rubrics })
      .from(assignments)
      .innerJoin(rubrics, eq(rubrics.id, assignments.rubricId))
      .where(eq(assignments.courseId, courseId));
    const ready = await tx
      .select({ id: sources.id, hash: sources.contentHash })
      .from(sources)
      .where(and(eq(sources.courseId, courseId), eq(sources.status, "ready")));
    return course && row
      ? { course, rubric: row.rubric, basis: coverageBasis(row.rubric.version, ready) }
      : null;
  });
}

export async function mapSourceCoverage(
  db: Database,
  tenantId: string,
  courseId: string,
  input: { requestedBy: string },
  model: AuthoringModel | null,
): Promise<{ ok: true } | { ok: false; error: JobError }> {
  if (!model) return { ok: false, error: "gateway_missing" };
  const context = await currentBasis(db, tenantId, courseId);
  if (!context) return { ok: false, error: "no_assignment" };
  const rubric = rubricSchema.parse(context.rubric.definition);
  const languages = context.course.languages.filter(isLocale);
  const locale = languages[0] ?? "en";
  const sections = sectionsWithinBudget(
    await loadSourceSections(db, tenantId, courseId),
    SECTION_BUDGET,
  );
  if (sections.length === 0) return { ok: false, error: "no_sources" };
  const refs = new Map<string, CoverageSection>(
    sections.map((section, index) => [
      `C${index + 1}`,
      { sourceId: section.sourceId, label: sectionLabel(section) },
    ]),
  );
  const criteria = rubric.criteria.map((criterion) => ({
    id: criterion.id,
    label: localize(criterion.label, locale, languages),
    description: localize(criterion.description, locale, languages),
  }));

  let map: SourceCoverageEntry[] | null;
  try {
    map = await askForJson(
      meteredModel(db, model, { tenantId, kind: "source_coverage", courseId }),
      {
        prompt: buildSourceCoveragePrompt({
          criteria,
          sections: sections.map((section, index) => ({
            ref: `C${index + 1}`,
            label: sectionLabel(section),
            text: section.text,
          })),
          nonce: randomUUID(),
        }),
        jsonSchema: {
          ...SOURCE_COVERAGE_JSON_SCHEMA,
          schema: { ...SOURCE_COVERAGE_JSON_SCHEMA.schema },
        },
        purpose: "source-coverage",
        promptVersion: SOURCE_COVERAGE_PROMPT_VERSION,
        temperature: 0.1,
        maxTokens: 2_000,
        parse: (content) =>
          parseSourceCoverage(
            content,
            criteria.map((criterion) => criterion.id),
            refs,
          ),
      },
    );
  } catch (error) {
    return { ok: false, error: draftFailure(error, "source-coverage") };
  }
  if (!map) return { ok: false, error: "invalid_drafts" };

  const row = {
    tenantId,
    courseId,
    basis: context.basis,
    criteria: map,
    model: model.model,
    promptVersion: SOURCE_COVERAGE_PROMPT_VERSION,
    createdBy: input.requestedBy,
    createdAt: new Date(),
  };
  await withTenant(db, tenantId, (tx) =>
    tx
      .insert(sourceCoverage)
      .values(row)
      .onConflictDoUpdate({
        target: [sourceCoverage.tenantId, sourceCoverage.courseId],
        set: row,
      }),
  );
  return { ok: true };
}

export interface StoredSourceCoverage {
  criteria: SourceCoverageEntry[];
  basis: CoverageBasis;
  createdAt: Date;
  /** False once the rubric or a source changed after the check. */
  current: boolean;
}

export async function loadSourceCoverage(
  db: Database,
  tenantId: string,
  courseId: string,
): Promise<StoredSourceCoverage | null> {
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx.select().from(sourceCoverage).where(eq(sourceCoverage.courseId, courseId)),
  );
  if (!row) return null;
  const now = await currentBasis(db, tenantId, courseId);
  return {
    criteria: row.criteria,
    basis: row.basis,
    createdAt: row.createdAt,
    current: now ? coverageIsCurrent(row.basis, now.basis) : false,
  };
}
