import type { Translator } from "@/core/i18n/translator";
import type { RegistrationForm } from "@/core/webinars/landing";

/** Everything the registration form says, worded on the server (or in a Studio preview). */
export interface FormLabels {
  name: string;
  email: string;
  optional: string;
  choose: string;
  participation: string;
  recording: string | null;
  marketing: string;
  leadHandoff: string;
  privacy: string;
  signedInAs: string;
  submit: string;
  submitWaitlist: string;
  sending: string;
  sent: string;
  sentHint: string;
  error: string;
  errors: { required: string; too_long: string; not_an_option: string; email: string };
}

export function formLabels(
  t: Translator,
  input: {
    academy: string;
    title: string;
    recorded: boolean;
    recordingNotice: string | null;
    email: string | null;
    linkMinutes: number;
    /** After the end: the form is for the recording (no seat, no session to appear in). */
    forRecording?: boolean;
  },
): FormLabels {
  const { academy } = input;
  if (input.forRecording) {
    return {
      ...formLabels(t, { ...input, recorded: false, forRecording: false }),
      participation: t.t("webinar.form.participationRecording", { title: input.title, academy }),
      submit: t.t("webinar.relive.submit"),
      sentHint: t.t("webinar.form.sentHintRecording", { minutes: input.linkMinutes }),
    };
  }
  return {
    name: t.t("webinar.form.name"),
    email: t.t("webinar.form.email"),
    optional: t.t("webinar.form.optional"),
    choose: t.t("webinar.form.choose"),
    participation: t.t("webinar.form.participation", { title: input.title, academy }),
    recording: input.recorded
      ? (input.recordingNotice ?? t.t("webinar.form.recording", { academy }))
      : null,
    marketing: t.t("me.newsLabel", { academy }),
    leadHandoff: t.t("me.contactLabel", { academy }),
    privacy: t.t("webinar.form.privacy", { academy }),
    signedInAs: input.email ? t.t("webinar.form.signedInAs", { email: input.email }) : "",
    submit: t.t("webinar.form.submit"),
    submitWaitlist: t.t("webinar.form.submitWaitlist"),
    sending: t.t("webinar.form.sending"),
    sent: t.t("webinar.form.sent", { email: "{email}" }),
    sentHint: t.t("webinar.form.sentHint", { minutes: input.linkMinutes }),
    error: t.t("webinar.form.error"),
    errors: {
      required: t.t("webinar.form.errorRequired"),
      too_long: t.t("webinar.form.errorTooLong"),
      not_an_option: t.t("webinar.form.errorOption"),
      email: t.t("webinar.form.errorEmail"),
    },
  };
}

/**
 * The form's fields: name and address (unless signed in), the custom fields
 * in the webinar's language, then what taking part means and the optional
 * consents, each unticked (webinar brief §5). Shared by the page, the embed
 * and the Studio's preview.
 */
export function FormFieldsView(props: {
  form: RegistrationForm;
  labels: FormLabels;
  /** The webinar's language: custom field labels and options are written in it. */
  contentLocale: string;
  signedIn: boolean;
  privacyUrl?: string;
  errors?: Record<string, string>;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const { form, labels, errors = {} } = props;
  const id = (name: string) => `${props.idPrefix ?? "webinar"}-${name}`;
  const errorFor = (name: string) =>
    errors[name] ? (
      <p id={id(`${name}-error`)} className="text-sm font-semibold" role="alert">
        {errors[name]}
      </p>
    ) : null;
  const described = (name: string) => (errors[name] ? id(`${name}-error`) : undefined);
  return (
    <fieldset className="space-y-4" disabled={props.disabled}>
      {!props.signedIn && (
        <>
          {form.name !== "off" && (
            <div className="field">
              <label htmlFor={id("name")} className="label">
                {labels.name}
                {form.name === "optional" && (
                  <span className="font-normal text-muted"> ({labels.optional})</span>
                )}
              </label>
              <input
                id={id("name")}
                name="name"
                className="input"
                autoComplete="name"
                maxLength={120}
                required={form.name === "required"}
                aria-invalid={Boolean(errors.name) || undefined}
                aria-describedby={described("name")}
              />
              {errorFor("name")}
            </div>
          )}
          <div className="field">
            <label htmlFor={id("email")} className="label">
              {labels.email}
            </label>
            <input
              id={id("email")}
              name="email"
              type="email"
              className="input"
              autoComplete="email"
              inputMode="email"
              required
              aria-invalid={Boolean(errors.email) || undefined}
              aria-describedby={described("email")}
            />
            {errorFor("email")}
          </div>
        </>
      )}
      {form.fields.map((field) => (
        <div key={field.id} className="field">
          <label htmlFor={id(`field-${field.id}`)} className="label">
            <span lang={props.contentLocale}>{field.label}</span>
            {!field.required && (
              <span className="font-normal text-muted"> ({labels.optional})</span>
            )}
          </label>
          {field.kind === "select" ? (
            <select
              id={id(`field-${field.id}`)}
              name={`field.${field.id}`}
              className="select"
              required={field.required}
              defaultValue=""
              aria-invalid={Boolean(errors[field.id]) || undefined}
              aria-describedby={described(field.id)}
            >
              <option value="" disabled={field.required}>
                {labels.choose}
              </option>
              {(field.options ?? []).map((option) => (
                <option key={option} value={option} lang={props.contentLocale}>
                  {option}
                </option>
              ))}
            </select>
          ) : field.kind === "textarea" ? (
            <textarea
              id={id(`field-${field.id}`)}
              name={`field.${field.id}`}
              className="textarea"
              rows={3}
              maxLength={2000}
              required={field.required}
              aria-invalid={Boolean(errors[field.id]) || undefined}
              aria-describedby={described(field.id)}
            />
          ) : (
            <input
              id={id(`field-${field.id}`)}
              name={`field.${field.id}`}
              className="input"
              maxLength={200}
              required={field.required}
              aria-invalid={Boolean(errors[field.id]) || undefined}
              aria-describedby={described(field.id)}
            />
          )}
          {errorFor(field.id)}
        </div>
      ))}
      <div className="space-y-3 rounded-card bg-subtle p-4 text-sm">
        <p>
          {labels.participation}
          {labels.recording && (
            <>
              {" "}
              <strong>{labels.recording}</strong>
            </>
          )}
        </p>
        {form.consents.marketing && (
          <label className="flex items-start gap-3">
            <input type="checkbox" name="marketing" className="mt-0.5 size-4 shrink-0" />
            <span>{labels.marketing}</span>
          </label>
        )}
        {form.consents.lead_handoff && (
          <label className="flex items-start gap-3">
            <input type="checkbox" name="leadHandoff" className="mt-0.5 size-4 shrink-0" />
            <span>{labels.leadHandoff}</span>
          </label>
        )}
        {props.privacyUrl && (
          <p>
            <a href={props.privacyUrl} className="underline" target="_blank" rel="noopener">
              {labels.privacy}
            </a>
          </p>
        )}
      </div>
    </fieldset>
  );
}
