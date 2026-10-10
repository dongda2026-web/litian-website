# DongDa Private Content CMS

## Scope

The A8 accepted local WordPress editor has11 product/industry records and is not a deployed cloud CMS. v2 added20 history milestones. The current v3 SOURCE CANDIDATE adds3 existing buyer guides,4 existing requirement checklists and6 shared requirement fields,for44 registered records. Only Chinese/English/Russian text is editable. No A8 installation/database/selected-artifact migration has been performed here. Company overview,independent enterprise news/cases,new file editions,formal document/media upload and external client identities remain unimplemented.

History IDs,years,order,five other original translations,provenance and legacy-pending status are immutable. Guides/checklists preserve IDs,structure,product/image mappings,dates,editions and editorial/noindex policy. Text approval is not factual/company/certification approval; the separate publication gate remains authoritative. Explicit v1 catalog-only andv2 history exports remain readable but cannot ingest newer kinds. Unknown,duplicate andstale records are rejected,with no silent truncation. The dedicated exporter still bounds both advertised andstreamed output at1MiB.

Docker and WordPress target execution are deferred by the user. Native offline contract/file fixtures and static generation do not prove PHP syntax, real role/revision/save behavior or migration. PHP is not installed on this host. Do not run setup or activate the new plugin/seed until the separately accepted private environment is available.

The old plugin directory is directly mounted by the local compose configuration. Its original PHP/admin/seed andv1 installer/verifier are therefore retained. New plugin/editor/installer/seed remain isolated under wordpress/history-candidate; build-cms-seed writes only that candidate seed. scripts/verify-cms-editorial.mjs is a prepared negative-role/field/CAS subset for an accepted v3 installation,not a complete positive-save/migration acceptance or an A8 command. The v2 verifier is retained as historical context. No mount or runtime is switched here; v1 setup is not a history/editorial migration command.

The candidate installer checks promoted name/limit helpers,v3 schema and44-record seed before installation,option/user writes oractivation. This guard is source-reviewed only: PHP andactual WordPress execution are still unverified. Promotion requires a separately approved private backup andmigration; never copy the candidate over the mounted plugin while Docker is deferred.

The editor supports existing article sections/FAQ and shared checklist prompts,not adding arbitrary sections or new news. Native schema text lengths are retained(guide bodies2000 UTF-16 units,FAQ questions200/answers1000,resource text800); browser andNode helpers are testable without private runtime,but PHP parity is still pending. Shared fields preview a real containing checklist. Public TXT still uses the canonical renderer,with complete-artifact identities and existing SHA manifests. Text editing does not issue a new technical edition or update the protected approval/source date. Formal new-edition/dating workflow remains a separate unfinished gate; do not call this complete resource version management.

Frontend rendering remains static HTML/CSS/vanilla JavaScript. WordPress edits approved text only. Node 22.23.0 validates the export against the shared catalog/industry schemas, builds an isolated clone with all launch gates, and serves only the selected complete version. No public request reads the CMS database. Unpublished CMS entries fall back to the existing canonical content; this is staged migration, not a complete single-source CMS conversion.

The materials/construction record remains a technical module, not a separate product page. Its text can be edited/exported, but entity-page preview is explicitly disabled. A dedicated technical-module preview remains outside this initial entity preview implementation.

## Local Runtime

- Official digest-pinned WordPress 7.1.3, PHP 8.3, MariaDB 11.4 images are in `wordpress/compose.yaml`.
- `npm run setup:cms-local` creates only the dedicated local compose project and loopback admin entry at `http://127.0.0.1:4192/wp-admin/admin.php?page=dongda-content`.
- Private identities and environment files are generated under ignored `var/cms/`, mode 0600. Never copy these files, database volumes or application passwords into deliverables. Setup reruns preserve accounts, content and volumes.
- `node --env-file=var/cms/service.env scripts/start-cms.mjs` starts the loopback server bridge on 4193 and the selected static frontend on `http://127.0.0.1:4194/`.
- Local preview images/styles use the existing 4191 preview. This origin is a local test configuration, not a production asset origin.
- The 4194 listener demonstrates static content activation only; it does not mount inquiry/admin APIs. Use the existing 4191 entry for synthetic inquiry submission. Production must explicitly mount the validated API/proxy; do not describe 4194 as an accepted ERP/RFQ endpoint.
- `node scripts/verify-local-cms.mjs <report-path>` checks real local WordPress permission, validation, revision and public-isolation behavior. It performs rejected synthetic writes only; run after returning the test summary to the baseline.

## Ownership And Security

Authors save drafts and submit review. Reviewers approve text, view/restore native metadata revisions and activate/roll back complete builds. The dedicated exporter reads export envelopes only. None of these roles can manage plugins/users or act as an ERP employee. Browser requests use native WordPress cookies and REST nonces; no application password or bridge key is sent to browser JavaScript.

IDs,aliases,images,media roles,product/industry mappings,procurement configuration,history years/other translations,guide/checklist structure/dates/editions,review flags andindexing policy remain locked. Content approval does not prove supply capability,certification orimage authorization. Existing `review-pending`/`noindex` restrictions are preserved.

The Node bridge rejects browser Origin requests, anonymous calls, unexpected keys, invalid routes and oversized bodies. WordPress exports and sandboxed previews are private/no-store. The public static bundle excludes CMS/server code, drafts, users, revisions, environment files and databases. Preview strips scripts/events/forms, disables buttons and limits images/styles to the configured origin; it is not an interactive RFQ test surface.

The website accepts procurement requests; the document/customer/sales main system owns organizations, customers, assignment, follow-up, quotations and orders. Do not add a second formal CRM. The agreed target domains are `cn-dongda.com` for the website and `erp.cn-dongda.com` for ERP, not finance.

## Operator Workflow

1. Edit trilingual text, save a draft and submit review. Stale saves return 409 and do not overwrite the current payload. Reload explicitly after resolving a conflict.
2. Generate a private draft build and inspect its Chinese/English/Russian read-only previews. Draft builds cannot activate and never change the selected public version.
3. Approve content, build approved records, then activate that exact ready version. Each build runs `npm run preflight:aliyun`. Source/catalog changes, concurrent activation and tampered artifacts require a fresh build.
4. Refresh the public product/industry/history/guide/checklist entity after an accepted migration andactivation. A ready build alone is not activation proof. History preview uses the fixed localized company/history entity;guide/resource IDs resolve through canonical registries,andcommon fields through a real containing checklist. Preview controls/download links are disabled; it is not a public interactive or file-download acceptance.
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
