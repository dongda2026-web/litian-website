# DongDa Website Codex Guide

## Project Context

This workspace contains the DongDa B2B industrial packaging website (historical source directories retain the Litian name). The active production source is:

- `work/litian-upgrade/litian-website/index.html`
- build output: `work/litian-upgrade/litian-website/dist/client`
- final hosting target: Alibaba Cloud, with static OSS/CDN first and dynamic services added in phases

The site is currently a static, multilingual, product-led corporate website. Preserve the existing brand, navigation labels, WhatsApp number, product imagery, company history and inquiry flow unless the user explicitly requests a replacement.

## Architecture

- Current runtime: static HTML/CSS/vanilla JavaScript.
- Build script: `npm run build:sites`, which copies production assets into `dist/client`.
- Launch audit: `npm run audit:launch`.
- Dynamic-ready content seed: `content/*.json`.
- Future dynamic target: static or ISR frontend backed by CMS/API, Alibaba Cloud OSS for assets, CDN for delivery, and API/database services for forms, products, news and AI customer service.

Dependency direction:

1. Frontend rendering reads content and assets.
2. Static assets are stored under `assets/` and copied to `dist/client`.
3. Dynamic endpoints must be optional and configured through environment or injected runtime variables.
4. No frontend file may contain database passwords, SMTP passwords, API keys or private tokens.

## Inquiry Service (Phase A, Local Acceptance)

- `server/inquiry-service.mjs`: Node.js HTTP API and private SQLite storage; tested on Node 22.23.0, requires >=22.18. `node:sqlite` remains experimental in Node 22; pin and verify deployment runtime.
- Keep public static frontend separate from this service. Never copy server code, databases, env files or administrator tokens into `dist/client` or public OSS.
- SQLite requires a dedicated durable disk/volume and single instance. No FC ephemeral storage or multi-instance/HA claims; migrate to managed relational storage before scaling.
- `POST /api/inquiries` succeeds only after commit: `{ok:true,persisted:true,leadId:"DD-..."}`. Preserve Idempotency-Key across retries; changed content with the same key returns 409.
- `/admin` is an isolated sales UI served from server/admin-ui, never copied to the public static build. Browser administration uses short-lived HttpOnly cookie sessions plus Origin/CSRF checks; server-to-server bearer auth remains supported. Staff SSO/individual roles remain pending. CORS is not authentication.
- Browser followups include expectedRevision; stale writes return 409 without losing drafts. Additive revision/actor migrations preserve existing records. Follow local server/AGENTS.md for private UI, session and migration rules.
- Outbox `accepted` means gateway acceptance, not inbox delivery. Missing gateway leaves inquiries pending; failure must not lose records.
- `npm test` uses `node:test`, including real HTTP restart/readback and failure/permission tests. `preflight:aliyun` now runs tests before build gates.
- `preview:procurement` injects the endpoint only into local preview HTML at port 4191. Port 4190 is excluded by Fetch unsafe-port rules; earlier 4190 evidence remains historical. Production runtime config stays unchanged until actual deployment and live acceptance.

## DongDa Main-System Integration

- User-confirmed target: the document/customer/sales main system, not the finance system. Integration is a launch requirement, not a later optional CRM project.
- User-approved domain architecture: cn-dongda.com for the public website, erp.cn-dongda.com for the main system. This is the target design, not a completed DNS/routing/TLS migration; preserve current business routes until migration acceptance.
- Preserve the local inquiry service/admin implementation for acceptance and rollback. It is not an independent authoritative production CRM. The main system owns customer identity, assignees, sales stages, followups, quotations and order admission.
- Website browsers must never receive internal user/admin credentials. Use a server-to-server, path-restricted, fixed-organization integration identity. CORS does not establish identity or tenant scope.
- Do not point LEADS_WEBHOOK_URL at /api/sales/leads: payload/acknowledgement contracts differ and lead creation lacks website receipt idempotency. Add a dedicated atomic ingestion contract before enabling retries.
- Keep raw inquiries and a durable delivery queue; acknowledge main-system ingestion only after its transaction commits and retain its lead ID. A local DD receipt is not proof of ERP acceptance.
- Bind product/customer IDs through reviewed mappings. Never infer a customer match, amount, quotation, won/lost stage or order from free text.
- The current Nginx root for cn-dongda.com points to the main system and includes finance routes. Never overwrite it with website files or repoint DNS without approved routing, protected backups and client/service-worker regression evidence.
- Source and deployed versions may differ. Verify release identities and affected-file hashes before main-system edits. This website task must not absorb unrelated main-system changes.
- Latest inspection and acceptance prerequisites: outputs/upgrade-logs/2026-10-08-dongda-integration/Inspection-Report.md.
- Approved layout: cn-dongda.com is the website, erp.cn-dongda.com is the main system. No DNS/routing/TLS switch has occurred. Preserve finance routes and existing PWA links during a separately accepted migration.
- A06 local candidate lives at work/dongda-main-integration (10.21.36/85650249 baseline). Exact POST /api/sales/website-inquiries uses a dedicated server credential, fixed site/org, complete validated envelope, atomic receipt/lead/message/assignment and immutable idempotency. Do not merge unrelated dirty ERP/SaaS work.
- Website CRM queue is separate from notification accepted. Record main lead ID only after matching persisted ACK, keep retry leases and source/target identity stable, and prohibit parallel local followups when CRM is configured. Local synthetic HTTP acceptance does not prove production PostgreSQL/cloud readiness.

## Coding Standards

### Unified Product Catalog (B01 / A4)

- content/products.json is the canonical schema: six product families plus one technical module. Homepage, details, drawers, selectors, inquiry payloads and footer must resolve the same IDs. Preserve old IDs as aliases for retry compatibility.
- assets/js/catalog-core.js owns strict validation, immutable data, multilingual AND search/filter and three-series comparison. Keep catalog UI separate in catalog-ui.js; do not reintroduce literal PRODS/Q_PRODUCTS catalog arrays in index.html.
- npm run build:catalog generates catalog-data.js and local Lucide icon nodes/license. Never manually edit the generated catalog seed. build:sites and preflight rebuild it.
- Node tests use node:test; test schema, aliases, unknown fields, missing translations, invalid option values and quantity consistency. Quote-calculator input requires independent server validation; browser validation alone is insufficient.
- zh/en/ru catalog content is required. Other existing site languages currently fall back to English for new catalog copy, not fully translated content.
- mediaRole distinguishes samples, existing customer examples and production references. Never present factory footage as an unverified product sample. NW/AL photos/supply specifications await business confirmation.
- All options are requested requirements, not verified certification, capacity, MOQ, availability or price. A4 used #product/... navigation; A5 canonicalizes these old links to physical product pages.
- Current acceptance: outputs/upgrade-logs/2026-10-08-product-catalog/Implementation-Log.md. Local API a4/catalog-v1 passed 40 tests and isolated main-system HTTP readback; production org/cloud/domain migration remain pending.

### Product Entity Delivery (B02/B06 / A5)

- assets/js/catalog-copy.js and product-page-core.js are shared by browser rendering and static generation. scripts/build-product-pages.mjs uses parse5 8.0.1, with physical /en|zh|ru/products/<canonical-id>/index.html output. Rebuild artifacts instead of hand-editing them.
- 18 localized paths include 12 indexable product URLs. NW/AL production-reference photos are not product images; exclude their six pages from sitemap/image metadata and keep noindex until approved supply/photos are available.
- Product canonical, hreflang/x-default, OG/Twitter, JSON-LD and sitemap use the user-confirmed cn-dongda.com. This is target metadata, not proof of domain deployment or indexing. No fabricated offers, reviews, certificates or downloads.
- Keep old hash/ID aliases, language changes and browser history compatible. Quote/inquiry URLs retain canonical product IDs across reloads; restoration must not add extra history entries.
- No-script body, related links and native FAQ are prerendered; interactive menu, configurator and form still require JavaScript. Do not describe the whole site as functional without scripts.
- Static preview and build worker preserve actual 301/404/HEAD/405 and root-contained reads. Cloud routing must independently match these semantics; no homepage 200 fallback for nonexistent products.
- Latest evidence: outputs/upgrade-logs/2026-10-08-product-pages/Implementation-Log.md. 48 tests, physical-page audit, synthetic CRM HTTP regression and browser acceptance passed. API stays a4/catalog-v1; page build is pages-v1. Production org/PG/SSO/domain/cloud acceptance and B03/C/D remain unfinished.

- Prefer small, scoped changes over full rewrites.
- Keep the active source as a single static site until a backend/CMS is intentionally introduced.
- Use vanilla JavaScript patterns already present in the file.
- Use `async/await` for new Node scripts.
- Use kebab-case for content file names and script names.
- Use JSON files for structured content seeds. Do not parse important content with ad hoc string slicing.
- Keep visible Chinese/English/Russian business copy accurate and plain.
- Do not remove existing language keys unless you also update every consumer.

## UI Standards

### Multi-Product RFQ (B03 / A6)

- assets/js/rfq-list-core.js is shared public/server validation; rfq-list-ui.js uses existing fieldValue, inquiry submission and receipt helpers. Do not add a second submission or price engine.
- Keep 1-20 independent line UUIDs and canonical product IDs. Same product with different configurations is valid; do not sum all line quantities or infer internal product IDs, quotations or orders.
- Persist only non-personal selection, UI language, salted request digest/key and receipt ID in sessionStorage. Contacts/destination/notes remain memory-only. Preserve identical retry keys after reload; explicitly clear identity for a new inquiry.
- Private ERP v1 retains its three existing types and 16 KiB streamed limit. v2/64 KiB is RFQ-only; both preserve fixed org/site, service credentials, original payload, transactional assignment, deduplication, CAS and non-WhatsApp origin.
- RFQ uses zh/en/ru copy with existing other-language fallback. Check desktop/tablet/320/390, icons/tap areas, invalid inputs, offline/retry, language/reload, receipt and new-intent reset. Hide the assistant only while the RFQ form is active, retain it elsewhere.
- Latest local candidate is API 2026.10.08-a6; 55 website tests, 52 impacted main-system tests and separate v1/v2 synthetic HTTP readback passed. Evidence: outputs/upgrade-logs/2026-10-08-multi-product-rfq. This is not deployed; full A/B/C/D scope and production acceptance remain open.

- Keep the page product-led, international and B2B procurement focused.
- Prioritize mobile readability, visible CTAs, clear product series, company credibility and fast scanning.
- Avoid crowding the first viewport with cookie, AI panel or repeated CTAs.
- Desktop navigation must stay one line or collapse before clipping.
- Product cards need stable image dimensions, readable hierarchy and tap-friendly controls.
- Do not add decorative UI that does not help purchasing, product understanding or trust.

## Quality Gates

### Industry Entity Pages (B04-B06 / A7)

- `content/industries.json` is the trilingual source for four industry entities. `industry-core.js` is shared by static builders and the browser; validate exact product/application mappings against the canonical catalog.
- Reuse parse5 page/SEO helpers and existing navigation, procurement and RFQ submission. Restore the physical industry ID before initial language rendering so refresh cannot rewrite a detail route into a list route.
- Industry guidance is `review-pending`, `noindex,follow` and excluded from sitemap. Sample images and associated product names do not prove suitability, certification, supply capability or customer authorization. Editorial approval requires an intentional schema/gate change, not just toggling a flag.
- Run `npm run preflight:aliyun`, including industry audits. Check zh/en/ru, language/back/forward/refresh, native FAQ, 320/390/768/1440 and industry-to-configured multi-product RFQ with synthetic readback.
- A7 local evidence: 64 website tests, 15 industry routes, 22 indexed content records (not 22 indexable URLs). Existing 18 product routes/12 indexable product URLs remain. API stays a6; ERP source is unchanged from A6, whose 52 impacted tests are reused only after source hashes match. New v1/v2 isolated HTTP acceptance is separate evidence.
- Keep unapproved company/history/capacity/certification/service claims in the review ledger; A05 is not complete. WordPress reauthorization, production org/notification, TLS/ICP/domain migration and cloud acceptance remain pending. No DNS/routing writes or installation packages were made in A7.

Run these before claiming launch readiness:

```bash
cd work/litian-upgrade/litian-website
npm run validate:content
npm run build:sites
npm run audit:launch
```

When UI layout changes are significant, also run a browser/mobile visual check and keep screenshots or notes in `outputs/`.

## Security

### Private WordPress CMS (C01 / A8)

- `cms/` is private server/editor source, never copied into `dist/client`. The public runtime remains static. Product/industry trilingual text editing is implemented; company/history/news/media/documents are not yet CMS-managed.
- Reuse WordPress native cookies/nonces, scoped author/reviewer/export roles and revision-enabled metadata. Node uses a dedicated read-only exporter and a server-only bridge key. Private synthetic identities are generated under ignored `var/cms/`; no credentials, database volumes or draft payloads enter logs or archives.
- Keep catalog IDs, aliases, images, mappings, configuration, review/indexing flags immutable. A content reviewer is not a technical certification approver or ERP employee. ERP remains the only formal customer/sales authority.
- Build full isolated artifacts through `preflight:aliyun`; retain failures and validate source/content/artifact hashes before CAS activation. Draft previews are sandboxed and private, cannot activate, and must preserve original CSS order. Rollback switches a complete artifact, not file overlays; content revision restoration does not automatically publish.
- Local compose is dedicated loopback-only WordPress/PHP/MariaDB, not a production deployment recipe. 4192 is local CMS; 4193 is a server bridge; 4194 is selected static content only, with no inquiry API. 4191 remains the synthetic inquiry preview. Do not conflate these entries with production ERP integration.
- CMS source changes invalidate ready-release activation; rebuild after edits. Keep current/previous artifacts and volumes. Never blindly remove an operation lock after a crash; check processes and authoritative state first. A timeout does not prove activation was canceled.
- Validate Node unit/HTTP tests, PHP syntax, real WordPress role/validation/conflict/revision behavior, activation/readback/rollback and responsive editor/preview. WordPress.com reauthorization, cloud release/backup/SSO, production secrets/TLS/ICP and domain migration remain independent gates.
- User-confirmed domain split stays website `cn-dongda.com`, document/customer/sales ERP `erp.cn-dongda.com`. No DNS/Nginx/finance route changes during local CMS acceptance. Evidence: `outputs/upgrade-logs/2026-10-08-wordpress-cms/`.

- Keep secrets out of source code and JSON content.
- Dynamic lead capture must validate inputs server-side before email/CRM forwarding.
- Form and AI endpoints must use allowlisted origins, rate limits and spam protection before public launch.
- Use Alibaba Cloud RAM users with least privilege for OSS/CDN deployment.
- Do not hardcode production credentials in frontend JavaScript.

## Workflow

### Private Artwork Foundation (C02 / A12 In Progress)

- Source API 2026.10.08-a12-pre is an isolated candidate; preview 4191 remains A11 and default entrypoints do not enable uploads. Domain design remains website cn-dongda.com / document-customer-sales ERP erp.cn-dongda.com; no DNS/routing migration has occurred.
- Private upload sessions are anonymous 30-minute HttpOnly draft capabilities, not verified customer or ERP identities. Mutations require exact Origin/CSRF and session ownership. Public IDs never grant file-byte access.
- server/private-uploads.mjs stores original bytes/hash/provenance and binds them atomically with the durable inquiry. Fixed file/session/global quotas, duplicate-content identity and immutable binding apply. Migrate additively with verified private backups; do not replace current business data on rollback.
- Use busboy/file-type, structured bounded PDF inspection and a local fresh fail-closed ClamAV scanner. A clean scan is not a safety guarantee or technical approval. Preserve real negative observations; do not rename mocked detections or structural rejection as real antivirus evidence.
- Until ERP transport is implemented, attachment-bearing CRM delivery explicitly blocks as attachment_transport_pending with no outbound request. Do not report ERP acceptance, expose the upload form or infer a completed file handoff. Existing non-attachment v1-v4 paths remain protected.
- server/upload-scanner/compose.local.yml is loopback-only acceptance configuration, not cloud deployment. Preserve unrelated CMS/ERP containers. Never include var, databases, secrets, signatures or customer artwork in source/delivery archives.
- Full attachment transport, ERP organization/owner-aware viewing, public zh/en/ru upload UI, image/CDR resource review, customer-authenticated tracking and actual notifications remain open. Evidence: outputs/upgrade-logs/2026-10-08-private-attachments.

#### A12 Private ERP Transport (Local Candidate)

- v5 attachment quote/RFQ/sample preserves the old demand validators and v1-v4 streamed limits. Bounded server-only base64 is hash/type-checked; only metadata enters the immutable source receipt. Every file must be confirmed by the ERP persisted ACK. crmAttachmentsEnabled is explicit opt-in; public UI/default entrypoints remain disabled.
- Reuse existing archive-files/uploaded_files with deterministic immutable private originals. Generic archive and business-sync cannot read, export or mutate them. Employee attachment reads recheck the current org/module/lead owner and source receipt on each request; website credentials/public IDs are not download grants.
- File-first and sales-transaction persistence is NOT cross-store atomic. Retain partial originals for identity-stable recovery and never issue a false ACK. PostgreSQL corruption/outage must fail closed, not return a local mirror as cloud success.
- Rollback retains private archive/sync guards once private originals exist. Before-code snapshots are not permission to restore an unguarded service or old database. Disable v5/worker first, preserve originals, receipts, employee data and configuration.
- Evidence: outputs/upgrade-logs/2026-10-08-private-attachments-erp. 120 website, 61 sales/intake and 69 archive/sync regressions; 3 dedicated local PG groups; real scanner PNG/JPEG/PDF quote/RFQ/sample with separate ERP process/SQLite restart, lost ACK and reassignment permissions. A12/C02 is still partial: public/employee UI, image/CDR/resource review, production PG sales/SSO/retention/backup, notifications, tracking and domain/cloud acceptance remain open. Preview 4191 stays A11; no production, DNS or user ERP/finance writes.

#### A12 Employee Original Downloads (Local Candidate)

- Reuse the employee-only attachment endpoint through SDK getWebsiteOriginal. Require live current identity, no-store/no-redirect, bounded MIME/size/SHA-256 validation and abort on identity changes; never serve an offline original fallback.
- SalesWebsiteAttachments is a scoped read-only list using ActionButton, central localization and existing downloadOutputBlob. Preserve original names/RFQ association, one pending request, cancel/close/lead-owner guards and actionable errors. No previews, replacement or technical approval.
- Local SDK 52 and synthetic built HTTP/browser checks cover exact PNG/JPEG/PDF, denied/corrupt/cancel/retry paths and zh/en/ru phone/desktop UI. Download initiation is not completed filesystem/native save; fixture provenance is not antivirus evidence. Retain invalid screenshot/tooling diagnostics.
- Previous backend/site protected sources are unchanged; do not claim new full ERP/PG/website matrices. Preview 4191 remains A11 with channels off. Public upload/CDR/resources, production organization/PG/SSO/retention/notifications/tracking, packages/domain/cloud gates remain open. No DNS, finance, WordPress.com or user ERP checkout writes. Evidence: outputs/upgrade-logs/2026-10-08-employee-attachments.

#### A12 Isolated Image Worker (Not Activated)

- server/upload-inspector/image-inspector.py is a stdin-only Pillow 12.3.0 candidate, now integrated with the private-upload SOURCE CANDIDATE through a private broker/Node adapter. Public/default entrypoints remain off. Keep original bytes, exact MIME/hash, static PNG/JPEG, strict bounded envelopes/full decode and fixed errors. No CDR/technical approval claim.
- Run only under a private unprivileged OS supervisor/container with no external network, read-only source/root, scratch-only writes and explicit CPU/memory/PID/file/wall limits. Worker Linux resource limits alone are not complete sandboxing. Never grant the public API Docker socket access or use the unrelated local toolchain application image as production infrastructure.
- 20 final local sandbox groups cover 12MP phone/exact16MP RGBA, existing JPEG, full decode, framing/CRC/IDAT/inflation, hash and real resource effects. Prior 8MP phone rejection is preserved. No actual Node API integration, public UI, stored-policy relabelling, PDF/CDR or deployment is proved.
- Actual upload integration needs a dedicated minimal pinned worker runtime, private bounded broker/adapter, immutable provenance/versioning and unavailable/crash/retry/session/transaction/backward-compatibility acceptance. Existing website/ERP/CMS/records/old archives remain unchanged. Evidence: outputs/upgrade-logs/2026-10-08-image-inspection. A12/C02 and full A/B/C/D remain open.

#### A12 Image Upload Integration (Source Candidate, Not Accepted)

- New image-broker.py bounds Unix framing, SO_PEERCRED, two jobs, total input deadline, subprocess output/stderr and independent kill/reap. It runs only in a dedicated no-network/read-only sandbox; the public API gets a private socket, never Docker privileges. The existing unrelated Python image is acceptance tooling only, not a production design.
- server/image-upload-inspector.mjs is wired into private-uploads.mjs; a required inspector precedes antivirus and new image persistence. Save private image_policy/image_inspection with original bytes, keeping v5 envelope/digest/legacy validationPolicy unchanged. Never relabel legacy bound originals; preserve their readback/exact retry. Unchecked ready images cannot bind; new-policy rows missing proof fail closed.
- Initial integration evidence had 13 Python broker groups and no Node/HTTP execution. The next batch prepared Linux Node tooling outside target execution: adapter/private-upload 30/30 and website 132/132 passed. The first minimal image passed actual image/AV/SQLite/HTTP; the final broker fix passed 14 groups but still needs final-image HTTP/ERP regression. Full preflight failed on an incomplete isolated build closure and has not rerun. Preserve the old failure records and frozen source checkpoint; do not relabel it with newer results.
- Public/default uploads remain off. A separate local minimal image exists, but its supply-chain/production-capacity approval, PDF whole-process/CDR and retention remain open. No DNS/Nginx/TLS/finance, preview activation or user ERP change. Latest frozen local evidence: outputs/upgrade-logs/2026-10-08-image-upload-acceptance. Docker's Linux environment stopped during ERP toolchain export; recover only with user confirmation, without reset/prune/shared-volume deletion. A12/C02 and A/B/C/D remain active, not complete.
- Target execution must include an in-container wall limit and trusted parent stop/readback for a uniquely created, ownership-labelled container. Killing only a Docker CLI is not proof that the workload stopped. Ambiguous creation/observation is not terminal or permission to relaunch: inspect the same identity, and report unknown cleanup if the engine is unavailable. Parent-controller simulations are not target or runtime acceptance. The dedicated preflight controller is work/acceptance-2026-10-08/run-preflight-sandbox.mjs, not a public-site asset.

### Structured Customization (C02 / A11)

- Current local website API is 2026.10.08-a11. customization-core.js is shared browser/server validation; customization-ui.js reuses procurement/RFQ and existing receipt helpers. Keep the static runtime and original product imagery/brand/homepage.
- Quote requests may carry root customization; RFQ requests carry independent per-line customization. Units are explicit mm/cm; dimensions/load are positive decimal strings with at most three decimals; printing and optional colour count have exact enums/ranges. Reject unknown keys and cross-type/version extensions. These are buyer requirements, never approved performance or ERP product master data.
- Preserve v1/v2/v3. ERP v4 applies only to customized quote or RFQ: quote keeps 16 KiB, RFQ 64 KiB actual streamed bytes. Existing fixed site/org, service identity, digest, transactional assignment, immutable receipt/source message, CAS and WhatsApp-window exclusion remain authoritative.
- Customer design text is memory-only, not in sessionStorage/localStorage, receipt response, monitoring or mailto fallback. Public selection/retry identity may still restore. Submission errors preserve drafts; success is shown only after durable website ACK, not a quote or production CRM confirmation.
- ERP customization UI is read-only and translated zh/en/ru. Generic editing/retries cannot replace original demand. Do not add a second CRM or infer internal product/customer mappings, quotations or orders.
- Quote layout uses scoped compact header, restored horizontal gutters, minmax grid tracks and unframed parameter sections. Check child bounds as well as document overflow: overflow-x:hidden can conceal clipping. Preserve unrelated homepage/product/industry/CMS layouts.
- Evidence: outputs/upgrade-logs/2026-10-08-customization. 102 website tests, 56 affected ERP tests and isolated v1/v2/v3/v4 quote/v4 RFQ HTTP/restart gates passed. This is not the full ERP release matrix or production PostgreSQL acceptance.
- Private attachments, customer-authenticated tracking, notifications and the rest of A/B/C/D remain open. No DNS/Nginx/finance/production/WordPress.com/user ERP-SaaS changes; A8 selected CMS artifact remains unchanged and needs a fresh complete build before activation.

### Sample Requests (C02 / A10)

- The website API is now 2026.10.08-a10. assets/js/sample-request-core.js owns shared strict validation; sample-request-ui.js reuses existing submission, contact validation and salted retry identity. Product entities link to /#sample/<canonical-id>. Preserve v1 inquiry and v2 RFQ behavior.
- Sample-only ERP v3/16 KiB retains purpose, requested sample units, separate estimated purchase volume, requirements, recipient and cost/freight acknowledgement. Keep generic order quantity/specifications empty. No free-sample, automatic approval, quotation, order, shipment or notification claims.
- The existing ERP sales transaction owns original request, receipt, assigned lead and source message. Dedicated employee POST /api/sales/leads/:id/sample-review validates organization, ownership, write permission, revision, five manual statuses and a required note. A website service credential cannot review; retries and generic edits must retain original demand and staff review.
- Customer browser storage contains only product selection, language, salted retry key/digest and receipt. Personal/company/address/requirements remain memory-only and are cleared after success. Same-product refresh restores receipt; a different-product intent clears the old receipt. Errors retain drafts, not fake success.
- Sales and document archives load shared record-editor.css with their own lazy route. CSS imports must precede rules. Verify loaded hashed assets after refresh; an old PWA shell is not evidence for the current build. Preserve archive-specific responsive overrides.
- A10 local evidence: outputs/upgrade-logs/2026-10-08-sample-requests; 95 website tests, 54 affected ERP tests, actual isolated v1/v2/v3 HTTP/restart readback and browser phone/tablet/desktop/three-language/conflict checks. This is not a full ERP release matrix or production PostgreSQL acceptance.
- Customization attachments, customer-authenticated tracking and real notifications remain open; C02 is partial. No DNS/Nginx/finance/production/user ERP-SaaS changes. Existing A8 CMS selected artifact remains unchanged and must be rebuilt before activation against new source.

### Inquiry Operations Monitoring (C03 / A9)

- Private `/api/admin/monitoring?days=7|30|90` and the existing workspace share auth/session/Origin/rate controls. No monitor data or admin source enters the public static artifact. The local API is now `2026.10.08-a9`; catalogue and selected A8 CMS static version are independent identities.
- Count committed unique inquiries, strict ERP saved acknowledgements and gateway accepted separately. Confirmation-date trends are not cohort conversion; historical accepted rows without timestamps remain explicitly unknown. Local first stage progression is not a customer reply or ERP response readback.
- A9 adds bounded 90-day UTC daily counters with sanitized enums only, worker observations and notification accepted_at/lease_token. No URLs/queries/addresses/contact/receipt/ERP IDs or provider error text in monitoring. Channel attribution, visitor tracking, consent-based funnel, alerts and ERP response readback remain pending; C03 is only partially implemented.
- Existing data gets a verified private SQLite snapshot before additive migration; failure stops startup. Delivery result and aggregate commit atomically behind a matching lease; request/worker counter failure never invalidates a committed inquiry. Rollback application code only, never replace current business data.
- A9 evidence is under `outputs/upgrade-logs/2026-10-08-inquiry-monitoring`: 88 website tests, 12 monitoring groups, real isolated v1/v2 ERP HTTP/aggregate/restart readback, responsive UI/error/draft/logout evidence. The ERP candidate's 19 source hashes remain A6; reuse its 52 impacted tests without claiming a new full ERP matrix.
- Runtime preview remains 4191 with channels disabled. Synthetic fixtures 4195/4196 are stopped after acceptance. CMS 4192/4193/4194 and its A8 selected artifact remain unchanged; changed source requires a new gated release before activation. No DNS, Nginx, production data, cloud, WordPress.com or user ERP/SaaS writes.

- Before large refactors, write a short impact plan in the conversation.
- Preserve original files and useful code; prefer layered upgrades and changelog entries.
- Maintain a rollback log for launch changes under `outputs/upgrade-logs/`.
- If a change only prepares future dynamic behavior, label it clearly as a scaffold, not a live backend.

### Public Resource Centre (B06 / A13 Static Local Acceptance)

- User explicitly deferred Docker. Do not recover/restart it, bypass the unresolved A12 lease or run private upload/ERP targets without their sandbox. A13 is a separate static frontend increment, not A12 acceptance.
- `content/resources.json` and `resource-core.js` define four buyer requirement checklists bound to canonical product IDs. Validate exact keys, complete zh/en/ru copy, fields, dates and immutable data. No certificate, specification, brochure authorization or commercial approval is inferred from these checklists.
- `build-resource-pages.mjs` generates 15 physical language routes and 12 real versioned UTF-8 TXT files with a hash/size manifest. Keep pending-review pages and documents noindex; Alibaba hosting must independently apply headers/routing. Product links, query filters, language, refresh and history reuse the existing navigation/quote engine; no new CRM or submission path.
- Preserve all 20 existing company milestones in a native details disclosure. Neutral headings and presentation changes do not resolve the existing company/history/capacity/certification claims or conflicting grouped dates. Existing private whitepaper is not published without authorization and content/brand review.
- `work/acceptance-2026-10-08/run-static-a13.mjs` stages only public assets, reviewed static builders and frontend tests. A native offline macOS sandbox denies outside writes/network, uses clean environment, bounded output/heap and a 120-second process-group deadline. It does not replace the full backend/image/ERP preflight; two socket-based tests are explicitly excluded, with separate real static HTTP evidence.
- Preview 4201 is static-only from `work/static-acceptance-a13/site/dist/client`; no API, upload, CRM or notifications. Original 4191/A11 and CMS selection remain unchanged. Source edits invalidate older CMS release activation until a new complete release passes all gates.
- A13 evidence: `outputs/upgrade-logs/2026-10-08-resource-centre`. Production organization/SSO/PG, attachments/CDR, notifications, authenticated tracking, factual content approval, complete CMS, ICP/TLS/domain migration and Alibaba acceptance remain open. No DNS/Nginx/finance/production/Git/native package release is implied.

### Procurement Insights (B06 / A14 Static Local Acceptance)

- Docker remains explicitly deferred. A14 uses only reviewed public frontend/build/test code in a separate native offline sandbox. No private upload/ERP/CMS target execution, pending-lease bypass or cloud migration is implied.
- `content/insights.json` is the strict trilingual registry for three buyer requirement guides. Keep canonical product mappings, complete section/FAQ translations, immutable data and pending editorial review. Current dates identify guide revisions, not company news events; no invented authors, certificates, offers or approvals.
- `insight-core.js` owns validation, AND search/topic/sort, physical paths, escaped rendering and noindex metadata. `insight-ui.js` reuses existing navigation and RFQ; do not auto-add article products or create another submission engine. Native TOC links must include the physical article path because the global base points to root.
- `build-insight-pages.mjs` generates 12 physical language routes. Pending guides remain outside sitemap. Old `NEWS_DATA` and the 3 legacy news.json records are preserved in private review snapshots, not public runtime/index; build emits an empty public news.json compatibility response. Legacy published flags are not publication approval. Other company/history/capacity statements remain unresolved.
- A14 ran 42 actual static tests, 11 native sandbox/build/audit steps, 61 page GET readbacks among 109 actual HTTP checks, and 24 responsive / 17 real browser flow groups. Two old socket tests are excluded from the offline batch, not counted; full private npm test/preflight and production acceptance are unrun.
- Preview 4202 is static-only from `work/static-acceptance-a14/site/dist/client`. Preserve 4191/A11, 4201/A13 and selected A8 CMS artifact. News/company/resources are not fully CMS-managed; source changes require a fresh full release before any CMS activation.
- Evidence: `outputs/upgrade-logs/2026-10-08-insights-pages`. Keep title-click/base-anchor failures and tooling diagnostics. Full A/B/C/D scope, A12 final image/ERP gates, factual approval, production org/SSO/PG/notifications/tracking/retention, TLS/ICP/domain/cloud and Git/package releases remain open.

### Unified Public Search (B01/B06 / A15 Static Local Acceptance)

- Docker stays explicitly deferred. A15 uses only reviewed public source and static native-sandbox execution. Do not bypass the A12 pending lease or conflate static search with private service/ERP acceptance.
- `site-search-core.js` composes existing strict product/industry/resource/insight registries into 17 immutable public records. Exclude unreviewed company/news, technical modules without entity routes, CMS drafts and private contacts/receipts/ERP/artwork. Extending scope requires an intentional validated publication contract, not arbitrary DOM scraping.
- `site-search-ui.js` owns multilingual AND search, type/relevance/title selection and q/type/sort physical URL restoration. Reuse existing native entity links/nav and RFQ helpers; no search API, personal storage, CRM or submission engine. Queries can appear in URL/access logs; static no-script rendering shows all records, not filtered server results.
- `build-site-search-pages.mjs` generates three noindex search paths and a public derived index. Canonical/hreflang never include query terms; keep search out of sitemap. NW/AL factory references are not product thumbnails; preserve supply/guidance pending states.
- Shared navigation must be checked by child bounds, not document overflow alone. Fixed desktop text sizing/spacing and compact brand presentation keep official Logo/name visible; collapse before clipping. Verify 320/390/768/1440/1441/1600/1920 and three locales, real controls/history/native links and existing RFQ identity without business submission.
- A15 evidence: `outputs/upgrade-logs/2026-10-08-site-search`; 53 actual static tests, 12 sandbox/build/audit steps, 64 page GET readbacks among 97 real HTTP checks, 22 browser groups, 21 search responsive and 9 home header groups. Two old socket tests are excluded, not counted. Keep wide-header failure and tool diagnostics. Full private preflight and production remain unrun.
- Preview 4203 is dedicated static-only; preserve 4191/A11, 4201/A13, 4202/A14 and selected A8 CMS artifact. Source changes require new complete release gates before CMS/cloud activation. Company facts, complete CMS, A12, notification/tracking/org/PG/SSO/retention/domain/ICP/TLS/cloud and full A/B/C/D remain open.

### Public Keyboard and Dialogs (P1 UI / A16 Static Local Acceptance)

- Docker remains deferred; do not inspect/recover it or bypass the unresolved A12 lease. A16 is public static UI, not private service or deployment acceptance.
- `accessibility-core.js` holds immutable zh/en/ru control copy. `public-accessibility.js` owns six native dialogs, single-modal scroll ownership, cancel/close/opener restoration and route focus. Keep native showModal isolation; the first/last Tab compatibility rule only handles embedded-host boundaries. Closing an inactive surface must not unlock another modal.
- Language selection and the assistant are nonmodal. Use controls/expanded and hidden/inert, scoped message logs, explicit labels and existing Lucide icons. Do not introduce a second inquiry engine, storage or AI/backend claim. Opening/closing must preserve relevant drafts; redacted browser input content is not verified readback.
- `build-public-accessibility.mjs` localizes 64 root/entity documents, native media triggers and physical-path skip links. Main wrapping must retain all entity/navigation/SEO semantics. Original history, imagery and catalog IDs are unchanged; company and policy bodies still require approval.
- Consent clearance derives from the visible banner height without accepting consent. Verify actual pointer hit targets, not only locator visibility; a banner can cover the footer. Keep focus-visible and reduced-motion behavior scoped. Legal heading translation is not full legal policy translation or compliance certification.
- A16 evidence: `outputs/upgrade-logs/2026-10-08-public-accessibility`; 62 actual static tests (9 new), 13 native static gates, 64 page GET readbacks among 97 HTTP requests, 35 actual browser groups and 18 responsive groups. Two old socket tests are excluded, not counted. Preserve JSON-LD/missing-test-target, host-boundary, consent-overlap and tooling diagnostics. No OS screen-reader/device/browser certification or full private preflight.
- Preview 4204 and `2026.10.08-accessibility-v1` identify only the isolated static candidate. Preserve 4191/A11, 4201/A13, 4202/A14, 4203/A15, selected A8 CMS, ERP and finance. Full A/B/C/D, A12, complete CMS/fact approval/production identity/PG/SSO/notifications/tracking/retention/domain/ICP/TLS/cloud remain open.

### Procurement FAQ (D02 / P2 / A17 Static Local Acceptance)

- Docker remains deferred. A17 runs only reviewed public static code in the native offline sandbox; do not inspect/recover Docker or bypass A12. No private backend/image/ERP/CMS acceptance or deployment is implied.
- content/faqs.json maps eight existing answers: two catalog-copy and six insight FAQ entries. faq-core.js validates exact fields, immutable trilingual source resolution, canonical products and topic intersections. Do not duplicate answers, scrape arbitrary DOM/private records, infer approvals or silently remap reordered guide questions.
- faq-ui.js reuses existing navigation and inquiry/RFQ/sample engines, q/product/topic URL restoration and native details. Global question IDs/anchors use question- to avoid hidden-form collisions. Search v2 includes 25 public records; the four-source legacy envelope remains compatible at 17. No new customer storage, API, CRM or AI service.
- build-faq-pages.mjs produces /en|zh|ru/faq/ and localizes entries across 67 root/entity documents. Use independent manifest feature versions; rebuild generated catalog-data/content-index, not manual seed edits. Keep unknown physical routes 404, canonical redirects 301 and query/HEAD/405 semantics.
- Reviewer is unknown, review is pending, generic FAQ dates are not fabricated. Use noindex, exclude sitemap and WebPage schema. A local centralized FAQ is not technical approval or an authorized AI knowledge base; D02/P2 and complete A/B/C/D remain partial.
- A17 evidence: outputs/upgrade-logs/2026-10-08-procurement-faq; 71 static tests, 14 gates, 113 HTTP requests/67 page byte readbacks, 26 browser and 15 responsive groups. Preserve first anchor-collision failure and incorrect AND-test expectation. Two old socket tests and full private preflight are not counted/run.
- Existing private startup/README changes and new runtime-config source/tests were encountered and retained, not authored/tested by A17. Snapshot current identities before work and preserve newer unrelated changes rather than forcing A16 hashes.
- Preview 4205 is static-only faq-v1. Preserve prior previews, selected CMS, ERP/finance/routes/data and old archives. Production org/PG/SSO/notifications/tracking/retention, factual/legal review, full CMS/A12, ICP/TLS/domain/cloud remain open; no Git or APK/DMG release is implied.
- Late A17 visual review found the mobile assistant over the FAQ query's right edge. FAQ-scoped CSS now uses bottom placement and an upward, consent-aware bounded panel; retain the assistant and other-page placement. Verify actual elementFromPoint query/select/button targets and panel bounds, not only document overflow. Keep the initial A17 ZIP/screenshots as a checkpoint; refined evidence is under 2026-10-08-procurement-faq-refined and the Refined-local desktop package. The embedded browser can crop a wide bitmap despite a larger DOM override; do not call that bitmap a complete desktop screenshot or relabel it as a layout failure/pass.

### Homepage Procurement (P0/A05 Partial / A18)

- Docker remains deferred. A18 is an isolated public static increment; no private image/ERP/CMS execution, unresolved-lease bypass or production migration.
- home-procurement-core.js is the shared plain zh/en/ru copy and featured-product renderer. data-home-copy has one translation owner, never data-i in parallel. Other existing languages explicitly fall back to English for this increment. build-home-procurement localizes the same hooks across all physical documents.
- Featured cards use canonical catalog products with homepage=true and the existing ProductPage renderer. Preserve mediaRole labels and native physical product links. The materials technical module remains in the product centre; a factory reference is not a product sample. No new quotation/submission/storage engine or automatic RFQ line addition.
- Removed proof/advantage claims are replaced with buyer requirements, not fabricated approval. Only hero, product heading, application introduction, international brief and pre-order items are governed. Legacy global statistics, service commitments, company/history/certifications/patents, partners and public legacy payloads remain pending; A05 is NOT complete. Keep all original company milestones and the detailed Review-Ledger.md.
- Verify actual child bounds and button wrapping at 320px Russian; minmax(0,1fr) and min-width:0 must prevent an action from widening its track. Restore the series heading at legacy desktop breakpoints. Keep failed responsive observations and unedited screenshots.
- Evidence: outputs/upgrade-logs/2026-10-08-home-procurement; dedicated static preview 4206. Preserve all earlier artifacts/archives, source dist/client, selected CMS and private runtime code. New source requires a fresh complete release before any CMS/cloud activation. Production integration, notification routing, factual/legal authorization, A12, full A/B/C/D, domain/ICP/TLS/cloud gates remain open.

### Private Publication Review (P0/A05 Partial / A19)

- Docker remains explicitly deferred; no inspection/recovery, A12 bypass or private HTTP/image/ERP/WordPress targets. A19 permits only static native-sandbox execution and pure CMS temporary file-store fixtures. Preview 4207 is static-only, publication-review-v1 and publishable=false; existing preview/CMS selections and business routes remain unchanged.
- scripts/publication-review-core.mjs uses pinned Acorn 8.19.0 plus parse5, never eval, to bind 12 claim groups and conservative full HTML/JS/JSON/media hashes. content/private-review/review.json is private, initially all pending. No inferred owner/approval/validity or fake authorization from synthetic tests.
- Approved records require explicit identities/dates and SHA-bound source/publication-permission files; missing, revoked, expired, drifted, linked or oversized inputs fail closed. Manual attestation is not authenticated approval, verified certification or legal compliance. Evidence is Git-ignored, excluded before content hashing/public copy and must not enter delivery archives.
- preflight:aliyun checks approval before/after quality. preflight:preview only separates pending content from quality, not permission to run deferred private targets. Full quality/private matrices remain unrun. Standalone build:sites is a local artifact, not a publication grant; manual/external upload paths still need independent production enforcement.
- CMS freeze candidateSourceHash and artifactHash. Activation/rollback assess frozen candidate against current authoritative private reviewRoot and require cleared public metadata. Never trust a stale copied approval or old ready flag. Old ready packages require rebuild; current selected releases are not automatically replaced. Draft previews cannot activate.
- public-review-copy.js owns the neutral service badge in zh/en/ru and English fallback for five existing languages. Keep one translation owner; legacy company/history/certifications/partners/service/policy claims remain review-pending, not silently approved or deleted.
- Evidence: outputs/upgrade-logs/2026-10-08-publication-review. Final 108 offline Node groups, 19 bounded steps including three expected denials, 67 static pages/243 public files, 122 real static HTTP requests, 18 responsive/11 browser/five fallback groups. Four socket groups excluded, not counted. Preserve initial fixture/private-directory traversal failures and tooling/history expectation diagnostics. A05 and full A/B/C/D remain partial; no production/domain/Git/APK/DMG release.

### Guided Bag Selection (P1 Partial / A20)

- Docker remains deferred. A20 only uses native offline static gates and pure temporary file fixtures; preserve the A12 unresolved identity and all private/ERP/finance/CMS/runtime state. Preview 4208 is static-only, selection-v1, not an API or publication grant.
- selection-core.js owns strict memory-only requirements and structural ranking using canonical catalogue mappings/options. Selection is a catalogue direction, never a verified load, barrier, certification, availability, price or engineering approval. Only three existing homepage bag series are eligible; all other catalogue entities remain accessible. Do not invent SKUs or include production-reference images as sample candidates.
- selection-view/ui.js reuse current comparison, qState/customization and addRfqProduct. Quantity and unselected specs remain blank; technicalAdvice=true is required. Preserve quote drafts until keep/cancel/new confirmation, guard busy/MAX20 and reset retry identity only on an explicit new intent. No second submission, CRM, storage or price engine.
- Guide state survives language and in-page navigation, not full reload; no load/notes/contact data in URL or persistent storage. Existing RFQ serialization still excludes customization. Other site languages fall back to English for new copy; no-script only offers native product links.
- Three physical locale routes are noindex and excluded from sitemap. build-selection-pages localizes links through all 70 documents and preserves 301/404/HEAD/405. Static output never includes private review, server/admin/CMS/var/evidence or credentials. Actual 12 review groups remain pending after source-hash refresh.
- Verify child bounds, loaded original media, actual Cookie-safe button bottom/centre and no input/action overlap. Scoped overflow-x:clip avoids accidental body scroll containers; a sticky row alone did not solve Russian 320px. Keep initial negative records and incorrect RFQ selector diagnostics.
- Evidence: outputs/upgrade-logs/2026-10-08-guided-selection; 116 offline logic groups/20 bounded steps, CSS-only final rebuild and two focused audits, 70 pages/251 public files/138 static HTTP, 72 responsive and 15 workflow groups plus three-language Cookie checks. Four socket groups and full private quality are unrun. A/B/C/D, real approvals, complete CMS/A12/org/PG/SSO/notifications/tracking/retention/ICP/TLS/domain/cloud remain open. No Git, production or native installer release.

### Company and History Entities (P1 Partial / A21)

- Docker remains explicitly deferred; preserve the unresolved A12 identity and all private ERP/finance/CMS state. Preview 4209 is company-v1 static-only, not deployed, not an inquiry API, and publishable=false. No routing/domain/TLS/cloud changes.
- content/company-history.json is the strict immutable registry for 20 original milestones and all eight existing timeline translations, with legacy-index provenance. company-core/ui share rendering, exact decades and native IDs. build-company-data generates the seed and original foldout; do not edit generated output. Legacy T timeline keys remain compatibility/history text, not rendering authority.
- Six /en|zh|ru/company/ and /company/history/ routes prerender legacy overview text/capabilities/certificates and native history. All are noindex and excluded from sitemap. New UI copy uses English fallback for other languages, while the original timeline keeps eight translations. Menus, filters and submissions still require JS; do not claim full no-script functionality.
- Source review hashes explicitly bind company-history.json to company-profile/company-history/public-content. Any language edit invalidates old review. The user elected to retain company data as pending, not approve it. Original 1987/1991, stage-range discrepancies, workforce/capacity/markets/locations/certifications/first/largest/patent/media claims remain unresolved. No fabricated Organization/founding/approval schema.
- Preserve memory-only RFQ drafts across company/history navigation, native anchors, legacy hash aliases, replaceState language changes and query-free canonical metadata. This UI has no submission/storage/CRM engine. Returning to overview must not carry a milestone anchor into an overview route.
- Test actual visible company headings/entries and direct-parent bounds. Legacy auto-minimum grid tracks clipped 320px; legacy global min-width desktop rules hid the series heading and history link. Scoped company CSS fixes both. Preserve failure observations and earlier candidates, not just overflow checks.
- Evidence: outputs/upgrade-logs/2026-10-09-company-history; 125 offline tests/22 bounded steps plus final CSS-only real rebuild/two audits, 76 pages/263 public files/166 static HTTP, 36 responsive/15 workflows, eight-language history and visible three-language Cookie controls. Four socket/full private quality are unrun. This is not company CMS, factual approval, complete A/B/C/D or production acceptance. Preserve 192 useful source contexts, original media, old archives/previews and pending business configuration.

### Public Procurement Copy and Draft Transfer (P0/A05 Partial / A22)

- Docker remains deferred. Use native offline static gates and approved pure fixtures only; no A12 lease bypass/private HTTP/ERP/CMS/database target, domain/routing or production write. Preview 4210 is public-procurement-v1 static-only and publishable=false, not a business API.
- public-procurement-core.js is the shared owner for 13 workflow fields, six mounted home task cards and assistant copy. data-public-copy and data-assistant-copy/label never compete with data-i. Existing other languages explicitly fall back to English. Native link semantics do not make hash-based tools functional without JavaScript.
- Preserve original HNAV icons/company facts and all legacy enterprise data as review-pending. The custom card goes to the existing quote/customization workflow. MEGA_DATA/buildMegas have no current m1/m2 hooks: keep historical code, do not invent a new menu or report its old data as a visible tested defect.
- The assistant is a local keyword responder, not a live AI/ERP/mail service. Requirements are not approved suitability/load, price, sample availability or delivery. Numeric text does not decide a bag reply; Russian samples use the corresponding neutral copy.
- Explicit Move to inquiry reuses existing form/status/submission. Preserve existing notes, busy or received requests and existing email; reject oversized transcript without silent truncation. Show draft/unsent status, never infer product/quantity/order or submit automatically. Contacts/transcripts remain memory-only.
- A22 evidence: outputs/upgrade-logs/2026-10-09-public-procurement-copy. 135 offline tests, 23 actual bounded steps including the separately executed dedicated audit, 76 pages/265 files/168 static HTTP, 18 responsive/30 browser groups and 3 actual Cookie-time pointer groups. Bottom-edge hit is not independently proved. Browser email inputs are redacted; preservation is source-function fixture evidence, not actual browser value readback. Retain all negative/tool observations and old tests.
- All 12 real review groups remain pending. A05/full A/B/C/D, full CMS/A12/factual approval/production org/PG/SSO/notifications/tracking/retention/backup/ICP/TLS/domain/finance-route/cloud gates remain open. Preserve 197 useful sources, 188 non-target baseline files, original media/history, old archives/previews and private state. No Git or native installer release is implied.

### Browser Storage Notice (P0/A05 Partial / A23)

- Docker remains deferred. Native offline static gates and approved pure file fixtures only; never inspect/recover Docker or bypass A12. Preview 4211 is storage-v1 static-only, not deployed, publishable=false and inquiry API404.
- storage-notice-core/ui own strict version acknowledgement and zh/en/ru technical copy with existing English fallback. Ignore legacy cookie acceptance; only write dongda-storage-notice-v1. Dismissal is not analytics/advertising permission. Never clear selections, salted retry identity, receipts or memory-only drafts as a side effect. Blocked storage stays dismissible in this page and may reappear after reload.
- Reuse the six native dialogs and existing clearance observer, with single data-storage-copy translation ownership. The privacy body is a technical draft: complete policy, retention, processing parties and privacy contact remain pending. Current script inventory has no configured visitor analytics provider; do not add inert optional-consent switches or claim legal compliance.
- Original enterprise figures remain pending per user choice, not approved. Legacy policy/notice source and keys are preserved in before/context. New source invalidates old CMS releases; all 12 real review groups remain pending and production preflight denies before private quality.
- A23 evidence: outputs/upgrade-logs/2026-10-09-storage-notice. 146 offline tests/24 bounded steps, 76 pages/268 public files/171 actual static HTTP, 18 responsive/21 browser flows and zero console warn/error. Four socket/full private matrices are unrun. Preserve locator diagnostic; wide DOM is not a full-width bitmap, dismissal BODY focus is not input-focus restoration or OS accessibility certification.
- Preserve 203 useful sources, 193 non-target baseline files, original logo/media/history, 23 old archives/A15 failed checkpoint, all private state/old previews and unresolved identity. Full A/B/C/D/CMS/A12/facts/privacy/production org/PG/SSO/notifications/tracking/retention/ICP/TLS/domain/finance-route/cloud gates remain open. No DNS, business, Git or installer release.

### Public Navigation and Floating Controls (P0 Partial / A24)

- Docker remains deferred. Only native offline static logic and pure fixtures plus actual static HTTP/browser acceptance are allowed; preserve A12/private/ERP/CMS/finance state. Preview 4212 is navigation-v1 static-only, publishable=false and API404, not deployed.
- Closed ai-widget must not intercept empty-wrapper clicks; pointer-events:none belongs to the wrapper and auto to actual FAB/panel. Back-to-top is horizontally separate and notice-height-aware. Verify centre/bottom hit targets and real clicks, not only bounding rectangles. A23 failure was actual wrapper obstruction, not proof that window.scrollTo is broken.
- Reuse public-accessibility scrollPage/backToTop for instant active-page navigation and explicit heading focus. Preserve anchors, history/replace/no-focus restoration, six dialogs, memory-only drafts and routing. ArrowUp comes from the pinned catalogue build; immutable zh/en/ru labels fall back to English for other existing languages. No second router/storage/submission engine.
- Evidence: outputs/upgrade-logs/2026-10-09-public-navigation. 154 offline tests/25 regular gates plus two separate icon-bootstrap gates, 76 pages/268 files/175 actual static HTTP, 18 notice-visible responsive groups and 17 actual browser workflows. Four socket/full private matrices are unrun. Keep old obstruction, partial run and locator diagnostics; wide DOM is not full-width bitmap proof.
- Preserve 205 useful sources, 194 non-target files, original media/history, 24 old checkpoints/A15 failure and unresolved identity. All 12 claims remain pending per user choice. Full A/B/C/D/CMS/A12/production integration/notification/tracking/approval/retention/ICP/TLS/domain/cloud gates remain open; no Git or native package release.

### Procurement Field Feedback (P1 Partial / A25)

- Docker remains deferred; native offline static/pure fixtures and static HTTP/browser only. Preview4213 is form-feedback-v1, publishable=false and API404, not a deployment or persistent form acceptance. Preserve A12/private/ERP/CMS/finance state.
- form-feedback-core/ui/CSS only present existing validation errors. Reuse catalogue/customization/sample/contact validators and original payload/retry/receipt behavior; no second domain validator, CRM, storage or submission engine. Memory error map holds bounded field IDs/codes/minimum, not personal values.
- textContent, aria-invalid and one owned aria-describedby token; retain existing hint tokens and quote spans. Reattach after language/RFQ rerender, prune removed controls, clear synthetic drafts through UI. Sample edits revalidate existing demand; other specification edits keep original clear/submit-recheck semantics. Missing contact controls fail closed.
- Quote configuration errors precede customization focus. RFQ still uses existing validator/contact order, not necessarily DOM order. New field text uses zh/en/ru and five-language English fallback; legacy generic RFQ status may retain the old locale and is not repaired by this layer.
- Evidence: outputs/upgrade-logs/2026-10-09-form-feedback. 173 offline tests/26 steps, separate19 focused groups,76 pages/271 files/181 staticHTTP,17 browser/20 responsive groups. No valid business submission or email-value browser readback; four socket/full private matrices unrun. Retain ENOSYS, test/locator and ENOSPC failures; actual later screenshot readback is separate evidence.
- Preserve211 useful sources/198 non-target files, original media/history,25 old successful archives/A15 failure and A12 identity. Enterprise facts remain pending per user decision; real case detail/permission reply is absent. All12 review groups and fullA/B/C/D/production gates remain open; no production/domain/Git/installer release.

### General Procurement Status (P1 Partial / A26)

- Docker remains deferred. Static native sandbox/pure fixtures and static HTTP/browser only; preserve A12/private/ERP/CMS/finance. Preview4214 is lead-status-v1, publishable=false/API404, not deployed or persistent submission acceptance.
- lead-status-ui.js binds five existing regions to finite source/key/kind tuples, using existing translation owners and textContent only. Never store contacts/payloads/receipts or add a submission/storage/CRM engine. Raw compatibility text is not retained for language sync. Hidden/removed status cannot revive.
- Language rerenders preserve quote parameter summary errors; explicit valid/reset/product-change/ACK paths clear. Original busy guards, validation/payload/retry/receipt stay. zh/en/ru and existing English fallback do not imply eight-language complete content.
- Original sendLead fingerprints before language/page/timestamp extension. Cross-language retry can retain a key with a changed envelope; A26 fixture proves unchanged legacy behavior, not production idempotency. Resolve with separate service-contract/HTTP acceptance when private targets are permitted.
- Evidence: outputs/upgrade-logs/2026-10-09-lead-status. 191 offline/27 steps,18 focused,76 pages/272 files/183 staticHTTP,17 browser/24 responsive,3 unedited screenshots. Four socket/full private matrices unrun. Keep failed tooling filename/sha266 derivation and rejected patch diagnostics.
- Preserve215 useful sources/204 non-target,original media/history,26 old archives/A15 failure/A12. Enterprise facts and12 claims pending; case permissions/new notification routing absent. FullA/B/C/D/production gates remain open, no production/domain/Git/installer release.

### Public Motion and Reduced Motion (P1 Partial / A27)

- Docker remains deferred; native offline static/pure fixtures plus actual static HTTP/browser only. Preserve A12/private/ERP/CMS/finance. Preview4215 is motion-v1 static-only, publishable=false/API404, not deployed.
- public-motion.js owns one native observer, coalesced RAF refresh, active-page/pruned nodes and weak completed identity. Reuse obs and legacy refresh wrappers; no competing inline observers, per-image timers or inactive carousel parallax. Original media, route history, inputs/submission/retry/receipts and translation declarations remain.
- public-motion.css is visible by default; only scheduled nodes become pending. Reduced/missing/failed IO shows content, live preference never re-hides completed nodes. Keep functional display/position transforms; no animation completion handler may become a business prerequisite. Global reduced-mode CSS turns off transitions/pseudo animations, not private services or consent.
- A27 evidence: outputs/upgrade-logs/2026-10-09-public-motion.205 offline/28 steps,14 final focused,76 pages/274 files/185 staticHTTP,38 browser/18 responsive plus9 separate non-empty global CSS reads. Zero-target entity groups prove route/H1/mode only. Retain12/14 first run, driver parseFloat and wrong-language locator diagnostics. Four socket/full private matrices unrun; P75 web performance unmeasured.
- Preserve220 useful sources/211 non-target,27 old archives/A15 failure/A12,original history/media.89 top-level functions/44 declarations remain SHA-exact.Enterprise/12 claims pending, fullA/B/C/D and production gates open. Temporary media/viewport overrides cleared; no Docker/production/domain/Git/native package release.

### Public Inquiry Retry Identity (P0 Partial / A28 Source Candidate)

- Docker remains deferred. Disk below 256 MiB blocked cloned staging; full build still requires 512 MiB. Do not clear old/shared data or lower the full-build gate. A27 preview4215/dist remains unchanged; no new preview or publication.
- procurement-core prepareRequest and existing rfqRequestKey are the shared four-form retry path. New version2 records contain only UUID/salted demand digest/initial language/fixed public page; no contacts, addresses, notes or design text. Freeze original language, canonical labels and sorted demand; strip new source query/hash input. Digest is not an anonymization claim.
- Legacy key/digest records support exact original replay only, otherwise fail closed. 409/corrupt context does not rotate keys, produce receipt or open email fallback. Explicit new-intent resets clear only their own identity; busy guards apply. Changed business data can create another demand; cross-device/lost-session/blocked-storage reload remains outside guarantees.
- 45 focused offline tests pass in native read-only/no-network/no-write sandbox, including denied storage-removal reset. Tests extract only the real pure RequestError/validateLead AST declarations, never import/run private service/HTTP/SQLite. Memory lost-ACK ledger is not persistence/ERP acceptance. Full site/build/browser/real service gates remain pending.
- Evidence: outputs/upgrade-logs/2026-10-09-inquiry-retries. Preserve221 useful sources/210 non-target baseline files, original media/history,28 old archives/A15 failure/A8/A12. Enterprise/12 reviews remain pending; fullA/B/C/D and production gates stay open. No Docker/production/domain/finance/WordPress.com/userERP/Git/native package changes.

### Inquiry Pending and Receipt State (P0 Partial / A29 Source Candidate)

- Disk remains below full-build threshold; no new preview or artifact activation. Keep Docker/private/ERP/CMS/finance untouched. A27 preview4215 and source dist remain old; no production acceptance.
- setInquiryBusy locks the original inquiry fields and exposes aria-busy through the existing submission control. Missing control, pending or existing receipt cannot submit again. Failure unlocks and preserves draft/identity; source callbacks do not imply actual persistence.
- Product prefill while pending only returns to the original inquiry; queued prefill while pending/after receipt is discarded. Explicit valid product inquiry after receipt uses existing resetInquiry to create a new intent, clears only its own retry/old personal fields and retains other selections. Invalid product cannot reset a receipt. Do not introduce a second CRM/state/submission engine.
- 65 native read-only offline tests (12 new actual-source function fixtures,45 impacted retry/status/core and8 navigation) pass. Mock DOM/callbacks are not browser/HTTP/SQLite/ERP evidence. Full build/site/browser/persistence gates remain pending; no Docker or alternative private execution.
- Evidence: outputs/upgrade-logs/2026-10-09-inquiry-state. Preserve222 selected sources/218 non-target,29 old archives/A15 failure,original media/history/A8/A12. Enterprise/12 reviews pending, fullA/B/C/D and all production gates open; no DNS/finance/WordPress.com/userERP/Git/native package release.

### Inquiry Static Candidate Acceptance (A30)

- Space recovered to about 2 GiB without cleanup. A30 rebuilt the unchanged 222-file A29 source checkpoint in an isolated native offline stage; the full-build minimum remains 512 MiB. Source dist, selected CMS and old previews remain unchanged.
- Preview 4216 includes retry-v2 and A29 inquiry-state fixes, static-only and publishable=false/API404. 238 public logic tests, complete bounded static gates, 76 pages/274 files and 186 actual static HTTP checks passed. Four socket/private groups and full backend matrices remain unrun.
- 14 actual browser flows and 48 zh/en/ru 320/390/768/1440 DOM layout groups passed. Required-field feedback, unconfigured-service no-receipt/unlock, config-to-RFQ, draft/language/reload and selection removal were operated. Real async pending/ACK/retry, persistence, ERP and notification acceptance are still missing.
- Keep initial hidden-honeypot measurement and native AX/DOM locator diagnostics. Phone bitmap is 390px; the simulated 1440 desktop bitmap is host-cropped and is not full-width image evidence. Temporary viewport override and synthetic drafts/selections were cleared.
- Evidence: outputs/upgrade-logs/2026-10-09-inquiry-browser-acceptance; desktop inquiry-static-acceptance. Preserve 222 source identities, 30 old archives, media and A12 identity. No Docker/private/production/domain/Git/native release. Full A/B/C/D and all factual/business/cloud gates remain open.

### Private Company-History CMS Source Candidate (A31)

- Docker stays deferred. No WordPress/PHP/private HTTP/database/ERP target execution or A12 inspection. CMS history v2 is an uninstalled source candidate, not a real migration or complete CMS. Keep enterprise facts and all 12 publication groups pending per the user.
- cms/content-contract.mjs registers the original 11 catalog/industry plus 20 immutable history milestones. Only title/description zh/en/ru are editable. Preserve years/IDs/order, five other translations, provenance and review/noindex gates. Legacy v1 remains catalog-only; reject unknown/duplicate/stale/protected changes. Dedicated exporter bounds advertised/streamed bytes to 1 MiB.
- Reuse existing release-store CAS/complete artifacts/private readonly preview. History uses fixed localized company/history paths; draft or drifted content cannot activate. File-fixture approval is synthetic, not real reviewer acceptance.
- Existing compose directly mounts wordpress/dongda-content. Initial edits there were isolated and this turn's old plugin/admin/seed/installer/v1 verifier restored exactly. Candidate lives in cms/wordpress/history-candidate; build-cms-seed writes only its seed. Never promote mounts or run setup/verifiers while Docker is deferred. Runtime cache/external effects were not observed; restoration is source-byte evidence only.
- Candidate installer guard requires promoted v2/31 seed/helper before setup writes; PHP absent, guard/source syntax and real role/revision/transaction/migration remain unexecuted. Prepared v2 verifier is scripts/verify-cms-history.mjs, not the old v1 command.
- Final native offline/static gates: 251 tests,29 bounded steps. Public274 files are byte-identical to A30, so only reuse A30 publicHTTP/browser/layout evidence for identical output, no new browser count. Existing preview4216 remains static-only,publishable=false/API404; no source-dist or A8 activation.
- Evidence: outputs/upgrade-logs/2026-10-09-cms-history; desktop cms-history-source-candidate. Preserve229 selected sources,215 unchanged baseline,45 original media,30 old archives/A15 failure/A12. Overview/cases/news/documents/media CMS,A12,real ERP/notification/privacy/auth/domain/cloud and fullA/B/C/D remain open. No production/DNS/finance/WordPress.com/userERP/Git/native release.

### Private Editorial CMS Source Candidate (C01 Partial / A32)

- v3 registers44 records: original11 catalog/industry+20 history+3 buyer guides+4 checklists+6 shared resource fields. Only canonical zh/en/ru text can change; preserve structures/IDs/date/edition/product/image mappings/review/noindex policy. Explicit v1/11 andv2/31 cannot ingest new kinds. Reuse insight-core/resource-core validation and downloadText; no second publisher/CRM/renderer.
- release-store composes insights/resources only inside isolated complete builds. New readonly previews resolve actual registry IDs and shared fields through a real containing checklist,never arbitrary paths. Keep draft/publication/drift/CAS/integrity gates. Text review is not technical/company approval or a new technical edition; protected source dates/1.0 versions and formal file-version/upload lifecycle remain unfinished.
- Browser/Node text lengths follow domain schema; PHP limit helper mirrors UTF-16 source intent but has not run. Candidate2026.10.09.2 stays under unmounted history-candidate. Installer checksv3/44/name+limit helpers before setup writes; old mounted plugin/seed/installer/v1 verifier remain exact. v3 verifier is a prepared negative subset only; oldv2 command is historical,not a44-record migration command.
- Candidate editor locks all fields while requests wait,retaining permission locks on success/failure. Actual-source helper fixtures are not browser/WordPress UI proof. Docker/PHP/private HTTP/ERP/database remain deferred; no bypass ofA12. Complete positive migration/save/revision/role/activation/rollback and production still need acceptance.
- First264 tests failed15 due wrong fixture export name; bad fixtures/logs kept. After correction264 passed; after waiting-lock change a separate finalstage passed265 tests/29 bounded steps. Four socket/private groups and complete private quality are unrun. Public274 files/76pages are A30-byte-identical,so only reuse its existing publicHTTP/browser/layout evidence. Preview4216 stays static/API404/publishable=false; no source-dist/A8 activation.
- Evidence:outputs/upgrade-logs/2026-10-09-cms-editorial; desktop cms-editorial-source-candidate. Preserve231 selected sources/218 unchanged baseline/45 media/30 ZIPs/A15/A31 source archives/A12. Enterprise facts and12 review groups staypending. FullCMS/new editions/news/cases/media,A12,realERP/notification/privacy/auth/retention/domain/cloud andfullA/B/C/D remainopen; no production/DNS/finance/WordPress.com/userERP/Git/native release.

### Public Resource Delivery Integrity (B06 Partial / A33)

- resource-delivery-data.mjs uses canonical downloadText/Node crypto to generate twelve full-SHA256 TXT paths and identical old-v1 aliases. Strict resource-delivery-core binds canonical IDs/locale/source date/edition/type/size/digest and immutable same-origin paths. Rebuild catalog-data; do not hand-edit generated files. A fingerprint change is not technical approval or a new edition; a page-only summary change does not change TXT bytes.
- resource-download-ui uses anonymous bounded no-store/no-redirect reads and validates MIME/size/SHA256/exact canonical text before Blob creation. One active operation, 30-second timeout, duplicate-click and page/filter/language cancellation apply. Fixed trilingual errors never leak upstream messages or save invalid bytes. No contacts/storage/CRM engine added. Native/no-script/modified-click paths are not client-verified; download initiation is not completed native filesystem save.
- Scoped resource CSS reserves status space and retains the existing assistant, positioned with the page to avoid download rows. Keep other page styles and source media unchanged. Final actual browser evidence checks consultant open/close and resource-control overlap, not just document overflow.
- Final accepted-layout: 282 offline tests/29 bounded steps,76 pages/288 public files,229 actual static HTTP requests,19 browser operations/30 zh-en-ru 320/390/768/1200/1440 layout groups. Keep earlier two fixture-failure logs, HEAD-header and async/lazy-image tooling diagnostics. Initial281-pass candidate had assistant overlap and its browser overall passed=false; do not relabel it as final CSS evidence. Final full desktop image is1200px; historical1440 image was host-cropped.
- Target worker cache/routing are synthetic contract checks, not actual Aliyun CDN. Local static preview is no-store. Current Content-Length validation assumes identity TXT encoding; require actual identity cloud acceptance or implement/test compressed-length compatibility before enabling gzip/br. Other mutable asset caching, formal edition/history/retention and full cloud/publication gates remain open.
- Preview4218 is final static-only/publishable=false/API404;4217 is historical candidate and4216 unchanged. Source dist/A8/private API remain unactivated. Docker/PHP/WordPress/ERP/database targets stay deferred; no A12 bypass. Evidence:outputs/upgrade-logs/2026-10-09-resource-delivery; desktop resource-delivery-local. Preserve235 source identities/221 non-target/45 media/30 ZIPs/A15/A31/A32/A12. Facts/12 reviews/fullA-B-C-D/production org/notification/auth/TLS/domain/finance-route migration remain open; no production/Git/native release.

### Static Fingerprints and Encoded Delivery (P0/B06 Partial / A34)

- resource-delivery-v2 validates decoded canonical bytes while bounding coded Content-Length. Support single gzip/br/deflate/identity, reject unknown/chained encodings; native Fetch owns decoding. Preserve the twelve TXT bodies/date/1.0 edition and legacy aliases. Downloads are initiated, not proven native filesystem saves.
- build-static-delivery is the final HTML build phase. Reuse parse5/acorn/crypto, fingerprint linked public JS/CSS under full SHA256 paths, add native SRI, preserve original ordering/attributes/aliases. Validate asset-files.json and exact release namespace. Unsupported module/worker/CSS dependencies need explicit build rules, not silent relative-path breakage. Never copy private sources into public output.
- Immutable only exact successful known fingerprint assets/hash TXT in worker/local profile. Old JS/CSS, HTML and metadata no-store; unversioned images revalidate. _headers releases wildcard relies on complete validated build. Actual Aliyun/cache/TLS remain unaccepted; allow compression but no source minification/rewriting, retain old hashes and atomically switch complete artifacts. Changed photos need new identities or proven invalidation.
- staticPreview default remains unchanged. Explicit preview-static --delivery verifies public files before enabling optional loopback compression/cache acceptance; no business API. Keep 301/404/405/HEAD/root containment. Native profile is not a production service recipe or private sandbox workaround.
- Final candidate-03:289 offline tests/30 bounded steps,352 public files/76 main pages/77 HTML,63 assets/4788 local references/4864 ordered references including fonts,546 real public HTTP checks,8 effective browser checks plus retained tooling diagnostic and21 responsive groups. Native Log.entryAdded proves corrupted script blocked; preliminary dev.logs/Script-interception failures retained. Temporary4220 fixture stopped exit0; final4219 stays static-only. Source dist/A8/old previews unchanged as write targets.
- Preserve240 selected sources/226 unchanged baseline/45 media/30 ZIPs/A15/A31-A33 archives/A12 pending identity. Enterprise figures and12 publication groups remain pending per user; full preflight is denied before private quality, not fully passed. Full A/B/C/D, CMS/A12/real ERP/new notification/auth/tracking/retention/ICP/TLS/domain/finance/PWA/cloud remain open. No Docker observation/recovery/private targets/production/DNS/user ERP/finance/WordPress.com/Git/APK/DMG release. Evidence:outputs/upgrade-logs/2026-10-09-static-delivery; desktop static-delivery-local.

### Self-Contained CMS Readonly Preview (C01 Partial / A35)

- cms/preview-document.mjs uses parse5 and pinned css-tree3.2.1, server-only. ReleaseStore reads exact verified artifact bytes with per-read digest, root/file/O_NOFOLLOW and fixed budgets, including catalog routing data. Embed public raster bytes by actual MIME and preserve head/body/noscript CSS order. No current-release/CDN dependency, new private asset route, browser service key or wider iframe sandbox.
- Remove imports/fonts/external references/active elements; never emit Raw CSS values. Discard invalid standalone declarations as browsers do, preserve parsed supports fallback. Historical cement-ton-bag.jpg is PNG; keep its original bytes and true embedded MIME. Signature recognition is not full image decoding/antivirus/user-artwork acceptance. Font fallback is not public pixel-identical typography. Keep output16MiB, CSS512KiB, image8MiB/64/2MiB each and bounded reads.
- Source changes invalidate prior CMS ready-release activation. Drafts cannot activate; preserve complete-artifact/CAS/review/rollback and immutable IDs/44-record contract. Company overview remains outside current CMS candidate. Mounted WordPress plugin/A8/source dist remain unmodified targets; no PHP/WordPress/private HTTP/ERP/database or Docker execution while deferred.
- A35 final300 offline tests/30 bounded steps;18 actual public-content readonly exports,43 static-only HTTP checks,60 trilingual responsive groups. These are synthetic public-content fixtures, not real CMS auth/roles/srcdoc operator acceptance. Public352-file identity must match A34 before reusing its website browser/HTTP evidence. New readonly fixture4221, main preview4219 unchanged. Preserve initial298/6 failures,299-pass-but-real-preview-failed candidate, ENOSPC/temporary source absence/recovery and stale screenshot diagnostics.
- Keep enterprise figures and12 review groups pending. All CMS/ERP/notification/A12/customer-auth/retention/publication/domain/cloud and fullA/B/C/D remain open. Desktop cms-preview-local and evidence outputs/upgrade-logs/2026-10-09-cms-preview-assets contain rollback/source identities; no production/domain/user business/Git/native release.

### Company Profile Content Entity (C01 Partial / A36)

- content/company-profile.json and company-profile-core.js share strict plain-text validation/frozen language projection across Node/browser. Reuse existing about layout,21 eight-language keys,5 capabilities and4 pillars; only102 zh/en/ru paths are CMS-editable. Preserve other languages,brand,facts,periods,image,provenance,IDs,order,pillar tags/codes andlegacy-pending. Seed once with exclusive writes; regenerate company-data/page/seed outputs instead of hand-editing. Keep legacy T/CAPS/ABOUT_PILLARS/CERTS literal declarations unchanged.
- CMS v4 candidate has45 records; explicit v1/v2/v3 remain11/31/44 and cannot ingest profile. Old verifiers pin their historical schemas. Only unmounted history-candidate changes; real PHP/WordPress roles/save/revision/migration/build/activation/rollback are unrun. Native file fixtures and editor helper checks do not prove those flows. Keep 1MiB export and exact-ID company preview; no new CRM,credential,public API or iframe privileges.
- Static overview and buildAbout project the same content. Default three-language static output matches old rendering. Existing five other-language certification undefined values use English fallback without changing original three-language texts or factual approval. Company/public-content review digests include profile; preserve12 pending review records. Source changes invalidate old ready-release activation; drafts cannot activate.
- Final candidate02:312 offline tests/31 bounded native steps,355 public files/76 main pages/64 assets/4864 retained-reference ordering,231 actual static HTTP plus75 public synthetic fixture requests,21 readonly exports,36 trilingual responsive groups/16 browser behavior checks,observed warn/error0. Retain candidate01 and extraction/404-checker/back-expectation/empty-collection diagnostics,not final acceptance. Synthetic renderer fixtures are not complete publishable artifacts or WordPress operator/ERP proof.
- Final preview4227 is static-only/publishable=false;4229 is public synthetic-renderer/readonly fixture. Historical4223/4225 and old previews/source dist/A8 stay unactivated. Preserve246 selected sources/224 unchanged baseline/45 original media/30 ZIPs/A15/A31-A35 archives/A12 pending identity. Evidence outputs/upgrade-logs/2026-10-09-company-profile-cms; desktop company-profile-cms-local. Facts/reviews/fullA-B-C-D/A12/realCMS ERP notification auth/retention/ICP TLS domain finance-PWA migration/cloud remain open. No Docker observation/recovery,private targets,production/DNS/user ERP/finance/WordPress.com/Git/APK/DMG release.

### Same-Origin Font Delivery (P0 Partial / A37)

- Preserve the existing three font families/weights, Unicode subsets and all original font bytes. assets/fonts/manifest.json pins vendor provenance, CSS/font/license hashes and Google repository commit. CSS is generated through css-tree, never hand-edited. Future font changes need a new isolated acquisition/version and complete gated build; do not fetch vendors during build or overwrite content-addressed objects.
- font-delivery.mjs validates exact bounded manifests, regular files, WOFF2 container framing and closed font-face descriptors. Framing is not decoding. Only local-fonts.css has an explicit dependency rule; other CSS/JS dependency guards remain. Keep static-delivery-v1/SRI and legacy compatibility; missing declared fonts fail closed. Exact successful font paths are immutable, not arbitrary font directories or missing files.
- CMS readonly preview discards the dedicated font sheet without reading/trusting it; no larger CSS budgets, font grants, credential exposure or public CMS activation. Fallback typography remains intentional. Changed source invalidates old ready-release activation.
- Final local candidate01:321 offline tests/31 bounded native steps,471 public files/76 main pages/65 JS-CSS assets/110 unmodified WOFF2/4940 ordered references. 231 public-site and244 font actual HTTP checks,21 readonly exports,72 physical trilingual320/390/768/1200 layout groups plus6 readonly groups,110 browser decodes and6 actual platform-font reads passed. Entry/form and scrolling-tab checks do not prove inquiry/ERP submission. Preserve initial network/viewport/screenshot/geometric diagnostics.
- Final preview4231 is static-only/publishable=false;4233 is public synthetic readonly/font instrumentation. Browser temporary settings restored; previous previews/source dist/A8/private state unchanged as write targets. Source context363 identities/237 unchanged baseline,45 media,30 archives/A15/A31-A36/A12 retained. Evidence outputs/upgrade-logs/2026-10-09-local-fonts; desktop self-hosted-fonts-local.
- Target CSP self-hosted-font rule is prepared, not real cloud enforcement. Actual OSS/CDN MIME/cache/compression/CSP/old-session hash retention/China-global performance remain release gates. No regional Web Vitals or completed deployment claim. Facts and12 reviews/fullA-B-C-D/CMS ERP notification auth/retention/A12/domain-cloud/finance-PWA migration remain open. Docker and all private targets stay deferred; no production/DNS/user business/Git/native release.

### Public Product Photograph Inspection (P1 / A38 Local)

- product-inspection-core.js/UI/CSS enhance native physical-detail image anchors using the existing lbx dialog/accessibility owner. Panzoom4.6.2 is an unmodified local registry distribution with MIT/hash provenance; regenerate local Lucide nodes through build-catalog. Do not hand-roll a second gesture/dialog engine, edit original photos or enable private uploads.
- Only canonical sample/customer-example products may open. Preserve exact original bytes, captions and old IDs; production-reference families have no sample/inspection trigger. Quick drawer is unchanged. Product keyboard arrows cannot enter factory mode; factory/case navigation restores legacy mode. Close/retry/navigation retain identity guards and focus; disabling a focused boundary control moves focus to an enabled control.
- Candidate03:333 offline tests/31 bounded native steps,481 public files/76 main pages/69 fingerprinted assets,12 image links/5244 ordered refs;165 actual static HTTP,72 trilingual four-width page layouts,12 viewer groups/72 operated controls and12 image readbacks. One normal reload has198 complete network events/no external failure and console0. Mouse/wheel/keyboard were tested; in-app touch commands are unsupported,so no pinch/physical-phone claim.
- Keep candidate01 assertion failure,candidate02 pre-focus-fix source/archive/browser records,rAF/clip/invalid-route diagnostics. Accepted clips use actual scrollX/scrollY;JPEG1200x900 and390x844. New4239 is static-only/review-required;source dist/A8/old previews/private targets stay unactivated. Source context370/357 unchanged baseline,45 media/110 fonts/30 old ZIPs/A15/A31-A37/A12 retained. Evidence outputs/upgrade-logs/2026-10-09-product-inspection;desktop product-image-inspection-local.
- Company figures and12 reviews remain pending. FullA/B/C/D,realCMS ERP notifications/auth/retention/A12/touch hardware/ICP TLS/domain/finance-PWA/cloud gates are open. Source drift invalidates CMS ready activation. Docker/private targets stay deferred;no production/DNS/user business/Git/APK/DMG release.

#### A38 Latest Candidate04

- Candidate04 is the latest local source and static preview at4241. Only explicit zero heading letter-spacing changed after03;369 source files/68 runtime assets/77 normalized HTML bodies remain exact. Reuse03's333 tests/31steps/behavior evidence explicitly; fresh04 ran21 focused tests/nine bounded steps/full build/165HTTP/twelve three-language four-width viewer groups. Keep the computed-normal assertion diagnostic; zero CSS can compute to normal in this browser.
- The user permits retiring the thirty historical Desktop ZIPs and using latest code. They are no longer upgrade prerequisites; never silently restore them. Their disappearance/reappearance and final hashes are logged. A separate authorized operation moved all30 exact ZIP bytes to a dedicated recoverable Trash folder; no permanent deletion. Historical-Archive-Retirement.json records ownership/destinations. Keep latest selected-source archive, necessary before/after rollback, prior03 checkpoint, useful licenses/code, original media/fonts, A12 identity and independent business records. No Docker/private/production/domain/Git/native release.

### A39 Route Recovery And Deployment Pause Request

- Latest source is A39 candidate03 on A38 candidate04. Guard existing nav, reuse nonindexable recovery copy/SEO, restore exact physical anchors and remove stale dynamic schemas while retaining Organization. Preserve inquiry drafts and original business/media/content. Five existing changes plus one test; 371 selected sources, 365 unchanged baseline. Do not restore removed old ZIP/build caches.
- 342 offline tests/31 bounded native steps and 165 actual local static HTTP checks passed. Complete artifact has481 files/76 main pages/69 fingerprinted assets/5244 ordered refs; original45 media/110 fonts unchanged. Browser route observations are partial, not a completed responsive/history/draft matrix. The user redirected to deployment; do not add features or claim full private/production acceptance.
- On October9 the user confirms ICP filing is still in progress. Fresh public domain HTTP403/HTTPS failure, missing erp A record and CDN-not-open remain blockers. cn-dongda.com still points at the existing ERP/finance host; no routing/DNS/service migration is authorized by private staging. Existing account OAuth is not the future least-privilege production RAM identity.
- Private staging targets exactly two new encrypted/private static archive/manifest objects, never server/CMS source or customer records. Source backup stays local. Require exact ACL, anonymous rejection, complete authenticated readback and preserved live-index/bucket/DNS observations. Keep first timed-out PUT evidence; verified process/key observation precedes separately journaled native multipart, whose completion uses private ACL and forbid-overwrite. Cloud-Staging-Receipt.json is authoritative, not successful local packaging or an individual part.
- Evidence: outputs/upgrade-logs/2026-10-09-route-recovery and 2026-10-09-aliyun-staging. Local preview4243 is static-only/review-required, not a public deployment. Filing/TLS/domain/ERP-finance-PWA migration,12 publication groups, production backend/notifications and all remaining A/B/C/D gates stay open. Docker/private targets remain deferred.
- The user explicitly requests pausing upgrades after this bounded deployment work. Pause the active goal once delivery ends; do not mark the project complete, automatically resume upgrades, enable a public release or schedule a filing retry. Resume only on a new user request.

#### A39 Private Staging Result

- Cloud-Staging-Receipt passed: two exact new objects are private/AES256, four anonymousGET/HEAD403 checks and two full authenticated hashes match. Twelve native multipart MD5s and481 cloud-extracted file identities passed. Journal02 is successful; the original timed-out journal remains failed and preserved. Live index body/size/modification time, bucket ACL/policy absence andDNS observations match; no independent ETag or complete ERP/finance regression claim.
- Source/static archives and necessary rollback remain locally retained; no public website/backend/domain activation occurred. Formal filing/TLS/reviews/production gates remain open. After verified desktop delivery, pause the goal at the user's request and stop upgrades.
