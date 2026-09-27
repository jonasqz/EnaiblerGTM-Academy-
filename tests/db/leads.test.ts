import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { periodWindow } from "@/core/analytics/sharing";
import type { CompletionMode } from "@/core/courses/completion";
import { generatePublicId } from "@/core/credentials/public-id";
import type { ShareChannel } from "@/core/credentials/share";
import {
  ctaAddress,
  linkedInPageId,
  parseHashtags,
  type SharingInput,
} from "@/core/credentials/share-settings";
import type { EntryContext } from "@/core/entry/context";
import { localize } from "@/core/i18n/locales";
import { sharingIssueText } from "@/core/i18n/studio/helpers";
import { studioText } from "@/core/i18n/studio/translator";
import { LEAD_COLUMNS, leadCsvRow, type Lead } from "@/core/people/leads";
import { toCsv } from "@/core/shared/csv";
import type { TenantContext } from "@/core/tenant/context";
import { consents, courses, credentials, events } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { findTenantById } from "@/db/tenants";
import { confirmMarketingConsent, requestMarketingConsent } from "@/server/consent";
import { issueCredential, revokeCredential } from "@/server/credentials/issue";
import { trackEvent } from "@/server/events";
import { ensureEnrollment, ensureLearner } from "@/server/learners";
import { setContactOptIn, setDisplayName } from "@/server/profile";
import { updateAcademySettings, updateSharingSettings } from "@/server/studio/academy";
import { createCourse } from "@/server/studio/courses";
import { exportLeads, leadCourses, listLeads } from "@/server/studio/leads";
import { sharingNumbers } from "@/server/studio/sharing";

import {
  createTenant,
  createUser,
  hasDatabase,
  openTestDatabases,
  type TestDatabases,
} from "./helpers";

const WORDING = "Acme Academy may contact me about its offers.";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe.skipIf(!hasDatabase)("lead generation in the Studio", () => {
  let dbs: TestDatabases;
  let tenant: TenantContext;
  let other: TenantContext;

  beforeAll(async () => {
    dbs = await openTestDatabases();
    tenant = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    other = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
  });

  afterAll(async () => {
    await dbs?.close();
  });

  /** A published course, as learners find it. */
  async function publishedCourse(academy: TenantContext, title: string, mode: CompletionMode) {
    const id = await createCourse(dbs.app.db, academy.id, {
      languages: ["en", "de"],
      title,
      completionMode: mode,
      artifactName: "Reminder playbook",
      outcome: "Write the reminder sequence you will use for late invoices.",
      deliveryMode: "free_async",
    });
    const [row] = await withTenant(dbs.app.db, academy.id, (tx) =>
      tx
        .update(courses)
        .set({ status: "published", publishedAt: new Date() })
        .where(eq(courses.id, id))
        .returning({ slug: courses.slug }),
    );
    return { id, slug: row!.slug };
  }

  /** Someone who follows an entry link, signs up and starts the course, as /start does. */
  async function arrive(academy: TenantContext, courseSlug: string, entry: EntryContext) {
    const userId = await createUser(dbs.owner.db);
    await withTenant(dbs.app.db, academy.id, async (tx) => {
      await ensureLearner(tx, academy, userId, { locale: "en", entry });
      await ensureEnrollment(tx, academy, userId, { courseSlug, locale: "en", entry });
    });
    return userId;
  }

  async function complete(
    academy: TenantContext,
    userId: string,
    courseId: string,
    basis: CompletionMode,
  ) {
    const issued = await withTenant(dbs.app.db, academy.id, (tx) =>
      issueCredential(tx, academy, {
        userId,
        courseId,
        basis,
        submissionId: null,
        testAttemptId: null,
      }),
    );
    return issued.publicId;
  }

  /** The learner makes the certificate public and shares it, as the verification page does. */
  async function share(
    academy: TenantContext,
    userId: string,
    courseId: string,
    targets: ShareChannel[],
  ) {
    await withTenant(dbs.app.db, academy.id, async (tx) => {
      await tx
        .update(credentials)
        .set({ visibility: "public", madePublicAt: new Date() })
        .where(and(eq(credentials.userId, userId), eq(credentials.courseId, courseId)));
      await trackEvent(tx, {
        tenantId: academy.id,
        name: "credential_made_public",
        userId,
        courseId,
      });
      for (const target of targets) {
        await trackEvent(tx, {
          tenantId: academy.id,
          name: "credential_shared_linkedin",
          userId,
          courseId,
          props: { target },
        });
      }
    });
  }

  /** When they agreed, so the order is certain. */
  async function agreedAt(academy: TenantContext, userId: string, at: Date) {
    await withTenant(dbs.app.db, academy.id, (tx) =>
      tx
        .update(consents)
        .set({ confirmedAt: at })
        .where(and(eq(consents.userId, userId), eq(consents.kind, "lead_handoff"))),
    );
  }

  it("saves the sharing settings through the Studio, refusing what cannot be filled in or said", async () => {
    const input: SharingInput = {
      linkedinOrganizationId: linkedInPageId(
        "https://www.linkedin.com/company/12345678/admin/dashboard/",
      ),
      postText: {
        en: "Finished {course} at {academy}: {proof}. {url}",
        de: "Geschafft: {course} bei {academy}.",
      },
      hashtags: parseHashtags("#Freelancing, invoices"),
      ctaLabel: { en: "Start now", de: "Jetzt starten" },
      ctaUrl: ctaAddress("scaling.example/courses/{course}"),
    };
    // Saved, with a word about the German post that has no link.
    expect(await updateSharingSettings(dbs.app.db, tenant, input)).toEqual({
      ok: true,
      postsWithoutUrl: ["de"],
    });
    const saved = (await findTenantById(dbs.app.db, tenant.id))!;
    expect(saved.settings.linkedin_organization_id).toBe("12345678");
    expect(saved.settings.sharing).toEqual({
      post_text: input.postText,
      hashtags: ["Freelancing", "invoices"],
    });
    expect(saved.settings.verification_cta).toEqual({
      label: { en: "Start now", de: "Jetzt starten" },
      url: "https://scaling.example/courses/{course}",
    });

    // The academy form leaves the button alone: it is set under Sharing now.
    const academy = await updateAcademySettings(dbs.app.db, saved, {
      name: saved.settings.author_display_name,
      locales: saved.settings.locales,
      defaultLocale: saved.settings.default_locale,
      website: null,
      legalLinks: saved.settings.legal_links,
    });
    expect(academy.ok).toBe(true);
    expect((await findTenantById(dbs.app.db, tenant.id))!.settings.verification_cta).toEqual(
      saved.settings.verification_cta,
    );

    const de = studioText("de");
    const refused = async (changes: Partial<SharingInput>) => {
      const result = await updateSharingSettings(dbs.app.db, saved, { ...input, ...changes });
      return result.ok ? [] : result.issues.map((issue) => sharingIssueText(de, issue));
    };
    expect(await refused({ postText: { en: "Hi {name}, I finished {course}: {url}" } })).toEqual([
      "Der Beitrag auf Englisch enthält {name}; das lässt sich nicht ausfüllen. Nutze {course}, {academy}, {proof}, {artifact} und {url}.",
    ]);
    expect(await refused({ postText: { de: "Jetzt zertifiziert: {course} {url}" } })).toEqual([
      "„zertifiziert“ ist in Bescheinigungsvorlagen nicht erlaubt. Sprich von „Abschlussbescheinigung“ oder beschreibe, was gebaut wurde.",
    ]);
    // Every problem at once, not one per save.
    expect(await refused({ hashtags: parseHashtags("#certified #cash-flow") })).toEqual([
      "„certified“ ist in Bescheinigungsvorlagen nicht erlaubt. Sprich von „Abschlussbescheinigung“ oder beschreibe, was gebaut wurde.",
      "„#cash-flow“ ist kein Hashtag: Nutze ein Wort aus Buchstaben, Ziffern oder _.",
    ]);
    expect(await refused({ hashtags: parseHashtags("#cash-flow") })).toEqual([
      "„#cash-flow“ ist kein Hashtag: Nutze ein Wort aus Buchstaben, Ziffern oder _.",
    ]);
    expect(await refused({ ctaLabel: { en: "Get certified" } })).toHaveLength(1);
    expect(await refused({ linkedinOrganizationId: linkedInPageId("acme-gmbh") })).toEqual([
      "Gib die Nummer deiner LinkedIn-Seite ein (wie in linkedin.com/company/12345678/admin), nicht ihren Namen.",
    ]);
    expect(await refused({ ctaUrl: ctaAddress("https://scaling.example/{user}") })).toEqual([
      "Die Adresse des Buttons muss mit https:// beginnen, oder mit / für eine Seite deiner Akademie, und darf in geschweiften Klammern nur {course} und {path} enthalten.",
    ]);
    // Nothing that was refused reached the academy.
    expect((await findTenantById(dbs.app.db, tenant.id))!.settings.sharing).toEqual(
      saved.settings.sharing,
    );
  });

  it("lists leads with what they completed and where they came from, never who referred them", async () => {
    const invoices = await publishedCourse(tenant, "Get paid on time", "work");
    const pricing = await publishedCourse(tenant, "Price with confidence", "test");

    // Rita shares her certificate; she never agreed to be contacted.
    const rita = await arrive(tenant, invoices.slug, { utm: { source: "google" } });
    const ritasCertificate = await complete(tenant, rita, invoices.id, "work");
    await setDisplayName(dbs.app.db, tenant, rita, "Rita Referrer");
    await share(tenant, rita, invoices.id, ["post", "profile"]);

    // Lea came through Rita's post, finished the same course and added it to her profile.
    const lea = await arrive(tenant, invoices.slug, {
      course: invoices.slug,
      utm: { source: "linkedin", medium: "post", content: ritasCertificate },
    });
    await complete(tenant, lea, invoices.id, "work");
    await share(tenant, lea, invoices.id, ["profile"]);
    await setDisplayName(dbs.app.db, tenant, lea, "Lea Lead");
    await setContactOptIn(dbs.app.db, tenant, lea, true, WORDING);
    await agreedAt(tenant, lea, new Date(Date.now() - 3 * HOUR));

    // Noah came from the newsletter, passed the pricing test and started the invoices course.
    const noah = await arrive(tenant, pricing.slug, {
      utm: { source: "newsletter", medium: "email", campaign: "autumn" },
    });
    await complete(tenant, noah, pricing.id, "test");
    await withTenant(dbs.app.db, tenant.id, (tx) =>
      ensureEnrollment(tx, tenant, noah, { courseSlug: invoices.slug, locale: "en", entry: {} }),
    );
    await setContactOptIn(dbs.app.db, tenant, noah, true, WORDING);
    await agreedAt(tenant, noah, new Date(Date.now() - 2 * HOUR));

    // Mia's link names a certificate this academy does not have.
    const mia = await arrive(tenant, pricing.slug, {
      utm: { source: "verification", medium: "credential", content: generatePublicId() },
    });
    await setContactOptIn(dbs.app.db, tenant, mia, true, WORDING);
    await agreedAt(tenant, mia, new Date(Date.now() - HOUR));

    // Never leads: a withdrawn consent, the newsletter alone, another academy's lead.
    const withdrawn = await arrive(tenant, invoices.slug, {});
    await setContactOptIn(dbs.app.db, tenant, withdrawn, true, WORDING);
    await setContactOptIn(dbs.app.db, tenant, withdrawn, false, WORDING);
    const reader = await arrive(tenant, invoices.slug, {});
    const request = await requestMarketingConsent(dbs.app.db, tenant.id, reader, "News, please.");
    if (request.status !== "confirmation_needed") throw new Error(request.status);
    expect(await confirmMarketingConsent(dbs.app.db, tenant.id, request.token)).toBe(true);
    const elsewhere = (await publishedCourse(other, "Elsewhere", "work")).slug;
    const outsider = await arrive(other, elsewhere, { utm: { source: "linkedin" } });
    await setContactOptIn(dbs.app.db, other, outsider, true, WORDING);

    const page = await listLeads(dbs.app.db, tenant.id);
    expect(page).toMatchObject({ total: 3, page: 1, pages: 1 });
    expect(page.leads.map((lead) => lead.userId)).toEqual([mia, noah, lea]);
    const [miasRow, noahsRow, leasRow] = page.leads as [Lead, Lead, Lead];

    expect(leasRow).toMatchObject({
      name: "Lea Lead",
      email: `${lea}@learners.test`,
      locale: "en",
      wording: WORDING,
      inProgress: [],
      source: {
        utm: { source: "linkedin", medium: "post" },
        viaCertificate: { courseTitle: { en: "Get paid on time" } },
      },
    });
    expect(leasRow.completed).toMatchObject([
      {
        courseId: invoices.id,
        title: { en: "Get paid on time" },
        basis: "work",
        visibility: "public",
        sharedOn: ["profile"],
      },
    ]);
    expect(noahsRow).toMatchObject({
      name: null,
      completed: [
        {
          courseId: pricing.id,
          basis: "test",
          visibility: "private",
          sharedOn: [],
        },
      ],
      inProgress: [{ courseId: invoices.id, title: { en: "Get paid on time" } }],
      source: {
        utm: { source: "newsletter", medium: "email", campaign: "autumn" },
        viaCertificate: null,
      },
    });
    expect(miasRow).toMatchObject({
      completed: [],
      source: {
        utm: { source: "verification", medium: "credential" },
        viaCertificate: { courseTitle: null },
      },
    });

    // Who shared the certificate stays unknown: not the learner, not the certificate.
    const shown = JSON.stringify(page);
    for (const secret of [rita, "Rita Referrer", `${rita}@learners.test`, ritasCertificate]) {
      expect(shown).not.toContain(secret);
    }

    // By course: who took it, completed or not.
    const took = async (courseId: string) =>
      (await listLeads(dbs.app.db, tenant.id, { courseId })).leads.map((lead) => lead.userId);
    expect(await took(invoices.id)).toEqual([noah, lea]);
    expect(await took(pricing.id)).toEqual([mia, noah]);
    expect((await leadCourses(dbs.app.db, tenant.id)).map((course) => course.id).sort()).toEqual(
      [invoices.id, pricing.id].sort(),
    );
    // A page past the end shows the last one.
    expect((await listLeads(dbs.app.db, tenant.id, { page: 9 })).page).toBe(1);

    // Each academy sees its own leads only.
    expect((await listLeads(dbs.app.db, other.id)).leads.map((lead) => lead.userId)).toEqual([
      outsider,
    ]);

    // The CSV keeps the contact columns first and adds what a CRM needs, oldest first.
    const exported = await exportLeads(dbs.app.db, tenant.id);
    expect(exported.map((lead) => lead.userId)).toEqual([lea, noah, mia]);
    const csv = toCsv([
      LEAD_COLUMNS,
      ...exported.map((lead) => leadCsvRow(lead, (title) => localize(title, "en"))),
    ]).split("\r\n");
    expect(csv[0]).toBe(
      "email,name,language,agreed_to,asked_at,confirmed_at,courses_completed,utm_source,utm_medium,utm_campaign,via_shared_certificate,certificate_course",
    );
    const day = (date: Date) => date.toISOString().slice(0, 10);
    const leaCompleted = leasRow.completed[0]!.completedAt;
    expect(csv[1]).toBe(
      [
        `${lea}@learners.test`,
        "Lea Lead",
        "en",
        WORDING,
        leasRow.requestedAt.toISOString(),
        leasRow.agreedAt.toISOString(),
        `"Get paid on time (${day(leaCompleted)}, work, public, linkedin_profile)"`,
        "linkedin",
        "post",
        "",
        "true",
        "Get paid on time",
      ].join(","),
    );
    expect(csv[2]).toContain(
      `"Price with confidence (${day(noahsRow.completed[0]!.completedAt)}, test, private)",newsletter,email,autumn,false,`,
    );
    expect(csv[3]).toMatch(/,,verification,credential,,true,$/);
    expect(
      (await exportLeads(dbs.app.db, tenant.id, { courseId: pricing.id })).map(
        (lead) => lead.userId,
      ),
    ).toEqual([noah, mia]);
  });

  it("counts what shared certificates brought in a period, from recorded events", async () => {
    const academy = (await findTenantById(dbs.app.db, await createTenant(dbs.owner.db)))!;
    const invoices = await publishedCourse(academy, "Get paid on time", "work");
    const pricing = await publishedCourse(academy, "Price with confidence", "work");

    // Sign-ups through a shared certificate: a LinkedIn post, a profile, a passed-on link.
    const a1 = await arrive(academy, invoices.slug, {
      utm: { source: "linkedin", medium: "post", content: "X" },
    });
    const a2 = await arrive(academy, invoices.slug, {
      utm: { source: "verification", medium: "credential", content: "Y" },
    });
    const b1 = await arrive(academy, pricing.slug, {
      utm: { source: "linkedin", medium: "profile", content: "Z" },
    });
    // Not through a certificate.
    const a3 = await arrive(academy, invoices.slug, {
      utm: { source: "newsletter", medium: "email" },
    });
    const revoked = await arrive(academy, invoices.slug, {});

    for (const learner of [a1, a2, a3]) await complete(academy, learner, invoices.id, "work");
    await complete(academy, b1, pricing.id, "work");
    await complete(academy, revoked, invoices.id, "work");
    await withTenant(dbs.app.db, academy.id, (tx) =>
      revokeCredential(tx, { userId: revoked, courseId: invoices.id, reason: "Plagiarism" }),
    );
    // An imported certificate keeps its original date; it was not issued here in the period.
    const imported = await createUser(dbs.owner.db);
    await withTenant(dbs.app.db, academy.id, (tx) =>
      tx.insert(credentials).values({
        tenantId: academy.id,
        publicId: generatePublicId(),
        userId: imported,
        courseId: invoices.id,
        courseTitle: { en: "Get paid on time" },
        displayName: "Ada Lovelace",
        source: "imported",
        sourcePlatform: "learnworlds",
        externalId: "lw-1",
        issuedAt: new Date(),
        visibility: "public",
        madePublicAt: new Date(),
      }),
    );

    await share(academy, a1, invoices.id, ["post", "profile"]);
    await share(academy, a2, invoices.id, []);
    await share(academy, b1, pricing.id, ["post"]);

    await withTenant(dbs.app.db, academy.id, async (tx) => {
      const visit = (
        name: "verification_page_viewed" | "verification_cta_clicked",
        courseId: string,
        via?: ShareChannel,
      ) =>
        trackEvent(tx, {
          tenantId: academy.id,
          name,
          courseId,
          props: via ? { via } : {},
        });
      for (const via of ["post", "post", "post", "profile", undefined] as const) {
        await visit("verification_page_viewed", invoices.id, via);
      }
      await visit("verification_page_viewed", pricing.id);
      await visit("verification_cta_clicked", invoices.id, "post");
      await visit("verification_cta_clicked", invoices.id, "post");
      await visit("verification_cta_clicked", pricing.id);
      // Before the period.
      await tx.insert(events).values({
        tenantId: academy.id,
        name: "verification_page_viewed",
        courseId: invoices.id,
        props: { via: "post" },
        occurredAt: new Date(Date.now() - 40 * DAY),
      });
    });
    // Another academy's visitors are not counted.
    await withTenant(dbs.app.db, other.id, (tx) =>
      trackEvent(tx, { tenantId: other.id, name: "verification_page_viewed", props: {} }),
    );

    // New leads: agreed in the period and still agreeing.
    await setContactOptIn(dbs.app.db, academy, a1, true, WORDING);
    await setContactOptIn(dbs.app.db, academy, a3, true, WORDING);
    await setContactOptIn(dbs.app.db, academy, a3, false, WORDING);
    await setContactOptIn(dbs.app.db, academy, b1, true, WORDING);
    await agreedAt(academy, b1, new Date(Date.now() - 40 * DAY));

    const window = { ...periodWindow(30), to: new Date(Date.now() + 60_000) };
    expect(await sharingNumbers(dbs.app.db, academy.id, window)).toEqual({
      issued: 4,
      madePublic: 3,
      shareRate: 75,
      shared: { post: 2, profile: 1, other: 0, total: 3 },
      views: { post: 3, profile: 1, other: 2, total: 6 },
      clicks: { post: 2, profile: 0, other: 1, total: 3 },
      clickRate: 50,
      newLearners: 3,
      newLeads: 1,
    });
    const longer = { ...periodWindow(90), to: window.to };
    expect(await sharingNumbers(dbs.app.db, academy.id, longer)).toMatchObject({
      views: { post: 4, total: 7 },
      newLeads: 2,
    });
    // One course: its certificates, and who started it through a shared one.
    expect(
      await sharingNumbers(dbs.app.db, academy.id, { ...window, courseId: invoices.id }),
    ).toEqual({
      issued: 3,
      madePublic: 2,
      shareRate: 67,
      shared: { post: 1, profile: 1, other: 0, total: 2 },
      views: { post: 3, profile: 1, other: 1, total: 5 },
      clicks: { post: 2, profile: 0, other: 0, total: 2 },
      clickRate: 40,
      newLearners: 2,
      newLeads: 0,
    });
  });
});
