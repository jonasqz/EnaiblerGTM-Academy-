import type { CompletionMode } from "@/core/courses/completion";
import type { Translator } from "@/core/i18n/translator";

/*
 * Sharing a credential on LinkedIn (brief §2 steps 7–8, §6): a post that
 * links to the verification page, or the certificate on the learner's
 * profile. Each shares the page with its own `via`, so the academy sees which
 * channel brings visitors and new learners, without cookies (brief §9).
 */

export const SHARE_CHANNELS = ["post", "profile"] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

export function shareChannelOf(value: unknown): ShareChannel | null {
  return typeof value === "string" && (SHARE_CHANNELS as readonly string[]).includes(value)
    ? (value as ShareChannel)
    : null;
}

/** The verification page's address as shared on a channel. */
export function sharedUrl(verificationUrl: string, channel: ShareChannel): string {
  return `${verificationUrl}?via=${channel}`;
}

export type Attribution = Record<"utm_source" | "utm_medium" | "utm_content", string>;

/**
 * What the verification page's call to action carries into the academy: the
 * credential that brought the visitor, and the LinkedIn channel it was shared
 * on (or none, for a link passed on some other way).
 */
export function shareAttribution(publicId: string, via: ShareChannel | null): Attribution {
  return via
    ? { utm_source: "linkedin", utm_medium: via, utm_content: publicId }
    : { utm_source: "verification", utm_medium: "credential", utm_content: publicId };
}

/** Whether an entry link's utm values came from a shared credential. */
export function fromSharedCredential(utm: { source?: string; medium?: string }): boolean {
  return (
    (utm.source === "verification" && utm.medium === "credential") ||
    (utm.source === "linkedin" && shareChannelOf(utm.medium) !== null)
  );
}

export interface PostFacts {
  basis: CompletionMode;
  course: string;
  academy: string;
  /** What the learner built; null for a credential earned by the test alone. */
  artifact: string | null;
  /** "Deliverable: … · Final Test passed" (see proof.ts). */
  proof: string;
  url: string;
}

const PLACEHOLDER = /\{(course|academy|artifact|proof|url)\}/g;

/**
 * The post suggested to the learner, who can change every word before
 * posting: the academy's own text if it has one, else one that says what
 * the learner did. Hashtags go last.
 */
export function suggestedPost(
  t: Translator,
  facts: PostFacts,
  academy: { template: string | null; hashtags: readonly string[] },
): string {
  const vars = {
    course: facts.course,
    academy: facts.academy,
    artifact: facts.artifact ?? "",
    proof: facts.proof,
    url: facts.url,
  };
  const body = academy.template
    ? academy.template.replace(PLACEHOLDER, (_, key: keyof typeof vars) => vars[key])
    : t.t(`share.post.${facts.basis}`, vars);
  const tags = academy.hashtags.map((tag) => `#${tag}`).join(" ");
  return tags ? `${body.trimEnd()}\n\n${tags}` : body.trimEnd();
}
