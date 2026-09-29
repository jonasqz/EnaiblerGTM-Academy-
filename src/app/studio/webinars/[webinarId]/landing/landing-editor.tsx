"use client";

import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";

import type { FormState } from "@/app/studio/actions";
import { saveLandingAction, savePresentersAction } from "@/app/studio/webinars/actions";
import { FormFeedback } from "@/components/studio/form-feedback";
import { useStudioText } from "@/components/studio/studio-text";
import { uploadFile } from "@/components/ui/file-upload";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";
import { FormFieldsView, formLabels } from "@/components/webinars/form-fields";
import { WebinarLanding, type LandingView } from "@/components/webinars/landing";
import type { Locale } from "@/core/i18n/locales";
import type { StudioKey } from "@/core/i18n/studio/index";
import { createTranslator, type MessageOverrides } from "@/core/i18n/translator";
import type {
  LandingBlock,
  LandingBlockType,
  Presenter,
  RegistrationForm,
} from "@/core/webinars/landing";
import type { TermOverrides } from "@/core/terminology/terms";

type Draft =
  | { key: string; type: "hero" }
  | { key: string; type: "learn"; heading: string; items: string }
  | { key: string; type: "build"; heading: string; body: string }
  | { key: string; type: "agenda"; heading: string; items: string }
  | { key: string; type: "presenters"; heading: string }
  | {
      key: string;
      type: "faq";
      heading: string;
      items: Array<{ question: string; answer: string }>;
    }
  | { key: string; type: "register"; heading: string };

let counter = 0;
const nextKey = () => `b${++counter}`;

function toDraft(block: LandingBlock): Draft {
  const key = nextKey();
  const heading = "heading" in block ? (block.heading ?? "") : "";
  switch (block.type) {
    case "hero":
      return { key, type: "hero" };
    case "learn":
      return { key, type: "learn", heading, items: block.items.join("\n") };
    case "build":
      return { key, type: "build", heading, body: block.body ?? "" };
    case "agenda":
      return {
        key,
        type: "agenda",
        heading,
        items: block.items
          .map((item) => (item.minute !== undefined ? `${item.minute} ${item.title}` : item.title))
          .join("\n"),
      };
    case "presenters":
      return { key, type: "presenters", heading };
    case "faq":
      return { key, type: "faq", heading, items: block.items.map((item) => ({ ...item })) };
    case "register":
      return { key, type: "register", heading };
  }
}

const lines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/** The block as saved; lists left empty make it drop out of the preview (and fail on save). */
function toBlock(draft: Draft): LandingBlock | null {
  const heading = "heading" in draft && draft.heading.trim() ? draft.heading.trim() : undefined;
  const withHeading = heading ? { heading } : {};
  switch (draft.type) {
    case "hero":
      return { type: "hero" };
    case "learn": {
      const items = lines(draft.items);
      return items.length ? { type: "learn", ...withHeading, items } : null;
    }
    case "build":
      return {
        type: "build",
        ...withHeading,
        ...(draft.body.trim() ? { body: draft.body.trim() } : {}),
      };
    case "agenda": {
      const items = lines(draft.items).map((line) => {
        const match = /^(\d{1,4})\s+(.+)$/.exec(line);
        return match ? { minute: Number(match[1]), title: match[2]! } : { title: line };
      });
      return items.length ? { type: "agenda", ...withHeading, items } : null;
    }
    case "presenters":
      return { type: "presenters", ...withHeading };
    case "faq": {
      const items = draft.items
        .map((item) => ({ question: item.question.trim(), answer: item.answer.trim() }))
        .filter((item) => item.question && item.answer);
      return items.length ? { type: "faq", ...withHeading, items } : null;
    }
    case "register":
      return { type: "register", ...withHeading };
  }
}

const ADDABLE: LandingBlockType[] = ["learn", "build", "agenda", "presenters", "faq"];
const SINGLE: LandingBlockType[] = ["build", "presenters"];

function emptyDraft(type: LandingBlockType): Draft {
  const key = nextKey();
  switch (type) {
    case "learn":
      return { key, type, heading: "", items: "" };
    case "build":
      return { key, type, heading: "", body: "" };
    case "agenda":
      return { key, type, heading: "", items: "" };
    case "faq":
      return { key, type, heading: "", items: [{ question: "", answer: "" }] };
    case "presenters":
      return { key, type, heading: "" };
    case "hero":
      return { key, type };
    case "register":
      return { key, type, heading: "" };
  }
}

export interface LandingPreviewData {
  view: Omit<LandingView, "blocks" | "presenters">;
  form: RegistrationForm;
  recorded: boolean;
  recordingNotice: string | null;
  brand: { name: string; logo?: string };
  anonymity: boolean;
  /** The academy's theme as CSS variables, for a preview in its look. */
  theme: CSSProperties;
  /** The academy's language closest to the webinar's, for the preview's page chrome. */
  locale: Locale;
  terms: TermOverrides;
  strings: MessageOverrides;
}

/** The page's blocks and its presenters, with a live preview in the academy's theme. */
export function LandingEditor(props: {
  webinarId: string;
  blocks: LandingBlock[];
  presenters: Presenter[];
  preview: LandingPreviewData;
  languageName: string;
}) {
  const t = useStudioText();
  const [drafts, setDrafts] = useState<Draft[]>(() => props.blocks.map(toDraft));
  const [people, setPeople] = useState<Presenter[]>(props.presenters);
  const [adding, setAdding] = useState<LandingBlockType>("learn");
  const landing = useActionForm<FormState>(saveLandingAction, {});
  const team = useActionForm<FormState>(savePresentersAction, {});
  const [uploadError, setUploadError] = useState<string | null>(null);

  const blocks = drafts.map(toBlock).filter((block): block is LandingBlock => block !== null);
  const learner = useMemo(
    () =>
      createTranslator({
        locale: props.preview.locale,
        termOverrides: props.preview.terms,
        messageOverrides: props.preview.strings,
      }),
    [props.preview.locale, props.preview.terms, props.preview.strings],
  );
  const update = (key: string, change: Partial<Draft>) =>
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? ({ ...draft, ...change } as Draft) : draft)),
    );
  const move = (index: number, by: number) =>
    setDrafts((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item!);
      return next;
    });
  const addable = ADDABLE.filter(
    (type) => !SINGLE.includes(type) || !drafts.some((draft) => draft.type === type),
  );
  const blockName = (type: LandingBlockType) => t.t(`webinars.page.block.${type}` as StudioKey);
  const hint = (type: LandingBlockType) =>
    type === "hero" || type === "build" || type === "presenters" || type === "register"
      ? t.t(`webinars.page.hint.${type}` as StudioKey)
      : null;

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="space-y-6">
        <form onSubmit={landing.onSubmit} className="space-y-4">
          <input type="hidden" name="webinarId" value={props.webinarId} />
          <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
          <p className="text-sm text-muted">
            {t.t("webinars.page.intro", { language: props.languageName })}
          </p>
          <ol className="space-y-3">
            {drafts.map((draft, index) => (
              <li key={draft.key} className="card-flat space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-semibold">{blockName(draft.type)}</span>
                  {draft.type !== "hero" && (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={index <= 1}
                        onClick={() => move(index, -1)}
                        aria-label={t.t("webinars.page.moveUp")}
                        title={t.t("webinars.page.moveUp")}
                      >
                        <ArrowUp aria-hidden size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={index === drafts.length - 1}
                        onClick={() => move(index, 1)}
                        aria-label={t.t("webinars.page.moveDown")}
                        title={t.t("webinars.page.moveDown")}
                      >
                        <ArrowDown aria-hidden size={16} />
                      </button>
                    </>
                  )}
                  {draft.type !== "hero" && draft.type !== "register" && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        setDrafts((current) => current.filter((item) => item.key !== draft.key))
                      }
                      aria-label={t.t("webinars.page.remove")}
                      title={t.t("webinars.page.remove")}
                    >
                      <Trash2 aria-hidden size={16} />
                    </button>
                  )}
                </div>
                {hint(draft.type) && <p className="hint">{hint(draft.type)}</p>}
                {"heading" in draft && (
                  <input
                    aria-label={t.t("webinars.page.heading")}
                    placeholder={t.t("webinars.page.heading")}
                    className="input"
                    maxLength={160}
                    value={draft.heading}
                    onChange={(event) => update(draft.key, { heading: event.target.value })}
                  />
                )}
                {(draft.type === "learn" || draft.type === "agenda") && (
                  <label className="field">
                    <span className="label">
                      {t.t(
                        draft.type === "learn"
                          ? "webinars.page.items"
                          : "webinars.page.agendaItems",
                      )}
                    </span>
                    <textarea
                      className="textarea"
                      rows={4}
                      value={draft.items}
                      onChange={(event) => update(draft.key, { items: event.target.value })}
                    />
                  </label>
                )}
                {draft.type === "build" && (
                  <label className="field">
                    <span className="label">{t.t("webinars.page.body")}</span>
                    <textarea
                      className="textarea"
                      rows={3}
                      maxLength={2000}
                      value={draft.body}
                      onChange={(event) => update(draft.key, { body: event.target.value })}
                    />
                  </label>
                )}
                {draft.type === "faq" && (
                  <div className="space-y-3">
                    {draft.items.map((item, position) => (
                      <div key={position} className="space-y-2 rounded-control bg-subtle p-3">
                        <div className="flex gap-2">
                          <input
                            aria-label={t.t("webinars.page.question")}
                            placeholder={t.t("webinars.page.question")}
                            className="input"
                            maxLength={160}
                            value={item.question}
                            onChange={(event) =>
                              update(draft.key, {
                                items: draft.items.map((entry, i) =>
                                  i === position
                                    ? { ...entry, question: event.target.value }
                                    : entry,
                                ),
                              })
                            }
                          />
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            aria-label={t.t("webinars.page.remove")}
                            onClick={() =>
                              update(draft.key, {
                                items: draft.items.filter((_, i) => i !== position),
                              })
                            }
                          >
                            <X aria-hidden size={16} />
                          </button>
                        </div>
                        <textarea
                          aria-label={t.t("webinars.page.answer")}
                          placeholder={t.t("webinars.page.answer")}
                          className="textarea"
                          rows={2}
                          maxLength={2000}
                          value={item.answer}
                          onChange={(event) =>
                            update(draft.key, {
                              items: draft.items.map((entry, i) =>
                                i === position ? { ...entry, answer: event.target.value } : entry,
                              ),
                            })
                          }
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        update(draft.key, {
                          items: [...draft.items, { question: "", answer: "" }],
                        })
                      }
                    >
                      <Plus aria-hidden size={16} /> {t.t("webinars.page.addQuestion")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {addable.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="add-block" className="sr-only">
                {t.t("webinars.page.add")}
              </label>
              <select
                id="add-block"
                className="select w-auto"
                value={addable.includes(adding) ? adding : addable[0]}
                onChange={(event) => setAdding(event.target.value as LandingBlockType)}
              >
                {addable.map((type) => (
                  <option key={type} value={type}>
                    {blockName(type)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const type = addable.includes(adding) ? adding : addable[0]!;
                  // New blocks go before the form, which usually ends the page.
                  setDrafts((current) => {
                    const at = current.findIndex((draft) => draft.type === "register");
                    const next = [...current];
                    next.splice(at === -1 ? next.length : at, 0, emptyDraft(type));
                    return next;
                  });
                }}
              >
                <Plus aria-hidden size={16} /> {t.t("webinars.page.add")}
              </button>
            </div>
          )}
          <FormFeedback state={landing.state} />
          <SubmitButton pending={landing.pending} pendingLabel={t.t("common.saving")}>
            {t.t("webinars.page.save")}
          </SubmitButton>
        </form>

        <form onSubmit={team.onSubmit} className="card-flat space-y-4 p-4">
          <input type="hidden" name="webinarId" value={props.webinarId} />
          <input
            type="hidden"
            name="presenters"
            value={JSON.stringify(
              people.map((person) => ({
                name: person.name.trim(),
                ...(person.role?.trim() ? { role: person.role.trim() } : {}),
                ...(person.photo ? { photo: person.photo } : {}),
              })),
            )}
          />
          <h2 className="font-semibold">{t.t("webinars.presenters.title")}</h2>
          <p className="hint">
            {props.preview.anonymity
              ? t.t("webinars.presenters.anonymity", { academy: props.preview.brand.name })
              : t.t("webinars.presenters.intro")}
          </p>
          {people.map((person, index) => (
            <div key={index} className="space-y-2 rounded-control bg-subtle p-3">
              <div className="flex gap-2">
                <input
                  aria-label={t.t("webinars.presenters.name")}
                  placeholder={t.t("webinars.presenters.name")}
                  className="input"
                  maxLength={80}
                  value={person.name}
                  onChange={(event) =>
                    setPeople((current) =>
                      current.map((entry, i) =>
                        i === index ? { ...entry, name: event.target.value } : entry,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  aria-label={t.t("webinars.page.remove")}
                  onClick={() => setPeople((current) => current.filter((_, i) => i !== index))}
                >
                  <X aria-hidden size={16} />
                </button>
              </div>
              <input
                aria-label={t.t("webinars.presenters.role")}
                placeholder={t.t("webinars.presenters.role")}
                className="input"
                maxLength={120}
                value={person.role ?? ""}
                onChange={(event) =>
                  setPeople((current) =>
                    current.map((entry, i) =>
                      i === index ? { ...entry, role: event.target.value } : entry,
                    ),
                  )
                }
              />
              <div className="flex flex-wrap items-center gap-3">
                {person.photo && (
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded photo
                  <img src={person.photo} alt="" className="size-12 rounded-full object-cover" />
                )}
                <label className="btn btn-secondary btn-sm cursor-pointer">
                  <ImagePlus aria-hidden size={16} /> {t.t("webinars.presenters.photo")}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      setUploadError(null);
                      const result = await uploadFile(
                        "/api/uploads?purpose=presenter_photo",
                        file,
                        () => undefined,
                      );
                      if (!result.ok) {
                        setUploadError(t.t("common.upload.failed", { name: file.name }));
                        return;
                      }
                      setPeople((current) =>
                        current.map((entry, i) =>
                          i === index ? { ...entry, photo: result.file.url } : entry,
                        ),
                      );
                    }}
                  />
                </label>
                {person.photo && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      setPeople((current) =>
                        current.map((entry, i) =>
                          i === index ? { name: entry.name, role: entry.role } : entry,
                        ),
                      )
                    }
                  >
                    {t.t("webinars.presenters.removePhoto")}
                  </button>
                )}
              </div>
            </div>
          ))}
          {uploadError && (
            <p role="alert" className="text-sm font-semibold">
              {uploadError}
            </p>
          )}
          {people.length < 6 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setPeople((current) => [...current, { name: "" }])}
            >
              <Plus aria-hidden size={16} /> {t.t("webinars.presenters.add")}
            </button>
          )}
          <FormFeedback state={team.state} />
          <SubmitButton pending={team.pending} pendingLabel={t.t("common.saving")}>
            {t.t("webinars.presenters.save")}
          </SubmitButton>
        </form>
      </div>

      <section className="min-w-0 space-y-2" aria-labelledby="preview-heading">
        <h2 id="preview-heading" className="font-semibold">
          {t.t("webinars.page.preview")}
        </h2>
        <p className="hint">{t.t("webinars.page.previewNote")}</p>
        {/* The academy's own theme, inside the Studio's. */}
        <div
          data-theme-scope
          lang={props.preview.locale}
          style={props.preview.theme}
          className="rounded-card border border-line bg-surface p-4 font-body text-ink sm:p-6"
        >
          <WebinarLanding
            view={{
              ...props.preview.view,
              blocks,
              presenters: people.filter((person) => person.name.trim()),
            }}
            t={learner}
            brand={props.preview.brand}
            anonymity={props.preview.anonymity}
            cta={learner.t("webinar.registerCta")}
            register={
              <FormFieldsView
                form={props.preview.form}
                labels={formLabels(learner, {
                  academy: props.preview.brand.name,
                  title: props.preview.view.title,
                  recorded: props.preview.recorded,
                  recordingNotice: props.preview.recordingNotice,
                  email: null,
                  linkMinutes: 15,
                })}
                contentLocale={props.preview.view.locale}
                signedIn={false}
                disabled
                idPrefix="preview"
              />
            }
          />
        </div>
      </section>
    </div>
  );
}
