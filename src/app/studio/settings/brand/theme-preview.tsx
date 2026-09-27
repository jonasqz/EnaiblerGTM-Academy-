import { BookOpen, CircleCheck, Timer } from "lucide-react";
import type { CSSProperties } from "react";

import { useStudioText } from "@/components/studio/studio-text";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { Logo } from "@/core/theme/schema";

/**
 * A miniature academy in the draft theme: the same component classes the
 * learner pages use, inside a [data-theme-scope] so only this box changes.
 * Its sample text is what learners see; only the box's label is Studio text.
 */
export function ThemePreview(props: {
  variables: Record<string, string>;
  academyName: string;
  logo?: Logo | null;
  courseTerm: string;
  lessonTerm: string;
}) {
  const t = useStudioText();
  return (
    <div
      data-theme-scope
      style={props.variables as CSSProperties}
      className="overflow-hidden rounded-card border-outline border-line bg-surface font-body text-ink"
      aria-label={t.t("brand.preview.label")}
    >
      <div className="flex items-center justify-between gap-3 border-b-outline border-line bg-card px-4 py-3">
        <span className="flex min-w-0 items-center gap-2 font-display text-base leading-tight">
          {props.logo && (
            // eslint-disable-next-line @next/next/no-img-element -- uploaded logo
            <img src={props.logo.src} alt="" className="h-7 w-auto max-w-32 object-contain" />
          )}
          {(!props.logo || props.logo.show_name) && (
            <span className="truncate">{props.academyName}</span>
          )}
        </span>
        <span className="btn btn-secondary btn-sm pointer-events-none">Sign in</span>
      </div>
      <div className="space-y-5 p-5">
        <div className="space-y-2">
          <p className="eyebrow">{props.academyName}</p>
          <p className="font-display text-2xl leading-tight">Learn it. Build it. Prove it.</p>
          <p className="text-sm text-muted">
            Every {props.courseTerm.toLowerCase()} ends with real work, reviewed on every criterion.
          </p>
          <span className="btn btn-primary btn-sm pointer-events-none">
            See all {props.courseTerm.toLowerCase()}s
          </span>
        </div>
        <div className="card card-interactive overflow-hidden">
          <div
            className="h-2"
            style={{ background: "var(--tenant-accent-1, var(--tenant-primary))" }}
          />
          <div className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="font-display text-lg leading-tight">Write a validated idea brief</p>
              <Badge tone="info">In progress</Badge>
            </div>
            <p className="flex gap-4 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <BookOpen aria-hidden size={14} /> 3 {props.lessonTerm.toLowerCase()}s
              </span>
              <span className="inline-flex items-center gap-1">
                <Timer aria-hidden size={14} /> 90 min
              </span>
            </p>
            <Progress value={66} label="Progress" />
          </div>
        </div>
        <div className="card-flat flex items-center gap-3 p-3 text-sm">
          <CircleCheck aria-hidden size={18} style={{ color: "var(--status-good)" }} />
          <span>
            <span className="font-semibold">Passed</span> · Evidence and reasoning 3 / 3
          </span>
        </div>
      </div>
    </div>
  );
}
