import { BookOpen, CircleCheck, Timer } from "lucide-react";
import type { CSSProperties } from "react";

import { useStudioText } from "@/components/studio/studio-text";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { Locale } from "@/core/i18n/locales";
import type { Logo } from "@/core/theme/schema";

/** What learners read in the preview, worded by the academy (see brand/page.tsx). */
export interface PreviewSample {
  locale: Locale;
  signIn: string;
  title: string;
  intro: string;
  browse: string;
  course: string;
  progress: string;
  lessons: string;
  minutes: string;
  passed: string;
  criterion: string;
}

/**
 * A miniature academy in the draft theme: the same component classes the
 * learner pages use, inside a [data-theme-scope] so only this box changes.
 * Its sample text is what learners see; only the box's label is Studio text.
 */
export function ThemePreview(props: {
  variables: Record<string, string>;
  academyName: string;
  logo?: Logo | null;
  sample: PreviewSample;
}) {
  const t = useStudioText();
  const { sample } = props;
  return (
    <div
      data-theme-scope
      lang={sample.locale}
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
        <span className="btn btn-secondary btn-sm pointer-events-none">{sample.signIn}</span>
      </div>
      <div className="space-y-5 p-5">
        <div className="space-y-2">
          <p className="eyebrow">{props.academyName}</p>
          <p className="font-display text-2xl leading-tight">{sample.title}</p>
          <p className="text-sm text-muted">{sample.intro}</p>
          <span className="btn btn-primary btn-sm pointer-events-none">{sample.browse}</span>
        </div>
        <div className="card card-interactive overflow-hidden">
          <div
            className="h-2"
            style={{ background: "var(--tenant-accent-1, var(--tenant-primary))" }}
          />
          <div className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="font-display text-lg leading-tight">{sample.course}</p>
              <Badge tone="info">{sample.progress}</Badge>
            </div>
            <p className="flex gap-4 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <BookOpen aria-hidden size={14} /> {sample.lessons}
              </span>
              <span className="inline-flex items-center gap-1">
                <Timer aria-hidden size={14} /> {sample.minutes}
              </span>
            </p>
            <Progress value={66} label={sample.progress} />
          </div>
        </div>
        <div className="card-flat flex items-center gap-3 p-3 text-sm">
          <CircleCheck aria-hidden size={18} style={{ color: "var(--status-good)" }} />
          <span>
            <span className="font-semibold">{sample.passed}</span> · {sample.criterion}{" "}
            <span className="whitespace-nowrap">3 / 3</span>
          </span>
        </div>
      </div>
    </div>
  );
}
