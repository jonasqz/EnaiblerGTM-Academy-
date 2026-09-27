"use client";

import { Plus, Trash } from "lucide-react";
import { useState } from "react";

import type { FormState } from "@/app/studio/actions";
import { saveLevelsAction } from "@/app/studio/paths/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { useStudioText } from "@/components/studio/studio-text";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import type { Locale, LocalizedText } from "@/core/i18n/locales";
import { languageName } from "@/core/i18n/studio/helpers";
import type { LevelDefinition, LevelRule } from "@/core/levels/rules";

interface Draft {
  key: string;
  name: Partial<Record<Locale, string>>;
  rule: LevelRule["type"];
  min: number;
}

const RULES: Array<LevelRule["type"]> = [
  "courses_completed_in_path",
  "path_complete",
  "manual_grant",
];

function toDraft(level: LevelDefinition): Draft {
  return {
    key: `level-${level.n}`,
    name: { ...level.name },
    rule: level.rule.type,
    min: level.rule.type === "courses_completed_in_path" ? level.rule.min : 1,
  };
}

/** Level scheme (brief §4, LevelScheme): numbered 1..N, one rule each. */
export function LevelsEditor(props: { levels: LevelDefinition[]; locales: Locale[] }) {
  const t = useStudioText();
  const [levels, setLevels] = useState<Draft[]>(() => props.levels.map(toDraft));
  const { state, pending, onSubmit } = useActionForm<FormState>(saveLevelsAction, {});
  const serialized = JSON.stringify(
    levels.map((level, index) => {
      const name: LocalizedText = {};
      for (const locale of props.locales) {
        const value = level.name[locale]?.trim();
        if (value) name[locale] = value;
      }
      return {
        n: index + 1,
        name,
        rule:
          level.rule === "courses_completed_in_path"
            ? { type: level.rule, min: Math.max(1, level.min) }
            : { type: level.rule },
      };
    }),
  );
  const update = (index: number, patch: Partial<Draft>) =>
    setLevels((current) =>
      current.map((level, i) => (i === index ? { ...level, ...patch } : level)),
    );

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="levels" value={serialized} />
      {levels.length === 0 && <p className="text-sm text-muted">{t.t("team.levels.empty")}</p>}
      <ol className="space-y-3">
        {levels.map((level, index) => (
          <li
            key={level.key}
            className="card-flat grid items-start gap-3 p-4 md:grid-cols-[3rem_1fr_16rem_auto]"
          >
            <span className="text-2xl font-semibold tabular-nums text-muted">{index + 1}</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {props.locales.map((locale) => (
                <label key={locale} className="field">
                  <span className="label">
                    {t.t("team.paths.nameIn", { language: languageName(t, locale) })}
                  </span>
                  <input
                    className="input"
                    value={level.name[locale] ?? ""}
                    maxLength={60}
                    onChange={(event) =>
                      update(index, { name: { ...level.name, [locale]: event.target.value } })
                    }
                  />
                </label>
              ))}
            </div>
            <div className="space-y-2">
              <label className="field">
                <span className="label">{t.t("team.levels.reachedWhen")}</span>
                <select
                  className="select"
                  value={level.rule}
                  onChange={(event) =>
                    update(index, { rule: event.target.value as LevelRule["type"] })
                  }
                >
                  {RULES.map((rule) => (
                    <option key={rule} value={rule}>
                      {t.t(`team.levels.rule.${rule}`)}
                    </option>
                  ))}
                </select>
              </label>
              {level.rule === "courses_completed_in_path" && (
                <label className="flex items-center gap-2 text-sm">
                  {t.t("team.levels.atLeast")}
                  <input
                    type="number"
                    min={1}
                    max={50}
                    className="input w-20"
                    value={level.min}
                    onChange={(event) => update(index, { min: Number(event.target.value) })}
                  />
                  {t.t("team.levels.inPath")}
                </label>
              )}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm self-start"
              aria-label={t.t("team.levels.remove", { n: index + 1 })}
              onClick={() => setLevels((current) => current.filter((_, i) => i !== index))}
            >
              <Trash aria-hidden size={16} />
            </button>
          </li>
        ))}
      </ol>
      <div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() =>
            setLevels((current) => [
              ...current,
              {
                key: `new-${Date.now()}`,
                name: {},
                rule: "courses_completed_in_path",
                min: current.length + 1,
              },
            ])
          }
        >
          <Plus aria-hidden size={16} /> {t.t("team.levels.add")}
        </button>
      </div>
      <FormFeedback state={state} />
      <SubmitButton pending={pending} pendingLabel={t.t("common.saving")}>
        {t.t("team.levels.save")}
      </SubmitButton>
    </form>
  );
}
