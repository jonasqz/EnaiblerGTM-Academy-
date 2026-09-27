import type { CompletionMode } from "@/core/courses/completion";
import { linkedInAddToProfileUrl, linkedInShareUrl } from "@/core/credentials/linkedin";
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

export interface LinkedInCredential {
  verificationUrl: string;
  /** What LinkedIn's form calls it (credentialCopy's linkedInName). */
  name: string;
  academy: string;
  /** The academy's LinkedIn page, when it has told us its id. */
  organizationId?: string | null;
  issuedAt: Date;
  /** As shown on the credential (ABCD-EFGH-…). */
  credentialId: string;
}

/**
 * Where the owner's share button leads: LinkedIn's composer for a post, or
 * the "Add to profile" form. Either way LinkedIn gets the page with its
 * channel, so visitors it brings are counted where they came from.
 */
export function linkedInTarget(channel: ShareChannel, credential: LinkedInCredential): string {
  const url = sharedUrl(credential.verificationUrl, channel);
  if (channel === "post") return linkedInShareUrl(url);
  return linkedInAddToProfileUrl({
    name: credential.name,
    organizationName: credential.academy,
    organizationId: credential.organizationId,
    issuedAt: credential.issuedAt,
    certUrl: url,
    certId: credential.credentialId,
  });
}

/** The page's call to action, carrying on the channel the visitor came from. */
export function ctaPath(publicId: string, via: ShareChannel | null): string {
  return via ? `/verify/${publicId}/cta?via=${via}` : `/verify/${publicId}/cta`;
}

/**
 * The link preview's description: the learner's name and what they did.
 * Parts left empty (a learner without a name) leave no stray separator.
 */
export function previewDescription(parts: ReadonlyArray<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim() ?? "")
    .filter((part) => part !== "")
    .join(" · ");
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
