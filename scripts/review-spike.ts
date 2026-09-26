/**
 * October spike: AI review quality and cost on real exemplars (brief §8, §13).
 *
 *   LLM_BASE_URL=http://localhost:4000/v1 LLM_API_KEY=… LLM_REVIEW_MODEL=… \
 *     npx tsx scripts/review-spike.ts spikes/review/idea-brief --runs 3
 *
 * A spike folder holds spike.yaml (assignment, rubric, locale, tone) and
 * exemplars/*.md|*.txt. File names state the author's verdict: pass-*.md must
 * pass, fail-*.md must not. Reports agreement with the author, consistency
 * across runs, cost and latency, and writes JSON to <folder>/results/.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { localeSchema } from "@/core/i18n/locales";
import { REVIEW_TONES } from "@/core/review/prompt";
import { rubricSchema } from "@/core/review/rubric";
import { createLlmCaller } from "@/server/llm";
import { runAiReview } from "@/server/review/run-ai-review";

const spikeSchema = z.strictObject({
  locale: localeSchema.default("en"),
  tone: z.enum(REVIEW_TONES).default("warm"),
  assignment: z.strictObject({ artifact_name: z.string().min(1), prompt: z.string().min(1) }),
  rubric: rubricSchema,
});

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

async function main() {
  const args = process.argv.slice(2);
  const folder = args.find((arg) => !arg.startsWith("--"));
  const runsFlag = args.indexOf("--runs");
  const runs = runsFlag === -1 ? 1 : Number.parseInt(args[runsFlag + 1] ?? "1", 10);
  const { LLM_BASE_URL, LLM_API_KEY, LLM_REVIEW_MODEL } = process.env;
  if (!folder || !LLM_BASE_URL || !LLM_REVIEW_MODEL) {
    console.error(
      "Usage: LLM_BASE_URL=… LLM_REVIEW_MODEL=… tsx scripts/review-spike.ts <spike-folder> [--runs n]",
    );
    process.exit(1);
  }

  const spike = spikeSchema.parse(parseYaml(readFileSync(join(folder, "spike.yaml"), "utf8")));
  const files = readdirSync(join(folder, "exemplars"))
    .filter((name) => /^(pass|fail)-.*\.(md|txt)$/.test(name))
    .sort();
  if (files.length === 0) throw new Error("No exemplars named pass-*.md / fail-*.md found");

  const llm = createLlmCaller({ baseUrl: LLM_BASE_URL, apiKey: LLM_API_KEY });
  const rows: Array<Record<string, unknown>> = [];

  for (const file of files) {
    const expected = file.startsWith("pass-");
    const text = readFileSync(join(folder, "exemplars", file), "utf8");
    for (let run = 1; run <= runs; run++) {
      const outcome = await runAiReview({
        llm,
        model: LLM_REVIEW_MODEL,
        prompt: {
          locale: spike.locale,
          tone: spike.tone,
          assignmentPrompt: spike.assignment.prompt,
          artifactName: spike.assignment.artifact_name,
          rubric: spike.rubric,
          submission: { text },
        },
        metadata: { spike: folder, exemplar: file },
      });
      const row = {
        file,
        run,
        expected,
        ok: outcome.ok,
        pass: outcome.ok ? outcome.review.pass : null,
        percent: outcome.ok ? outcome.review.percent : null,
        agrees: outcome.ok ? outcome.review.pass === expected : false,
        scores: outcome.ok
          ? Object.fromEntries(outcome.review.criteria.map((c) => [c.criterionId, c.score]))
          : null,
        evidenceVerified: outcome.ok ? outcome.review.evidenceVerifiedRatio : null,
        attempts: outcome.calls.length,
        tokensIn: outcome.calls.reduce((sum, call) => sum + (call.tokensIn ?? 0), 0),
        tokensOut: outcome.calls.reduce((sum, call) => sum + (call.tokensOut ?? 0), 0),
        cost: outcome.totalCost,
        latencyMs: outcome.calls.reduce((sum, call) => sum + call.latencyMs, 0),
        errors: outcome.ok ? [] : outcome.errors,
      };
      rows.push(row);
      console.log(
        `${row.agrees ? "✓" : "✗"} ${file} #${run}: expected ${expected ? "pass" : "fail"}, got ${
          row.ok ? `${row.pass ? "pass" : "fail"} (${row.percent}%)` : "invalid output"
        } · ${row.attempts} call(s) · ${row.tokensIn}/${row.tokensOut} tokens · ${row.cost ?? "?"} · ${row.latencyMs} ms`,
      );
    }
  }

  const reviewed = rows.filter((row) => row.ok);
  const costs = rows
    .map((row) => row.cost)
    .filter((cost): cost is number => typeof cost === "number");
  const latencies = rows.map((row) => row.latencyMs as number);
  const unstable = files.filter(
    (file) => new Set(rows.filter((row) => row.file === file).map((row) => row.pass)).size > 1,
  );
  const summary = {
    model: LLM_REVIEW_MODEL,
    reviews: rows.length,
    agreement: rows.filter((row) => row.agrees).length / rows.length,
    invalidOutputs: rows.length - reviewed.length,
    unstableVerdicts: unstable,
    meanCost: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
    maxCost: costs.length ? Math.max(...costs) : null,
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
  };
  console.log("\nSummary", summary);
  console.log(
    "Cost is in LiteLLM's price currency (USD unless configured). Target: under €0.10 per review.",
  );

  mkdirSync(join(folder, "results"), { recursive: true });
  const out = join(folder, "results", `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(out, JSON.stringify({ summary, rows }, null, 2));
  console.log(`Wrote ${out}`);
}

await main();
