---
title: Privacy policy
status: draft
updated: 2026-09-27
description: What data enaibler processes on this website and when running academies, why, for how long, and what your rights are.
---

> **Draft for review by counsel. Not legal advice.** Text in [square brackets] is a placeholder or an open decision. The processes described match the software as of 27 September 2026.

## At a glance

- enaibler runs on servers in the EU on which we operate every service ourselves. We use external providers only for the servers, backups, sending e-mail and AI models.
- We set no tracking cookies. There are only two cookies: your language and, when you are signed in to an academy, your session.
- We count page views without cookies and with the page's path only.
- The academy is responsible for the data of its learners. We process it on the academy's behalf.

## Who is responsible

Controller within the meaning of the General Data Protection Regulation (GDPR) for the processing this policy describes:

[Company name and legal form]\
[Street and number]\
[Postcode and city]\
E-mail: [E-mail address for data protection requests]

[Data protection officer, if appointed or required by law: name or office and contact. Otherwise remove.]

## Our role and the academies' role

enaibler is a platform on which businesses run their own academies. That gives us two roles:

- **enaibler as controller.** For this website, for businesses that create an academy and enter into a contract with us, for reports sent through our report form and for enquiries to us, we decide ourselves why we process data. That is what this policy is about.
- **enaibler as processor.** We process the data of an academy's learners and team on the academy's behalf and on its instructions, under a data processing agreement (Art. 28 GDPR). The academy is then the controller. How it handles your data is set out in its privacy policy, linked at the bottom of each of its pages. What the platform does the same way for every academy is described below under "For learners of an academy".

## Visiting this website

### Servers and logs

When you open this website, our servers process the information your browser sends along for technical reasons, for example your IP address, date and time, the address requested and details of your browser and operating system. Without it, the website cannot be delivered or protected against attacks. The legal basis is our legitimate interest in a secure, working service (Art. 6(1)(f) GDPR). The servers are provided to us by [hosting provider] in [data centre location in the EU], acting as our processor. [Retention of server and proxy logs, e.g. 14 days.]

### Cookies

We use no tracking or advertising cookies, so we need no cookie banner. There are only two cookies, both needed for the service:

- `enaibler_locale` stores your language for one year. It is set when you switch the language or open an address that states a language.
- `enaibler.session_token` keeps you signed in to an academy (over HTTPS with the prefix `__Secure-`). It is only created when you sign in, only applies to that academy's address and ends when you sign out or after seven days without use.

The legal basis for storing them on your device is § 25(2) no. 2 of the German TDDDG, and for the further processing Art. 6(1)(b) and (f) GDPR. Where you came from to a course, for example through a shared link, travels in the address, not in a cookie.

### Page statistics without cookies

To understand which pages are used, we count page views with [Umami or Plausible Community Edition], which we run ourselves. No cookie is set and nothing is stored on your device. What is sent is the page's path without query parameters and, as far as your browser tells, the website you came from. Pages whose address carries a key, such as sign-in links, are not counted. [Add how the chosen tool processes IP address and browser identifier, e.g. only briefly for a hash that changes daily, and how long it keeps data.] The legal basis is our legitimate interest in improving the website (Art. 6(1)(f) GDPR).

## Creating an academy

When you create an academy, we process its name and address, your e-mail address, the academy's languages, your website's address if you give it, and your acceptance of the terms of use and the data processing agreement with version, wording and time. We use your website's address so that you can take colours and fonts from it in the Studio. We send you a sign-in link and tell our team about the new academy by e-mail.

The legal basis is the contract with you or the business you represent (Art. 6(1)(b) GDPR), and for the record of your acceptance our legitimate interest (Art. 6(1)(f) GDPR). Against abuse, we count attempts per IP address and per e-mail address, in memory only and for one hour at most.

## Signing in with an e-mail link

enaibler works without passwords. To sign in, to the Studio or to an academy, we send a link to your e-mail address. It is valid for 15 minutes, works once and is stored only as a hash. Signing in creates a session, with which we store your IP address and your browser's identifier to detect abuse. It ends when you sign out or after seven days without use. [Set a period after which expired sessions are deleted.] Within an academy, this happens on the academy's behalf.

## Reporting content

Through our [report form](/report) you can report illegal content or breaches of our terms of use. We process the address of the content, the reason, your explanation, your name, your e-mail address and your statement that the report is accurate. You may leave out name and e-mail address only when reporting child sexual abuse material.

The report goes to our team by e-mail. You get a confirmation of receipt and, later, our decision. We do not store reports in the platform's database. We tell the academy concerned your name and e-mail address only where that is strictly necessary (Art. 17(3)(b) DSA), for example when you assert your own rights in a piece of content.

The legal basis is our obligation to receive and handle reports (Art. 6(1)(c) GDPR in conjunction with Art. 16 DSA). Against abuse, we count reports per IP address and per e-mail address, in memory only and for one hour at most.

## E-mails

The platform's e-mails, that is sign-in links, confirmations of receipt and the academies' messages to their learners, are sent through [e-mail delivery service] with servers in [location in the EU], acting as our processor. The platform sends no newsletters: academies export the contacts who subscribed to their newsletter and confirmed by e-mail, and send it themselves.

## Error reports

When an error occurs, on the server or in your browser, a report goes to our self-hosted error monitoring (GlitchTip). It contains the page concerned without query parameters, the academy's address and technical details of the error, but no form contents and no request headers. E-mail addresses and key-like strings are masked first. The legal basis is our legitimate interest in a service that works (Art. 6(1)(f) GDPR). [Retention of error reports, e.g. 90 days.]

## AI features

Academies can have an AI assess submitted work first and use AI help when building courses. For that, we send the content needed, for example a piece of work and the rubric, through a gateway we run ourselves (LiteLLM) to [AI provider], [in an EU region or with contractually assured zero retention at the provider]. [Open decision: provider, region, retention at the provider; rule out use of the data for training.] Whether work passes is calculated by the platform from the points per criterion; the academy's team checks samples and close results and can change any result. Recordings that courses are built from are transcribed on our own servers (Whisper). When an academy takes its brand from a website, the AI only sees facts drawn from it, such as colours and fonts, never the page itself. This processing happens on the academies' behalf.

## Recipients and processors

We only pass data to service providers that act as our processors and are bound by contract:

- [Hosting provider, location]: servers and data centre
- [Backup storage provider, location]: backups, with a different provider than the servers
- [E-mail delivery service, location]: sending e-mail
- [AI provider, region]: the academies' AI features

We run every other service ourselves on these servers: database, file storage, AI gateway, transcription, page statistics and error monitoring. We give data to public authorities only where the law requires us to.

## Transfers outside the EU

We process data in the EU. [If a provider processes data outside the EU or can access it from there: state the basis, e.g. an adequacy decision or standard contractual clauses.]

## How long we keep data

- Sign-in links: 15 minutes, and they work once.
- Sessions: until you sign out, or seven days without use.
- Language cookie: one year.
- Counts against abuse: one hour at most, in memory only.
- Server and proxy logs: [period].
- Page statistics: [period].
- Error reports: [period].
- Reports: in our team's mailbox for as long as handling them and any complaints or legal disputes take, [then period].
- Contract and customer account data: for the term of the contract, then as long as statutory retention requires, for example up to ten years for invoices and accounting records (§ 257 HGB, § 147 AO).
- Record of the accepted terms of use and data processing agreement: as long as the academy exists, [then period].
- Backups: [retention period], then they are overwritten.

## Your rights

You have the right of access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18) and data portability (Art. 20). Where we process data on the basis of our legitimate interest, you may object on grounds relating to your particular situation (Art. 21). Write to us at [e-mail address for data protection requests].

You may also lodge a complaint with a data protection supervisory authority (Art. 77 GDPR), for example the one responsible for us: [competent supervisory authority with address].

## For learners of an academy

If you learn in an academy, the academy is responsible for your data; please send questions and requests to the academy. On the platform, the following applies to every academy:

- Under "My learning" you download all data the academy stores about you as a ZIP file with your files, and you delete it there too. Deleting removes your submissions, reviews, test attempts, Certificates of Completion, consents and files in that academy at once; usage events are kept for statistics only, without any link to you. If you are in no other academy on enaibler, we delete your sign-in account as well. What the academy exported or passed to its own systems before is its responsibility.
- Your Certificates of Completion are private until you make them public yourself. To anyone else, a private certificate looks exactly like one that does not exist.
- In the Studio, the academy's team sees you under a pseudonym. It sees your name and e-mail address only if you expressly agreed that the academy may contact you. You get an academy's newsletter only if you subscribe and confirm by e-mail.
- With the same e-mail address, you have one shared sign-in account across academies; all other data stays separate per academy.

## Changes

We update this policy when the service or the law changes. The date at the top shows the current version.
