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
import { useStudioText } from "@/components/studio/studio-text";
import { uploadFile, type FileUploadLabels } from "@/components/ui/file-upload";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import { contrastIssueText, studioUploadLabels } from "@/core/i18n/studio/helpers";
import type { StudioKey } from "@/core/i18n/studio/index";
import { themeContrastIssues } from "@/core/theme/contrast";
import { fontFaceCss, themeToCssVariables } from "@/core/theme/css";
import {
  FONT_WEIGHT_NAMES,
  guessFontFace,
  uploadedFamilies,
  type BundledFont,
} from "@/core/theme/fonts";
import { themeSchema, type Theme } from "@/core/theme/schema";

/** Upload errors the editor explains; anything else "could not be uploaded". */
const UPLOAD_ERRORS: Record<string, keyof FileUploadLabels["errors"]> = {
  too_large: "too_large",
  type_not_allowed: "type_not_allowed",
  unknown_type: "type_not_allowed",
  invalid_content: "invalid_content",
  rate_limited: "rate_limited",
};

const COLOR_FIELDS = ["primary", "ink", "surface", "card"] as const;

function ColorField(props: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useStudioText();
  return (
    <div className="field">
      <label htmlFor={props.id} className="text-sm font-semibold">
        {props.label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={t.t("brand.colors.picker", { label: props.label })}
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
  const t = useStudioText();
  const uploadLabels = studioUploadLabels(t);
  const uploadError = (error: string, fallback: StudioKey) => {
    const known = UPLOAD_ERRORS[error];
    return known ? uploadLabels.errors[known] : t.t(fallback);
  };
  const weightName = (weight: number) =>
    weight in FONT_WEIGHT_NAMES ? t.t(`brand.fonts.weight.${weight}` as StudioKey) : String(weight);
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
    setLogoStatus(uploadLabels.uploading);
    const uploaded = await uploadFile("/api/uploads?purpose=brand_logo", file, () => undefined);
    if (!uploaded.ok) {
      setLogoStatus(uploadError(uploaded.error, "brand.logo.uploadFailed"));
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
    setFontStatus(uploadLabels.uploading);
    const uploaded = await uploadFile("/api/uploads?purpose=brand_font", file, () => undefined);
    if (!uploaded.ok) {
      setFontStatus(uploadError(uploaded.error, "brand.fonts.uploadFailed"));
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
      setFontStatus(t.t("brand.fonts.nameRule"));
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
                {t.t("brand.import.title")}
              </h2>
              <p className="text-sm text-muted">{t.t("brand.import.intro")}</p>
            </div>
          </div>
          <form onSubmit={importer.onSubmit} className="flex flex-wrap gap-2">
            <label htmlFor="import-url" className="sr-only">
              {t.t("brand.import.urlLabel")}
            </label>
            <input
              id="import-url"
              name="url"
              className="input min-w-60 flex-1"
              inputMode="url"
              placeholder={t.t("brand.import.urlPlaceholder")}
              defaultValue={props.website}
              required
            />
            <SubmitButton
              pending={importer.pending}
              pendingLabel={t.t("brand.import.pending")}
              className="btn btn-secondary"
            >
              <Wand2 aria-hidden size={18} /> {t.t("brand.import.submit")}
            </SubmitButton>
          </form>
          {importer.state.status === "error" && (
            <Notice tone="critical" title={importer.state.message} />
          )}
          {importer.state.status === "done" && (
            <Notice
              tone="good"
              title={t.t("brand.import.suggested", { source: importer.state.source })}
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
            {t.t("brand.presets.title")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
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
                {t.t(`brand.presets.${preset.id}`)}
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="logo-heading" className="card-flat space-y-4 p-5 sm:p-6">
          <div>
            <h2 id="logo-heading" className="text-lg font-semibold">
              {t.t("brand.logo.title")}
            </h2>
            <p className="hint">{t.t("brand.logo.hint")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {draft.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- uploaded logo
              <img
                src={draft.logo.src}
                alt={t.t("brand.logo.current")}
                className="h-14 w-auto max-w-56 rounded-control border border-line bg-card object-contain p-2"
              />
            ) : (
              <p className="text-sm text-muted">{t.t("brand.logo.none")}</p>
            )}
            <label className="btn btn-secondary btn-sm cursor-pointer">
              <ImageUp aria-hidden size={16} />{" "}
              {draft.logo ? t.t("brand.logo.replace") : t.t("brand.logo.upload")}
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
                <Trash aria-hidden size={16} /> {t.t("common.remove")}
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
                {t.t("brand.logo.showName")}
                <span className="block text-xs text-muted">{t.t("brand.logo.showNameHint")}</span>
              </span>
            </label>
          )}
        </section>

        <section aria-labelledby="colours-heading" className="card-flat space-y-4 p-5 sm:p-6">
          <h2 id="colours-heading" className="text-lg font-semibold">
            {t.t("brand.colors.title")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {COLOR_FIELDS.map((field) => (
              <ColorField
                key={field}
                id={`color-${field}`}
                label={t.t(`brand.colors.${field}`)}
                hint={t.t(`brand.colors.${field}Hint`)}
                value={draft[field]}
                onChange={(value) => set({ [field]: value })}
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
            {t.t("brand.colors.autoButtonText")}
          </label>
          {draft.onPrimary !== null && (
            <ColorField
              id="color-on-primary"
              label={t.t("brand.colors.buttonText")}
              value={draft.onPrimary}
              onChange={(value) => set({ onPrimary: value })}
            />
          )}
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">{t.t("brand.colors.accents")}</legend>
            <p className="hint">{t.t("brand.colors.accentsHint")}</p>
            <div className="flex flex-wrap items-center gap-2">
              {draft.accents.map((accent, index) => (
                <span key={index} className="flex items-center gap-1">
                  <input
                    type="color"
                    aria-label={t.t("brand.colors.accent", { n: index + 1 })}
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
                    aria-label={t.t("brand.colors.removeAccent", { n: index + 1 })}
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
                  {t.t("brand.colors.addAccent")}
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
            {t.t("brand.fonts.title")}
          </h2>
          {(["display", "body"] as const).map((slot) => (
            <div key={slot} className="field">
              <label htmlFor={`font-${slot}`} className="text-sm font-semibold">
                {t.t(`brand.fonts.${slot}`)}
              </label>
              <select
                id={`font-${slot}`}
                className="select"
                value={draft[slot]}
                onChange={(event) => set({ [slot]: event.target.value })}
                style={{ fontFamily: `"${draft[slot]}"` }}
              >
                {ownFamilies.length > 0 && (
                  <optgroup label={t.t("brand.fonts.yours")}>
                    {ownFamilies.map((family) => (
                      <option key={family} value={family} style={{ fontFamily: `"${family}"` }}>
                        {family}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label={t.t("brand.fonts.openSource")}>
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
          <p className="hint sm:col-span-2">{t.t("brand.fonts.hosting")}</p>

          <div className="space-y-3 border-t border-line pt-4 sm:col-span-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Type aria-hidden size={16} /> {t.t("brand.fonts.own")}
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
                      {file.style === "italic"
                        ? t.t("brand.fonts.italicWeight", { weight: weightName(file.weight) })
                        : weightName(file.weight)}{" "}
                      · {file.src.split(".").pop()?.toUpperCase()}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-label={t.t("brand.fonts.remove", {
                        font: file.family,
                        weight: weightName(file.weight),
                      })}
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
                    {t.t("brand.fonts.name")}
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
                    {t.t("brand.fonts.weight")}
                  </label>
                  <select
                    id="font-weight"
                    className="select"
                    value={pendingFont.weight}
                    onChange={(event) =>
                      setPendingFont({ ...pendingFont, weight: Number(event.target.value) })
                    }
                  >
                    {Object.keys(FONT_WEIGHT_NAMES).map((weight) => (
                      <option key={weight} value={weight}>
                        {weight} · {weightName(Number(weight))}
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
                  {t.t("brand.fonts.italic")}
                </label>
                <div className="flex gap-2 sm:col-span-3">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={addPendingFont}
                  >
                    {t.t("brand.fonts.add")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPendingFont(null)}
                  >
                    {t.t("common.cancel")}
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
                    {t.t("brand.fonts.licence")}
                    <span className="block text-xs text-muted">
                      {t.t("brand.fonts.licenceHint")}
                    </span>
                  </span>
                </label>
                <label
                  className={`btn btn-secondary btn-sm ${licensed ? "cursor-pointer" : "pointer-events-none opacity-50"}`}
                  aria-disabled={!licensed}
                >
                  <Upload aria-hidden size={16} /> {t.t("brand.fonts.upload")}
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
            {t.t("brand.shape.title")}
          </h2>
          <fieldset className="field sm:col-span-2">
            <legend className="mb-1.5 text-sm font-semibold">{t.t("brand.shape.style")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["soft", "outlined"] as const).map((value) => (
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
                    <span className="block text-sm font-semibold">
                      {t.t(`brand.shape.style.${value}`)}
                    </span>
                    <span className="text-xs text-muted">
                      {t.t(`brand.shape.style.${value}Hint`)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="field">
            <label htmlFor="shape-radius" className="text-sm font-semibold">
              {t.t("brand.shape.radius")}{" "}
              <span className="font-normal text-muted">{draft.radius}px</span>
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
              {t.t("brand.shape.border")}{" "}
              <span className="font-normal text-muted">{draft.borderWidth}px</span>
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
              {t.t("brand.shape.shadow")}
            </label>
            <select
              id="shape-shadow"
              className="select"
              value={draft.shadow}
              onChange={(event) => set({ shadow: event.target.value as ShadowKind })}
            >
              <option value="soft">{t.t("brand.shape.shadow.soft")}</option>
              <option value="hard">{t.t("brand.shape.shadow.hard")}</option>
              <option value="none">{t.t("brand.shape.shadow.none")}</option>
            </select>
          </div>
        </section>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <p className="eyebrow">{t.t("brand.preview")}</p>
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
              errors: blocking.map((issue) => contrastIssueText(t, issue)),
              warnings: issues
                .filter((issue) => issue.severity === "warning")
                .map((issue) => contrastIssueText(t, issue)),
            }}
          />
        )}
        <form onSubmit={save.onSubmit} className="space-y-3">
          <input type="hidden" name="theme" value={JSON.stringify(themeFromDraft(draft))} />
          <FormFeedback state={save.state} />
          <SubmitButton
            pending={save.pending}
            pendingLabel={t.t("common.saving")}
            disabled={!parsed || blocking.length > 0}
            className="btn btn-primary w-full"
          >
            {t.t("brand.save")}
          </SubmitButton>
        </form>
        {!props.isDefault && (
          <form onSubmit={save.onSubmit}>
            <input type="hidden" name="reset" value="1" />
            <SubmitButton
              className="btn btn-ghost btn-sm w-full"
              confirm={t.t("brand.resetConfirm")}
            >
              {t.t("brand.reset")}
            </SubmitButton>
          </form>
        )}
      </aside>
    </div>
  );
}
