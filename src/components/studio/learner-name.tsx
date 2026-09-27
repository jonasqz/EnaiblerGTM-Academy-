import { Mail } from "lucide-react";

/**
 * Learners appear under a per-academy alias. Name and e-mail only show for
 * learners who agreed to be contacted by the academy (lead handoff, brief §9).
 */
export function LearnerName(props: {
  alias: string;
  displayName: string | null;
  contactEmail: string | null;
}) {
  if (!props.contactEmail) {
    return <span className="font-mono text-sm font-semibold">{props.alias}</span>;
  }
  return (
    <span className="block min-w-0">
      <span className="block font-semibold">{props.displayName || props.alias}</span>
      <a
        href={`mailto:${props.contactEmail}`}
        className="inline-flex items-center gap-1 text-xs text-muted hover:underline"
      >
        <Mail aria-hidden size={12} /> {props.contactEmail}
      </a>
    </span>
  );
}
