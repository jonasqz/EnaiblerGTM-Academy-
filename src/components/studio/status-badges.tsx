"use client";

import {
  Archive,
  CircleCheck,
  Clock,
  EyeOff,
  Gavel,
  Hourglass,
  PencilLine,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";

import { useStudioText } from "@/components/studio/studio-text";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { SubmissionStatus } from "@/core/review/outcome";
import type { CourseStatus } from "@/server/studio/courses";

const COURSE: Record<CourseStatus, { tone: BadgeTone; icon: LucideIcon }> = {
  draft: { tone: "neutral", icon: PencilLine },
  published: { tone: "good", icon: CircleCheck },
  unpublished: { tone: "warning", icon: EyeOff },
  archived: { tone: "neutral", icon: Archive },
};

export function CourseStatusBadge(props: { status: CourseStatus }) {
  const t = useStudioText();
  const { tone, icon } = COURSE[props.status];
  return (
    <Badge tone={tone} icon={icon}>
      {t.t(`common.courseStatus.${props.status}`)}
    </Badge>
  );
}

const SUBMISSION: Record<SubmissionStatus, { tone: BadgeTone; icon: LucideIcon }> = {
  submitted: { tone: "info", icon: Clock },
  in_review: { tone: "warning", icon: Hourglass },
  needs_revision: { tone: "neutral", icon: RotateCcw },
  passed: { tone: "good", icon: CircleCheck },
  overridden: { tone: "info", icon: Gavel },
};

export function SubmissionStatusBadge(props: { status: SubmissionStatus }) {
  const t = useStudioText();
  const { tone, icon } = SUBMISSION[props.status];
  return (
    <Badge tone={tone} icon={icon}>
      {t.t(`common.submissionStatus.${props.status}`)}
    </Badge>
  );
}

const SOURCE: Record<
  "pending" | "processing" | "ready" | "failed",
  { tone: BadgeTone; icon: LucideIcon }
> = {
  pending: { tone: "info", icon: Clock },
  processing: { tone: "info", icon: Hourglass },
  ready: { tone: "good", icon: CircleCheck },
  failed: { tone: "critical", icon: RotateCcw },
};

export function SourceStatusBadge(props: { status: keyof typeof SOURCE }) {
  const t = useStudioText();
  const { tone, icon } = SOURCE[props.status];
  return (
    <Badge tone={tone} icon={icon}>
      {t.t(`common.sourceStatus.${props.status}`)}
    </Badge>
  );
}
