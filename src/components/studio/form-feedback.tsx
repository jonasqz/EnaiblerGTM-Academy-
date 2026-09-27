import { Notice } from "@/components/ui/notice";

/** Result of a Studio form action: errors block, warnings inform, a message confirms. */
export function FormFeedback(props: {
  state: { ok?: boolean; message?: string; errors?: string[]; warnings?: string[] };
}) {
  const { state } = props;
  return (
    <div className="space-y-3 empty:hidden" aria-live="polite">
      {state.errors && state.errors.length > 0 && (
        <Notice tone="critical" title="Not saved">
          <ul className="list-disc space-y-1 pl-4">
            {state.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </Notice>
      )}
      {state.ok && state.message && <Notice tone="good" title={state.message} />}
      {state.warnings && state.warnings.length > 0 && (
        <Notice tone="warning" title="Check the wording">
          <ul className="list-disc space-y-1 pl-4">
            {state.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Notice>
      )}
    </div>
  );
}
