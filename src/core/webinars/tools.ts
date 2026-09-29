/**
 * Webinar tools (webinar brief §2.3, §6): enaibler never hosts live video;
 * the session runs in the academy's own tool. Each tool is one adapter
 * behind this interface. "Link only" always works, so no academy waits for
 * an integration; Zoom, Teams and Meet adapters come later and must fill in
 * what their plan and API allow (verify every column in a spike first).
 */
export const WEBINAR_TOOLS = ["link", "zoom", "teams", "meet"] as const;
export type WebinarTool = (typeof WEBINAR_TOOLS)[number];

/** What the Studio offers today. */
export const OFFERED_TOOLS: readonly WebinarTool[] = ["link"];

export interface ToolSession {
  webinarId: string;
  title: string;
  startsAt: Date;
  durationMinutes: number;
  timeZone: string;
  /** What the host pasted (link only) or what the tool gave last time. */
  joinUrl: string | null;
  externalId: string | null;
}

export interface CreatedSession {
  joinUrl: string | null;
  externalId: string | null;
}

export interface ToolAttendee {
  email: string;
  name: string | null;
}

/** One attendee as the tool reports them; matched to registrants by address. */
export interface ToolAttendance {
  email: string;
  joinedAt: Date | null;
  leftAt: Date | null;
  durationMinutes: number | null;
}

export interface ToolRecording {
  /** Where the recording can be fetched from (for the re-live import). */
  url: string;
  durationSeconds: number | null;
}

export interface WebinarToolAdapter {
  tool: WebinarTool;
  /** How attendance gets in when the tool cannot report it: check-in code and file upload. */
  attendance: "tool_report" | "checkin_or_file";
  /** Creates or updates the session in the tool; link only keeps the pasted link. */
  createSession(session: ToolSession): Promise<CreatedSession>;
  /** A personal join link where the tool has them (better attendance matching); else null. */
  registerAttendee(
    session: ToolSession,
    attendee: ToolAttendee,
  ): Promise<{ joinUrl: string | null }>;
  /** The tool's attendance report, or null when it has none. */
  fetchAttendance(session: ToolSession): Promise<ToolAttendance[] | null>;
  /** The tool's recording, or null (link only: the host uploads it). */
  fetchRecording(session: ToolSession): Promise<ToolRecording | null>;
}

/** Any tool, by its link: enaibler keeps the registrations; attendance by code or file. */
export const linkAdapter: WebinarToolAdapter = {
  tool: "link",
  attendance: "checkin_or_file",
  createSession: async (session) => ({
    joinUrl: session.joinUrl,
    externalId: session.externalId,
  }),
  registerAttendee: async () => ({ joinUrl: null }),
  fetchAttendance: async () => null,
  fetchRecording: async () => null,
};

const ADAPTERS: Partial<Record<WebinarTool, WebinarToolAdapter>> = { link: linkAdapter };

/** The adapter for a tool; tools without one yet fall back to link only. */
export function toolAdapter(tool: WebinarTool): WebinarToolAdapter {
  return ADAPTERS[tool] ?? linkAdapter;
}

/**
 * A join link the host pasted: https only, no credentials in it. Zoom,
 * Teams and Meet links all qualify; the tool's own passcode may ride along.
 */
export function joinUrlIssue(value: string): "invalid" | "https" | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return "invalid";
  }
  if (url.username || url.password || value.trim().length > 2000) return "invalid";
  return url.protocol === "https:" ? null : "https";
}
