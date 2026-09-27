"use client";

import { Minus, Plus, Trash } from "lucide-react";
import { useId } from "react";

import { LANGUAGE_NAMES } from "@/components/studio/language-names";
import { SUPPORTED_LOCALES, type Locale, type LocalizedText } from "@/core/i18n/locales";
import type { Exemplar, ReviewMode, ReviewPolicy, Rubric } from "@/core/review/rubric";

/*
 * Rubric editor (brief §7 step 1). Works on a draft and serialises it for
 * the server, which validates it with rubricSchema. Criterion ids are fixed
 * once saved: lessons point at them for the coverage map.
 */

export type LocalizedDraft = Partial<Record<Locale, string>>;

export interface CriterionDraft {
  /** React key; stable while editing. */
  key: string;
  /** Saved id, or "" for a criterion added in this session. */
  id: string;
  label: LocalizedDraft;
  description: LocalizedDraft;
  weight: number;
  levels: Array<{ score: number; description: LocalizedDraft }>;
}

export interface RubricDraft {
  criteria: CriterionDraft[];
  passThreshold: number;
  policy: ReviewPolicy;
  exemplars: Exemplar[];
}

export function draftFromRubric(rubric: Rubric): RubricDraft {
  return {
    criteria: rubric.criteria.map((criterion) => ({
      key: criterion.id,
      id: criterion.id,
      label: { ...criterion.label },
      description: { ...criterion.description },
      weight: criterion.weight,
      levels: criterion.score_descriptors.map((level) => ({
        score: level.score,
        description: { ...level.description },
      })),
    })),
    passThreshold: rubric.pass_threshold,
    policy: rubric.review_policy,
    exemplars: rubric.exemplars,
  };
}

function clean(text: LocalizedDraft): LocalizedText {
  const out: LocalizedText = {};
  for (const locale of SUPPORTED_LOCALES) {
    const value = text[locale]?.trim();
    if (value) out[locale] = value;
  }
  return out;
}

function idFrom(label: string, taken: Set<string>): string {
  const base =
    label
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "criterion";
  const start = /^[a-z0-9]/.test(base) ? base : `c_${base}`;
  if (!taken.has(start)) return start;
  for (let n = 2; ; n++) if (!taken.has(`${start}_${n}`)) return `${start}_${n}`;
}

/** The JSON the server validates (rubricSchema input). */
export function serializeRubric(draft: RubricDraft, primary: Locale) {
  const taken = new Set(
    draft.criteria.filter((criterion) => criterion.id).map((criterion) => criterion.id),
  );
  return {
    criteria: draft.criteria.map((criterion) => {
      let id = criterion.id;
      if (!id) {
        id = idFrom(
          criterion.label[primary] ?? Object.values(criterion.label).find(Boolean) ?? "",
          taken,
        );
        taken.add(id);
      }
      return {
        id,
        label: clean(criterion.label),
        description: clean(criterion.description),
        weight: criterion.weight,
        score_descriptors: criterion.levels.map((level) => ({
          score: level.score,
          description: clean(level.description),
        })),
      };
    }),
    pass_threshold: draft.passThreshold,
    exemplars: draft.exemplars,
    review_policy: draft.policy,
  };
}

/** After a save: new criteria take the id they were saved under. */
export function withSavedIds(draft: RubricDraft, primary: Locale): RubricDraft {
  const saved = serializeRubric(draft, primary).criteria;
  return {
    ...draft,
    criteria: draft.criteria.map((criterion, index) => ({ ...criterion, id: saved[index]!.id })),
  };
}

const MODES: Array<{ mode: ReviewMode; title: string; body: string }> = [
  {
    mode: "ai_auto",
    title: "AI decides, humans spot-check",
    body: "Results reach learners at once. The first passes and then a sample go to the review queue; results near the threshold and repeated fails wait for a human.",
  },
  {
    mode: "ai_then_human",
    title: "AI drafts, a human confirms",
    body: "Every result waits in the review queue with the AI scores filled in.",
  },
  {
    mode: "human_only",
    title: "Humans only",
    body: "No AI review. Every submission goes to the review queue.",
  },
];

let counter = 0;
const newKey = () => `new-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function RubricEditor(props: {
  draft: RubricDraft;
  onChange: (draft: RubricDraft) => void;
  languages: readonly Locale[];
}) {
  const { draft, onChange, languages } = props;
  const uid = useId();
  const totalWeight =
    draft.criteria.reduce((sum, criterion) => sum + (criterion.weight || 0), 0) || 1;

  const update = (index: number, change: Partial<CriterionDraft>) =>
    onChange({
      ...draft,
      criteria: draft.criteria.map((criterion, i) =>
        i === index ? { ...criterion, ...change } : criterion,
      ),
    });
  const setPolicy = (change: Partial<ReviewPolicy>) =>
    onChange({ ...draft, policy: { ...draft.policy, ...change } });
  const setEscalation = (change: Partial<ReviewPolicy["escalate_on"]>) =>
    setPolicy({ escalate_on: { ...draft.policy.escalate_on, ...change } });

  const addCriterion = () =>
    onChange({
      ...draft,
      criteria: [
        ...draft.criteria,
        {
          key: newKey(),
          id: "",
          label: {},
          description: {},
          weight: 1,
          levels: [0, 1, 2, 3].map((score) => ({ score, description: {} })),
        },
      ],
    });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-[12rem_1fr]">
        <div className="field">
          <label htmlFor={`${uid}-threshold`} className="label">
            Pass at
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`${uid}-threshold`}
              type="number"
              min={0}
              max={100}
              step={1}
              className="input w-24"
              aria-describedby={`${uid}-threshold-hint`}
              value={draft.passThreshold}
              onChange={(event) =>
                onChange({ ...draft, passThreshold: Number(event.target.value) })
              }
            />
            <span className="font-semibold">%</span>
          </div>
          <p id={`${uid}-threshold-hint`} className="hint">
            Of the weighted score across all criteria.
          </p>
        </div>
        <fieldset className="field">
          <legend className="label mb-1.5">Who decides</legend>
          <div className="grid gap-2 lg:grid-cols-3">
            {MODES.map((option) => (
              <label
                key={option.mode}
                className={`flex gap-3 rounded-control border p-3 ${
                  draft.policy.mode === option.mode
                    ? "border-primary bg-primary-soft"
                    : "border-line"
                }`}
              >
                <input
                  type="radio"
                  name={`${uid}-mode`}
                  className="mt-1 size-4 shrink-0 accent-(--tenant-primary)"
                  checked={draft.policy.mode === option.mode}
                  onChange={() => setPolicy({ mode: option.mode })}
                />
                <span>
                  <span className="block text-sm font-semibold">{option.title}</span>
                  <span className="text-xs text-muted">{option.body}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <ol className="space-y-4">
        {draft.criteria.map((criterion, index) => {
          const share = Math.round(((criterion.weight || 0) / totalWeight) * 100);
          return (
            <li key={criterion.key} className="rounded-card border border-line bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="font-semibold">
                  Criterion {index + 1}
                  {criterion.id && (
                    <span className="ml-2 font-mono text-xs font-normal text-muted">
                      {criterion.id}
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    Weight
                    <input
                      type="number"
                      min={0.5}
                      max={100}
                      step={0.5}
                      className="input w-20 py-1"
                      value={criterion.weight}
                      onChange={(event) => update(index, { weight: Number(event.target.value) })}
                    />
                  </label>
                  <span className="text-sm text-muted tabular-nums">{share} % of score</span>
                  {draft.criteria.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      title="Remove criterion"
                      aria-label={`Remove criterion ${index + 1}`}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Remove this criterion? Lessons that teach it lose the link, earlier reviews keep their scores.",
                          )
                        ) {
                          onChange({
                            ...draft,
                            criteria: draft.criteria.filter((_, i) => i !== index),
                          });
                        }
                      }}
                    >
                      <Trash aria-hidden size={16} />
                    </button>
                  )}
                </div>
              </div>

              <div className={`mt-3 grid gap-3 ${languages.length > 1 ? "lg:grid-cols-2" : ""}`}>
                {languages.map((locale, position) => (
                  <div key={locale} className="space-y-2">
                    <label className="field">
                      <span className="text-sm font-semibold">
                        Name <span className="text-muted">({LANGUAGE_NAMES[locale]})</span>
                      </span>
                      <input
                        className="input"
                        required={position === 0}
                        maxLength={80}
                        value={criterion.label[locale] ?? ""}
                        placeholder={position === 0 ? "e.g. Evidence" : undefined}
                        onChange={(event) =>
                          update(index, {
                            label: { ...criterion.label, [locale]: event.target.value },
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      <span className="text-sm font-semibold">
                        What the reviewer looks for{" "}
                        <span className="text-muted">({LANGUAGE_NAMES[locale]})</span>
                      </span>
                      <textarea
                        className="textarea min-h-0"
                        rows={2}
                        required={position === 0}
                        maxLength={600}
                        value={criterion.description[locale] ?? ""}
                        onChange={(event) =>
                          update(index, {
                            description: { ...criterion.description, [locale]: event.target.value },
                          })
                        }
                      />
                    </label>
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <p className="text-sm font-semibold">Score levels</p>
                <div className="table-wrap">
                  <table className="table mt-1">
                    <thead>
                      <tr>
                        <th scope="col" className="w-16">
                          Score
                        </th>
                        {languages.map((locale) => (
                          <th key={locale} scope="col">
                            {LANGUAGE_NAMES[locale]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {criterion.levels.map((level, levelIndex) => (
                        <tr key={level.score}>
                          <td className="font-semibold tabular-nums">{level.score}</td>
                          {languages.map((locale, position) => (
                            <td key={locale} className="py-1.5">
                              <input
                                className="input py-1"
                                aria-label={`Score ${level.score}, ${LANGUAGE_NAMES[locale]}`}
                                required={position === 0}
                                maxLength={300}
                                value={level.description[locale] ?? ""}
                                onChange={(event) =>
                                  update(index, {
                                    levels: criterion.levels.map((item, i) =>
                                      i === levelIndex
                                        ? {
                                            ...item,
                                            description: {
                                              ...item.description,
                                              [locale]: event.target.value,
                                            },
                                          }
                                        : item,
                                    ),
                                  })
                                }
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {criterion.levels.length < 11 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        update(index, {
                          levels: [
                            ...criterion.levels,
                            {
                              score: Math.max(...criterion.levels.map((level) => level.score)) + 1,
                              description: {},
                            },
                          ],
                        })
                      }
                    >
                      <Plus aria-hidden size={16} /> Add a level
                    </button>
                  )}
                  {criterion.levels.length > 2 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => update(index, { levels: criterion.levels.slice(0, -1) })}
                    >
                      <Minus aria-hidden size={16} /> Remove the top level
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {draft.criteria.length < 12 && (
        <button type="button" className="btn btn-secondary" onClick={addCriterion}>
          <Plus aria-hidden size={18} /> Add a criterion
        </button>
      )}

      <details className="rounded-card border border-line p-4">
        <summary className="cursor-pointer font-semibold">Spot checks and escalation</summary>
        <p className="mt-2 text-sm text-muted">
          Defaults follow the brief: every AI pass is checked until the first 20, then a sample.
          Change them once you have data.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField
            label="Check every pass until pass no."
            value={draft.policy.initial_full_check_passes}
            min={0}
            onChange={(value) => setPolicy({ initial_full_check_passes: value ?? 0 })}
          />
          <NumberField
            label="Then spot-check (%)"
            value={Math.round(draft.policy.spot_check_rate * 100)}
            min={0}
            max={100}
            onChange={(value) => setPolicy({ spot_check_rate: (value ?? 0) / 100 })}
          />
          <NumberField
            label="Once AI and humans agree (%)"
            value={Math.round(draft.policy.reduce_when_agreement_at_least * 100)}
            min={0}
            max={100}
            onChange={(value) => setPolicy({ reduce_when_agreement_at_least: (value ?? 0) / 100 })}
          />
          <NumberField
            label="… lower the spot checks to (%)"
            value={Math.round(draft.policy.reduced_spot_check_rate * 100)}
            min={0}
            max={100}
            onChange={(value) => setPolicy({ reduced_spot_check_rate: (value ?? 0) / 100 })}
          />
          <NumberField
            label="Hold results within ± points of the threshold"
            value={draft.policy.escalate_on.near_threshold_margin}
            min={0}
            max={50}
            optional
            onChange={(value) => setEscalation({ near_threshold_margin: value })}
          />
          <NumberField
            label="Hold failed results from attempt no."
            value={draft.policy.escalate_on.failed_attempt}
            min={1}
            optional
            onChange={(value) => setEscalation({ failed_attempt: value })}
          />
        </div>
      </details>
    </div>
  );
}

function NumberField(props: {
  label: string;
  value: number | null;
  min?: number;
  max?: number;
  optional?: boolean;
  onChange: (value: number | null) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="text-sm font-semibold">
        {props.label}
      </label>
      <input
        id={id}
        type="number"
        className="input"
        min={props.min}
        max={props.max}
        value={props.value ?? ""}
        placeholder={props.optional ? "Off" : undefined}
        onChange={(event) =>
          props.onChange(
            event.target.value === "" ? (props.optional ? null : 0) : Number(event.target.value),
          )
        }
      />
    </div>
  );
}
