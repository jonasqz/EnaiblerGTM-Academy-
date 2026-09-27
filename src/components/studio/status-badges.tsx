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

import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { SubmissionStatus } from "@/core/review/outcome";
import type { CourseStatus } from "@/server/studio/courses";

const COURSE: Record<CourseStatus, { tone: BadgeTone; icon: LucideIcon; label: string }> = {
  draft: { tone: "neutral", icon: PencilLine, label: "Draft" },
  published: { tone: "good", icon: CircleCheck, label: "Published" },
  unpublished: { tone: "warning", icon: EyeOff, label: "Unpublished" },
  archived: { tone: "neutral", icon: Archive, label: "Archived" },
};

export function CourseStatusBadge(props: { status: CourseStatus }) {
  const { tone, icon, label } = COURSE[props.status];
  return (
    <Badge tone={tone} icon={icon}>
      {label}
    </Badge>
  );
}

const SUBMISSION: Record<SubmissionStatus, { tone: BadgeTone; icon: LucideIcon; label: string }> = {
  submitted: { tone: "info", icon: Clock, label: "AI reviewing" },
  in_review: { tone: "warning", icon: Hourglass, label: "Needs a human" },
  needs_revision: { tone: "neutral", icon: RotateCcw, label: "Needs revision" },
  passed: { tone: "good", icon: CircleCheck, label: "Passed" },
  overridden: { tone: "info", icon: Gavel, label: "Overridden" },
};

export function SubmissionStatusBadge(props: { status: SubmissionStatus }) {
  const { tone, icon, label } = SUBMISSION[props.status];
  return (
    <Badge tone={tone} icon={icon}>
      {label}
    </Badge>
  );
}
