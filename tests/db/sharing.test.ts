import { randomBytes } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  agreeToContactAction,
  saveCredentialNameAction,
  setCredentialVisibility,
} from "@/app/(academy)/verify/[publicId]/actions";
import { GET as ctaRoute } from "@/app/(academy)/verify/[publicId]/cta/route";
import { GET as shareRoute } from "@/app/(academy)/verify/[publicId]/share/route";
import { GET as continueRoute } from "@/app/auth/continue/route";
import { generatePublicId } from "@/core/credentials/public-id";
import { createTranslator } from "@/core/i18n/translator";
import type { TenantContext } from "@/core/tenant/context";
import { themeSchema } from "@/core/theme/schema";
import { consents, courses, credentials, events } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { findTenantById } from "@/db/tenants";
import { confirmMarketingConsent, listContacts, loadMarketingConsent } from "@/server/consent";
import { renderCredentialImage } from "@/server/credential-image";
import { loadCredential } from "@/server/credentials";
import { loadLandingCourse, recordLandingEvent } from "@/server/credentials/landing";
import type { OutgoingEmail } from "@/server/email/mailer";
import { storeFile } from "@/server/files";
import { reportError } from "@/server/observability/report";
import { hasContactOptIn } from "@/server/profile";
import { deleteObject } from "@/server/storage";
import { createCourse } from "@/server/studio/courses";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  type TestDatabases,
} from "./helpers";

const hasStorage = hasDatabase && Boolean(process.env.TEST_S3_ENDPOINT);

// The routes and actions outside Next: academy, visitor, language, database and mail come from here.
const scope = vi.hoisted(() => ({
  db: undefined as unknown,
  tenant: undefined as unknown,
  origin: "",
  locale: "en" as "en" | "de",
  viewer: null as { userId: string; email: string; name: string } | null,
  mails: [] as OutgoingEmail[],
  mailFails: false,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/client")>()),
  getDb: () => scope.db,
}));
vi.mock("@/server/request", async () => {
  const { tenantTranslator } = await import("@/core/i18n/tenant-translator");
  return {
    getTenant: async () => scope.tenant,
    getOrigin: async () => scope.origin,
    getLocale: async () => scope.locale,
    getTranslator: async () => tenantTranslator(scope.tenant as TenantContext, scope.locale),
  };
});
vi.mock("@/server/auth", () => ({ getViewer: async () => scope.viewer }));
vi.mock("@/server/access", () => ({
  requireViewer: async () => {
    if (!scope.viewer) throw new Error("Not signed in");
    return { tenant: scope.tenant, viewer: scope.viewer, roles: ["learner"] };
  },
}));
vi.mock("@/server/email/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/email/mailer")>()),
  sendEmail: async (mail: OutgoingEmail) => {
    if (scope.mailFails) throw new Error("relay unavailable");
    scope.mails.push(mail);
  },
}));
vi.mock("@/server/observability/report", () => ({ reportError: vi.fn(async () => {}) }));

/** Where a server action sent the learner (next/navigation's redirect throws). */
async function redirectOf(action: Promise<unknown>): Promise<string> {
  try {
    await action;
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT;")) return digest.split(";")[2]!;
    throw error;
  }
  throw new Error("The action did not redirect");
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe.skipIf(!hasDatabase)("sharing a credential and the page it leads to", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let academy: string;
  let origin: string;
  let courseId: string;
  let courseSlug: string;

  const signIn = (userId: string) => {
    scope.viewer = { userId, email: `${userId}@learners.test`, name: "" };
  };

  /** A credential of a new learner for the course; public and named unless said otherwise. */
  async function credentialOf(
    options: { visibility?: "public" | "private"; displayName?: string } = {},
  ): Promise<{ owner: string; publicId: string }> {
    const owner = await createUser(dbs.owner.db);
    const publicId = generatePublicId();
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.insert(credentials).values({
        tenantId: tenant.id,
        publicId,
        userId: owner,
        courseId,
        courseTitle: { en: "Get paid on time" },
        basis: "work",
        artifactName: { en: "Reminder playbook" },
        displayName: options.displayName ?? "Ada Lovelace",
        visibility: options.visibility ?? "public",
      }),
    );
    return { owner, publicId };
  }

  const eventsNamed = (name: string) =>
    withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(events).where(eq(events.name, name)).orderBy(asc(events.occurredAt)),
    );

  beforeAll(async () => {
    if (hasStorage) {
      process.env.S3_ENDPOINT = process.env.TEST_S3_ENDPOINT;
      process.env.S3_BUCKET = `enaibler-test-${randomBytes(4).toString("hex")}`;
      process.env.S3_ACCESS_KEY_ID = "test";
      process.env.S3_SECRET_ACCESS_KEY = "test";
    }
    dbs = await openTestDatabases();
    tenant = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    academy = tenant.settings.author_display_name;
    origin = `https://${tenant.primaryDomain}`;
    courseId = await createCourse(dbs.app.db, tenant.id, {
      languages: ["en"],
      title: "Get paid on time",
      artifactName: "Reminder playbook",
      outcome: "Write the reminder sequence you will use for late invoices.",
      deliveryMode: "free_async",
    });
    const [course] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .update(courses)
        .set({ status: "published", summary: { en: "Stop chasing invoices." }, estMinutes: 45 })
        .where(eq(courses.id, courseId))
        .returning({ slug: courses.slug }),
    );
    courseSlug = course!.slug;
    scope.db = dbs.app.db;
    scope.tenant = tenant;
    scope.origin = origin;
  });

  beforeEach(() => {
    scope.locale = "en";
    scope.viewer = null;
    scope.mails.length = 0;
    scope.mailFails = false;
    vi.mocked(reportError).mockClear();
  });

  afterAll(async () => {
    await dbs?.close();
  });

  it("sends the owner to LinkedIn with the page's own channel, and records each share", async () => {
    const { owner, publicId } = await credentialOf();
    const share = (to: string) =>
      shareRoute(new NextRequest(`${origin}/verify/${publicId}/share?to=${to}`), {
        params: Promise.resolve({ publicId }),
      });
    signIn(owner);

    const profile = await share("profile");
    expect(profile.status).toBe(303);
    const addToProfile = new URL(profile.headers.get("location")!);
    expect(addToProfile.origin + addToProfile.pathname).toBe(
      "https://www.linkedin.com/profile/add",
    );
    expect(addToProfile.searchParams.get("certUrl")).toBe(
      `${origin}/verify/${publicId}?via=profile`,
    );
    expect(addToProfile.searchParams.get("organizationName")).toBe(academy);

    const post = new URL((await share("post")).headers.get("location")!);
    expect(post.origin + post.pathname).toBe("https://www.linkedin.com/sharing/share-offsite/");
    expect(post.searchParams.get("url")).toBe(`${origin}/verify/${publicId}?via=post`);

    const shared = (await eventsNamed("credential_shared_linkedin")).filter(
      (event) => event.userId === owner,
    );
    expect(shared.map((event) => event.props)).toEqual([{ target: "profile" }, { target: "post" }]);

    // Only its owner shares it: anyone else goes back to the page, and nothing is recorded.
    signIn(await createUser(dbs.owner.db));
    expect((await share("post")).headers.get("location")).toBe(`${origin}/verify/${publicId}`);
    const hidden = await credentialOf({ visibility: "private" });
    signIn(hidden.owner);
    const privateShare = await shareRoute(
      new NextRequest(`${origin}/verify/${hidden.publicId}/share?to=post`),
      { params: Promise.resolve({ publicId: hidden.publicId }) },
    );
    expect(privateShare.headers.get("location")).toBe(`${origin}/verify/${hidden.publicId}`);
    expect(await eventsNamed("credential_shared_linkedin")).toHaveLength(2);
  });

  it("counts views and clicks by the channel they came from, and tags the call to action", async () => {
    const { publicId } = await credentialOf();
    const credential = (await loadCredential(tenant, publicId, dbs.app.db))!;
    await recordLandingEvent(dbs.app.db, tenant.id, "verification_page_viewed", credential, {
      locale: "en",
      via: "post",
    });
    await recordLandingEvent(dbs.app.db, tenant.id, "verification_page_viewed", credential, {
      locale: "de",
      via: null,
    });

    const click = (query: string, userAgent = "Mozilla/5.0 (Macintosh)") =>
      ctaRoute(
        new Request(`${origin}/verify/${publicId}/cta${query}`, {
          headers: { "user-agent": userAgent },
        }),
        { params: Promise.resolve({ publicId }) },
      );
    const fromPost = await click("?via=post");
    expect(fromPost.status).toBe(303);
    const target = new URL(fromPost.headers.get("location")!);
    expect(target.origin + target.pathname).toBe(`${origin}/start`);
    expect(Object.fromEntries(target.searchParams)).toEqual({
      course: courseSlug,
      utm_source: "linkedin",
      utm_medium: "post",
      utm_content: publicId,
    });
    const fromProfile = new URL((await click("?via=profile")).headers.get("location")!);
    expect(fromProfile.searchParams.get("utm_medium")).toBe("profile");
    // A link passed on some other way, or a channel we do not know: the credential still counts.
    for (const query of ["", "?via=twitter"]) {
      const plain = new URL((await click(query)).headers.get("location")!);
      expect(plain.searchParams.get("utm_source")).toBe("verification");
      expect(plain.searchParams.get("utm_medium")).toBe("credential");
    }
    // LinkedIn's preview crawler is sent on but not counted.
    await click("?via=post", "LinkedInBot/1.0 (compatible; Mozilla/5.0)");

    const views = await eventsNamed("verification_page_viewed");
    expect(views.map((event) => [event.props, event.locale, event.courseId])).toEqual([
      [{ via: "post" }, "en", courseId],
      [{}, "de", courseId],
    ]);
    const clicks = await eventsNamed("verification_cta_clicked");
    expect(clicks.map((event) => event.props)).toEqual([
      { via: "post" },
      { via: "profile" },
      {},
      {},
    ]);

    // A private credential's call to action goes nowhere near it.
    const hidden = await credentialOf({ visibility: "private" });
    const privateClick = await ctaRoute(
      new Request(`${origin}/verify/${hidden.publicId}/cta?via=post`),
      { params: Promise.resolve({ publicId: hidden.publicId }) },
    );
    expect(privateClick.headers.get("location")).toBe(`${origin}/`);
  });

  it("shows visitors the course behind a credential while it is live", async () => {
    expect(await loadLandingCourse(dbs.app.db, tenant.id, courseId)).toEqual({
      summary: { en: "Stop chasing invoices." },
      estMinutes: 45,
      completionMode: "work",
      artifactName: { en: "Reminder playbook" },
      free: true,
      live: false,
    });

    const testOnly = await createCourse(dbs.app.db, tenant.id, {
      languages: ["en"],
      title: "Invoices in ten questions",
      deliveryMode: "free_async",
      completionMode: "test",
    });
    expect(await loadLandingCourse(dbs.app.db, tenant.id, testOnly)).toBeNull();
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.update(courses).set({ status: "published" }).where(eq(courses.id, testOnly)),
    );
    expect(await loadLandingCourse(dbs.app.db, tenant.id, testOnly)).toMatchObject({
      completionMode: "test",
      artifactName: null,
      summary: null,
    });
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.update(courses).set({ status: "unpublished" }).where(eq(courses.id, testOnly)),
    );
    expect(await loadLandingCourse(dbs.app.db, tenant.id, testOnly)).toBeNull();
  });

  it("lets the owner name the credential and make it public right from the panel", async () => {
    const { owner, publicId } = await credentialOf({ visibility: "private", displayName: "" });
    const stateOf = async () => (await loadCredential(tenant, publicId, dbs.app.db))!;
    signIn(owner);

    // Without a name it stays private, however the form is sent.
    await setCredentialVisibility(form({ publicId, visibility: "public" }));
    expect((await stateOf()).visibility).toBe("private");

    await saveCredentialNameAction(form({ publicId, displayName: "   " }));
    expect((await stateOf()).displayName).toBe("");
    await saveCredentialNameAction(form({ publicId, displayName: "  Grace Hopper " }));
    expect((await stateOf()).displayName).toBe("Grace Hopper");

    await setCredentialVisibility(form({ publicId, visibility: "public" }));
    expect((await stateOf()).visibility).toBe("public");
    const madePublic = (await eventsNamed("credential_made_public")).filter(
      (event) => event.userId === owner,
    );
    expect(madePublic).toHaveLength(1);
  });

  it("stores the panel's contact opt-in with the words the learner agreed to, only if ticked", async () => {
    const { owner, publicId } = await credentialOf();
    signIn(owner);
    scope.locale = "de";

    expect(await redirectOf(agreeToContactAction(form({ publicId })))).toBe(
      `/verify/${publicId}#share`,
    );
    expect(await hasContactOptIn(dbs.app.db, tenant.id, owner)).toBe(false);

    expect(await redirectOf(agreeToContactAction(form({ publicId, optIn: "on" })))).toBe(
      `/verify/${publicId}?contact=saved#share`,
    );
    expect(await hasContactOptIn(dbs.app.db, tenant.id, owner)).toBe(true);
    const given = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx.select().from(consents).where(eq(consents.userId, owner)),
    );
    // Its own consent, nothing else: no newsletter comes with it.
    expect(given).toHaveLength(1);
    expect(given[0]).toMatchObject({
      kind: "lead_handoff",
      wording: `${academy} darf mich zu ihren Angeboten kontaktieren.`,
      revokedAt: null,
    });
    expect(given[0]!.confirmedAt).toBeInstanceOf(Date);
    expect(
      (await listContacts(dbs.app.db, tenant.id, "lead_handoff")).map((row) => row.email),
    ).toContain(`${owner}@learners.test`);
  });

  it("starts the double opt-in after sign-in when the news box was ticked, and subscribes nobody before the click", async () => {
    const learner = await createUser(dbs.owner.db);
    signIn(learner);
    const signedIn = (query: string) =>
      continueRoute(new NextRequest(`${origin}/auth/continue${query}`));
    const news = () => loadMarketingConsent(dbs.app.db, tenant.id, learner);

    // The box was read in German; the link may be opened on a device in English.
    const response = await signedIn(`?news=de`);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${origin}/`);
    expect((await news()).state).toBe("pending");
    expect(await listContacts(dbs.app.db, tenant.id, "tenant_marketing")).toEqual([]);
    const [asked] = await withTenant(dbs.app.db, tenant.id, (tx) =>
      tx
        .select()
        .from(consents)
        .where(and(eq(consents.userId, learner), eq(consents.kind, "tenant_marketing"))),
    );
    expect(asked!.wording).toBe(
      `Ja, schickt mir Neuigkeiten und Angebote von ${academy} per E-Mail. Ich kann mich jederzeit abmelden.`,
    );
    expect(scope.mails).toHaveLength(1);
    expect(scope.mails[0]).toMatchObject({
      to: `${learner}@learners.test`,
      subject: `Bitte bestätigen: Neuigkeiten von ${academy}`,
    });

    // Only the click in the mail subscribes.
    const token = scope.mails[0]!.html.match(/\/consent\/confirm\?token=([\w-]+)/)![1]!;
    expect(await confirmMarketingConsent(dbs.app.db, tenant.id, token)).toBe(true);
    expect(
      (await listContacts(dbs.app.db, tenant.id, "tenant_marketing")).map((row) => row.email),
    ).toEqual([`${learner}@learners.test`]);

    // Subscribed learners are not asked again.
    await signedIn(`?news=de`);
    expect(scope.mails).toHaveLength(1);
    expect((await news()).state).toBe("confirmed");

    // Without the box, or with a language the academy does not offer, nothing starts.
    const other = await createUser(dbs.owner.db);
    signIn(other);
    await signedIn("");
    await signedIn("?news=fr");
    expect((await loadMarketingConsent(dbs.app.db, tenant.id, other)).state).toBe("none");

    // A mail that cannot go out never holds up the sign-in, and asking again works at once.
    scope.mailFails = true;
    expect((await signedIn("?news=en")).status).toBe(303);
    expect((await loadMarketingConsent(dbs.app.db, tenant.id, other)).state).toBe("revoked");
    expect(vi.mocked(reportError)).toHaveBeenCalledTimes(1);
    scope.mailFails = false;
    await signedIn("?news=en");
    expect((await loadMarketingConsent(dbs.app.db, tenant.id, other)).state).toBe("pending");
    expect(scope.mails.at(-1)!.subject).toBe(`Please confirm: news from ${academy}`);
  });

  describe.skipIf(!hasStorage)("share images", () => {
    let admin: string;
    let publicId: string;
    const t = createTranslator({ locale: "en" });

    beforeAll(async () => {
      admin = await createUser(dbs.owner.db);
      publicId = (await credentialOf()).publicId;
    });

    const withTheme = (theme: Record<string, unknown>): TenantContext => ({
      ...tenant,
      theme: themeSchema.parse({ ...structuredClone(tenant.theme), ...theme }),
    });
    const render = async (academyContext: TenantContext) => {
      const credential = (await loadCredential(academyContext, publicId, dbs.app.db))!;
      const png = await renderCredentialImage(dbs.app.db, academyContext, credential, {
        t,
        origin,
        format: "og",
      });
      return sharp(Buffer.from(png)).metadata();
    };
    const reportedAssets = () =>
      vi.mocked(reportError).mock.calls.map(([, context]) => context.extra?.asset);

    it("keeps the picture when the logo is gone from storage", async () => {
      const logo = await storeFile(dbs.app.db, tenant.id, {
        purpose: "brand_logo",
        body: new Uint8Array(
          await sharp({
            create: { width: 120, height: 40, channels: 3, background: "#2e2a36" },
          })
            .png()
            .toBuffer(),
        ),
        name: "logo.png",
        createdBy: admin,
      });
      const branded = withTheme({
        logo: { src: `/files/${logo.id}.png`, ratio: 3, show_name: false },
      });
      expect(await render(branded)).toMatchObject({ format: "png", width: 1200, height: 630 });
      expect(reportedAssets()).toEqual([]);

      await deleteObject(tenant.id, logo.storageKey);
      expect(await render(branded)).toMatchObject({ format: "png", width: 1200, height: 630 });
      expect(reportedAssets()).toEqual(["brand_logo"]);
    });

    it("renders with a bundled font when the academy's own cannot be used", async () => {
      // A font file the renderer cannot read, and one that is gone from storage.
      const broken = await storeFile(dbs.app.db, tenant.id, {
        purpose: "brand_font",
        body: new Uint8Array([0, 1, 0, 0, ...new Uint8Array(96)]),
        name: "Broken-Regular.ttf",
        createdBy: admin,
      });
      const fonts = (src: string) => ({
        fonts: {
          display: "Acme Sans",
          body: "Acme Sans",
          files: [{ family: "Acme Sans", weight: 400, src }],
        },
      });
      expect(await render(withTheme(fonts(`/files/${broken.id}.ttf`)))).toMatchObject({
        format: "png",
        width: 1200,
      });
      expect(reportedAssets()).toEqual(["render"]);

      vi.mocked(reportError).mockClear();
      const gone = await storeFile(dbs.app.db, tenant.id, {
        purpose: "brand_font",
        body: new Uint8Array([0, 1, 0, 0, ...new Uint8Array(96)]),
        name: "Gone-Regular.ttf",
        createdBy: admin,
      });
      await deleteObject(tenant.id, gone.storageKey);
      expect(await render(withTheme(fonts(`/files/${gone.id}.ttf`)))).toMatchObject({
        format: "png",
        width: 1200,
      });
      expect(reportedAssets()).toContain("brand_font");
    });
  });
});
