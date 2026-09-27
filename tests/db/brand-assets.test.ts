import { randomBytes } from "node:crypto";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TenantContext } from "@/core/tenant/context";
import { themeSchema } from "@/core/theme/schema";
import { findTenantById } from "@/db/tenants";
import { fontFromUpload, logoFromUpload } from "@/server/brand/assets";
import { fileBytes, loadFile, storeFile } from "@/server/files";
import { imageFonts } from "@/server/og-fonts";
import { updateAcademyTheme } from "@/server/studio/academy";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  type TestDatabases,
} from "./helpers";

const hasStorage = hasDatabase && Boolean(process.env.TEST_S3_ENDPOINT);

describe.skipIf(!hasStorage)("brand assets: logo and own fonts", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let admin: string;

  beforeAll(async () => {
    process.env.S3_ENDPOINT = process.env.TEST_S3_ENDPOINT;
    process.env.S3_BUCKET = `enaibler-test-${randomBytes(4).toString("hex")}`;
    process.env.S3_ACCESS_KEY_ID = "test";
    process.env.S3_SECRET_ACCESS_KEY = "test";
    dbs = await openTestDatabases();
    tenant = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    admin = await createUser(dbs.owner.db);
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("keeps an SVG logo and renders a PNG for mail and share images", async () => {
    const svg = await storeFile(dbs.app.db, tenant.id, {
      purpose: "brand_logo",
      body: new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 30"><rect width="120" height="30" fill="#2e2a36"/></svg>',
      ),
      name: "acme.svg",
      createdBy: admin,
    });
    const logo = await logoFromUpload(dbs.app.db, tenant.id, svg.id, admin);
    expect(logo).toMatchObject({ src: `/files/${svg.id}.svg` });
    expect(logo!.ratio).toBeCloseTo(4, 1);
    const pngId = logo!.png!.match(/\/files\/([0-9a-f-]{36})\.png$/)![1]!;
    const png = await loadFile(dbs.app.db, tenant.id, pngId);
    const meta = await sharp(Buffer.from(await fileBytes(png!))).metadata();
    expect(meta).toMatchObject({ format: "png", height: 128 });
    expect(meta.width).toBeGreaterThanOrEqual(510);

    // Other purposes' files are not logos.
    const font = await storeFile(dbs.app.db, tenant.id, {
      purpose: "brand_font",
      body: new Uint8Array([...new TextEncoder().encode("wOF2"), ...new Uint8Array(60)]),
      name: "AcmeSans-Bold.woff2",
      createdBy: admin,
    });
    expect(await logoFromUpload(dbs.app.db, tenant.id, font.id, admin)).toBeNull();
    expect(await fontFromUpload(dbs.app.db, tenant.id, font.id)).toBe(`/files/${font.id}.woff2`);
    expect(await fontFromUpload(dbs.app.db, tenant.id, svg.id)).toBeNull();

    // The theme keeps both; the brand editor saves them like any other token.
    const result = await updateAcademyTheme(dbs.app.db, tenant, {
      ...structuredClone(tenant.theme),
      fonts: {
        display: "Acme Sans",
        body: "Inter",
        files: [{ family: "Acme Sans", weight: 700, src: `/files/${font.id}.woff2` }],
      },
      logo: { ...logo!, show_name: false },
    });
    expect(result.ok).toBe(true);
    const saved = (await findTenantById(dbs.app.db, tenant.id))!.theme;
    expect(saved.logo).toMatchObject({ show_name: false, png: logo!.png });
    expect(saved.fonts.files).toHaveLength(1);
  });

  it("uses an uploaded .ttf in share images and falls back for .woff2", async () => {
    const theme = themeSchema.parse({
      ...structuredClone(tenant.theme),
      fonts: {
        display: "Acme Sans",
        body: "Acme Sans",
        files: [
          {
            family: "Acme Sans",
            weight: 700,
            src: "/files/0b7a1f6e-8a51-4d1c-9a55-3f0c2f7f9b10.ttf",
          },
          {
            family: "Acme Sans",
            weight: 400,
            src: "/files/1b7a1f6e-8a51-4d1c-9a55-3f0c2f7f9b10.woff2",
          },
        ],
      },
    });
    const own = Buffer.from("own font bytes");
    const fonts = await imageFonts(theme, async (src) => (src.endsWith(".ttf") ? own : null));
    // Only the .ttf is readable for Satori: it serves every weight.
    expect(fonts.map((font) => font.data === own)).toEqual([true, true, true]);
    const fallback = await imageFonts(theme, async () => null);
    expect(fallback.every((font) => font.data.length > 1000)).toBe(true);
  });
});
