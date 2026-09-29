# enaibler — Webinar Brief

**Status:** Add-on spec · September 2026
**Read with:** `enaibler-dev-brief.md` (v2) and `CLAUDE.md`. Everything here follows the same principles: generic core, tenant configuration, proof over points, private by default, compliance built in, self-hosted on Coolify.

---

## 1. Why webinars

B2B marketing teams already run webinars and already have a budget for them. Most webinars die after the live date: a recording nobody rewatches and a lead list with "attended: yes/no".

enaibler turns webinars into the front door of the academy:

```
Landing page ─► Register ─► Live session (Zoom/Teams/Meet) ─► Re-live
                                    │                           │
                                    └──────► Homework ◄─────────┘
                                                │
                              AI review ─► Certificate of Completion ─► Share
```

Two value propositions:

1. **Webinar → course:** reuse recordings the company already paid for. Value in week one.
2. **Webinar → proof:** attendees who submit homework are qualified leads, not just "watched 40 minutes".

**Scope boundary:** enaibler does **not** host live video. Live sessions run in the tenant's existing tool. enaibler owns everything around the session: planning, landing page, registration, reminders, attendance, re-live, homework, credential, analytics.

**Wording:** the credential is always a "Certificate of Completion". Never "certified", "certification" or "zertifiziert" (see dev brief §9).

---

## 2. Feature set

### 2.1 Webinar recordings as course source

Extends the authoring pipeline (dev brief §7).

- **Inputs:** video upload (MP4, MOV, WebM), import from a connected tool's cloud recording, or a URL the tenant owns (e.g. their own YouTube/Vimeo video).
- **Pipeline:** transcode → transcribe (self-hosted Whisper) → speaker separation → chapter detection → slide/keyframe extraction → searchable transcript.
- **AI drafts from the transcript:**
  - course outline and lessons (Markdown, screenshots inline),
  - key takeaways per chapter,
  - quiz questions with answer explanations,
  - an assignment suggestion plus a draft rubric,
  - a coverage map: which rubric criteria the webinar actually teaches.
- **Several webinars → one course:** merge transcripts, remove duplicates, order topics.
- **The video itself** can stay in the course as a re-live lesson with chapters (see 2.4).
- **Q&A reuse:** questions from the live Q&A (if the tool exports them) become an FAQ lesson or feed quiz questions.

### 2.2 Plan webinars: landing page and registration

- **Session setup:** title, description, date/time with time zone, duration, host tool, capacity, language, linked course (optional), presenters.
- **Presenters:** name, role, photo, **or** a brand persona. Tenants with anonymity mode (tenant 0) show only the brand, never a person.
- **Landing page:** tenant-themed, built from blocks: hero, "what you'll learn", "what you'll build" (the homework artifact), agenda, presenters, FAQ, registration form, series overview. Custom slug on the tenant domain (`/webinars/<slug>`), OG image rendered from theme, SEO meta, UTM capture.
- **Registration form builder:** default fields (name, email) plus custom fields (company, role, company size, free text), required/optional, consent checkboxes separated by purpose (see §5).
- **Capacity and waitlist:** close registration at capacity, waitlist with automatic promotion.
- **Embeddable form:** a registration widget the tenant can place on their own website.
- **Registration = learner account.** Registering creates (or links) a learner in the tenant; magic-link login later needs no second sign-up.

### 2.3 Connect webinar tools

Per-tenant OAuth connection. Tokens encrypted at rest.

| Tool                                  | Create session + join link | Register attendees  | Attendance import                      | Recording import         |
| ------------------------------------- | -------------------------- | ------------------- | -------------------------------------- | ------------------------ |
| **Zoom** (Meetings / Webinars)        | ✓                          | ✓ (registrants)     | ✓ (participant report)                 | ✓ (cloud recording)      |
| **Microsoft Teams** (Graph API)       | ✓ (online meeting)         | via calendar invite | ✓ (attendance report)                  | ✓ (if recording enabled) |
| **Google Meet** (Calendar + Meet API) | ✓ (event with Meet link)   | via calendar invite | ✓ (conference records, Workspace only) | ✓ (Drive recording)      |
| **Link only** (any tool)              | paste URL                  | enaibler only       | check-in code or manual upload (CSV)   | manual upload            |

Capabilities depend on the tenant's plan with each vendor and on current APIs — **verify every column in an integration spike before promising it.** "Link only" must always work, so no tenant is blocked by a missing integration.

- **Personal join links** where the tool supports them (better attendance matching).
- **Attendance matching:** by registrant email; fallback check-in code shown during the session and entered in the academy.
- **Webhooks** from tools (meeting ended, recording ready) trigger import jobs automatically.

### 2.4 Re-live

- **Sources:** recording imported from the tool, uploaded video, or an embed of a video the tenant already hosts (YouTube, Vimeo).
- **Self-hosted player** for uploaded/imported videos: transcoded to HLS, stored in our object storage, adaptive quality, chapters, playback speed, captions from the transcript (DE/EN, AI-translated optional), searchable transcript with click-to-jump.
- **External embeds:** YouTube in privacy-enhanced mode and Vimeo, loaded only after consent (two-click embed), watch progress through their player APIs where available.
- **Access control:** re-live public, registrants-only, or learners-only per session.
- **Watch tracking:** segments actually watched (not just the furthest position), so "watched" means watched. Tenant sets the threshold (default 80 %).
- **Missed the live session?** Registrants get the re-live automatically, with the same homework.

### 2.5 Link to course

- A session can be **a lesson inside a course** (lesson type `session`) or **stand alone** with a "continue in the course" call to action.
- Landing page shows the linked course; the course shows upcoming sessions.
- After the session, registrants land directly in the course, at the right lesson.

### 2.6 Homework and assessment

Generalises the course ending from dev brief §4. A course or standalone session can require:

| Type                              | Use                                                                | Review                                  |
| --------------------------------- | ------------------------------------------------------------------ | --------------------------------------- |
| **Artifact assignment** (default) | Hand in real work: file, template form, link                       | AI review against rubric (dev brief §8) |
| **Quiz**                          | Multiple choice / multiple select, question pool, randomised order | Automatic; pass threshold, retry rules  |
| **Both**                          | Quiz for knowledge, artifact for proof                             | Both must pass                          |

- **Deadlines:** optional submission deadline per session (e.g. "before the next session"). Late submissions allowed or not, per tenant.
- **Live loop (optional):** the host sees the best anonymised submissions before the next session and can discuss them live.
- **Credential evidence:** the credential stores which evidence was required (`quiz`, `artifact`, `attendance`). Positioning note: artifact-backed credentials are the product's promise; quiz-only is allowed but the verification page shows the evidence type honestly.

### 2.7 Webinar series as one course

- A **series** is a course whose lessons include several sessions, in order.
- **Completion policy** (configurable per course):
  - every session **attended live or watched as re-live** above the threshold,
  - homework passed (per session, at the end, or both),
  - optional catch-up window ("missed a session? watch the re-live within 7 days").
- **Progress view** for the learner: sessions done, next session date, open homework.
- **One registration for the whole series,** with calendar invites for all dates.
- The Certificate of Completion is issued only when the full policy is met.
- This is the natural format for **live cohorts** (dev brief phase 2) and for **paid courses later**, see §5.

---

## 3. What else (recommended additions)

**Must-have for the feature set to work**

- **Reminder sequence:** confirmation with `.ics` calendar file, reminders 24 h and 1 h before, "starting now", post-event mail with re-live and homework, homework reminder before deadline. Templates per tenant and language.
- **Time zones:** stored in UTC, shown in the viewer's zone, landing page shows both.
- **Funnel analytics per session and series:** landing views → registrations → attended live → watched re-live → homework submitted → passed → shared → verification views. No-show rate. Re-live drop-off by minute.
- **Recording consent:** registration and join notices that the session is recorded (see §5).

**Strong growth levers**

- **Highlight clips:** AI proposes 30–90 s clips from the recording with captions, for LinkedIn promotion of the next session or the course.
- **Co-hosted webinars:** a partner company co-hosts; registrants can consent to be shared with the co-host. Co-marketing is how B2B webinars spread.
- **Evergreen re-live landing pages:** after the live date, the landing page switches to "Watch the recording + build the artifact". Clearly labelled as recorded; no fake "live" countdowns.
- **Lead signals with consent:** attendance, watch time and homework status sent to the tenant's CRM via webhook, only for learners who opted in.
- **"Ask the webinar":** learners ask questions answered from the transcript with timestamps (RAG over transcript). Phase 3.

**Nice to have**

- Pre-webinar questions in the registration form, shown to the host as a digest.
- Poll and Q&A import from tools that export them.
- Attendance confirmation for learners (private, not shareable — shareable credentials stay tied to completion).
- Session feedback form (rating + one question) after the session, feeding the tenant's dashboard.

---

## 4. Domain model additions

All tables carry `tenant_id`.

| Entity               | Key fields                                                                                                                                                                                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Session**          | course_id (nullable), lesson_id (nullable), title, description, starts_at (UTC), duration, timezone, language, capacity, tool (`zoom` \| `teams` \| `meet` \| `link`), external_id, join_url, status (`draft` \| `scheduled` \| `live` \| `ended` \| `relive`), relive_access, landing_page_id |
| **Presenter**        | session_id, display_name, role, photo, is_brand_persona                                                                                                                                                                                                                                        |
| **LandingPage**      | slug, blocks (JSON), seo, og_image, form_id, state (`upcoming` \| `evergreen`)                                                                                                                                                                                                                 |
| **Form**             | fields (JSON schema), consents [{purpose, text i18n, required}]                                                                                                                                                                                                                                |
| **Registration**     | session_id or series (course) id, learner_id, answers, consents given (with timestamp + text version), personal_join_url, status (`registered` \| `waitlist` \| `cancelled`), entry utm\_\*                                                                                                    |
| **Attendance**       | session_id, learner_id, source (`tool_report` \| `checkin_code` \| `manual`), joined_at, left_at, duration                                                                                                                                                                                     |
| **MediaAsset**       | type (`upload` \| `tool_recording` \| `external_embed`), storage path / URL, hls_path, duration, transcript_id, chapters, captions                                                                                                                                                             |
| **WatchProgress**    | learner_id, media_asset_id, watched_segments, percent_watched                                                                                                                                                                                                                                  |
| **Quiz**             | questions [{type, text, options, correct, explanation}], pool_size, pass_threshold, max_attempts                                                                                                                                                                                               |
| **CompletionPolicy** | course_id, rules [{type: `lessons` \| `sessions_attended_or_watched` \| `quiz_passed` \| `assignment_passed`, params}], catch_up_days                                                                                                                                                          |
| **ToolConnection**   | tool, oauth tokens (encrypted), scopes, account_label, status                                                                                                                                                                                                                                  |
| **EmailSequence**    | trigger (registration, reminder offsets, post-event, deadline), templates per locale                                                                                                                                                                                                           |

Credential gets one new field: `evidence` (e.g. `["attendance", "artifact"]`).

---

## 5. Compliance (not legal advice; confirm with counsel)

- **Recording consent:** attendees must be told before joining that the session is recorded and how the recording is used (re-live, course). Before a recording becomes public re-live or course material, attendee faces/voices/names must be removed or consented. Default: re-live access `registrants-only`; publishing wider requires the host to confirm.
- **Consent per purpose:** participation (required), marketing emails (optional, double opt-in), sharing with co-host (optional), CRM handoff (optional). Store text version and timestamp.
- **Third-party tools:** Zoom, Microsoft and Google become processors for the live part. The tenant contracts them; enaibler stores only what it imports. Document which data flows back (attendance, recordings).
- **External embeds:** YouTube/Vimeo only after consent.
- **FernUSG:**
  - Free webinars and free series: no restriction.
  - **Paid live series:** fine without ZFU as long as recordings are not promised as the product. Re-live may be offered as a courtesy but must not be sold as a self-paced course.
  - **Paid re-live-only course with learning checks** = distance learning → requires `paid_async_approved` (ZFU approval).
  - The platform enforces this through `delivery_mode` (dev brief §4, §9): e.g. a `paid_live` course cannot mark re-live as a required, self-paced substitute for attendance unless the tenant confirms approval.
- **Wording:** "Certificate of Completion" everywhere; lint rules apply to landing pages too.

---

## 6. Architecture additions (self-hosted on Coolify)

| Area             | Decision                                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Video processing | **ffmpeg** in the pg-boss worker: transcode uploads to HLS (several renditions), thumbnails, keyframes. Separate worker queue for heavy video jobs so reviews stay fast                                             |
| Storage          | HLS segments and originals in the self-hosted S3-compatible storage, tenant-prefixed, signed URLs for non-public re-lives                                                                                           |
| Player           | Open-source HLS player (e.g. Vidstack or hls.js) with chapters, captions, speed; watch-segment tracking sent to our events API                                                                                      |
| Transcription    | Existing Whisper service; add speaker separation and chapter detection jobs                                                                                                                                         |
| Integrations     | One adapter per tool behind a common interface (`createSession`, `registerAttendee`, `fetchAttendance`, `fetchRecording`). OAuth tokens encrypted in Postgres. Public webhook endpoints with signature verification |
| Calendar         | `.ics` generation for single sessions and series                                                                                                                                                                    |
| Email            | Sequences scheduled as pg-boss jobs, sent via the EU SMTP relay, templates in React Email                                                                                                                           |
| Landing pages    | Rendered by Next.js from blocks + tenant theme; static caching with revalidation on edit                                                                                                                            |
| Capacity         | Budget server resources for video: storage grows with every re-live. Add a storage quota per tenant plan                                                                                                            |

---

## 7. Phasing

Fits the dev brief timeline without delaying the tenant 0 MVP.

| When                         | Scope                                                                                                                                                                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MVP (Dec 2026)**           | Nothing new beyond dev brief v2. The recording → lesson pipeline already accepts webinar recordings as uploads                                                                                                                                                                                 |
| **Phase 1.5 (Feb–Mar 2027)** | Webinar-as-source polish (chapters, quiz drafts, multi-webinar merge) · self-hosted re-live player with watch tracking · quiz as assessment type · completion policies                                                                                                                         |
| **Phase 2 (Apr–Jun 2027)**   | Sessions, landing pages, registration forms, reminders, `.ics` · **Link-only** mode first, then **Zoom**, then **Teams** and **Meet** · series as course · attendance import · funnel analytics. **Pilot:** tenant 0's free AI Founder Program beta cohort (May 2027) runs as the first series |
| **Phase 3 (H2 2027)**        | Highlight clips · co-hosted webinars · CRM webhooks · evergreen pages · "Ask the webinar" · paid live series (after legal green light, with payments)                                                                                                                                          |

---

## 8. Success metrics

- Registration rate (landing views → registrations)
- Show-up rate live, plus re-live catch-up rate for no-shows
- Homework submission rate among attendees (the key "webinar → proof" metric)
- Series completion rate
- Share rate and verification views for webinar-based credentials
- Author time from recording to published course

---

## 9. Open questions

1. Which tool integration first after "link only"? Default proposal: Zoom (largest API surface), then Teams (enterprise DACH), then Meet.
2. Video storage cost per tenant: quota in the pricing tiers, or pass-through?
3. Should re-live of a paid live series be allowed at all, or only for attendees who missed a session (safer under FernUSG)?
4. Quiz-only credentials: allowed per tenant, or only in combination with attendance?
5. Do we need our own lightweight live Q&A/poll layer later, or always rely on the tool?
