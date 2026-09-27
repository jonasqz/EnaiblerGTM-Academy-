import { entryEventProperties, type EntryContext } from "@/core/entry/context";
import type { EventName } from "@/core/events/names";
import { isWebhookEvent } from "@/core/webhooks/events";
import type { Queryable } from "@/db/client";
import { events } from "@/db/schema";
import { queueWebhookEvent } from "@/server/webhooks";

export interface TrackedEvent {
  tenantId: string;
  name: EventName;
  userId?: string | null;
  courseId?: string | null;
  pathId?: string | null;
  locale?: string | null;
  /** Entry context of the learner (utm_* etc.), carried on every event (brief §10). */
  entry?: EntryContext | null;
  props?: Record<string, unknown>;
}

/** Records a product event. Call inside the tenant transaction of the action it describes. */
export async function trackEvent(db: Queryable, event: TrackedEvent): Promise<void> {
  // utm_* go to their own column; the rest of the entry context rides along in props.
  const entryProps = Object.fromEntries(
    Object.entries(entryEventProperties(event.entry)).filter(([key]) => !key.startsWith("utm_")),
  );
  const props = { ...entryProps, ...event.props };
  await db.insert(events).values({
    tenantId: event.tenantId,
    name: event.name,
    userId: event.userId ?? null,
    courseId: event.courseId ?? null,
    pathId: event.pathId ?? null,
    locale: event.locale ?? null,
    utm: event.entry?.utm ?? {},
    props,
  });
  // The academy's own systems hear about it too, in the same transaction.
  if (isWebhookEvent(event.name)) {
    await queueWebhookEvent(db, {
      tenantId: event.tenantId,
      type: event.name,
      userId: event.userId,
      courseId: event.courseId,
      pathId: event.pathId,
      locale: event.locale,
      utm: event.entry?.utm,
      props,
    });
  }
}
