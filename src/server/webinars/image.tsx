import { ImageResponse } from "next/og";

import type { Translator } from "@/core/i18n/translator";
import type { TenantContext } from "@/core/tenant/context";
import type { ReliveState } from "@/core/webinars/relive";
import { formatWebinarDate, formatWebinarTime } from "@/core/webinars/time";
import type { Database } from "@/db/client";
import { fileBytes, loadFile } from "@/server/files";
import { reportError } from "@/server/observability/report";
import { imageFonts } from "@/server/og-fonts";
import type { PublicWebinar } from "@/server/webinars/public";

export const WEBINAR_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** The academy's logo as a data URL, when it has a PNG (Satori cannot read the storage URL). */
async function logoPng(db: Database, tenant: TenantContext): Promise<string | null> {
  const logo = tenant.theme.logo;
  const id = (logo?.png ?? logo?.src)?.match(/^\/files\/([0-9a-f-]{36})\.png$/)?.[1];
  if (!id) return null;
  try {
    const record = await loadFile(db, tenant.id, id);
    if (!record || record.purpose !== "brand_logo" || record.contentType !== "image/png") {
      return null;
    }
    return `data:image/png;base64,${Buffer.from(await fileBytes(record)).toString("base64")}`;
  } catch (error) {
    // A preview without the logo beats no preview.
    await reportError(error, {
      runtime: "web",
      tenant: tenant.slug,
      route: "/webinars/[slug]/image",
      extra: { asset: "brand_logo" },
    });
    return null;
  }
}

/**
 * The link preview of a webinar's page, drawn from the academy's theme
 * (webinar brief §2.2), like the credential images. Fonts are the bundled
 * families closest to the theme's. Over with a recording, it says so and
 * when it was held, like the page (never a time to be there).
 */
export async function renderWebinarImage(
  db: Database,
  tenant: TenantContext,
  webinar: PublicWebinar,
  t: Translator,
  relive: ReliveState = "none",
): Promise<ArrayBuffer> {
  const { theme } = tenant;
  const logo = await logoPng(db, tenant);
  const outlined = theme.visual_style === "outlined";
  const border = `${theme.border_width} solid ${outlined ? theme.colors.ink : `${theme.colors.ink}26`}`;
  const time =
    relive === "none"
      ? formatWebinarTime(webinar.startsAt, webinar.durationMinutes, webinar.timeZone, t.locale)
      : `${t.t("webinar.recordingBadge")} · ${t.t("webinar.recordedOn", {
          date: formatWebinarDate(webinar.startsAt, webinar.timeZone, t.locale),
        })}`;
  const academy = tenant.settings.author_display_name;
  const element = (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        padding: 44,
        background: theme.colors.surface,
        fontFamily: "Body",
        color: theme.colors.ink,
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: theme.colors.card,
          border,
          borderRadius: theme.radius,
          borderTop: `18px solid ${theme.colors.primary}`,
          padding: "40px 52px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 26, fontWeight: 700 }}>
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- Satori renders plain img
            <img
              src={logo}
              height={48}
              width={Math.round(48 * (theme.logo?.ratio ?? 1))}
              style={{ marginRight: theme.logo?.show_name ? 16 : 0 }}
            />
          )}
          {(!logo || theme.logo?.show_name) && academy}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              letterSpacing: 1,
              textTransform: "uppercase",
              opacity: 0.75,
            }}
          >
            {time}
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Display",
              fontSize: webinar.title.length > 60 ? 52 : 64,
              lineHeight: 1.1,
              marginTop: 12,
            }}
          >
            {webinar.title}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: 22,
          }}
        >
          <div style={{ display: "flex" }}>
            {t.t("webinar.minutes", { minutes: webinar.durationMinutes })} ·{" "}
            {t.t("webinar.heldIn", {
              language: t.t(
                webinar.locale === "de" ? "webinar.language.de" : "webinar.language.en",
              ),
            })}
          </div>
          <div style={{ display: "flex", fontSize: 19, opacity: 0.8 }}>{t.t("app.poweredBy")}</div>
        </div>
      </div>
    </div>
  );
  return new ImageResponse(element, {
    ...WEBINAR_IMAGE_SIZE,
    fonts: await imageFonts(theme),
  }).arrayBuffer();
}
