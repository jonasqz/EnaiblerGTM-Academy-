/** Link-preview crawlers and bots; their page views do not count as verification views. */
const BOT_PATTERN =
  /bot|crawler|spider|preview|facebookexternalhit|linkedin|slack|whatsapp|telegram|discord|embedly|curl|wget/i;

export function isBot(userAgent: string | null | undefined): boolean {
  return !userAgent || BOT_PATTERN.test(userAgent);
}
