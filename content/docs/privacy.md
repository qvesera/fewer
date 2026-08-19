---
title: Privacy Policy
description: How fewer collects, uses, and protects your data. Fewer runs in your browser with no trackers, no ads, and no telemetry. This policy explains exactly what we handle, why, and how you can control it.
lastUpdated: August 15, 2026
---

**Last updated: August 15, 2026**

<!-- NOTE FOR THE SITE OPERATOR: This policy is written to be transparent and easy to read, but it is still a template. Before publishing it as legally binding, have a qualified attorney confirm the operator identity, jurisdiction, and the named service providers below match your actual deployment. This is not legal advice. -->

## The Short Version

Fewer is a browser-based tool that turns directory structures into interactive graphs. Here is what you need to know, in plain language:

- **Your data stays yours.** Everything you import, edit, or export (your directories, graphs, and files) is processed locally in your browser. By default, none of it is sent to our servers.
- **We do not sell your data.** We do not run ads, and we do not track you across the Internet.
- **We collect almost nothing unless you sign in.** Optional features (accounts, saving across devices, share links, email invites, and email digests) involve a small, clearly described set of data. When you don't use them, we handle almost none of your personal information.
- **You are in control.** You can export your data, delete any saved graph, unsubscribe from any email, or delete your account at any time.
- **You can stop at any moment.** Close the tab and everything that only lives in your browser disappears. Server-side data you delete is removed promptly.

If a section ever surprises you, tell us — we would rather make the policy clearer than surprise you.

## About Fewer

This Privacy Policy explains how fewer ("we", "our", or "us") handles information when you use the fewer web application and related services (together, the "Service"). The interactive app lives at [app.fewer.directory](https://app.fewer.directory). The homepage and public site are at [fewer.directory](https://fewer.directory).

Fewer is open source, licensed under the [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html). Because the code is public, anyone can verify how the product actually behaves — including what it does and does not collect.

By using the Service, you agree to the practices described in this policy.

## 1. What "Local" Means Here

Fewer runs entirely in your browser. Your imported directories, graphs, edits, and exported files are processed on your own device. They never leave your browser unless you choose to save them to an account or share them.

The only things that ever leave your browser are the optional actions you take, described throughout this policy (such as saving a graph, creating a share link, importing a public file index, or connecting a cloud service).

**Transparency about environments.** We run separate non-production environments (local development, deploy previews, and test branches) against a separate database from production, so activity in a dev, preview, or stage build never writes to your production data. Those builds are for testing; use them at your own discretion and don't treat them as a permanent home for anything you care about.

## 2. Information We Collect

Because fewer is a client-side application, we collect very little. What we handle depends entirely on which optional features you use.

### Data You Provide (Optional)

- **Contact and account details.** If you create an account, we store your email address and authentication credentials (managed securely by Supabase Auth).
- **Saved graphs.** If you sign in and save a directory, the graph data you explicitly save is stored in our database so you can access it across devices. This data is private to your account by default.
- **Share links.** If you create a public share link, the graph data you choose to share is stored and served to anyone who has the link. Creating a shared link is a deliberate, visible action.
- **Email share invites.** If you invite someone by email to view a shared graph, we store the recipient's email address and a one-time token that lets them open the graph without an account. We send that one invite email and do not use the address for anything else.
- **Watch digests.** If you enable watch digests, we store the public file-index URLs you add and email you a daily digest when those indexes change. This only happens if you enable it.
- **Bug reports.** If you submit an optional bug report, we collect the report text you write (description and steps), together with diagnostics about your browser/device and aggregate graph statistics. We use this to fix faults; bug reports are optional and you can review exactly what is sent before submitting.

### Data Collected Automatically (Minimal)

- **Service logs.** Standard logs (such as IP address, user-agent, and pages visited) are collected by our hosting provider, Netlify, to operate, secure, and debug the Service. These logs are not used for advertising or profiling.
- **Authentication logs.** Authentication providers log standard sign-in events for security.
- **Cookies and local storage.** We use storage for two practical purposes only, and neither is tracking.
- **Auth session cookie.** Kept while you are signed in so you stay authenticated. Removing it signs you out.
- **One-time cloud connection cookie.** Used during optional GitHub / Google / Microsoft connections to prevent cross-site request forgery, then cleared.
- We do **not** use cookies for advertising, analytics, or cross-site tracking, and there is no third-party tracking script on the site.

### Data from Optional Connected Services

- **Cloud connections.** If you opt in to connect a third-party service (GitHub, Google, Microsoft — covering OneDrive, SharePoint, Azure DevOps, and Azure Blob), we access those services on your behalf through OAuth, but only to list and import the trees you request. We use the minimum access needed for the task. Access tokens are encrypted at rest before storage and tied to your account. The contents of your connected accounts are not stored.

## 3. Who We Share Your Data With

We do **not** sell, rent, or trade your personal information, and we do not share data for advertising.

We share information only in these limited cases, and we name our service providers so you know who they are:

| Provider | What they do | What data they may see |
| --- | --- | --- |
| **Supabase** | Authentication and the database that stores accounts, saved graphs, and share data | Your email, your saved/share data, auth session data |
| **Netlify** | Hosting, content delivery, and serverless functions (e.g., the daily watch-digest check) | Service logs from traffic to the site |
| **Resend** | Sending transactional email (share invites and watch digests) | The recipient email address and the email content for the emails you send or receive |
| **Web3Forms** | Forwarding bug reports you choose to submit (delivered to us by email) | The report content you write, plus your browser/device and graph-diagnostics you opt into sending |
| **GitHub / Google / Microsoft** | Optional cloud imports you initiate | Only what is needed to fetch the tree you asked for; contents are never stored wholesale |
| **Legal process** | If the law requires it | Only what a valid legal request compels us to provide |

Each provider processes data only to perform its functions for us, and is bound by its own terms and privacy policies, including: [Supabase](https://supabase.com/privacy), [Netlify](https://www.netlify.com/privacy-policy/), [Resend](https://resend.com/legal/privacy-policy), [Web3Forms](https://web3forms.com/privacy), [GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement), [Google](https://policies.google.com/privacy), and [Microsoft](https://privacy.microsoft.com/en-us/privacystatement).

## 4. How We Use Information

We use information only for these purposes:

- To provide, operate, and maintain the Service.
- To let you save, access, and share graphs across devices.
- To send share-invite and watch-digest emails you requested or initiated.
- To detect and fix faults, and to secure the Service against abuse.
- To respond to your support requests.
- To meet legal obligations.

We do **not** use your data to build profiles of you, to target advertising, or for anything unrelated to the Service.

## 5. Data Storage and Retention

- **Encryption in transit.** All data sent to and from the Service travels over encrypted HTTPS connections.
- **Encryption at rest.** Saved data is stored on encrypted infrastructure. Cloud access tokens are individually encrypted at rest.
- **Access controls.** Saved graphs are private to your account and protected by row-level security except where you deliberately share them.
- **How long we keep data.** We keep data only as long as needed for the purpose it was collected.
- **Account + saved graphs.** While your account is active; deleted when you delete your account.
- **Share links.** Until you delete the link.
- **Email invites.** The recipient's email and one-time token are kept only long enough to deliver and validate the invite.
- **Service logs.** Retained under our hosting provider's schedule, never used for advertising.

No internet transmission or electronic storage is ever 100% secure, so we cannot guarantee absolute security — but we take reasonable, industry-standard measures.

## 6. Data Transfer Across Borders

Your information may be stored and processed in a different country from your own, including where our service providers are located. When providers process data across borders, we rely on appropriate transfer mechanisms (such as Standard Contractual Clauses) where required by law. We do not transfer data for reasons unrelated to operating the Service.

## 7. Your Rights and Controls

Depending on where you live — including under India's Digital Personal Data Protection Act (DPDP Act) 2023, the GDPR, UK GDPR, Brazil's LGPD, California's CCPA/CPRA, and similar laws — you may have the right to:

- **Access** a copy of the personal data we hold about you.
- **Correct** inaccurate data.
- **Delete** your data and your account.
- **Port** your data in a structured, machine-readable format.
- **Restrict or object** to certain processing.
- **Withdraw consent** at any time, where processing is based on consent.
- **Unsubscribe** from any email (every email we send includes an unsubscribe option, and watch digests can be turned off in settings).

### How to exercise your rights

- **Delete saved graphs:** directly in the Service at any time.
- **Unsubscribe from digests or email:** use the in-app controls or the unsubscribe link in any email.
- **Delete your account:** in account settings; this removes your account and its related data.
- **File a request:** open an issue on the [GitHub repository](https://github.com/qvesera/fewer) or use the contact details below.

When you request access or deletion, we will verify your identity before acting and respond within the time limits the law requires (generally no more than one month). We will not discriminate against you for exercising your rights.

## 8. Use by Children

Fewer is not directed at children under the age of 13 (or the applicable minimum age in your jurisdiction). We do not knowingly collect personal information from children. If you believe a child has provided us with personal information, contact us and we will delete it.

## 9. Cloud Connections

Optional cloud connections (GitHub, Google, Microsoft) work strictly on your initiation:

- We only fetch directory listings from the service you connect — we never search or download the contents of your accounts wholesale.
- Tokens are encrypted at rest and can be revoked at any time by disconnecting.
- Disconnecting a connected service revokes the stored token so it can no longer be used.
- Disconnecting does not delete data you already imported; that data stays under your control.

## 10. Security Incidents

If we become aware of a security breach affecting the personal data we hold, we will notify affected users and the relevant authorities as required by law, without undue delay once we are able. We will provide clear, practical information about what happened and what you can do.

## 11. Changes to This Policy

If we change what data we collect or how we handle it, we will update this page and change the "Last updated" date. For material changes, we will post a prominent notice on the Service. Because the code is open source, you can always see exactly what the product does in a given version.

## 12. Contact Us

Questions, requests, or concerns are welcome — we would rather you tell us than wonder.

- **GitHub:** open an issue on the [fewer repository](https://github.com/qvesera/fewer) or message the maintainers.
- **Email / security:** for privacy-specific requests, use a GitHub issue marked private/security — do not paste sensitive personal data into a public thread; [SECURITY.md](https://github.com/qvesera/fewer/blob/main/SECURITY.md) has guidance.

We will respond to privacy requests as promptly as the law requires and aim to do better. If you are unsatisfied with our response, and it applies to you, you may also contact your local data-protection authority.
