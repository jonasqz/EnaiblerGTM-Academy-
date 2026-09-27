import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "good" | "warning" | "serious" | "critical" | "info";

/** Status never relies on colour alone: every badge has an icon and a text label. */
export function Badge(props: { tone?: BadgeTone; icon?: LucideIcon; children: ReactNode }) {
  const Icon = props.icon;
  return (
    <span className="badge" data-tone={props.tone ?? "neutral"}>
      {Icon && <Icon aria-hidden size={14} strokeWidth={2.5} />}
      {props.children}
    </span>
  );
}
