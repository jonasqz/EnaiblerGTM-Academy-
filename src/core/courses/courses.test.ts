import { describe, expect, it } from "vitest";

import { can, capabilitiesOf } from "@/core/access/roles";
import {
  acceptsText,
  formFieldsFromSchema,
  validateFormValues,
} from "@/core/assignments/submission-types";
import {
  courseProgress,
  lessonKeyFor,
  neighbours,
  nextLessonKey,
  resumeLessonKey,
} from "@/core/courses/lessons";
import { checkCoursePublishable, type PublishCheckInput } from "@/core/courses/publish-check";
import { starterRubric } from "@/core/courses/starter-rubric";
import { lintLocalizedWording } from "@/core/compliance/wording-lint";
import { learnerAlias } from "@/core/people/alias";
import type { TestQuestion } from "@/core/questions/questions";
import { canResubmit, effectiveOutcome } from "@/core/review/outcome";

describe("roles", () => {
  it("gives learners no studio access", () => {
    expect(can(["learner"], "studio.view")).toBe(false);
  });

  it("lets authors build and publish courses and run the review queue", () => {
    expect([...capabilitiesOf(["author"])].sort()).toEqual([
      "cohorts.manage",
      "courses.edit",
      "courses.publish",
      "courses.view",
      "people.view",
      "reviews.decide",
      "studio.view",
    ]);
  });

  it("keeps reviewers away from course editing", () => {
    expect(can(["reviewer"], "reviews.decide")).toBe(true);
    expect(can(["reviewer"], "courses.edit")).toBe(false);
  });

  it("combines roles", () => {
    expect(can(["learner", "tenant_admin"], "courses.publish")).toBe(true);
  });

  it("leaves the academy's settings and brand to admins", () => {
    expect(can(["tenant_admin"], "academy.manage")).toBe(true);
    expect(can(["author", "reviewer"], "academy.manage")).toBe(false);
  });
});

describe("lessons", () => {
  const keys = ["intro", "problem", "interviews", "brief"];

  it("derives unique keys from titles", () => {
    expect(lessonKeyFor("Why ideas fail", [])).toBe("why-ideas-fail");
    expect(lessonKeyFor("Intro", ["intro", "intro-2"])).toBe("intro-3");
    expect(lessonKeyFor("!!!", [])).toBe("lesson");
  });

  it("computes progress", () => {
    expect(
      courseProgress(keys, { intro: { completedAt: "x" }, brief: { completedAt: "x" } }),
    ).toEqual({
      done: 2,
      total: 4,
      percent: 50,
    });
    expect(courseProgress([], {}).percent).toBe(0);
  });

  it("resumes at the first unfinished lesson", () => {
    expect(resumeLessonKey(keys, { intro: { completedAt: "x" } })).toBe("problem");
    const all = Object.fromEntries(keys.map((key) => [key, { completedAt: "x" }]));
    expect(resumeLessonKey(keys, all)).toBeNull();
  });

  it("moves on to the next unfinished lesson, wrapping to skipped ones", () => {
    const progress = { intro: { completedAt: "x" }, interviews: { completedAt: "x" } };
    expect(nextLessonKey(keys, progress, "problem")).toBe("brief");
    expect(nextLessonKey(keys, { interviews: { completedAt: "x" } }, "brief")).toBe("intro");
    expect(
      nextLessonKey(
        keys,
        {
          intro: { completedAt: "x" },
          problem: { completedAt: "x" },
          interviews: { completedAt: "x" },
        },
        "brief",
      ),
    ).toBeNull();
  });

  it("finds neighbours", () => {
    expect(neighbours(keys, "intro")).toEqual({ previous: null, next: "problem" });
    expect(neighbours(keys, "brief")).toEqual({ previous: "interviews", next: null });
  });
});

describe("starter rubric", () => {
  it("covers only the course languages and passes the wording guardrail", () => {
    const rubric = starterRubric(["de"]);
    expect(rubric.criteria.map((criterion) => criterion.id)).toEqual([
      "complete",
      "evidence",
      "clarity",
    ]);
    expect(rubric.criteria[0]?.label).toEqual({ de: "Vollständig" });
    for (const criterion of starterRubric(["de", "en"]).criteria) {
      expect(lintLocalizedWording(criterion.label, "level_name")).toEqual([]);
    }
  });
});

describe("publish checklist", () => {
  const rubric = starterRubric(["en"]);
  const ready: PublishCheckInput = {
    course: {
      title: { en: "Validation Lab" },
      languages: ["en"],
      deliveryMode: "free_async",
      estMinutes: 90,
      completionMode: "work",
    },
    lessons: [
      { key: "intro", locale: "en", title: "Intro", markdown: "Hello", criterionIds: ["complete"] },
      {
        key: "evidence",
        locale: "en",
        title: "Evidence",
        markdown: "Talk to 5 people",
        criterionIds: ["evidence", "clarity"],
      },
    ],
    assignment: {
      prompt: { en: "Write a one-page brief." },
      artifactName: { en: "Validated idea brief" },
      submissionTypes: [{ type: "file", accept: ["md"], max_mb: 15 }],
    },
    rubric,
  };

  it("needs the academy's imprint and privacy page before anything goes public", () => {
    const blocked = checkCoursePublishable({
      ...ready,
      academy: { legalLinks: { imprint: "https://acme.example/imprint" } },
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.errors.map((issue) => issue.code)).toEqual(["legal_pages_missing"]);
    const fine = checkCoursePublishable({
      ...ready,
      academy: {
        legalLinks: {
          imprint: "https://acme.example/imprint",
          privacy: "https://acme.example/privacy",
        },
      },
    });
    expect(fine.ok).toBe(true);
  });

  it("passes a complete course and maps coverage", () => {
    const result = checkCoursePublishable(ready);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.coverage.map((row) => [row.criterionId, row.lessonKeys])).toEqual([
      ["complete", ["intro"]],
      ["evidence", ["evidence"]],
      ["clarity", ["evidence"]],
    ]);
  });

  it("flags criteria no lesson teaches", () => {
    const result = checkCoursePublishable({
      ...ready,
      lessons: ready.lessons.map((lesson) => ({ ...lesson, criterionIds: [] })),
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.filter((w) => w.code === "criterion_not_taught")).toHaveLength(3);
  });

  it("blocks missing lessons, assignment and rubric", () => {
    const result = checkCoursePublishable({
      ...ready,
      lessons: [],
      assignment: null,
      rubric: null,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code).sort()).toEqual([
      "no_assignment",
      "no_lessons",
      "no_rubric",
    ]);
  });

  it("requires every course language to be complete", () => {
    const result = checkCoursePublishable({
      ...ready,
      course: { ...ready.course, languages: ["en", "de"] },
    });
    expect(result.errors.map((e) => [e.code, e.locale])).toEqual([
      ["missing_title", "de"],
      ["no_lessons", "de"],
      ["missing_assignment_text", "de"],
    ]);
  });

  it("blocks certification wording in titles and warns in lesson text", () => {
    const result = checkCoursePublishable({
      ...ready,
      course: { ...ready.course, title: { en: "Certified Validation Lab" } },
      lessons: [
        { ...ready.lessons[0]!, markdown: "Unlike certification courses …" },
        ready.lessons[1]!,
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toEqual(["wording"]);
    expect(result.warnings.map((w) => w.code)).toEqual(["wording"]);
  });

  describe("courses that end with a final test", () => {
    const question = (id: string, texts: { en: string; de?: string }): TestQuestion => ({
      id,
      prompt: texts,
      options: [
        { id: "a", text: { en: "Yes", ...(texts.de ? { de: "Ja" } : {}) } },
        { id: "b", text: { en: "No", ...(texts.de ? { de: "Nein" } : {}) } },
      ],
      correct: ["a"],
    });
    const five = ["q1", "q2", "q3", "q4", "q5"].map((id) =>
      question(id, { en: `Is ${id} right?` }),
    );

    it("asks for a test instead of work when the test alone completes the course", () => {
      const result = checkCoursePublishable({
        ...ready,
        course: { ...ready.course, completionMode: "test" },
        assignment: null,
        rubric: null,
        test: { questions: five },
      });
      expect(result.ok).toBe(true);
      expect(result.warnings).toEqual([]);
      // No rubric to cover when nobody hands in work.
      expect(result.coverage).toEqual([]);
      const empty = checkCoursePublishable({
        ...ready,
        course: { ...ready.course, completionMode: "test" },
        test: { questions: [] },
      });
      expect(empty.errors.map((e) => e.code)).toEqual(["no_test"]);
    });

    it("asks for both when the course ends with work and a test", () => {
      const result = checkCoursePublishable({
        ...ready,
        course: { ...ready.course, completionMode: "work_and_test" },
        assignment: null,
        test: null,
      });
      expect(result.errors.map((e) => e.code).sort()).toEqual(["no_assignment", "no_test"]);
    });

    it("needs every question in every course language and warns about short tests", () => {
      const result = checkCoursePublishable({
        ...ready,
        course: {
          ...ready.course,
          title: { en: "Lab", de: "Lab" },
          languages: ["en", "de"],
          completionMode: "test",
        },
        lessons: [...ready.lessons, ...ready.lessons.map((l) => ({ ...l, locale: "de" as const }))],
        test: {
          questions: [question("q1", { en: "Yes?", de: "Ja?" }), question("q2", { en: "Hm?" })],
        },
      });
      expect(result.errors.map((e) => [e.code, e.locale, e.params])).toEqual([
        ["missing_test_text", "de", { count: 1 }],
      ]);
      expect(result.warnings.map((w) => [w.code, w.params])).toEqual([
        ["test_too_short", { count: 2, min: 5 }],
      ]);
    });

    it("lints questions: lesson checks as lesson text, the test as test text", () => {
      const result = checkCoursePublishable({
        ...ready,
        course: { ...ready.course, completionMode: "work_and_test" },
        lessons: [
          {
            ...ready.lessons[0]!,
            questions: [
              {
                id: "k1",
                prompt: "Which certification fits?",
                options: [
                  { id: "a", text: "A" },
                  { id: "b", text: "B" },
                ],
                correct: ["a"],
              },
            ],
          },
          ready.lessons[1]!,
        ],
        test: { questions: [...five, question("q6", { en: "Is this accredited?" })] },
      });
      expect(result.ok).toBe(true);
      expect(result.warnings.map((w) => w.finding?.context)).toEqual([
        "lesson_text",
        "test_question",
      ]);
    });
  });

  it("blocks paid delivery modes until payments ship", () => {
    const result = checkCoursePublishable({
      ...ready,
      course: { ...ready.course, deliveryMode: "paid_live" },
    });
    expect(result.errors.map((e) => e.code)).toEqual(["delivery_mode"]);
  });

  it("keeps a paid live series from taking recordings instead of attendance (FernUSG)", () => {
    const result = checkCoursePublishable({
      ...ready,
      course: { ...ready.course, deliveryMode: "paid_live", sessionRule: "attended_or_watched" },
      sessions: [{ title: "Kick-off", status: "published" }],
      platform: { paymentsEnabled: true },
    });
    expect(result.errors.map((e) => [e.code, e.deliveryMode])).toEqual([
      ["delivery_mode", "paid_recording_replaces_session"],
    ]);
  });

  it("warns about sessions learners cannot register for yet, and a rule without sessions", () => {
    const series = checkCoursePublishable({
      ...ready,
      course: { ...ready.course, sessionRule: "attended" },
      lessons: [
        ...ready.lessons,
        // The session is the lesson's content: no text needed.
        {
          key: "live-1",
          locale: "en",
          title: "Live",
          markdown: "",
          criterionIds: [],
          session: true,
        },
      ],
      sessions: [
        { title: "Kick-off", status: "published" },
        { title: "Review day", status: "draft" },
      ],
    });
    expect(series.ok).toBe(true);
    expect(series.warnings.map((w) => [w.code, w.params?.title])).toEqual([
      ["session_draft", "Review day"],
    ]);
    const empty = checkCoursePublishable({
      ...ready,
      course: { ...ready.course, sessionRule: "attended_or_watched" },
    });
    expect(empty.warnings.map((w) => w.code)).toEqual(["sessions_missing"]);
  });

  it("warns about missing translations and empty lessons", () => {
    const result = checkCoursePublishable({
      ...ready,
      course: { ...ready.course, title: { en: "Lab", de: "Lab" }, languages: ["en", "de"] },
      assignment: {
        ...ready.assignment!,
        prompt: { en: "p", de: "p" },
        artifactName: { en: "a", de: "a" },
      },
      lessons: [
        ...ready.lessons,
        { key: "intro", locale: "de", title: "Intro", markdown: " ", criterionIds: [] },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.map((w) => w.code).sort()).toEqual([
      "empty_lesson",
      "missing_translation",
    ]);
  });
});

describe("assignment form fields", () => {
  const schema = {
    type: "object",
    required: ["customer"],
    properties: {
      customer: { type: "string", title: "Customer", maxLength: 120 },
      evidence: { type: "string", title: "Evidence", description: "Quotes from interviews" },
    },
  };

  it("reads the supported JSON-schema subset", () => {
    expect(formFieldsFromSchema(schema)).toEqual([
      { key: "customer", title: "Customer", required: true, multiline: false, maxLength: 120 },
      {
        key: "evidence",
        title: "Evidence",
        description: "Quotes from interviews",
        required: false,
        multiline: true,
        maxLength: 5000,
      },
    ]);
  });

  it("rejects schemas it cannot render", () => {
    expect(formFieldsFromSchema({ type: "array" })).toBeNull();
    expect(
      formFieldsFromSchema({ type: "object", properties: { n: { type: "number" } } }),
    ).toBeNull();
    expect(
      formFieldsFromSchema({ type: "object", properties: { "Bad Key": { type: "string" } } }),
    ).toBeNull();
  });

  it("validates values", () => {
    const fields = formFieldsFromSchema(schema)!;
    expect(validateFormValues(fields, { customer: "  " })).toEqual({
      ok: false,
      errors: { customer: "required" },
    });
    expect(validateFormValues(fields, { customer: "x".repeat(121) })).toEqual({
      ok: false,
      errors: { customer: "too_long" },
    });
    expect(validateFormValues(fields, { customer: " Designers ", evidence: "" })).toEqual({
      ok: true,
      data: { customer: "Designers" },
    });
  });

  it("knows when learners may write Markdown directly", () => {
    expect(acceptsText([{ type: "file", accept: ["md", "pdf"], max_mb: 10 }])).toBe(true);
    expect(acceptsText([{ type: "url" }])).toBe(false);
  });
});

describe("learner aliases", () => {
  it("is stable per academy and differs between academies", () => {
    const a = learnerAlias("tenant-a", "user-1");
    expect(a).toMatch(/^L-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(learnerAlias("tenant-a", "user-1")).toBe(a);
    expect(learnerAlias("tenant-b", "user-1")).not.toBe(a);
  });
});

describe("submission outcome", () => {
  it("maps statuses to what the learner sees", () => {
    expect(effectiveOutcome("submitted", null)).toBe("pending");
    expect(effectiveOutcome("in_review", null)).toBe("pending");
    expect(effectiveOutcome("passed", null)).toBe("passed");
    expect(effectiveOutcome("overridden", false)).toBe("needs_revision");
    expect(effectiveOutcome("overridden", true)).toBe("passed");
  });

  it("allows resubmission only after a revision request", () => {
    expect(canResubmit(null)).toBe(true);
    expect(canResubmit("needs_revision")).toBe(true);
    expect(canResubmit("pending")).toBe(false);
    expect(canResubmit("passed")).toBe(false);
  });
});
