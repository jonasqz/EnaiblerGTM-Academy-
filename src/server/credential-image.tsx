import { ImageResponse } from "next/og";

import type { Translator } from "@/core/i18n/translator";
import type { TenantContext } from "@/core/tenant/context";
import { pathColor } from "@/core/theme/css";
import type { Database } from "@/db/client";
import { credentialCopy } from "@/server/credential-copy";
import type { CredentialView } from "@/server/credentials";
import { fileBytes, loadFile } from "@/server/files";
import { reportError } from "@/server/observability/report";
import { imageFonts, type UploadedFontLoader } from "@/server/og-fonts";

export const CREDENTIAL_IMAGE_SIZES = {
  og: { width: 1200, height: 630 }, // link previews
  card: { width: 1200, height: 848 }, // download
} as const;

export type CredentialImageFormat = keyof typeof CREDENTIAL_IMAGE_SIZES;

/*
 * A shared post without its picture is the worst case for the academy, so a
 * brand asset that cannot be read (a logo or font missing from storage,
 * storage down, a font the renderer rejects) never costs the image: it is
 * reported, and the image falls back to the academy's name and a bundled font.
 */

function reportAsset(tenant: TenantContext, error: unknown, asset: string): Promise<void> {
  return reportError(error, {
    runtime: "web",
    tenant: tenant.slug,
    route: "/verify/[publicId]/image",
    extra: { asset },
  });
}

/**
 * A PNG from the academy's storage as a data URL: the path picture or the
 * logo (SVGs were rendered to PNG on upload).
 */
async function storedPng(
  db: Database,
  tenant: TenantContext,
  url: string | undefined,
  purpose: "path_visual" | "brand_logo",
): Promise<string | null> {
  const id = url?.match(/^\/files\/([0-9a-f-]{36})\.png$/)?.[1];
  if (!id) return null;
  try {
    const record = await loadFile(db, tenant.id, id);
    if (!record || record.contentType !== "image/png" || record.purpose !== purpose) {
      throw new Error(`The ${purpose} ${id} is not among the academy's files`);
    }
    return `data:image/png;base64,${Buffer.from(await fileBytes(record)).toString("base64")}`;
  } catch (error) {
    await reportAsset(tenant, error, purpose);
    return null;
  }
}

// Uploaded fonts never change (new upload, new id), so a few stay in memory.
const fontCache = new Map<string, Promise<Buffer | null>>();

function uploadedFontLoader(db: Database, tenant: TenantContext): UploadedFontLoader {
  return (src) => {
    const key = `${tenant.id}:${src}`;
    let pending = fontCache.get(key);
    if (!pending) {
      pending = (async () => {
        const id = src.match(/^\/files\/([0-9a-f-]{36})\./)?.[1];
        const record = id ? await loadFile(db, tenant.id, id) : null;
        if (!record || record.purpose !== "brand_font") {
          throw new Error(`The font ${src} is not among the academy's files`);
        }
        return Buffer.from(await fileBytes(record));
      })().catch(async (error: unknown) => {
        // Not kept: storage may be back for the next image.
        fontCache.delete(key);
        await reportAsset(tenant, error, "brand_font");
        return null;
      });
      if (fontCache.size >= 24) fontCache.delete(fontCache.keys().next().value!);
      fontCache.set(key, pending);
    }
    return pending;
  };
}

interface Pictures {
  logo: string | null;
  path: string | null;
}

function credentialImage(
  tenant: TenantContext,
  credential: CredentialView,
  t: Translator,
  copy: ReturnType<typeof credentialCopy>,
  format: CredentialImageFormat,
  pictures: Pictures,
) {
  const { theme } = tenant;
  const accent = credential.path
    ? pathColor(theme, credential.path.position, credential.path.color)
    : theme.colors.primary;
  const outlined = theme.visual_style === "outlined";
  const logo = theme.logo;
  const border = `${theme.border_width} solid ${outlined ? theme.colors.ink : `${theme.colors.ink}26`}`;
  return (
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
          <div style={{ display: "flex", alignItems: "center", fontWeight: 700 }}>
            {pictures.logo && (
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- Satori renders plain img
              <img
                src={pictures.logo}
                height={48}
                width={Math.round(48 * (logo?.ratio ?? 1))}
                style={{ marginRight: logo?.show_name ? 16 : 0 }}
              />
            )}
            {(!pictures.logo || logo?.show_name) && copy.academy}
          </div>
          {copy.pathTitle && (
            <div style={{ display: "flex", alignItems: "center" }}>
              {pictures.path ? (
                // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- Satori renders plain img
                <img
                  src={pictures.path}
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
          <div style={{ display: "flex", fontSize: 30, marginTop: 14 }}>{copy.proofLine}</div>
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
    </div>
  );
}

/**
 * The credential as a PNG, rendered from the academy's theme (brief §6, §11:
 * Satori via next/og). Rendered to the end here, so that a failure shows up
 * while there is still time to fall back.
 */
export async function renderCredentialImage(
  db: Database,
  tenant: TenantContext,
  credential: CredentialView,
  input: { t: Translator; origin: string; format: CredentialImageFormat },
): Promise<ArrayBuffer> {
  const { t, format } = input;
  const size = CREDENTIAL_IMAGE_SIZES[format];
  const copy = credentialCopy(tenant, credential, t, input.origin);
  const logo = tenant.theme.logo;
  const [logoPicture, pathPicture, fonts] = await Promise.all([
    logo ? storedPng(db, tenant, logo.png ?? logo.src, "brand_logo") : null,
    storedPng(db, tenant, credential.path?.visual?.png, "path_visual"),
    imageFonts(tenant.theme, uploadedFontLoader(db, tenant)),
  ]);
  try {
    return await new ImageResponse(
      credentialImage(tenant, credential, t, copy, format, {
        logo: logoPicture,
        path: pathPicture,
      }),
      { ...size, fonts },
    ).arrayBuffer();
  } catch (error) {
    await reportAsset(tenant, error, "render");
    return new ImageResponse(
      credentialImage(tenant, credential, t, copy, format, { logo: null, path: null }),
      { ...size, fonts: await imageFonts(tenant.theme) },
    ).arrayBuffer();
  }
}
