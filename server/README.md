# DongDa Inquiry Service

Status: single-instance persistent service with recorded local acceptance; the current source includes unfinished attachment/image inspection work. Cloud deployment and actual sales notification integration remain pending. Not a WordPress CMS replacement.

Docker and private HTTP/database/ERP/CMS target execution remain deferred by the user. Service, fixture, integration and full-test commands in this document are reference instructions for an explicitly resumed private acceptance session. Do not start them, recover Docker or bypass the pending private environment while documenting the project. This documentation update ran no service, migration or test; recorded results do not automatically validate the latest source.

The user requires integration with the DongDa document/customer/sales main system. Keep this implementation for local acceptance, raw inquiry reception and rollback, not as a second authoritative production CRM. The main system owns assignees, followups, quotations and order admission. A dedicated fixed-organization intake endpoint and durable receipt idempotency now exist in the isolated main-system candidate; local HTTP acceptance is available, but production is not configured or deployed. Do not point LEADS_WEBHOOK_URL at /api/sales/leads: its input and acknowledgement differ. Approved domain layout: website cn-dongda.com, main system erp.cn-dongda.com. Existing routing/DNS remains unchanged.

See the workspace report `outputs/upgrade-logs/2026-10-08-dongda-integration/Inspection-Report.md`. No main-system integration worker is enabled by this documentation change.

## Runtime And Storage

Tested with Node.js 22.23.0. Requires Node.js >=22.18 for the built-in `node:sqlite` API (still experimental in Node 22; pin and test the runtime before deploying). Uses SQLite WAL, FULL synchronous mode, prepared statements, atomic lead/outbox creation and private file permissions. Database must live on a durable ECS disk or a persistent container volume, outside the public web root. Do not use an FC temporary filesystem or multiple independent SQLite copies. For HA or multiple writers, migrate the repository to a managed relational database before scaling out.

Reference: [Node 22 SQLite documentation](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html).

## Server-Only Configuration

Provide via secret manager or an ignored `.env` file. Never copy secrets to `content/`, browser JS or public OSS.

- `INQUIRY_DB_PATH`: absolute path to the private database.
- `INQUIRY_ADMIN_TOKEN`: at least 32 characters of cryptographically random secret material.
- `INQUIRY_RATE_SALT`: at least 32 random characters for hashing rate-limit buckets.
- `ALLOWED_ORIGINS`: exact comma-separated website origins, e.g. `https://cn-dongda.com,https://www.cn-dongda.com` only after DNS/TLS verification.
- `PORT`: default 4191, binds only to loopback; place behind HTTPS reverse proxy.
- `SALES_RECIPIENT`: business-approved sales destination.
- `LEADS_WEBHOOK_URL`: optional HTTPS notification gateway.
- `LEADS_WEBHOOK_TOKEN`: optional server-to-server gateway authorization.
- `DONGDA_CRM_INTAKE_URL`: optional dedicated `https://erp.cn-dongda.com/api/sales/website-inquiries` endpoint, only after domain and main-system deployment acceptance.
- `DONGDA_CRM_SITE_ID`: stable reviewed site identity, e.g. `dongda-website`.
- `DONGDA_CRM_INTAKE_TOKEN`: dedicated random server-to-server token, >=32 characters, distinct from every staff/admin/gateway credential. Only server configuration stores it.

### Candidate attachment startup wiring (default OFF)

`INQUIRY_UPLOADS_ENABLED` and `DONGDA_CRM_ATTACHMENTS_ENABLED` are independent, server-only flags. Absence, empty or `0` means OFF; only exactly `1` enables the corresponding capability. Other values fail startup. Existing CRM credentials alone never enable uploads or v5 transport. For new uploads, explicitly configure either `UPLOAD_AV_SOCKET` (private absolute Unix socket) or `UPLOAD_AV_PORT` (integer 1–65535, always 127.0.0.1), plus `UPLOAD_IMAGE_SOCKET` (private absolute Unix socket). Do not set both AV transports. HTTP scanner URLs are unsupported; `UPLOAD_AV_URL` is rejected when enabling uploads. The socket owner, private 0700 directory/0600 socket and separate least-privilege services must be accepted during deployment.

Either attachment flag requires valid dedicated HTTPS CRM configuration. New uploads additionally require exact HTTPS website origins. The production entrypoint never sets `localPreview` or `crmAllowLoopback`. Configuration constructs the existing ClamAV/image-inspector adapters only; it neither tests their health nor proves malware safety. Existing upload-session admission performs the actual pinned-image readiness and current AV signature checks before issuing a capability, and upload scanning still fails closed. No scanner policy, file limit, PDF check or retained byte is changed.

Keep new uploads OFF while services or resource/retention acceptance is missing. Transport can be enabled separately to retry previously bound originals while new uploads stay OFF; worker acknowledgements still require every exact attachment id/SHA. The ERP separately requires its explicit `DONGDA_WEBSITE_INTAKE_ATTACHMENTS_ENABLED=1`, authoritative database, reviewed site-to-org binding and current eligible same-org sales employees. No website env, form or payload supplies org/tenant/owner, and this wiring does not select or authorize a salesperson. Review the actual ERP assignment policy with the business owner before activation.

These flags do not expose upload controls, change public runtime endpoints, install routes/nginx/TLS, clear ICP restrictions or configure social-platform OAuth. Apply and validate this candidate against the current source before claiming a deployed website-to-ERP attachment flow.

After private execution is explicitly resumed and the intended configuration/storage are accepted, the service entrypoint is `npm run start:inquiry`. No CRM configuration leaves a separate pending queue. Partial/unsafe CRM configuration prevents startup. Production startup never accepts HTTP/loopback CRM destinations. Notifications remain optional and independent. `crmConfigured` reports configuration presence, not proof of ERP availability or saved inquiries.

## Main-System Intake

The main-system candidate is `work/dongda-main-integration` in the parent workspace, isolated from the user's active main checkout. Its exact POST path accepts a versioned envelope containing site ID, DD receipt, receivedAt, complete normalized payload and SHA-256 canonical JSON digest. Idempotency-Key must equal the DD receipt. Main-system server configuration fixes `DONGDA_WEBSITE_INTAKE_ORG`, `DONGDA_WEBSITE_INTAKE_SITE_ID`, `DONGDA_WEBSITE_INTAKE_TOKEN` and `DONGDA_WEBSITE_INTAKE_FOLLOWUP_HOURS` (1-168). No wildcard org, administrator reuse or browser Cookie/Origin. Only eligible employees in that exact org can receive an inquiry.

The existing main-system sales transaction atomically retains original receipt, lead, inbound message, assignment and history. Response 201/200 requires `{ok:true,persisted:true,siteId,sourceInquiryId,leadId,duplicate}`. Changed content for the same identity returns 409 without overwriting. Customer IDs are not guessed from names; quantity that cannot satisfy the existing sales contract is preserved in the raw message and flagged for review, not silently interpreted. No automatic quotation/order or WhatsApp window is created.

Additive SQLite `crm_deliveries` retains per-inquiry attempts, lease identity, bound site/endpoint, main lead ID and confirmed time. Restart backfills missing queue rows without deleting historical data. Lease tokens prevent stale workers overwriting a newer result. HTTPS only, no redirects, 10-second timeout, bounded ACK parsing, capped backoff; permanent 4xx are blocked for operator review. Missing-owner errors may retry. A lost response retries the same canonical packet; ERP deduplication returns its original lead. Destination/site changes after a send are blocked, even on manual retry. Never change tenant configuration for an existing identity without reconciliation.

Protected detail returns `crm` state and the linked main lead ID. `POST /api/admin/inquiries/DD-.../crm-retry` uses existing bearer/session/Origin/CSRF gates and does not mark success. Synced inquiries, and all browser followups while CRM is configured, cannot be edited as a parallel local CRM. Followups remain authoritative in the main system. Historical local followups are retained.

After explicit resumption of private acceptance, the full workflow includes website `npm test` and `preflight:aliyun`, building packages/API in the isolated main candidate, then `npm run test:main-integration` from the website directory (optional source-root CLI argument). These are not read-only documentation checks and remain deferred. The integration verifier uses synthetic data and loopback only, clears inherited service/database environment variables, verifies actual HTTP reception/readback/lost-ACK recovery/restarts and removes its own temporary directory. It is not a cloud/PostgreSQL/business acceptance certificate.

## API Contract

- `POST /api/inquiries`: JSON, allowlisted Origin, `Idempotency-Key` (16-100 letters/digits/underscore/hyphen). Validates shared `content/inquiry-schema.json`. Returns 201 (new) or 200 (same request): `{ok:true,persisted:true,leadId:"DD-...",duplicate:false}` only after commit.
- Same key and changed business fields: 409. Missing/invalid fields: 422. Spam: 422. Unsupported content type: 415. Legacy body >16 KiB or multi-product RFQ body >64 KiB: 413. Throttled: 429 with Retry-After. Internal storage error: 503, never success.
- `GET /api/admin/inquiries?limit=50`: requires a valid admin session or `Authorization: Bearer ...`. Lists sales summaries, total, global summary and nextCursor. Optional `q`, `status`, `notification` and `cursor` filters. Cursor includes timestamp and ID so tied timestamps do not drop records. `before` remains compatible with the earlier API.
- `GET /api/admin/inquiries/DD-...`: protected full readback with followups and notification state.
- `POST /api/admin/inquiries/DD-.../followups`: protected JSON `{status,owner,note,expectedRevision}`. Status: new/contacted/qualified/quoted/closed. Browser writes require expectedRevision from detail readback; a stale revision returns 409 without replacing data. Bearer integrations retain the earlier optional-revision contract and should also supply expectedRevision.
- `POST /api/admin/inquiries/DD-.../retry`: protected requeue of failed/pending notification. Gateway-accepted or leased notifications are not requeued.
- `GET /api/health`: no customer data. Checks storage connectivity and reports whether notification configuration exists, not proof of delivery.

## Sales Workspace

### Multi-Product RFQ

The public type multi-product-rfq requires 1-20 independent line UUIDs, canonical product IDs, requested product labels, quantity strings in pcs and full validated per-product configuration. Destination is required; requested delivery window is optional. Empty aggregate productId/quantity/quantityUnit/specifications prevent projecting a batch sum into a sales order. Same product with different requirements is retained as separate lines. Shared rfq-list-core validates the browser and the website server; the private main-system v2 contract validates each item independently.

The website queue chooses envelope 2026.10.08-v2 only for this type. Old records keep v1, their identities and retries. One batch still has one DD receipt and one main lead; all lines appear in private detail and staff-scoped source metadata/message. Public success requires the same durable website ACK as single-product reception, not notification or CRM success.

Browser sessionStorage contains only non-personal product selection/line IDs, language, a salted request digest plus UUID key, and the server receipt ID. It must not contain contact/company/email/phone/destination/notes. Reload restores selection and language; contacts must be re-entered. Identical retry after re-entry retains the key. Explicit new inquiry clears the previous receipt/request identity. Failure retains the current form draft; no external email is sent automatically. The legacy public email remains pending replacement and is not a confirmed production notification recipient.

After private acceptance is explicitly resumed, `npm run test:rfq-integration` follows a rebuild of the isolated ERP API and the original v1 HTTP acceptance. It remains deferred here. RFQ needs JavaScript; no-script product content does not make this form functional without scripts.

### Workspace Operations

`/admin` is served by this private service, not by the public static build. It provides search/filter, 20-row pages, customer readback, owner/status updates, followup history and notification requeue. All lead data comes from protected APIs. Customer text uses DOM textContent, not HTML insertion; credentials and customer records are not stored in browser localStorage/sessionStorage. No customer data or admin secret is embedded in the initial HTML. Resources have no-store, noindex and a restrictive CSP.

- `GET /api/admin/session`: reports authentication state; an authenticated session receives its CSRF token and absolute expiry.
- `POST /api/admin/session`: JSON `{token}` with an allowlisted HTTPS Origin. Exchanges the server-only INQUIRY_ADMIN_TOKEN for a random 30-minute HttpOnly/SameSite=Strict/Secure cookie. The submitted token field is immediately cleared. Sessions are in memory, expire absolutely, and are lost on service restart. Five login attempts per minute per direct source address.
- Cookie-authenticated writes require exact Origin and X-CSRF-Token. CORS is not authentication. The same-origin admin frontend needs no credentialed cross-origin CORS. Server-to-server bearer access remains supported.
- `DELETE /api/admin/session`: CSRF-protected logout revokes the server session. An origin-scoped [BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API) also clears rendered records in other open workspace tabs; focus/visibility changes recheck the server session.
- Missing notification configuration disables the requeue control. Requeue means pending, not delivered. A failed/timeout followup keeps the draft; stale-record conflicts require explicit reload and rechecking rather than silent overwrite.

This is currently a single site-administrator role, not individual employee authentication or SSO. Audit actor labels distinguish local preview, site administrator and bearer API; they are not proof of a named human identity. SSO, staff permissions, business-approved notification integration and cloud acceptance remain required. Do not report the full A03 production workflow as complete.

Schema changes are additive: inquiries.revision, followups.actor and supporting indexes. Existing leads, notification entries and notes are retained. Back up the database before migration; never replace it with a pre-upgrade copy to roll back application code. Old actor-less history is explicitly marked as such. Cookie sessions become invalid on restart; reopen and log in again.

Icons are generated locally from pinned Lucide 1.53.0 via `npm run build:admin-icons`; the generated JSON and full ISC/Feather MIT license live under server/admin-ui. Lucide is a build-time dependency only. No icon CDN or third-party script is used in the workspace.

Notification gateway receives `{recipient,inquiry}` with server-side authorization and inquiry ID as its Idempotency-Key. It must return `{accepted:true}` only after durably accepting notification delivery. Outbox state `accepted` means this gateway acceptance, not inbox delivery; actual SMTP/provider delivery and bounce status require the real provider integration. Gateway must deduplicate the key. Timeouts and errors retain the lead and retry with capped backoff. No gateway/error payload or secrets enter public responses or logs.

## Production Acceptance Still Required

### Private Operations Monitoring (A9 / C03 Foundation)

`GET /api/admin/monitoring?days=7|30|90` shares the admin bearer/session/Origin/rate-limit boundary and no-store/noindex headers. No other query fields or repeated days are accepted. The workspace has an Operations tab, refresh/range controls, pending queue ages, UTC daily totals, sanitized failure causes and local stage-progression samples. Switching tabs preserves drafts; failure clears stale results and logout clears aggregates across open tabs. The public static artifact includes neither this UI nor these data.

Receipt counts derive from committed inquiry rows, including existing records, and are never inflated by identical retries. Daily ERP saved and gateway accepted counts use their actual confirmation date, not the receipt cohort. They are not a funnel or conversion rate. First local non-new stage update is not proof of customer response; ERP followup/response data have not been integrated. Historical accepted notifications without dates are shown separately instead of inventing timestamps.

Daily request observations and delivery outcomes start at the retained monitor_meta timestamp; pre-A9 requests/failed attempts cannot be reconstructed. The counters store only fixed statuses/types/codes/date/count/duration. No URL, query, body, address, receipt/customer/ERP identity or provider error text is captured. Keep 90 UTC calendar days of daily aggregate rows, pruned lazily at most hourly when requests/workers run. Business inquiries, followups, gateway/ERP acknowledgements and private backups have separate retention and are never deleted by this policy. Consent-based visitor/source attribution and the public funnel remain disabled, so C03 is not fully complete.

Matching leases prevent stale notification/CRM tasks from overwriting newer results or counting a second acceptance. State and daily delivery outcome commit atomically. Both gateways have a 4 KiB response limit. HTTP/worker counters are best-effort after reception; their failure cannot turn a committed inquiry into a false failed receipt. Capture failures are flagged in the private report; durable infrastructure monitoring and alert dispatch remain unimplemented. Worker recently_observed means a poll within 60 seconds, not service/provider health or delivered notifications.

Existing databases are backed up before the new schema migration using [SQLite VACUUM INTO](https://www.sqlite.org/lang_vacuum.html), a consistent snapshot rather than a direct live-file copy. Backups use a 0700 sibling backups directory, 0600 files, integrity checking and explicit file/directory flushing. A failed backup stops startup; production capacity, restore drills, backup retention/encryption and managed database acceptance remain required. Application rollback leaves the additive schema and current business data intact; never overlay the pre-migration database to roll back code. Paused old workers can leave a new lease token behind until expiry, so stop/wait for workers before code rollback and reconcile provider/ERP receipts before retries.

Tests cover real local HTTP gateway acceptance, failed retry, migrations/backups, strict/private requests, UTC boundaries, stale leases, atomic rollback, capture failure, idempotency, restart and sanitized response. `test:main-integration` and `test:rfq-integration` now verify operational counts and aggregate privacy against the isolated actual ERP HTTP service; no production or external notification writes occur.

After private acceptance is explicitly resumed, check that the chosen fixture port is free before starting a fixture. On macOS, `lsof -nP -iTCP:4195 -sTCP:LISTEN` must show no listener; an error or missing tool is not proof of availability. If occupied, preserve the existing process and choose another explicitly configured free port. Port 4193 belongs to the CMS bridge. The monitoring and admin fixtures below share the suggested port 4195 and must not run concurrently there.

The reference command `PORT=4195 node tests/browser-monitoring-fixture.mjs` is synthetic-only and remains deferred. ERP/gateway results are mocked, SIGUSR1 toggles a read failure, and `MONITOR_FIXTURE_EMPTY=1` starts an empty variant. The fixture contains no real provider credentials and is not a deployable server. Stop only the fixture owned by that acceptance session afterward.

Configure domain/TLS, a per-client edge rate limit and spam challenge at the public ingress, a dedicated service user, least-privilege disk access, secret rotation and operational access policy. Loopback rate limiting intentionally ignores untrusted forwarded headers: the proxy needs a real client-aware edge limit to avoid grouping all clients under one proxy IP. Protect administration behind VPN/SSO; the bearer API is the initial integration boundary, not a completed staff login system.

Back up the live database with a SQLite-safe backup procedure and test restoration. Establish data retention/deletion, monitoring, notifications and regional privacy requirements before accepting real customer data. Disable/redact reverse-proxy access logging for admin query strings (search can contain customer emails). No cloud readiness claim follows from local tests.

After private acceptance is explicitly resumed and port availability is checked, `npm run preview:procurement` serves the built site and API at localhost:4191. It remains deferred here. Port 4190 is reserved by browser/Fetch unsafe-port rules. It injects the endpoint only into local HTML; production runtime-config remains unchanged. Preview stores synthetic test data in ignored var/, never publishes it. `/admin` offers an explicit local test login only in this entrypoint; the server enforces opt-in, HTTP loopback origins and a loopback peer. Production startup never enables this mode. Preview cookies are separately named per port; no admin secret is printed. No notification worker runs in preview.

After explicit resumption and the free-port check above, use the explicit reference command `PORT=4195 node tests/browser-admin-fixture.mjs` for an isolated 25-record synthetic fixture at `http://127.0.0.1:4195/admin`. This command remains deferred. The historical script default is 4193; do not omit `PORT` and collide with the CMS bridge. Its injected fake gateway performs no external requests: initial failure, one failed retry, then gateway acceptance after a second requeue. Stop only the fixture owned by that acceptance session afterward; it removes only its own temporary synthetic database. Never use this fixture or preview entrypoint for a publicly accessible service.
