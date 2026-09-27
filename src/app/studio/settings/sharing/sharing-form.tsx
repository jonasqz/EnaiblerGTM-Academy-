"use client";

import { ExternalLink } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { FormState } from "@/app/studio/actions";
import { saveSharingSettingsAction } from "@/app/studio/settings/sharing/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { useStudioText } from "@/components/studio/studio-text";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import { COMPLETION_MODES, type CompletionMode } from "@/core/courses/completion";
import { suggestedPost, type PostFacts } from "@/core/credentials/share";
import {
  DEFAULT_CTA_LABEL,
  linkedInPageId,
  parseHashtags,
  POST_MAX_LENGTH,
  POST_PLACEHOLDERS,
} from "@/core/credentials/share-settings";
import type { Locale, LocalizedText } from "@/core/i18n/locales";
import { languageName } from "@/core/i18n/studio/helpers";
import type { Translator } from "@/core/i18n/translator";

/** A sample certificate in one language, per way a course can end (see sharing/page.tsx). */
export interface PostSample {
  locale: Locale;
  modes: Array<{ facts: PostFacts; enaibler: string }>;
}

/**
 * suggestedPost asks a learner translator only for enaibler's own text, which
 * the server worded with the sample values: the learner catalogue stays out
 * of the Studio's bundle.
 */
function wordedOnServer(locale: Locale, text: string): Translator {
  return { locale, terms: {} as Translator["terms"], t: () => text, term: () => "" };
}

/** A Studio text with its {placeholders} shown as code. */
function withCode(text: string): ReactNode[] {
  return text
    .split(/(\{\w+\})/)
    .map((part, index) => (index % 2 === 0 ? part : <code key={index}>{part}</code>));
}

export function SharingForm(props: {
  locales: readonly Locale[];
  linkedinOrganizationId: string;
  postText: LocalizedText;
  /** As shown in the field: "#Freelancing #Invoicing". */
  hashtags: string;
  ctaLabel: LocalizedText;
  ctaUrl: string;
  /** Where the button leads a visitor from a LinkedIn post, as saved. */
  ctaExample: string;
  samples: PostSample[];
}) {
  const t = useStudioText();
  const { state, pending, onSubmit } = useActionForm<FormState>(saveSharingSettingsAction, {});
  const [linkedinId, setLinkedinId] = useState(props.linkedinOrganizationId);
  const [posts, setPosts] = useState<LocalizedText>(props.postText);
  const [hashtags, setHashtags] = useState(props.hashtags);
  const [mode, setMode] = useState<CompletionMode>("work");
  const pageId = linkedInPageId(linkedinId);
  const tags = parseHashtags(hashtags).map((tag) => tag.replace(/^#/, ""));
  const columns = props.locales.length > 1 ? "lg:grid-cols-2" : "";

  const preview = (sample: PostSample, own: string) => {
    const example = sample.modes.find((entry) => entry.facts.basis === mode) ?? sample.modes[0]!;
    return suggestedPost(wordedOnServer(sample.locale, example.enaibler), example.facts, {
      template: own.trim() || null,
      hashtags: tags,
    });
  };

  return (
    <form onSubmit={onSubmit} className="max-w-4xl space-y-6">
      <section aria-labelledby="linkedin-heading" className="card-flat space-y-4 p-5 sm:p-6">
        <div>
          <h2 id="linkedin-heading" className="text-lg font-semibold">
            {t.t("settings.sharing.linkedin.heading")}
          </h2>
          <p className="text-sm text-muted">{t.t("settings.sharing.linkedin.intro")}</p>
        </div>
        <div className="field max-w-md">
          <label htmlFor="linkedin-id" className="label">
            {t.t("settings.sharing.linkedin.label")}
          </label>
          <input
            id="linkedin-id"
            name="linkedinId"
            className="input"
            inputMode="url"
            maxLength={300}
            placeholder={t.t("settings.sharing.linkedin.placeholder")}
            value={linkedinId}
            onChange={(event) => setLinkedinId(event.target.value)}
            aria-describedby="linkedin-how"
          />
          <p id="linkedin-how" className="hint">
            {t.t("settings.sharing.linkedin.howTo")}
          </p>
          {pageId && /^\d+$/.test(pageId) && (
            <a
              href={`https://www.linkedin.com/company/${pageId}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-semibold hover:underline"
            >
              {t.t("settings.sharing.linkedin.open")} <ExternalLink aria-hidden size={14} />
            </a>
          )}
        </div>
      </section>

      <section aria-labelledby="post-heading" className="card-flat space-y-5 p-5 sm:p-6">
        <div>
          <h2 id="post-heading" className="text-lg font-semibold">
            {t.t("settings.sharing.post.heading")}
          </h2>
          <p className="text-sm text-muted">{t.t("settings.sharing.post.intro")}</p>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold">{t.t("settings.sharing.post.placeholders")}</p>
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
            {POST_PLACEHOLDERS.map((name) => (
              <div key={name} className="contents">
                <dt>
                  <code>{`{${name}}`}</code>
                </dt>
                <dd className="text-muted">{t.t(`settings.sharing.placeholder.${name}`)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="field max-w-md">
          <label htmlFor="hashtags" className="label">
            {t.t("settings.sharing.hashtags.label")}
          </label>
          <input
            id="hashtags"
            name="hashtags"
            className="input"
            maxLength={250}
            placeholder={t.t("settings.sharing.hashtags.placeholder")}
            value={hashtags}
            onChange={(event) => setHashtags(event.target.value)}
            aria-describedby="hashtags-hint"
          />
          <p id="hashtags-hint" className="hint">
            {t.t("settings.sharing.hashtags.hint")}
          </p>
        </div>
        <div className="field max-w-md">
          <label htmlFor="preview-mode" className="label">
            {t.t("settings.sharing.preview.mode")}
          </label>
          <select
            id="preview-mode"
            className="select"
            value={mode}
            onChange={(event) => setMode(event.target.value as CompletionMode)}
            aria-describedby="preview-hint"
          >
            {COMPLETION_MODES.map((value) => (
              <option key={value} value={value}>
                {t.t(`courses.completion.${value}`)}
              </option>
            ))}
          </select>
          <p id="preview-hint" className="hint">
            {t.t("settings.sharing.preview.intro")}
          </p>
        </div>
        <div className={`grid gap-6 ${columns}`}>
          {props.samples.map((sample) => {
            const own = posts[sample.locale] ?? "";
            return (
              <div key={sample.locale} className="min-w-0 space-y-3">
                <p className="eyebrow">{languageName(t, sample.locale)}</p>
                <div className="field">
                  <label htmlFor={`post-${sample.locale}`} className="label">
                    {t.t("settings.sharing.post.label")}
                  </label>
                  <textarea
                    id={`post-${sample.locale}`}
                    name={`post.${sample.locale}`}
                    className="textarea"
                    rows={6}
                    maxLength={POST_MAX_LENGTH}
                    value={own}
                    onChange={(event) =>
                      setPosts({ ...posts, [sample.locale]: event.target.value })
                    }
                  />
                </div>
                <figure className="space-y-2">
                  <figcaption className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-semibold">{t.t("settings.sharing.preview.heading")}</span>
                    <Badge tone={own.trim() ? "info" : "neutral"}>
                      {own.trim()
                        ? t.t("settings.sharing.preview.own")
                        : t.t("settings.sharing.preview.default")}
                    </Badge>
                  </figcaption>
                  <p
                    lang={sample.locale}
                    className="whitespace-pre-wrap break-words rounded-control border border-line bg-subtle p-3 text-sm"
                  >
                    {preview(sample, own)}
                  </p>
                </figure>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="cta-heading" className="card-flat space-y-5 p-5 sm:p-6">
        <div>
          <h2 id="cta-heading" className="text-lg font-semibold">
            {t.t("settings.cta.heading")}
          </h2>
          <p className="text-sm text-muted">{t.t("settings.cta.intro")}</p>
        </div>
        <fieldset className="space-y-3">
          <legend className="label mb-1.5">{t.t("settings.sharing.cta.labels")}</legend>
          <div className={`grid gap-5 ${props.locales.length > 1 ? "sm:grid-cols-2" : ""}`}>
            {props.locales.map((locale) => (
              <div key={locale} className="field">
                <label htmlFor={`cta-${locale}`} className="label">
                  {languageName(t, locale)}
                </label>
                <input
                  id={`cta-${locale}`}
                  name={`cta.${locale}`}
                  className="input"
                  maxLength={40}
                  placeholder={DEFAULT_CTA_LABEL[locale]}
                  defaultValue={props.ctaLabel[locale] ?? ""}
                />
              </div>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="cta-url" className="label">
            {t.t("settings.sharing.cta.url")}{" "}
            <span className="font-normal text-muted">({t.t("common.optional")})</span>
          </label>
          <input
            id="cta-url"
            name="ctaUrl"
            className="input"
            inputMode="url"
            maxLength={500}
            placeholder={t.t("settings.sharing.cta.urlPlaceholder")}
            defaultValue={props.ctaUrl}
            aria-describedby="cta-url-hint"
          />
          <p id="cta-url-hint" className="hint">
            {withCode(t.t("settings.sharing.cta.urlHint"))}
          </p>
        </div>
        <div className="space-y-2 text-sm">
          <p className="text-muted">{t.t("settings.sharing.cta.utm")}</p>
          <p className="break-all rounded-control bg-subtle p-3 font-mono text-xs">
            {props.ctaExample}
          </p>
        </div>
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 space-y-3 border-t border-line bg-surface/95 px-4 py-4 backdrop-blur-sm sm:mx-0 sm:rounded-card sm:border">
        <FormFeedback state={state} />
        <div className="flex justify-end">
          <SubmitButton pending={pending} pendingLabel={t.t("common.saving")}>
            {t.t("settings.sharing.save")}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
