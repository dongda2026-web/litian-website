# DongDa Private Content CMS

## Scope

The A8 accepted local WordPress editor has 11 product/industry records and is not a deployed cloud CMS. The current unmounted v4 SOURCE CANDIDATE registers 45 records: the original 11, 20 history milestones, 3 buyer guides, 4 requirement checklists, 6 shared requirement fields and one `dongda-profile` company profile. The profile adds 102 Chinese/English/Russian plain-text paths; company numbers, periods, brand, image, pillar codes/tags and non-managed certification/HTML modules remain protected. No A8 installation, database, plugin mount or selected-artifact migration has been performed. Independent enterprise news/cases, new file editions, formal document/media upload and external client identities remain unimplemented.

History IDs, years, order, five other original translations, provenance and legacy-pending status are immutable. Guides/checklists preserve IDs, structure, product/image mappings, dates, editions and editorial/noindex policy. Text approval is not factual/company/certification approval; the separate publication gate remains authoritative. Explicit v1/v2/v3 exports retain their 11/31/44-record contracts and cannot ingest newer kinds. The v4 contract is bounded to 45 records. Unknown, duplicate and stale records are rejected, with no silent truncation. The dedicated exporter still bounds both advertised and streamed output at 1 MiB.

Docker and private WordPress/HTTP/database/ERP target execution remain deferred by the user. All setup, service, verifier and operator commands below are reference instructions for an explicitly resumed private acceptance session, not instructions to execute during documentation work. Native offline contract/file fixtures and static generation do not prove PHP syntax, real role/revision/save behavior or migration. The recorded candidate acceptance had no host PHP execution; this documentation update did not recheck runtime availability or run tests. Do not run setup or activate the new plugin/seed while private execution remains deferred.

The old plugin directory is directly mounted by the local compose configuration. Its original PHP/admin/seed and v1 installer/verifier are retained. New plugin/editor/installer/seed remain isolated under `wordpress/history-candidate`; `build-cms-seed` writes only that candidate seed. `scripts/verify-cms-editorial.mjs` is a prepared negative-role/field/CAS subset for an accepted v3 installation, not a complete positive-save/migration acceptance or an A8 command. The v2 verifier remains historical. Old verifiers pin their own schemas/counts and do not prove v4 acceptance; no real v4 migration verifier has executed. No mount or runtime is switched here; v1 setup is not a history/editorial/company migration command.

The candidate installer checks promoted name/limit helpers, the `2026.10.09-cms-company-v4` schema and a 45-record seed before installation, option/user writes or activation. This guard is source-reviewed only: PHP and actual WordPress execution are still unverified. Promotion requires a separately accepted private backup and migration; never copy the candidate over the mounted plugin while Docker is deferred.

The editor supports existing article sections/FAQ and shared checklist prompts,not adding arbitrary sections or new news. Native schema text lengths are retained(guide bodies2000 UTF-16 units,FAQ questions200/answers1000,resource text800); browser andNode helpers are testable without private runtime,but PHP parity is still pending. Shared fields preview a real containing checklist. Public TXT still uses the canonical renderer,with complete-artifact identities and existing SHA manifests. Text editing does not issue a new technical edition or update the protected approval/source date. Formal new-edition/dating workflow remains a separate unfinished gate; do not call this complete resource version management.

Frontend rendering remains static HTML/CSS/vanilla JavaScript. WordPress edits permitted text fields only. The Node bridge validates exports against the shared content schemas, builds an isolated clone with launch gates, and serves only the selected complete version. Node 22.23.0 is the recorded tested runtime, not a new result from this documentation update. No public request reads the CMS database. Unpublished CMS entries fall back to existing canonical content; this is staged migration, not a complete single-source CMS conversion.

The materials/construction record remains a technical module, not a separate product page. Its text can be edited/exported, but entity-page preview is explicitly disabled. A dedicated technical-module preview remains outside this initial entity preview implementation.

## Local Runtime

- Official digest-pinned WordPress 7.1.3, PHP 8.3, MariaDB 11.4 images are in `wordpress/compose.yaml`.
- `npm run setup:cms-local` creates only the dedicated local compose project and loopback admin entry at `http://127.0.0.1:4192/wp-admin/admin.php?page=dongda-content`.
- Private identities and environment files are generated under ignored `var/cms/`, mode 0600. Never copy these files, database volumes or application passwords into deliverables. Setup reruns preserve accounts, content and volumes.
- `node --env-file=var/cms/service.env scripts/start-cms.mjs` starts the loopback server bridge on 4193 and the selected static frontend on `http://127.0.0.1:4194/`.
- Current read-only preview source is self-contained: `preview-document.mjs` embeds permitted CSS and raster bytes from the exact verified artifact, with per-read identity checks and fixed size/count limits. It does not depend on the 4191 preview or a CDN. Scripts, forms, active elements, external references and fonts are removed; fallback typography is intentional and does not prove public pixel-identical rendering. This source candidate is not activated by documenting it.
- The 4194 listener demonstrates static content activation only; it does not mount inquiry/admin APIs. Use the existing 4191 entry for synthetic inquiry submission. Production must explicitly mount the validated API/proxy; do not describe 4194 as an accepted ERP/RFQ endpoint.
- `node scripts/verify-local-cms.mjs <report-path>` checks real local WordPress permission, validation, revision and public-isolation behavior. It performs rejected synthetic writes only; run after returning the test summary to the baseline.

## Ownership And Security

Authors save drafts and submit review. Reviewers approve text, view/restore native metadata revisions and activate/roll back complete builds. The dedicated exporter reads export envelopes only. None of these roles can manage plugins/users or act as an ERP employee. Browser requests use native WordPress cookies and REST nonces; no application password or bridge key is sent to browser JavaScript.

IDs,aliases,images,media roles,product/industry mappings,procurement configuration,history years/other translations,guide/checklist structure/dates/editions,review flags andindexing policy remain locked. Content approval does not prove supply capability,certification orimage authorization. Existing `review-pending`/`noindex` restrictions are preserved.

The Node bridge rejects browser Origin requests, anonymous calls, unexpected keys, invalid routes and oversized bodies. WordPress exports and sandboxed previews are private/no-store. The public static bundle excludes CMS/server code, drafts, users, revisions, environment files and databases. Read-only previews use only permitted, validated artifact bytes under existing iframe restrictions; preview rendering grants neither asset access to arbitrary paths nor form/download/script actions. It is not an interactive RFQ test surface.

The website accepts procurement requests; the document/customer/sales main system owns organizations, customers, assignment, follow-up, quotations and orders. Do not add a second formal CRM. The agreed target domains are `cn-dongda.com` for the website and `erp.cn-dongda.com` for ERP, not finance.

## Operator Workflow

Reference workflow after explicit resumption and acceptance of the private environment. The v4 candidate still requires real migration/save/readback/roles/revisions/activation/rollback acceptance; no step below was performed in this documentation update.

1. Edit trilingual text, save a draft and submit review. Stale saves return 409 and do not overwrite the current payload. Reload explicitly after resolving a conflict.
2. Generate a private draft build and inspect its Chinese/English/Russian read-only previews. Draft builds cannot activate and never change the selected public version.
3. Approve content, build approved records, then activate that exact ready version. Each build runs `npm run preflight:aliyun`. Source/catalog changes, concurrent activation and tampered artifacts require a fresh build.
4. Refresh the public product/industry/history/guide/checklist/company entity after an accepted migration and activation. A ready build alone is not activation proof. History preview uses the fixed localized company/history entity; guide/resource IDs resolve through canonical registries and common fields through a real containing checklist. Company preview requires the exact validated `dongda-profile` identity and fixed `/zh|en|ru/company/` page. Preview controls/download links are disabled; it is not public interactive or file-download acceptance.
5. Roll back the previous complete version using the current publishing revision. This changes a version pointer, never overlays old files into new files. CMS content revision restoration is a separate reviewer operation and does not automatically rebuild or activate.

## Persistence And Recovery

WordPress/MariaDB use dedicated named volumes. Do not use compose `down -v`. Static artifacts, gate logs, state and activation events live under the private release directory. Retain the current and previous immutable versions, source hashes and failed-gate evidence.

An exclusive lock prevents overlapping build/activation. After a crash, do not blindly delete `operation.lock`: verify the recorded process and build children are gone, preserve the lock/state/gate evidence, and compare `state.json` with the activation log before controlled recovery. Atomic state replacement is authoritative. If a bridge request times out or event-log append fails, refresh/read back the pointer before retrying; a failed response alone cannot prove the pointer did not change. Filesystem directory fsync and automated crash-lock recovery remain production hardening work.

## Production Prerequisites

This compose project is deliberately local, not a cloud deployment recipe. Production requires a private HTTPS CMS/bridge, least-privilege identities, managed secrets, tested database backups/restore, persistent release storage, retention, monitoring, dependency review, durable filesystem semantics and a controlled OSS/CDN activation strategy. A CMS in WordPress.com additionally requires the appropriate plugin-capable plan and user authorization; connector reauthorization has not been completed.

Do not change DNS, Nginx, finance routes or active ERP links as part of local CMS testing. ERP subdomain/SSO/client acceptance must precede moving the current root route. ICP/TLS, formal ERP organization/assignee, production database and new notification provider remain launch gates.

## Primary References

- [WordPress download and requirements](https://wordpress.org/download/)
- [Official WordPress image](https://hub.docker.com/_/wordpress)
- [WordPress REST authentication](https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/)
- [Revision-enabled metadata](https://developer.wordpress.org/reference/functions/register_meta/)
- [Native post revision metadata](https://developer.wordpress.org/reference/functions/register_post_meta/)
