import { CircleCheck, CircleX, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { BadgeTone } from "@/components/ui/badge";

const ICONS: Record<BadgeTone, LucideIcon> = {
  neutral: Info,
  info: Info,
  good: CircleCheck,
  warning: TriangleAlert,
  serious: TriangleAlert,
  critical: CircleX,
};

const COLORS: Record<BadgeTone, string> = {
  neutral: "var(--ui-muted)",
  info: "var(--tenant-primary)",
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  serious: "var(--status-serious)",
  critical: "var(--status-critical)",
};

export function Notice(props: { tone?: BadgeTone; title?: ReactNode; children?: ReactNode }) {
  const tone = props.tone ?? "info";
  const Icon = ICONS[tone];
  return (
    <div
      className="flex gap-3 rounded-card p-4"
      style={{
        background: `color-mix(in srgb, ${COLORS[tone]} 10%, var(--tenant-card))`,
        border: `1px solid color-mix(in srgb, ${COLORS[tone]} 40%, transparent)`,
      }}
      role={tone === "critical" ? "alert" : "status"}
    >
      <Icon aria-hidden size={20} className="mt-0.5 shrink-0" style={{ color: COLORS[tone] }} />
      <div className="min-w-0 space-y-1 text-sm">
        {props.title && <p className="font-semibold">{props.title}</p>}
        {props.children && <div>{props.children}</div>}
      </div>
    </div>
  );
}
