import { ArrowLeft, CalendarDays, Circle, CircleCheck, Hammer, ListChecks } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { completeLessonAction } from "@/app/(academy)/courses/[slug]/actions";
import { SessionPanel } from "@/app/(academy)/courses/[slug]/learn/[key]/session-panel";
import { KnowledgeCheck } from "@/components/knowledge-check";
import { knowledgeCheckLabels } from "@/components/knowledge-check-labels";
import { MediaBlock } from "@/components/media/media-block";
import { Markdown } from "@/components/ui/markdown";
import { Notice } from "@/components/ui/notice";
import { Progress } from "@/components/ui/progress";
import { can } from "@/core/access/roles";
import { requiresTest, requiresWork } from "@/core/courses/completion";
import { courseProgress, neighbours, type LessonProgressMap } from "@/core/courses/lessons";
import { localize } from "@/core/i18n/locales";
import { getDb } from "@/db/client";
import { requireViewer } from "@/server/access";
import { loadLearnerCourse } from "@/server/learning";
import { videosById } from "@/server/media/library";
import { progressOf } from "@/server/media/progress";
import { checkQuestionsOf, markdownOf, mediaAssetIdsOf } from "@/server/studio/lessons";
import { getTranslator } from "@/server/request";

/** Lesson player (brief §5): short, resumable, works on a phone. */
export default async function LessonPage({
  params,
  searchParams,
}: PageProps<"/courses/[slug]/learn/[key]">) {
  const { slug, key } = await params;
  const { session: registered } = await searchParams;
  const { tenant, viewer, roles } = await requireViewer(`/courses/${slug}/learn/${key}`);
  const t = await getTranslator();
  const data = await loadLearnerCourse(getDb(), tenant, slug, viewer.userId, t.locale);
  if (!data) notFound();
  if (!data.enrollment) redirect(`/courses/${slug}`);
  const lesson = data.lessons.find((row) => row.key === key);
  if (!lesson) notFound();

  const keys = data.lessons.map((row) => row.key);
  const progressMap = data.enrollment.lessonProgress as LessonProgressMap;
  const progress = courseProgress(keys, progressMap);
  const { previous, next } = neighbours(keys, key);
  const done = Boolean(progressMap[key]);
  const body = markdownOf(lesson.blocks);
  // Answer key included: knowledge checks are practice, checked in the browser.
  const questions = checkQuestionsOf(lesson.blocks);
  const mediaIds = mediaAssetIdsOf(lesson.blocks);
  // A live session (webinar brief §2.5): the webinar is the lesson, its recording comes after.
  const session = data.sessions.find((row) => row.lessonKey === key) ?? null;
  const sessionKeys = new Set(data.sessions.map((row) => row.lessonKey));
  const recordingId = session?.webinar.recordingAssetId ?? null;
  const videoIds = recordingId ? [...mediaIds, recordingId] : mediaIds;
  const videos = await videosById(getDb(), tenant.id, videoIds);
  const watched = await progressOf(getDb(), tenant.id, viewer.userId, videoIds);
  const mediaViewer = { member: roles.length > 0, canEditCourses: can(roles, "courses.edit") };
  const courseTitle = localize(data.course.title, data.locale, [tenant.settings.default_locale]);

  const syllabus = (
    <ol className="space-y-1">
      {data.lessons.map((row, index) => {
        const current = row.key === key;
        return (
          <li key={row.key}>
            <Link
              href={`/courses/${slug}/learn/${row.key}`}
              aria-current={current ? "page" : undefined}
              className={`flex items-center gap-2 rounded-control px-3 py-2 text-sm ${current ? "bg-primary-soft font-semibold" : "hover:bg-subtle"}`}
            >
              {progressMap[row.key] ? (
                <CircleCheck
                  aria-label={t.t("lesson.done")}
                  size={16}
                  className="shrink-0"
                  style={{ color: "var(--status-good)" }}
                />
              ) : sessionKeys.has(row.key) ? (
                <CalendarDays
                  aria-label={t.t("session.eyebrow")}
                  size={16}
                  className="shrink-0 text-muted"
                />
              ) : (
                <Circle aria-hidden size={16} className="shrink-0 text-muted" />
              )}
              <span className="text-muted">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate">{row.title}</span>
            </Link>
          </li>
        );
      })}
      {/* What the course ends with: the work, the test, or both. */}
      {requiresWork(data.completionMode) && data.assignment && (
        <li>
          <Link
            href={`/courses/${slug}/assignment`}
            className="flex items-center gap-2 rounded-control px-3 py-2 text-sm font-semibold hover:bg-subtle"
          >
            <Hammer aria-hidden size={16} className="shrink-0" />
            {t.term("assignment")}
          </Link>
        </li>
      )}
      {requiresTest(data.completionMode) && data.test && (
        <li>
          <Link
            href={`/courses/${slug}/test`}
            className="flex items-center gap-2 rounded-control px-3 py-2 text-sm font-semibold hover:bg-subtle"
          >
            <ListChecks aria-hidden size={16} className="shrink-0" />
            {t.term("test")}
          </Link>
        </li>
      )}
    </ol>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[17rem_1fr]">
      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Link
          href={`/courses/${slug}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
        >
          <ArrowLeft aria-hidden size={16} /> {courseTitle}
        </Link>
        <div className="space-y-1.5">
          <p className="text-xs text-muted">
            {t.t("course.progress", { done: progress.done, total: progress.total })}
          </p>
          <Progress
            value={progress.percent}
            label={t.t("course.progress", { done: progress.done, total: progress.total })}
          />
        </div>
        <details className="card-flat p-2 lg:hidden">
          <summary className="cursor-pointer px-2 py-1 text-sm font-semibold">
            {t.term("lesson", { plural: true })}
          </summary>
          <div className="pt-2">{syllabus}</div>
        </details>
        <nav className="hidden lg:block" aria-label={t.term("lesson", { plural: true })}>
          {syllabus}
        </nav>
      </aside>

      <article className="card min-w-0 p-6 sm:p-10">
        <p className="eyebrow">
          {session ? `${t.t("session.eyebrow")} · ` : ""}
          {t.term("lesson")} {keys.indexOf(key) + 1} / {keys.length}
        </p>
        <h1 className="mt-2 font-display text-3xl leading-tight">{lesson.title}</h1>
        {session && registered === "registered" && (
          <div className="mt-4">
            <Notice tone="good" title={t.t("session.registered")} />
          </div>
        )}
        {session && registered === "closed" && (
          <div className="mt-4">
            <Notice tone="warning" title={t.t("session.closed")} />
          </div>
        )}
        {session && (
          <div className="mt-6">
            <SessionPanel
              t={t}
              session={session}
              courseSlug={slug}
              lessonKey={key}
              academy={tenant.settings.author_display_name}
              requirement={data.sessionRequirement}
              watchedPercent={tenant.settings.video.watched_percent}
              recording={recordingId ? videos.get(recordingId) : undefined}
              // Learners of the series count as signed up for each of its sessions.
              viewer={{ ...mediaViewer, signedUp: true }}
              progress={recordingId ? (watched.get(recordingId) ?? null) : null}
              now={new Date()}
            />
          </div>
        )}
        <div className="mt-6 space-y-8">
          {session && body.trim() && (
            <h2 className="font-display text-xl">{t.t("session.preparation")}</h2>
          )}
          {mediaIds.map((id) => (
            <MediaBlock
              key={id}
              asset={videos.get(id)}
              t={t}
              viewer={mediaViewer}
              progress={watched.get(id) ?? null}
            />
          ))}
          {body.trim() ? (
            <Markdown source={body} />
          ) : mediaIds.length === 0 && !session ? (
            <p className="text-muted">{t.t("lesson.empty")}</p>
          ) : null}
        </div>
        {questions.length > 0 && (
          <KnowledgeCheck
            key={key}
            questions={questions}
            labels={knowledgeCheckLabels(t)}
            className="mt-10 border-t border-line pt-8"
          />
        )}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
          {previous ? (
            <Link href={`/courses/${slug}/learn/${previous}`} className="btn btn-ghost">
              ← {t.t("lesson.previous")}
            </Link>
          ) : (
            <span />
          )}
          {session ? (
            // A session is done by being there or watching it: no button marks it.
            <div className="flex flex-wrap items-center justify-end gap-3">
              {!done && (
                <p className="max-w-sm text-sm text-muted">
                  {t.t(
                    data.sessionRequirement.rule === "attended"
                      ? "session.doneAutoLive"
                      : "session.doneAuto",
                  )}
                </p>
              )}
              {next ? (
                <Link href={`/courses/${slug}/learn/${next}`} className="btn btn-primary">
                  {t.t("lesson.next")} →
                </Link>
              ) : (
                <Link href={`/courses/${slug}`} className="btn btn-primary">
                  {courseTitle} →
                </Link>
              )}
            </div>
          ) : (
            <form action={completeLessonAction}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="key" value={key} />
              <button type="submit" className="btn btn-primary">
                {done ? t.t("lesson.next") : t.t("lesson.markDone")} →
              </button>
            </form>
          )}
        </div>
      </article>
    </div>
  );
}
