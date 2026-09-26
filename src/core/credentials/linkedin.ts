/**
 * LinkedIn share and "Add to profile" links (brief §6).
 *
 * Add to profile: https://addtoprofile.linkedin.com/ — parameters as of
 * Sept 2026 (startTask, name, organizationId | organizationName, issueYear,
 * issueMonth (1-based), certUrl, certId). organizationId and organizationName
 * are mutually exclusive; use the name unless the tenant has a LinkedIn page id.
 * LinkedIn does not guarantee prefill, so click-test before each release.
 */
export interface AddToProfileInput {
  name: string;
  organizationName: string;
  /** Numeric id of the tenant's LinkedIn page, if configured. */
  organizationId?: string | null;
  issuedAt: Date;
  certUrl: string;
  certId: string;
}

export function linkedInAddToProfileUrl(input: AddToProfileInput): string {
  const params = new URLSearchParams({ startTask: "CERTIFICATION_NAME", name: input.name });
  if (input.organizationId) params.set("organizationId", input.organizationId);
  else params.set("organizationName", input.organizationName);
  params.set("issueYear", String(input.issuedAt.getUTCFullYear()));
  params.set("issueMonth", String(input.issuedAt.getUTCMonth() + 1));
  params.set("certUrl", input.certUrl);
  params.set("certId", input.certId);
  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}

/**
 * Documented share URL: only `url` is supported; the preview comes from the
 * page's Open Graph tags (the verification page renders them).
 */
export function linkedInShareUrl(url: string): string {
  return `https://www.linkedin.com/sharing/share-offsite/?${new URLSearchParams({ url }).toString()}`;
}
