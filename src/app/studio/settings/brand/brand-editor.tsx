"use client";

import { ImageUp, Sparkles, Trash, Type, Upload, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";

import type { FormState } from "@/app/studio/actions";
import {
  importBrandAction,
  prepareFontAction,
  prepareLogoAction,
  type BrandImportState,
} from "@/app/studio/settings/brand/actions";
import {
  draftFromTheme,
  parseDraft,
  PRESETS,
  themeFromDraft,
  type ShadowKind,
  type ThemeDraft,
} from "@/app/studio/settings/brand/theme-draft";
import { ThemePreview } from "@/app/studio/settings/brand/theme-preview";
import { saveThemeAction } from "@/app/studio/settings/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { uploadFile } from "@/components/ui/file-upload";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import { themeContrastIssues } from "@/core/theme/contrast";
import { fontFaceCss, themeToCssVariables } from "@/core/theme/css";
import {
  FONT_WEIGHT_NAMES,
  guessFontFace,
  uploadedFamilies,
  type BundledFont,
} from "@/core/theme/fonts";
import { themeSchema, type Theme } from "@/core/theme/schema";

const UPLOAD_ERRORS: Record<string, string> = {
  too_large: "The file is too large.",
  type_not_allowed: "This type of file is not accepted here.",
  unknown_type: "This type of file is not accepted here.",
  invalid_content: "The file could not be read.",
  rate_limited: "Too many uploads. Try again later.",
};

const COLOR_FIELDS: Array<{
  key: "primary" | "ink" | "surface" | "card";
  label: string;
  hint: string;
}> = [
  { key: "primary", label: "Primary", hint: "Buttons, links, highlights" },
  { key: "ink", label: "Text", hint: "Text, outlines, hard shadows" },
  { key: "surface", label: "Background", hint: "The page behind everything" },
  { key: "card", label: "Cards", hint: "Panels, forms, lessons" },
];

function ColorField(props: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={props.id} className="text-sm font-semibold">
        {props.label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${props.label} colour picker`}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          className="size-10 shrink-0 cursor-pointer rounded-control border border-line bg-card p-0.5"
        />
        <input
          id={props.id}
          className="input font-mono text-sm"
          value={props.value}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => {
            const value = event.target.value.trim();
            if (/^#[0-9a-fA-F]{6}$/.test(value)) props.onChange(value.toLowerCase());
            else event.currentTarget.value = value;
          }}
        />
      </div>
      {props.hint && <p className="hint">{props.hint}</p>}
    </div>
  );
}

export function BrandEditor(props: {
  initial: Theme;
  isDefault: boolean;
  academyName: string;
  courseTerm: string;
  lessonTerm: string;
  website: string;
  fonts: readonly BundledFont[];
}) {
  const [draft, setDraft] = useState<ThemeDraft>(() => draftFromTheme(props.initial));
  const set = (change: Partial<ThemeDraft>) => setDraft((current) => ({ ...current, ...change }));

  const parsed = useMemo(() => parseDraft(draft), [draft]);
  const issues = parsed ? themeContrastIssues(parsed) : [];
  const blocking = issues.filter((issue) => issue.severity === "error");
  const variables = useMemo(
    () => themeToCssVariables(parsed ?? props.initial),
    [parsed, props.initial],
  );

  const save = useActionForm<FormState>(saveThemeAction, {});
  // Presets and imports change the look; the logo and uploaded fonts stay.
  const setLook = (look: Partial<ThemeDraft>) =>
    setDraft((current) => ({
      ...current,
      ...look,
      logo: current.logo,
      fontFiles: current.fontFiles,
      sourceUrls: current.sourceUrls,
    }));
  const importer = useActionForm<BrandImportState>(
    async (previous, formData) => {
      const result = await importBrandAction(previous, formData);
      if (result.status === "done") setLook(draftFromTheme(themeSchema.parse(result.theme)));
      return result;
    },
    { status: "idle" },
  );

  const [logoStatus, setLogoStatus] = useState<string | null>(null);
  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    setLogoStatus("Uploading…");
    const uploaded = await uploadFile("/api/uploads?purpose=brand_logo", file, () => undefined);
    if (!uploaded.ok) {
      setLogoStatus(UPLOAD_ERRORS[uploaded.error] ?? "The logo could not be uploaded.");
      return;
    }
    const prepared = await prepareLogoAction(uploaded.file.id);
    if (!prepared.ok) {
      setLogoStatus(prepared.error);
      return;
    }
    setDraft((current) => ({
      ...current,
      logo: { ...prepared.logo, show_name: current.logo?.show_name ?? true },
    }));
    setLogoStatus(null);
  };

  const [licensed, setLicensed] = useState(false);
  const [fontStatus, setFontStatus] = useState<string | null>(null);
  const [pendingFont, setPendingFont] = useState<{
    src: string;
    family: string;
    weight: number;
    italic: boolean;
  } | null>(null);
  const uploadFont = async (file: File | undefined) => {
    if (!file) return;
    setFontStatus("Uploading…");
    const uploaded = await uploadFile("/api/uploads?purpose=brand_font", file, () => undefined);
    if (!uploaded.ok) {
      setFontStatus(UPLOAD_ERRORS[uploaded.error] ?? "The font could not be uploaded.");
      return;
    }
    const prepared = await prepareFontAction(uploaded.file.id);
    if (!prepared.ok) {
      setFontStatus(prepared.error);
      return;
    }
    const guess = guessFontFace(file.name);
    setPendingFont({
      src: prepared.src,
      family: guess.family,
      weight: guess.weight,
      italic: guess.style === "italic",
    });
    setFontStatus(null);
  };
  const addPendingFont = () => {
    if (!pendingFont) return;
    const family = pendingFont.family.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(family) || family.length > 60) {
      setFontStatus("Use letters, digits, spaces, _ and - for the font name.");
      return;
    }
    setDraft((current) => ({
      ...current,
      fontFiles: [
        ...current.fontFiles,
        {
          family,
          weight: pendingFont.weight,
          style: pendingFont.italic ? "italic" : "normal",
          src: pendingFont.src,
        },
      ],
    }));
    setPendingFont(null);
    setFontStatus(null);
  };
  const removeFontFile = (src: string) =>
    setDraft((current) => {
      const fontFiles = current.fontFiles.filter((file) => file.src !== src);
      const left = uploadedFamilies(fontFiles);
      const keep = (family: string) =>
        props.fonts.some((font) => font.family === family) || left.includes(family)
          ? family
          : "Inter";
      return {
        ...current,
        fontFiles,
        display: keep(current.display),
        body: keep(current.body),
      };
    });
  const ownFamilies = uploadedFamilies(draft.fontFiles);

  const style = (value: ThemeDraft["style"]) =>
    set(
      value === "outlined"
        ? {
            style: value,
            shadow: "hard",
            borderWidth: Math.max(draft.borderWidth, 2),
            radius: Math.min(draft.radius, 6),
          }
        : { style: value, shadow: "soft", borderWidth: 1, radius: Math.max(draft.radius, 10) },
    );

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-6">
        <section aria-labelledby="import-heading" className="card space-y-4 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-control bg-primary-soft">
              <Sparkles aria-hidden size={20} />
            </span>
            <div>
              <h2 id="import-heading" className="text-lg font-semibold">
                Import from your website
              </h2>
              <p className="text-sm text-muted">
                We read your site’s colours, fonts and shapes and suggest a theme. Nothing is saved
                until you save.
              </p>
            </div>
          </div>
          <form onSubmit={importer.onSubmit} className="flex flex-wrap gap-2">
            <label htmlFor="import-url" className="sr-only">
              Website address
            </label>
            <input
              id="import-url"
              name="url"
              className="input min-w-60 flex-1"
              inputMode="url"
              placeholder="https://your-company.com"
              defaultValue={props.website}
              required
            />
            <SubmitButton
              pending={importer.pending}
              pendingLabel="Reading your website…"
              className="btn btn-secondary"
            >
              <Wand2 aria-hidden size={18} /> Import
            </SubmitButton>
          </form>
          {importer.state.status === "error" && (
            <Notice tone="critical" title={importer.state.message} />
          )}
          {importer.state.status === "done" && (
            <Notice
              tone="good"
              title={`Suggested from ${importer.state.source}. Check the preview, adjust, then save.`}
            >
              <ul className="list-disc space-y-1 pl-4">
                {importer.state.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </Notice>
          )}
        </section>

        <section aria-labelledby="presets-heading" className="card-flat space-y-3 p-5 sm:p-6">
          <h2 id="presets-heading" className="text-lg font-semibold">
            Or start from a preset
          </h2>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setLook(preset.draft)}
              >
                <span aria-hidden className="flex">
                  {[preset.draft.primary, preset.draft.accents[0], preset.draft.ink].map(
                    (color) => (
                      <span
                        key={color}
                        className="-ml-1 size-3.5 rounded-full border border-line first:ml-0"
                        style={{ background: color }}
                      />
                    ),
                  )}
                </span>
                {preset.name}
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="logo-heading" className="card-flat space-y-4 p-5 sm:p-6">
          <div>
            <h2 id="logo-heading" className="text-lg font-semibold">
              Logo
            </h2>
            <p className="hint">
              In the header, on mails and on shared certificate images. SVG works best; PNG or WebP
              with a transparent background too.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {draft.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- uploaded logo
              <img
                src={draft.logo.src}
                alt="Current logo"
                className="h-14 w-auto max-w-56 rounded-control border border-line bg-card object-contain p-2"
              />
            ) : (
              <p className="text-sm text-muted">No logo yet: the academy name stands alone.</p>
            )}
            <label className="btn btn-secondary btn-sm cursor-pointer">
              <ImageUp aria-hidden size={16} /> {draft.logo ? "Replace logo" : "Upload logo"}
              <input
                type="file"
                accept=".svg,.png,.webp,image/svg+xml,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  void uploadLogo(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            {draft.logo && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => set({ logo: null })}
              >
                <Trash aria-hidden size={16} /> Remove
              </button>
            )}
          </div>
          {logoStatus && (
            <p role="status" className="text-sm font-semibold">
              {logoStatus}
            </p>
          )}
          {draft.logo && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.logo.show_name}
                onChange={(event) =>
                  set({ logo: { ...draft.logo!, show_name: event.target.checked } })
                }
                className="mt-0.5 size-4 accent-(--tenant-primary)"
              />
              <span>
                Show the academy name next to the logo
                <span className="block text-xs text-muted">
                  Turn it off when the logo already spells out the name.
                </span>
              </span>
            </label>
          )}
        </section>

        <section aria-labelledby="colours-heading" className="card-flat space-y-4 p-5 sm:p-6">
          <h2 id="colours-heading" className="text-lg font-semibold">
            Colours
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {COLOR_FIELDS.map((field) => (
              <ColorField
                key={field.key}
                id={`color-${field.key}`}
                label={field.label}
                hint={field.hint}
                value={draft[field.key]}
                onChange={(value) => set({ [field.key]: value })}
              />
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.onPrimary === null}
              onChange={(event) => set({ onPrimary: event.target.checked ? null : "#ffffff" })}
              className="size-4 accent-(--tenant-primary)"
            />
            Pick the button text colour automatically
          </label>
          {draft.onPrimary !== null && (
            <ColorField
              id="color-on-primary"
              label="Button text"
              value={draft.onPrimary}
              onChange={(value) => set({ onPrimary: value })}
            />
          )}
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Accents</legend>
            <p className="hint">Paths, course cards and decorations. Up to four.</p>
            <div className="flex flex-wrap items-center gap-2">
              {draft.accents.map((accent, index) => (
                <span key={index} className="flex items-center gap-1">
                  <input
                    type="color"
                    aria-label={`Accent ${index + 1}`}
                    value={accent}
                    onChange={(event) =>
                      set({
                        accents: draft.accents.map((item, i) =>
                          i === index ? event.target.value : item,
                        ),
                      })
                    }
                    className="size-9 cursor-pointer rounded-control border border-line bg-card p-0.5"
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm px-2"
                    aria-label={`Remove accent ${index + 1}`}
                    onClick={() => set({ accents: draft.accents.filter((_, i) => i !== index) })}
                  >
                    ×
                  </button>
                </span>
              ))}
              {draft.accents.length < 4 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => set({ accents: [...draft.accents, draft.primary] })}
                >
                  + Accent
                </button>
              )}
            </div>
          </fieldset>
        </section>

        <section
          aria-labelledby="type-heading"
          className="card-flat grid gap-4 p-5 sm:grid-cols-2 sm:p-6"
        >
          <h2 id="type-heading" className="text-lg font-semibold sm:col-span-2">
            Fonts
          </h2>
          {(["display", "body"] as const).map((slot) => (
            <div key={slot} className="field">
              <label htmlFor={`font-${slot}`} className="text-sm font-semibold">
                {slot === "display" ? "Headings" : "Text"}
              </label>
              <select
                id={`font-${slot}`}
                className="select"
                value={draft[slot]}
                onChange={(event) => set({ [slot]: event.target.value })}
                style={{ fontFamily: `"${draft[slot]}"` }}
              >
                {ownFamilies.length > 0 && (
                  <optgroup label="Your fonts">
                    {ownFamilies.map((family) => (
                      <option key={family} value={family} style={{ fontFamily: `"${family}"` }}>
                        {family}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Open-source fonts">
                  {props.fonts.map((font) => (
                    <option
                      key={font.family}
                      value={font.family}
                      style={{ fontFamily: `"${font.family}"` }}
                    >
                      {font.family}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          ))}
          <p className="hint sm:col-span-2">
            Open-source fonts are hosted by us in the EU. Your own fonts are served from your
            academy’s address too, never from a font service.
          </p>

          <div className="space-y-3 border-t border-line pt-4 sm:col-span-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Type aria-hidden size={16} /> Your own fonts
            </h3>
            {draft.fontFiles.length > 0 && (
              <ul className="divide-y divide-line rounded-control border border-line">
                {draft.fontFiles.map((file) => (
                  <li key={file.src} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span
                      className="min-w-0 flex-1 truncate"
                      style={{
                        fontFamily: `"${file.family}"`,
                        fontWeight: file.weight,
                        fontStyle: file.style,
                      }}
                    >
                      {file.family}
                    </span>
                    <span className="text-muted">
                      {FONT_WEIGHT_NAMES[file.weight] ?? file.weight}
                      {file.style === "italic" ? " italic" : ""} ·{" "}
                      {file.src.split(".").pop()?.toUpperCase()}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-label={`Remove ${file.family} ${FONT_WEIGHT_NAMES[file.weight] ?? ""}`}
                      onClick={() => removeFontFile(file.src)}
                    >
                      <Trash aria-hidden size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {pendingFont ? (
              <div className="grid gap-3 rounded-control border border-line p-3 sm:grid-cols-[1fr_10rem_auto]">
                <div className="field">
                  <label htmlFor="font-family-name" className="text-sm font-semibold">
                    Font name
                  </label>
                  <input
                    id="font-family-name"
                    className="input"
                    value={pendingFont.family}
                    maxLength={60}
                    onChange={(event) =>
                      setPendingFont({ ...pendingFont, family: event.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="font-weight" className="text-sm font-semibold">
                    Weight
                  </label>
                  <select
                    id="font-weight"
                    className="select"
                    value={pendingFont.weight}
                    onChange={(event) =>
                      setPendingFont({ ...pendingFont, weight: Number(event.target.value) })
                    }
                  >
                    {Object.entries(FONT_WEIGHT_NAMES).map(([weight, name]) => (
                      <option key={weight} value={weight}>
                        {weight} · {name}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={pendingFont.italic}
                    onChange={(event) =>
                      setPendingFont({ ...pendingFont, italic: event.target.checked })
                    }
                    className="size-4 accent-(--tenant-primary)"
                  />
                  Italic
                </label>
                <div className="flex gap-2 sm:col-span-3">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={addPendingFont}
                  >
                    Add font
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPendingFont(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={licensed}
                    onChange={(event) => setLicensed(event.target.checked)}
                    className="mt-0.5 size-4 accent-(--tenant-primary)"
                  />
                  <span>
                    We hold a licence to use this font on the web
                    <span className="block text-xs text-muted">
                      One file per weight: .woff2 is best; .woff, .ttf or .otf also work (and are
                      used for share images).
                    </span>
                  </span>
                </label>
                <label
                  className={`btn btn-secondary btn-sm ${licensed ? "cursor-pointer" : "pointer-events-none opacity-50"}`}
                  aria-disabled={!licensed}
                >
                  <Upload aria-hidden size={16} /> Upload font file
                  <input
                    type="file"
                    accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
                    className="sr-only"
                    disabled={!licensed}
                    onChange={(event) => {
                      void uploadFont(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
            )}
            {fontStatus && (
              <p role="status" className="text-sm font-semibold">
                {fontStatus}
              </p>
            )}
          </div>
        </section>

        <section
          aria-labelledby="shape-heading"
          className="card-flat grid gap-5 p-5 sm:grid-cols-2 sm:p-6"
        >
          <h2 id="shape-heading" className="text-lg font-semibold sm:col-span-2">
            Shape
          </h2>
          <fieldset className="field sm:col-span-2">
            <legend className="mb-1.5 text-sm font-semibold">Style</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["soft", "Soft", "Rounded corners, soft shadows, cards lift on hover."],
                  ["outlined", "Outlined", "Ink outlines, hard offset shadows, buttons press in."],
                ] as const
              ).map(([value, label, body]) => (
                <label
                  key={value}
                  className={`flex gap-3 rounded-control border p-3 ${draft.style === value ? "border-primary bg-primary-soft" : "border-line"}`}
                >
                  <input
                    type="radio"
                    name="style"
                    checked={draft.style === value}
                    onChange={() => style(value)}
                    className="mt-1 size-4 shrink-0 accent-(--tenant-primary)"
                  />
                  <span>
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="text-xs text-muted">{body}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="field">
            <label htmlFor="shape-radius" className="text-sm font-semibold">
              Corner radius <span className="font-normal text-muted">{draft.radius}px</span>
            </label>
            <input
              id="shape-radius"
              type="range"
              min={0}
              max={28}
              value={draft.radius}
              onChange={(event) => set({ radius: Number(event.target.value) })}
              className="accent-(--tenant-primary)"
            />
          </div>
          <div className="field">
            <label htmlFor="shape-border" className="text-sm font-semibold">
              Border width <span className="font-normal text-muted">{draft.borderWidth}px</span>
            </label>
            <input
              id="shape-border"
              type="range"
              min={0}
              max={4}
              value={draft.borderWidth}
              onChange={(event) => set({ borderWidth: Number(event.target.value) })}
              className="accent-(--tenant-primary)"
            />
          </div>
          <div className="field">
            <label htmlFor="shape-shadow" className="text-sm font-semibold">
              Shadow
            </label>
            <select
              id="shape-shadow"
              className="select"
              value={draft.shadow}
              onChange={(event) => set({ shadow: event.target.value as ShadowKind })}
            >
              <option value="soft">Soft</option>
              <option value="hard">Hard offset</option>
              <option value="none">None</option>
            </select>
          </div>
        </section>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <p className="eyebrow">Preview</p>
        {parsed && parsed.fonts.files.length > 0 && (
          <style dangerouslySetInnerHTML={{ __html: fontFaceCss(parsed) }} />
        )}
        <ThemePreview
          variables={variables}
          logo={draft.logo}
          academyName={props.academyName}
          courseTerm={props.courseTerm}
          lessonTerm={props.lessonTerm}
        />
        {issues.length > 0 && (
          <FormFeedback
            state={{
              errors: blocking.map((issue) => issue.message),
              warnings: issues
                .filter((issue) => issue.severity === "warning")
                .map((issue) => issue.message),
            }}
          />
        )}
        <form onSubmit={save.onSubmit} className="space-y-3">
          <input type="hidden" name="theme" value={JSON.stringify(themeFromDraft(draft))} />
          <FormFeedback state={save.state} />
          <SubmitButton
            pending={save.pending}
            pendingLabel="Saving…"
            disabled={!parsed || blocking.length > 0}
            className="btn btn-primary w-full"
          >
            Save brand
          </SubmitButton>
        </form>
        {!props.isDefault && (
          <form onSubmit={save.onSubmit}>
            <input type="hidden" name="reset" value="1" />
            <SubmitButton
              className="btn btn-ghost btn-sm w-full"
              confirm="Go back to enaibler's default look? Your current brand settings are replaced."
            >
              Reset to enaibler’s default look
            </SubmitButton>
          </form>
        )}
      </aside>
    </div>
  );
}
