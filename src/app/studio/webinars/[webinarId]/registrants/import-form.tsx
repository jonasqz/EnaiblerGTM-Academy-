"use client";

import { FileUp } from "lucide-react";

import { attendanceFileAction, type AttendanceFileState } from "@/app/studio/webinars/actions";
import { useStudioText } from "@/components/studio/studio-text";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/components/ui/use-action-form";

/**
 * Attendance from the tool's export: first a look at what matches, then the
 * import. The file stays chosen in between (the form is not reset).
 */
export function AttendanceImportForm(props: { webinarId: string }) {
  const t = useStudioText();
  const { state, pending, onSubmit } = useActionForm<AttendanceFileState>(attendanceFileAction, {
    status: "idle",
  });
  const preview = state.status === "preview" ? state.preview : null;
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="webinarId" value={props.webinarId} />
      <div className="field">
        <label htmlFor="attendance-file" className="label">
          {t.t("webinars.import.file")}
        </label>
        <input
          id="attendance-file"
          name="file"
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="input"
          required
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <SubmitButton
          name="intent"
          value="check"
          className="btn btn-secondary"
          pending={pending}
          pendingLabel={t.t("webinars.import.checking")}
        >
          <FileUp aria-hidden size={16} /> {t.t("webinars.import.check")}
        </SubmitButton>
        {preview && preview.matched.length > 0 && (
          <SubmitButton name="intent" value="import" pending={pending}>
            {t.t("webinars.import.import")} (
            {t.n("webinars.import.matched", preview.matched.length)})
          </SubmitButton>
        )}
      </div>
      <div aria-live="polite" className="space-y-3 empty:hidden">
        {state.status === "error" && <Notice tone="critical" title={state.message} />}
        {state.status === "imported" && <Notice tone="good" title={state.message} />}
        {state.status === "preview" && preview && (
          <div className="space-y-3">
            <p className="text-sm text-muted">{t.t(`webinars.import.format.${state.format}`)}</p>
            <p className="font-semibold">
              {t.n("webinars.import.matched", preview.matched.length)}
            </p>
            {preview.matched.length > 0 && (
              <ul className="divide-y divide-line rounded-card border border-line text-sm">
                {preview.matched.map((match) => (
                  <li key={match.registrationId} className="flex flex-wrap gap-x-3 px-3 py-2">
                    <span className="font-mono">{match.alias}</span>
                    {match.email && <span>{match.email}</span>}
                    {match.durationMinutes !== null && (
                      <span className="text-muted">
                        {t.t("webinars.registrants.minutes", { n: match.durationMinutes })}
                      </span>
                    )}
                    {match.already && (
                      <span className="text-muted">({t.t("webinars.import.already")})</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {preview.unmatched.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold">
                  {t.n("webinars.import.unmatched", preview.unmatched.length)}
                </summary>
                <ul className="mt-2 space-y-1">
                  {preview.unmatched.map((row) => (
                    <li key={row.line}>
                      <span className="text-muted">
                        {t.t("webinars.import.line", { n: row.line })}
                      </span>{" "}
                      {row.email}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {preview.skipped.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold">
                  {t.n("webinars.import.skipped", preview.skipped.length)}
                </summary>
                <ul className="mt-2 space-y-1">
                  {preview.skipped.map((row) => (
                    <li key={row.line}>
                      <span className="text-muted">
                        {t.t("webinars.import.line", { n: row.line })}
                      </span>{" "}
                      {row.text}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
