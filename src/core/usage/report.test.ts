import { describe, expect, it } from "vitest";

import { emptyTotals, type AiUsageKind, type KindUsage } from "@/core/usage/ai-usage";
import { usageReport, usageReportCsv, usageReportTable } from "@/core/usage/report";

const usage = (kind: AiUsageKind, values: Partial<KindUsage>): KindUsage => ({
  kind,
  items: 0,
  ...emptyTotals(),
  ...values,
});

const september = usageReport("2026-09", [
  { slug: "quiet", name: "Quiet Academy", kinds: [] },
  {
    slug: "acme",
    name: "Acme Academy",
    kinds: [
      // Four hand-ins, one of which needed a second attempt.
      usage("review", { calls: 5, items: 4, tokensIn: 6000, costMicroUsd: 16_000 }),
      usage("lesson_draft", { calls: 2, items: 1, costMicroUsd: 40_000 }),
      usage("transcription", { calls: 1, items: 1, audioSeconds: 312 }),
      usage("embedding", { calls: 3, items: 2, tokensIn: 9000, costMicroUsd: 90 }),
      usage("brand_import", { calls: 1, items: 1, costIncomplete: true }),
    ],
  },
]);

describe("usage report", () => {
  it("adds up reviews, authoring and transcription per academy, the costliest first", () => {
    expect(september.lines.map((line) => line.slug)).toEqual(["acme", "quiet"]);
    expect(september.lines[0]).toEqual({
      slug: "acme",
      name: "Acme Academy",
      reviews: 4,
      reviewCostMicroUsd: 16_000,
      costPerReviewMicroUsd: 4_000,
      // Setup (the brand import) counts with authoring: everything but reviews.
      authoringCalls: 7,
      authoringCostMicroUsd: 40_090,
      transcriptionSeconds: 312,
      totalCostMicroUsd: 56_090,
      costIncomplete: true,
    });
    expect(september.lines[1]).toMatchObject({
      reviews: 0,
      costPerReviewMicroUsd: null,
      totalCostMicroUsd: 0,
      costIncomplete: false,
    });
    expect(september.total).toMatchObject({
      name: "2 academies",
      reviews: 4,
      costPerReviewMicroUsd: 4_000,
      totalCostMicroUsd: 56_090,
      costIncomplete: true,
    });
  });

  it("prints aligned columns with a total and marks costs that are lower bounds", () => {
    const lines = usageReportTable(september).split("\n");
    expect(lines[0]).toContain("2026-09");
    const header = lines[2]!;
    const acme = lines.find((line) => line.startsWith("acme"))!;
    const quiet = lines.find((line) => line.startsWith("quiet"))!;
    // Numbers end where their column title ends.
    expect(acme.indexOf("0.0160") + "0.0160".length).toBe(
      header.indexOf("review cost") + "review cost".length,
    );
    expect(acme).toMatch(/ 0\.0040 .* 5\.2 +0\.0561 \*$/);
    expect(quiet).toMatch(/ - .* 0\.0000$/);
    expect(lines.find((line) => line.startsWith("total"))).toMatch(/2 academies +4 .*\*$/);
    expect(lines.at(-1)).toMatch(/^\* Some calls had no reported price/);
  });

  it("writes CSV that no spreadsheet turns into a formula", () => {
    const csv = usageReportCsv(
      usageReport("2026-09", [
        { slug: "x", name: '=HYPERLINK("https://evil.example")', kinds: [] },
        { slug: "y", name: "Smith, Jones\nand Co", kinds: [] },
      ]),
    );
    expect(csv.split("\n")).toEqual([
      "month,academy,name,ai_reviews,review_cost_usd,cost_per_review_usd,authoring_calls,authoring_cost_usd,transcription_minutes,total_cost_usd,costs_incomplete",
      `2026-09,x,"'=HYPERLINK(""https://evil.example"")",0,0.0000,,0,0.0000,0.0,0.0000,false`,
      `2026-09,y,"Smith, Jones and Co",0,0.0000,,0,0.0000,0.0,0.0000,false`,
      "",
    ]);
  });
});
