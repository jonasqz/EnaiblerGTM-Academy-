import { z } from "zod";

/**
 * Delivery modes and the FernUSG guardrails (brief §9). Not legal advice:
 * these rules encode what counsel asked for and must stay conservative.
 *
 * - free_async: free, self-paced. Always allowed.
 * - paid_live: paid, live sessions. Must not promise recordings.
 * - paid_async_approved: paid and self-paced, only with ZFU approval confirmed by the tenant.
 * Paid modes stay blocked until payments ship (phase 3).
 */
export const DELIVERY_MODES = ["free_async", "paid_live", "paid_async_approved"] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];
export const deliveryModeSchema = z.enum(DELIVERY_MODES);

export interface PlatformCapabilities {
  paymentsEnabled: boolean;
}

/** Payments are phase 3 (after the legal green light). */
export const PLATFORM_CAPABILITIES: PlatformCapabilities = { paymentsEnabled: false };

export interface ZfuApproval {
  confirmedAt: string;
  confirmedBy: string;
  approvalNumber?: string;
}

export interface DeliveryModeInput {
  deliveryMode: DeliveryMode;
  /** The course offers or promises recordings of live sessions. */
  offersRecordings?: boolean;
  zfuApproval?: ZfuApproval | null;
  /** Marketing texts of the course (title, summary) to scan for recording promises. */
  texts?: readonly string[];
}

export type DeliveryModeIssueCode =
  | "payments_not_available"
  | "paid_live_offers_recordings"
  | "zfu_approval_missing"
  | "possible_recording_promise";

export interface DeliveryModeIssue {
  code: DeliveryModeIssueCode;
  severity: "error" | "warning";
  message: string;
}

const RECORDING_PROMISE =
  /\b(?:recordings?|recorded|replays?)\b|aufzeichnung\p{L}*|mitschnitt\p{L}*/iu;

/** Issues that block publishing (errors) or need a second look (warnings). */
export function checkDeliveryMode(
  input: DeliveryModeInput,
  platform: PlatformCapabilities = PLATFORM_CAPABILITIES,
): DeliveryModeIssue[] {
  const issues: DeliveryModeIssue[] = [];
  const paid = input.deliveryMode !== "free_async";

  if (paid && !platform.paymentsEnabled) {
    issues.push({
      code: "payments_not_available",
      severity: "error",
      message: "Paid courses stay blocked until payments ship.",
    });
  }

  if (input.deliveryMode === "paid_live") {
    if (input.offersRecordings) {
      issues.push({
        code: "paid_live_offers_recordings",
        severity: "error",
        message: "Paid live courses must not offer or promise recordings.",
      });
    }
    const promising = (input.texts ?? []).find((text) => RECORDING_PROMISE.test(text));
    if (promising) {
      issues.push({
        code: "possible_recording_promise",
        severity: "warning",
        message: `Check that this text does not promise recordings: "${promising.slice(0, 80)}"`,
      });
    }
  }

  if (input.deliveryMode === "paid_async_approved" && !input.zfuApproval) {
    issues.push({
      code: "zfu_approval_missing",
      severity: "error",
      message: "Self-paced paid courses need the tenant to confirm ZFU approval first.",
    });
  }

  return issues;
}

export function canPublishWithDeliveryMode(
  input: DeliveryModeInput,
  platform: PlatformCapabilities = PLATFORM_CAPABILITIES,
): boolean {
  return checkDeliveryMode(input, platform).every((issue) => issue.severity !== "error");
}
