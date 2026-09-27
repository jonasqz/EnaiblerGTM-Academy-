"use client";

import { MailCheck } from "lucide-react";
import { useState, type ReactNode } from "react";

import { createAcademyAction, type SignupState } from "@/app/platform/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import type { Locale } from "@/core/i18n/locales";
import { suggestAcademySlug } from "@/core/platform/academy-slug";

export interface SignupLabels {
  name: string;
  nameHint: string;
  slug: string;
  slugHint: string;
  email: string;
  emailHint: string;
  language: string;
  alsoOffer: string;
  website: string;
  websiteHint: string;
  accept: string;
  termsLink: string;
  dpaLink: string;
  submit: string;
  submitting: string;
  sentTitle: string;
  sentBody: string;
  sentNext: string;
}

/** "I accept the {terms} and the {dpa}." with the placeholders as links. */
function withLinks(template: string, links: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{\w+\})/).map((part, index) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    return key && key in links ? <span key={index}>{links[key]}</span> : part;
  });
}

export function SignupForm(props: {
  labels: SignupLabels;
  languages: Array<{ value: Locale; name: string }>;
  defaultLanguage: Locale;
  address: { prefix: string; suffix: string };
  links: { terms?: string; dpa?: string };
}) {
  const { labels } = props;
  const { state, pending, onSubmit } = useActionForm<SignupState>(createAcademyAction, {
    status: "idle",
  });
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [language, setLanguage] = useState<Locale>(props.defaultLanguage);
  const errors = state.status === "error" ? state.fields : {};
  const other = props.languages.find((option) => option.value !== language);

  if (state.status === "sent") {
    return (
      <div className="space-y-4" role="status">
        <span className="grid size-12 place-items-center rounded-card bg-primary-soft">
          <MailCheck aria-hidden size={24} />
        </span>
        <h2 className="font-display text-2xl">{labels.sentTitle}</h2>
        <p>
          {labels.sentBody
            .replace("{email}", state.email)
            .replace("{url}", state.url.replace(/^https?:\/\//, ""))}
        </p>
        <p className="text-sm text-muted">{labels.sentNext}</p>
      </div>
    );
  }

  const error = (field: keyof typeof errors) =>
    errors[field] ? (
      <p className="hint font-semibold" style={{ color: "var(--status-critical)" }}>
        {errors[field]}
      </p>
    ) : null;

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="text-sm font-semibold"
          style={{ color: "var(--status-critical)" }}
        >
          {state.message}
        </p>
      )}
      {/* Honeypot: hidden from people and assistive technology, filled by bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Fax
          <input name="fax" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="field">
        <label htmlFor="signup-name" className="label">
          {labels.name}
        </label>
        <input
          id="signup-name"
          name="name"
          className="input"
          required
          maxLength={80}
          autoComplete="organization"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!slugEdited) setSlug(suggestAcademySlug(event.target.value));
          }}
          aria-describedby="signup-name-hint"
        />
        <p id="signup-name-hint" className="hint">
          {labels.nameHint}
        </p>
        {error("name")}
      </div>

      <div className="field">
        <label htmlFor="signup-slug" className="label">
          {labels.slug}
        </label>
        <div className="flex items-center overflow-hidden rounded-control border-outline border-line bg-card focus-within:outline focus-within:outline-3 focus-within:outline-primary">
          <span className="hidden pl-3 text-sm text-muted sm:inline">{props.address.prefix}</span>
          <input
            id="signup-slug"
            name="slug"
            required
            maxLength={40}
            autoCapitalize="none"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent px-2 py-2.5 outline-none sm:px-0.5"
            value={slug}
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
            }}
            aria-describedby="signup-slug-hint"
          />
          <span className="pr-3 text-sm text-muted">{props.address.suffix}</span>
        </div>
        <p id="signup-slug-hint" className="hint">
          {labels.slugHint}
        </p>
        {error("slug")}
      </div>

      <div className="field">
        <label htmlFor="signup-email" className="label">
          {labels.email}
        </label>
        <input
          id="signup-email"
          name="email"
          type="email"
          className="input"
          required
          autoComplete="email"
          inputMode="email"
          aria-describedby="signup-email-hint"
        />
        <p id="signup-email-hint" className="hint">
          {labels.emailHint}
        </p>
        {error("email")}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="signup-language" className="label">
            {labels.language}
          </label>
          <select
            id="signup-language"
            name="language"
            className="select"
            value={language}
            onChange={(event) => setLanguage(event.target.value as Locale)}
          >
            {props.languages.map((option) => (
              <option key={option.value} value={option.value}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
        {other && (
          <label className="flex items-center gap-2 self-end pb-3 text-sm">
            <input
              type="checkbox"
              name="alsoOffer"
              defaultChecked
              className="size-4 accent-(--tenant-primary)"
            />
            {labels.alsoOffer.replace("{language}", other.name)}
          </label>
        )}
      </div>

      <div className="field">
        <label htmlFor="signup-website" className="label">
          {labels.website}
        </label>
        <input
          id="signup-website"
          name="website"
          className="input"
          inputMode="url"
          autoComplete="url"
          placeholder="acme.com"
          aria-describedby="signup-website-hint"
        />
        <p id="signup-website-hint" className="hint">
          {labels.websiteHint}
        </p>
        {error("website")}
      </div>

      <div className="space-y-1">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="accept"
            required
            className="mt-0.5 size-4 shrink-0 accent-(--tenant-primary)"
          />
          <span>
            {withLinks(labels.accept, {
              terms: (
                <a href={props.links.terms} target="_blank" rel="noopener" className="underline">
                  {labels.termsLink}
                </a>
              ),
              dpa: (
                <a href={props.links.dpa} target="_blank" rel="noopener" className="underline">
                  {labels.dpaLink}
                </a>
              ),
            })}
          </span>
        </label>
        {error("accept")}
      </div>

      <SubmitButton
        pending={pending}
        pendingLabel={labels.submitting}
        className="btn btn-primary w-full"
      >
        {labels.submit}
      </SubmitButton>
    </form>
  );
}
