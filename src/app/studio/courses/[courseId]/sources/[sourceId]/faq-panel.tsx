"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useId, useState, useTransition } from "react";

import { draftFaqAction, type FaqState } from "@/app/studio/courses/[courseId]/sources/actions";
import { useStudioText } from "@/components/studio/studio-text";
import { Notice } from "@/components/ui/notice";
import type { Locale } from "@/core/i18n/locales";
import { languageName } from "@/core/i18n/studio/helpers";

/** "Draft an FAQ lesson" from a live Q&A (core/authoring/faq): the lesson lands in the course. */
export function FaqPanel(props: {
  courseId: string;
  sourceId: string;
  languages: Locale[];
  locale: Locale;
  aiAvailable: boolean;
}) {
  const t = useStudioText();
  const uid = useId();
  const [locale, setLocale] = useState<Locale>(props.locale);
  const [result, setResult] = useState<FaqState | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    const data = new FormData();
    data.set("courseId", props.courseId);
    data.set("sourceId", props.sourceId);
    data.set("locale", locale);
    setResult(null);
    startTransition(async () => setResult(await draftFaqAction(data)));
  };

  return (
    <section aria-labelledby={`${uid}-heading`} className="card-flat space-y-4 p-5">
      <div className="space-y-1">
        <h3 id={`${uid}-heading`} className="flex items-center gap-2 font-semibold">
          <Sparkles aria-hidden size={18} /> {t.t("drafts.faq.title")}
        </h3>
        <p className="text-sm text-muted">
          {t.t(props.aiAvailable ? "drafts.faq.intro" : "drafts.faq.introNoAi")}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {props.languages.length > 1 && (
          <div className="field">
            <label htmlFor={`${uid}-locale`} className="label">
              {t.t("drafts.faq.language")}
            </label>
            <select
              id={`${uid}-locale`}
              className="select"
              value={locale}
              onChange={(event) => setLocale(event.target.value as Locale)}
            >
              {props.languages.map((option) => (
                <option key={option} value={option}>
                  {languageName(t, option)}
                </option>
              ))}
            </select>
          </div>
        )}
        <button type="button" className="btn btn-primary" onClick={run} disabled={pending}>
          <Sparkles aria-hidden size={16} />{" "}
          {pending ? t.t("drafts.faq.running") : t.t("drafts.faq.run")}
        </button>
      </div>
      <div aria-live="polite">
        {result?.status === "error" && <Notice tone="critical" title={result.message} />}
        {result?.status === "done" && (
          <Notice tone="good" title={t.t("drafts.faq.done")}>
            <div className="space-y-2">
              {result.fallback && <p>{t.t("drafts.faq.fallback", { reason: result.fallback })}</p>}
              {result.notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
              {result.open.length > 0 && (
                <>
                  <p>{t.n("drafts.faq.left", result.open.length)}</p>
                  <ul className="list-disc space-y-1 pl-5">
                    {result.open.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                </>
              )}
              <Link
                href={`/studio/courses/${props.courseId}/lessons/${result.lessonId}` as Route}
                className="inline-flex items-center gap-1.5 font-semibold underline"
              >
                {t.t("drafts.faq.open")} <ArrowRight aria-hidden size={16} />
              </Link>
            </div>
          </Notice>
        )}
      </div>
    </section>
  );
}
