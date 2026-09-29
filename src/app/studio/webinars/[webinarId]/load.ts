import "server-only";

import { cache } from "react";

import { getDb } from "@/db/client";
import { loadStudioWebinar } from "@/server/webinars/studio";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One load per request for the webinar's layout and its tabs. */
export const getStudioWebinar = cache(async (tenantId: string, webinarId: string) =>
  UUID.test(webinarId) ? loadStudioWebinar(getDb(), tenantId, webinarId) : null,
);
