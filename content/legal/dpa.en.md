---
title: Data processing agreement
status: draft
updated: 2026-09-27
description: How enaibler processes personal data on behalf of the academies (Art. 28 GDPR), with its technical and organisational measures.
---

> **Draft for review by counsel. Not legal advice.** Text in [square brackets] is a placeholder or an open decision. The measures in Annex 1 describe the software as of 27 September 2026.

## 1. Parties and subject matter

1. This agreement applies between the business that runs an academy on enaibler (controller, the "customer") and [company name and legal form, address] (processor, "enaibler").
2. It governs how enaibler processes personal data on the customer's behalf in order to provide the service under the terms of use (Art. 28 GDPR). It applies for as long as the main contract runs and beyond that for as long as enaibler processes the customer's data.

## 2. Nature and purpose of the processing

enaibler runs the customer's academy and stores, processes and transmits data in order to:

- sign learners and team members in by e-mail link and manage their roles,
- provide courses, save progress, have submitted work reviewed by AI and people, and grade final tests,
- issue Certificates of Completion, show them publicly when learners choose to, and issue them as Open Badges,
- send e-mails to learners, such as sign-in links, results and confirmations,
- record consents and analyse and export contacts, leads and usage figures for the customer,
- transfer data to the customer's systems on its instructions (webhooks, interfaces),
- build courses with AI help from sources, recordings and interviews,
- secure and monitor the service and support the customer.

## 3. Types of personal data

- Account and contact data: e-mail address, display name, language, roles, sign-in sessions with IP address and browser identifier
- Learning data: enrolments, progress, submitted work (texts, files, links), reviews and feedback, test attempts, Certificates of Completion and showcase content, cohort membership
- Consents with wording and time, for example for the academy's newsletter and for being contacted by it
- Usage and origin data: events in the learning journey with course, language and campaign details, views of and clicks on shared Certificates of Completion without identifying the visitors
- Communication data: e-mails sent and webhook deliveries
- Content that team members provide to build courses, such as documents, recordings of voice and screen, and interviews
- any data that learners or team members write into texts and files themselves

Special categories of personal data (Art. 9 GDPR) are not intended; the customer does not ask for them in assignments.

## 4. Data subjects

- The academy's learners
- The customer's team members, such as admins, authors, reviewers and mentors
- People whose data appears in course content or submitted work

## 5. Instructions

1. enaibler processes the data only on the customer's documented instructions. The instructions follow from the terms of use, this agreement and the settings the customer makes in the Studio, for example on reviews, webhooks and interfaces. The customer gives further instructions in text form.
2. If a legal obligation requires enaibler to process data differently, enaibler informs the customer beforehand, unless the law prohibits this (Art. 28(3)(a) GDPR).
3. If enaibler considers an instruction to be unlawful, it informs the customer without undue delay.

## 6. enaibler's obligations

1. **Confidentiality.** Everyone who processes the customer's data is bound to confidentiality.
2. **Security.** enaibler takes the technical and organisational measures in Annex 1 (Art. 32 GDPR) and develops them further without lowering the level of protection.
3. **Data subjects' rights.** Learners can download and delete their data themselves under "My learning". Beyond that, enaibler supports the customer with data subjects' requests. If a request reaches enaibler, enaibler forwards it to the customer.
4. **Support.** enaibler supports the customer with its obligations under Art. 32 to 36 GDPR: security of processing, notification of breaches, data protection impact assessments and consulting the supervisory authority.
5. **Breaches.** enaibler notifies the customer of a personal data breach concerning its data without undue delay, [within 48 hours at the latest] after becoming aware of it, with the information required by Art. 33(3) GDPR as far as known.
6. **Location.** Processing takes place in the EU. Data is transferred to third countries only under the conditions of Art. 44 et seq. GDPR. [Check for the AI provider.]

## 7. Sub-processors

1. The customer approves the sub-processors listed in Annex 2.
2. enaibler informs the customer by e-mail at least [four weeks] in advance of any intended change. The customer may object for an important reason relating to data protection; if no solution is found, it may terminate the contract.
3. enaibler binds sub-processors by contract to the same data protection obligations as in this agreement (Art. 28(4) GDPR).

## 8. Evidence and audits

enaibler makes available to the customer all information needed to demonstrate compliance with the obligations of Art. 28 GDPR. enaibler allows audits by the customer or by auditors it appoints who are bound to confidentiality, after reasonable notice [period, e.g. 30 days], during business hours and without disrupting operations. Evidence may also be provided through current reports of independent auditors. [Agree who bears the cost of audits.]

## 9. Deletion and return

1. During the term, these periods apply: sign-in links 15 minutes; uploads that were never sent are deleted after 24 hours; webhook delivery logs after 30 days; e-mails sent after 90 days; [expired sessions after a period to be set]. When learners delete their data, it is removed at once; usage events are kept for statistics only, without any link to the person.
2. After the end of the contract, enaibler hands the data over at the customer's request [format and deadline] and then deletes it within [period], unless the law requires it to be kept. Backups are overwritten after [backup retention period].

## 10. Liability and final provisions

1. Liability is governed by Art. 82 GDPR; otherwise, the liability rules of the terms of use apply.
2. In the event of contradictions, this agreement takes precedence over the terms of use in matters of data protection.
3. German law applies. [Decide which language version prevails if they differ.]

## Annex 1: Technical and organisational measures

### Separation of academies

- The database separates every academy with row-level security: it only returns rows of the academy a request runs for. The application connects with a role without administrator rights, to which these rules always apply, and does not start in production otherwise.
- Files are kept in non-public storage, in a separate area per academy. Every download checks access.
- A sign-in session is only valid in the academy it was created in.

### Access and permissions

- Signing in works without passwords, through links that are valid for 15 minutes, work once and are stored only as a hash; sign-in attempts are limited.
- Roles with defined rights (learners, authors, reviewers, mentors, admins); every function in the Studio checks the permission it needs. Mentors see only their cohort.
- In the Studio, learners appear under a pseudonym, with name and e-mail address only after they agreed to be contacted.
- [Administrative access to servers and database: authorised people, keys, two-factor authentication.]

### Encryption and secrets

- Connections from outside are encrypted only (HTTPS with TLS), as are the connections to the e-mail delivery service and to the AI provider. The services on our own servers talk to each other over an internal network that cannot be reached from outside.
- Signing keys and webhook secrets are stored encrypted with AES-256-GCM, API keys only as a hash.
- [Encryption of disks and backups at the hosting provider.]

### Data minimisation

- No tracking cookies; page views are counted without cookies and with the path only.
- The service checks the type of uploaded files by their content. Images are re-encoded and PDF files lose their document information, so no details of their authors come along.
- Webhooks and Open Badges name learners only by a pseudonym; the e-mail address is included only with consent.
- Error reports contain no form contents, headers or query parameters; e-mail addresses and key-like strings are masked.

### Integrity and traceability

- Human reviews are stored next to the AI review; a changed decision needs a reason.
- Lessons keep every version.
- Consents are stored with the wording the person saw.
- The servers and the background service write structured logs.

### Availability and recovery

- The database is backed up [daily] to storage at a different provider in a different location, and so is the file storage. Restoring is tested [before launch and regularly after, e.g. quarterly].
- Availability and errors are monitored; requests are limited against abuse.

### Regular review

- Every change to the software goes through automated checks, including tests of the separation of academies in the database.
- [Review of these measures, e.g. yearly, and who is responsible for it.]

## Annex 2: Sub-processors

| Sub-processor             | Service                                                                                | Place of processing                    |
| ------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------- |
| [Hosting provider]        | Servers and data centre for the application, database, files and all self-run services | [Location in the EU]                   |
| [Backup storage provider] | Storage for backups, with a different provider than the servers                        | [Location in the EU]                   |
| [E-mail delivery service] | Sending e-mail                                                                         | [Location in the EU]                   |
| [AI provider]             | AI review and AI help with building courses                                            | [Region and retention at the provider] |

Run by enaibler itself on its servers, and therefore without further providers: database (PostgreSQL), file storage (SeaweedFS), AI gateway (LiteLLM), transcription (Whisper), page statistics ([Umami or Plausible]), error monitoring (GlitchTip) and availability monitoring (Uptime Kuma).
