# Private Upload Scanner

This is a local acceptance component, not a production deployment or a public upload endpoint. The website's default entrypoint and 4191 preview do not enable uploads yet. ERP byte transport and the public form must pass their own acceptance before activation.

The scanner uses the official ClamAV image pinned to `sha256:ebec5bc138401b36ae987caa1a3fa3c3b2a21ed3d51f0bfa5852825e663e67b0`, observed engine 1.5.4. Revalidate the image, vulnerabilities, supported engine version and signatures before a production release. Allocate 4 GiB for this isolated process; do not install it on a small server without a resource review.

Mount clamd.conf and freshclam.conf read-only into `/etc/clamav/`. Keep signature storage private and persistent at `/var/lib/clamav`. Use UTC. Publish the scanning port only to `127.0.0.1` for local acceptance; production should prefer a restricted local Unix socket or isolated loopback access, never a public unauthenticated clamd port. The application sends INSTREAM bytes, not names or paths. Never send customer artwork to a public scanning service.

The policy alerts on encrypted documents and exceeded scan limits. It bounds input at 5 MiB, expanded scan data at 25 MiB, recursion at 8, embedded files at 128 and scan time at 5 seconds. A FOUND result, unknown response, timeout, absent scanner, stale signature timestamp over 48 hours or changed engine identity rejects the upload. A clean verdict is not a guarantee that a file is harmless forever, decodable, technically correct or approved for production. Original downloads are authenticated and attachment-only, not inline execution.

Upload data is stored in private SQLite BLOBs with the original name, byte digest and scan provenance. This preserves transaction/backup consistency for the current single-instance acceptance target. There is no public storage URL, OSS website object or browser file cache. The service imposes three active files and 10 MiB per temporary session, a 200 MiB total retained-byte ceiling and 10,000 retained-session/file limits. Removed unbound files are retired, not physically erased; expired sessions lose access but bytes remain. Production retention/deletion policy, encryption at rest, durable volume, backup/restore, managed relational storage/scale and alerting must be accepted separately. Do not silently purge bound business attachments or bypass capacity errors.

An upload cookie is a 30-minute anonymous draft capability, not a verified customer identity or ERP role. Only its hash and CSRF hash are persisted. It can upload/status/remove its own unbound records, but cannot download file bytes. Bound originals require the existing authenticated admin route until ERP scope-aware transport/view is completed. A naked or expired credential URL is not a download grant. Future customer tracking requires a separately verified identity.

References: [OWASP file uploads](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), [ClamAV protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html), [official Docker deployment](https://docs.clamav.net/manual/Installing/Docker.html).

## Local Reproduction

From the website source root, use the dedicated local Compose project:

`docker compose -p dongda-website-upload-av-local -f server/upload-scanner/compose.local.yml up -d`

Wait for the configured health check and a fresh application VERSION response before `npm run test:private-uploads`. The check uses `clamdscan --config-file=/etc/clamav/clamd.conf --ping=1`, rather than the image's ambiguous localhost TCP check. This is not a production readiness check, and PING alone does not establish signature freshness.

Stop only this project after acceptance:

`docker compose -p dongda-website-upload-av-local -f server/upload-scanner/compose.local.yml stop`

Do not remove signature data, inquiry databases or unrelated CMS/ERP containers.

## PDF Policy and Evidence Limits

`private-artwork-v1-static-pdf` requires a structured pdf-lib 1.17.1 inspection in an isolated Worker before antivirus scanning. Encrypted PDFs, embedded files, scripts, launch/submit/import/rendition actions, RichMedia, XFA and additional actions are rejected. Decoded PDF names are checked, including escaped tokens. Limit documents to 100 pages, 5,000 indirect objects, 20,000 visited nodes and 50 traversal levels. The Worker has a 64 MiB JavaScript old-generation limit, 4 MiB stack and a two-second deadline; this is not a complete process/RSS or decompression budget. The original PDF is not rewritten. Policy identity is stored with each upload; older unvalidated records cannot be rebound or silently marked as checked.

Real-engine tests found that an EICAR marker appended to a PNG was not detected. An earlier PDF probe also appeared undetected, but the final saved test detected its generated embedded-PDF fixture; record each observation rather than generalizing either result. The 68-byte standalone standard test verifies the actual ClamAV adapter. The HTTP embedded-PDF rejection occurs independently before antivirus scanning and must not be reported as an antivirus detection. These tests do not prove all malicious documents are rejected. PNG/JPEG type checks do not yet prove full decoding or remove trailing/private metadata. Broader image validation/CDR, whole-process resource isolation and a production threat review remain release gates before enabling public uploads.
