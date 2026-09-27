import { BookOpen, CircleCheck, Hammer, Timer } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { localize, type Locale } from "@/core/i18n/locales";
import type { Translator } from "@/core/i18n/translator";
import type { CatalogCourse } from "@/server/catalog";

export function CourseCard(props: {
  entry: CatalogCourse;
  t: Translator;
  fallback: Locale[];
  accent: string;
  href: string;
  index?: number;
}) {
  const { entry, t } = props;
  const { course, status } = entry;
  const artifact = entry.artifactName
    ? localize(entry.artifactName, t.locale, props.fallback)
    : null;
  return (
    <Link
      href={props.href as never}
      className="card card-interactive flex h-full flex-col overflow-hidden"
    >
      <span className="block h-2" style={{ background: props.accent }} />
      <span className="flex flex-1 flex-col gap-3 p-5">
        <span className="flex items-start justify-between gap-3">
          <span className="font-display text-xl leading-tight">
            {props.index !== undefined && (
              <span className="mr-2 text-muted">{props.index + 1}</span>
            )}
            {localize(course.title, t.locale, props.fallback)}
          </span>
          {status?.completed && (
            <Badge tone="good" icon={CircleCheck}>
              {t.t("home.completed")}
            </Badge>
          )}
        </span>
        {course.summary && (
          <span className="text-sm text-muted">
            {localize(course.summary, t.locale, props.fallback)}
          </span>
        )}
        {artifact && (
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Hammer aria-hidden size={16} className="shrink-0" />
            {t.t("home.youBuild", { artifact })}
          </span>
        )}
        <span className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 text-sm text-muted">
          {course.estMinutes && (
            <span className="inline-flex items-center gap-1.5">
              <Timer aria-hidden size={15} />
              {t.t("home.minutes", { minutes: course.estMinutes })}
            </span>
          )}
          {entry.lessonCount > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <BookOpen aria-hidden size={15} />
              {t.t("home.lessonCount", { n: entry.lessonCount })}
            </span>
          )}
          <span className="inline-flex gap-1">
            {course.languages.map((language) => (
              <span
                key={language}
                className="rounded-control border border-line px-1.5 text-xs font-semibold"
              >
                {language.toUpperCase()}
              </span>
            ))}
          </span>
        </span>
        {status && !status.completed && (
          <span className="space-y-1.5 pt-1">
            <span className="block text-xs font-semibold">
              {t.t("home.inProgress", { percent: status.percent })}
            </span>
            <Progress
              value={status.percent}
              label={t.t("home.inProgress", { percent: status.percent })}
            />
          </span>
        )}
      </span>
    </Link>
  );
}
