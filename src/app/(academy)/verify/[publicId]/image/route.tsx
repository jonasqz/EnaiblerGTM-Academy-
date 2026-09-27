import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { pathColor } from "@/core/theme/css";
import { getViewer } from "@/server/auth";
import { credentialCopy } from "@/server/credential-copy";
import { canView, loadCredential } from "@/server/credentials";
import { getDb } from "@/db/client";
import { fileBytes, loadFile } from "@/server/files";
import { imageFonts } from "@/server/og-fonts";
import { getOrigin, getTenant, getTranslator } from "@/server/request";

const SIZES = {
  og: { width: 1200, height: 630 }, // link previews
  card: { width: 1200, height: 848 }, // download
} as const;

/** The path picture as a data URL (PNG from our storage; SVGs were rendered to PNG on upload). */
async function pathPng(tenantId: string, url: string | undefined): Promise<string | null> {
  const id = url?.match(/^\/files\/([0-9a-f-]{36})\.png$/)?.[1];
  if (!id) return null;
  const record = await loadFile(getDb(), tenantId, id);
  if (!record || record.contentType !== "image/png" || record.purpose !== "path_visual")
    return null;
  return `data:image/png;base64,${Buffer.from(await fileBytes(record)).toString("base64")}`;
}

/** Credential image rendered from the tenant theme (brief §6, §11: Satori via next/og). */
export async function GET(
  request: NextRequest,
  context: RouteContext<"/verify/[publicId]/image">,
): Promise<Response> {
  const { publicId } = await context.params;
  const tenant = await getTenant();
  const credential = await loadCredential(tenant, publicId);
  const viewer = credential?.visibility === "public" ? null : await getViewer(tenant);
  if (!credential || !canView(credential, viewer?.userId ?? null))
    return new Response("Not found", { status: 404 });

  const format = request.nextUrl.searchParams.get("format") === "card" ? "card" : "og";
  const size = SIZES[format];
  const t = await getTranslator();
  const copy = credentialCopy(tenant, credential, t, await getOrigin());
  const { theme } = tenant;
  const accent = credential.path
    ? pathColor(theme, credential.path.position, credential.path.color)
    : theme.colors.primary;
  const outlined = theme.visual_style === "outlined";
  const pathPicture = await pathPng(tenant.id, credential.path?.visual?.png);
  const border = `${theme.border_width} solid ${outlined ? theme.colors.ink : `${theme.colors.ink}26`}`;

  const headers: Record<string, string> = {
    "cache-control":
      credential.visibility === "public" ? "public, max-age=300" : "private, no-store",
  };
  if (request.nextUrl.searchParams.get("download") === "1") {
    headers["content-disposition"] = `attachment; filename="credential-${credential.publicId}.png"`;
  }

  return new ImageResponse(
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
          boxShadow: `${theme.shadow.x} ${theme.shadow.y} ${theme.shadow.blur} ${theme.shadow.color}`,
          borderTop: `18px solid ${accent}`,
          padding: "40px 52px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 26,
          }}
        >
          <div style={{ display: "flex", fontWeight: 700 }}>{copy.academy}</div>
          {copy.pathTitle && (
            <div style={{ display: "flex", alignItems: "center" }}>
              {pathPicture ? (
                // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- Satori renders plain img
                <img
                  src={pathPicture}
                  width={44}
                  height={44}
                  style={{ marginRight: 12, background: accent, borderRadius: 6 }}
                />
              ) : (
                <div
                  style={{ width: 22, height: 22, marginRight: 10, background: accent, border }}
                />
              )}
              {copy.pathTitle}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 24,
              letterSpacing: 2,
              textTransform: "uppercase",
              opacity: 0.7,
            }}
          >
            {copy.credentialTerm}
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Display",
              fontSize: format === "card" ? 72 : 60,
              lineHeight: 1.1,
              marginTop: 10,
            }}
          >
            {copy.courseTitle}
          </div>
          <div style={{ display: "flex", fontSize: 30, marginTop: 14 }}>{copy.artifactLine}</div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* Learners who set no name get a credential without one. */}
            {copy.displayName && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 22, opacity: 0.7 }}>
                  {t.t("verify.awardedTo")}
                </div>
                <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>
                  {copy.displayName}
                </div>
              </div>
            )}
            {copy.levelLine && (
              <div style={{ display: "flex", fontSize: 24, marginTop: 4 }}>{copy.levelLine}</div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              fontSize: 19,
              opacity: 0.8,
            }}
          >
            <div style={{ display: "flex" }}>
              {t.t("verify.issuedOn")} {copy.issuedOn}
            </div>
            <div style={{ display: "flex" }}>
              {t.t("verify.credentialId")}: {copy.credentialId}
            </div>
            {format === "card" && <div style={{ display: "flex" }}>{copy.verificationUrl}</div>}
            <div style={{ display: "flex", marginTop: 6 }}>{t.t("app.poweredBy")}</div>
          </div>
        </div>
      </div>
    </div>,
    { ...size, fonts: await imageFonts(theme), headers },
  );
}
