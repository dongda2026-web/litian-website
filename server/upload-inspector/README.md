# Isolated Private Image Inspector

Local candidate only. The worker has a private broker and Node adapter wired into the private-uploads.mjs SOURCE CANDIDATE. Linux Node adapter/transaction groups and the prior broker image's private-upload HTTP chain passed locally; final-image HTTP/ERP and full preflight remain pending. Public/default uploads remain off. Do not deploy the worker inside the public API process or grant that API access to a Docker socket. Supply-chain approval, production capacity and remaining release gates are required.

## Contract

Run one job as `python image-inspector.py --mime image/png` or `--mime image/jpeg`, with original bytes on stdin and EOF. It reads at most 5 MiB plus one byte. Successful stdout is one bounded JSON object with exactly ok, policy, decoder, mimeType, size, sha256, width, height and frames. No filenames, original bytes or metadata text leave the worker. Exit 0 only means inspection succeeded, not malware/CDR/technical approval.

Input failures return `{ok:false,code:<fixed code>}` with exit 2. Missing supported runtime, resource-limit setup failure or wall timeout uses exit 3. Signal termination, malformed/oversized output, wrong hash/MIME/size/policy, absent worker or parent timeout must fail closed at the future caller. Never fall back to file-signature-only acceptance.

The candidate uses Pillow 12.3.0 for verify and full pixel load. Bounded PNG/JPEG framing rejects concatenated/trailing data; CRC/zlib/segment checks are envelope guards, not custom pixel decoding. PNG compressed data must end exactly, with no unused second stream and a bounded expanded total. Only one static image is accepted. Approved decoder formats, not filenames, determine MIME.

| Candidate limit | Value |
| --- | --- |
| Original bytes | 5 MiB |
| Pixels / largest dimension | 16,000,000 / 8192 |
| PNG chunks / JPEG segments | 4096 |
| Encoded metadata | 512 KiB |
| PNG expanded stream | 128,065,536 bytes; streamed in 64 KiB chunks |
| Worker address space | 256 MiB |
| Worker CPU | 2-second soft / 3-second hard |
| Worker wall/input alarm | 4 seconds; supervisor must independently kill overdue jobs |
| Worker file writes/core dumps | 0 bytes |
| Worker descriptors / process limit | 32 / 1 |

These are technical candidate limits, not approved supply/printing specifications. Original RGB/CMYK/alpha bytes are preserved; no orientation, colour conversion, metadata stripping or derivative rewriting. Some recoverable encodings and allowed private metadata may remain. Keep existing AV, private storage and attachment-only current-owner download protections. PDF whole-process isolation and CDR remain separate open work.

## Local Acceptance

The existing local toolchain image was read-only inspected: Pillow 12.3.0, Python 3.11.15, JPEG codec 6.2, zlib 1.3.1. Local image ID is `sha256:f6200a729f192fb6483f9908910c31b914c7feeb34c374cde1ca0bde11de4e82`. This unrelated installed application image is NOT the production worker image. No packages were downloaded or installed.

The test supervisor uses a 90-second parent alarm and an ephemeral named container with no network, read-only root/source, unprivileged UID/GID 65534, no capabilities, no-new-privileges, 24 PIDs, 384 MiB total memory with no extra swap, one CPU and a 32 MiB noexec/nodev/nosuid scratch tmpfs. The larger test container also holds the fixture-generating parent; individual inspection children still have the enforced 256 MiB address-space cap. Only this directory and the existing public cement-valve-bag.jpg are mounted, read-only. No databases, HOME, credentials, customer files or runtime sockets are mounted.

From the website source root, after confirming the same local image identity and no conflicting owned test container:

```sh
perl -e 'alarm 90; exec @ARGV' docker run --rm \
  --name dongda-image-inspector-a12-test --network none --read-only \
  --user 65534:65534 --cap-drop ALL --security-opt no-new-privileges \
  --pids-limit 24 --memory 384m --memory-swap 384m --cpus 1 \
  --ulimit cpu=30:30 --ulimit fsize=16777216:16777216 --ulimit core=0:0 \
  --tmpfs /scratch:rw,noexec,nodev,nosuid,size=32m,uid=65534,gid=65534 \
  --mount "type=bind,src=$PWD/server/upload-inspector,dst=/tool,readonly" \
  --mount "type=bind,src=$PWD/assets/img/products/cement-valve-bag.jpg,dst=/fixtures/cement-valve-bag.jpg,readonly" \
  --entrypoint /usr/bin/env \
  sha256:f6200a729f192fb6483f9908910c31b914c7feeb34c374cde1ca0bde11de4e82 \
  -i HOME=/scratch TMPDIR=/scratch PATH=/usr/local/bin:/usr/bin:/bin \
  PYTHONDONTWRITEBYTECODE=1 python /tool/test-image-inspector.py
```

20 groups passed on 2026-10-08, including actual limit observations, bounded memory allocation failure, CPU termination, stalled stdin, 12MP PNG/JPEG, exact 16MP RGBA, progressive/CMYK, original public JPEG, framing/CRC/IDAT/expanded-stream rejection and unchanged original hashes. A previous 8MP policy rejected the new phone positive case; that counterexample is retained rather than relabelled a pass.

## Integration and Rollback

image-broker.py uses a private absolute Unix socket in an existing owner-only directory (0700); the socket is 0600 and Linux SO_PEERCRED requires the same non-root UID. Refuse existing paths; never blindly remove a stale socket. Deploy the API/worker as separate least-privilege services with the same dedicated numeric UID and a private shared IPC volume. Socket access is a service capability, not customer identity; do not share the UID or mount with unrelated applications.

Requests are a four-byte big-endian JSON header length (1-256), exact JSON {kind:"ready"} or {kind:"inspect",mimeType,size}, followed by the declared original bytes and write-half EOF. Readiness actually runs the fixed valid PNG through the worker. Responses are four-byte JSON length (1-1024), exact validated proof or fixed error and EOF. Total input deadline is two seconds; malformed/short/extra input rejects. At most two handlers/jobs run; the third fails busy. Worker stdout and stderr are independently limited to 1024 bytes; a six-second supervisor deadline kills/reaps before freeing the slot. The API adapter additionally has a bounded wall deadline, checks exact fields/original identity and sanitizes service errors.

The broker parent has 128 MiB soft / 256 MiB hard address space, 64 FDs, 24 processes and zero file/core writes; each job still enforces its 256 MiB address space and original CPU/input limits. A container/supervisor must independently bound total resources and network/filesystem access. RLIMIT alone does not establish those properties. The local acceptance container has 512 MiB memory/no extra swap, one CPU, 24 PIDs, 32 MiB scratch, no external network/root writes/capabilities and a 90-second parent alarm. No new packages/runtime were installed.

Reproduce broker acceptance with the previous Docker command, changing --name to dongda-image-broker-a12-test, --memory/--memory-swap to 512m, --ulimit cpu to 40:40 and the command to python /tool/test-image-broker.py. No public JPEG fixture mount is needed. On 2026-10-08, 13 groups passed in 8.866 seconds, zero failures/skips. Positive images include RGBA/JPEG/CMYK and an exact-5-MiB fully valid PNG, not tail padding. Failure groups cover framing/input/duplicate keys, corruption, two-slot pressure, stalled input, disconnected clients, worker crashes/malformed proof/output floods, kill/reap, socket ownership and restart.

The new private-uploads candidate requires an injected ImageUploadInspector in config.uploads, preserving the default OFF entrypoint. Internal image_policy/image_inspection are stored atomically with original bytes after checking exact original hash/type/size. They are intentionally not additions to the v5 ERP canonical metadata: old validationPolicy/receipts/digests remain unchanged, and no ERP source is changed. Additive migration invokes the existing pre-a12 private consistent backup first. Legacy bound images remain explicitly legacy; they keep exact original readback/retry metadata, with no fabricated decoding proof. Old unchecked ready images cannot newly bind. New-policy rows without matching proof fail closed. Saved identical uploads can return their original committed result without rerunning an unavailable decoder; new bytes still reject. Readiness failure cannot issue a new draft capability.

The previous source-integration checkpoint did not run Node/HTTP acceptance; keep that frozen record unchanged. In the next local batch, official Node 22.23.0 was prepared outside target execution, and already-installed dependencies were copied into immutable Linux acceptance tooling without npm/pip installation. Adapter/private-upload 30/30 and website 132/132 groups passed under no-network, read-only, unprivileged resource-bounded containers. Full preflight stopped at a missing public directory in the isolated fixture; the fixture closure was corrected, but the final gate has not rerun. Old padded/invalid PNG transaction fixtures remain synthetic-inspector unit tests, not decoding evidence.

The prior minimal image passed actual image/ClamAV/SQLite/HTTP PNG/JPEG/PDF acceptance, including trailing-image 422 before persistence, private image proof, unchanged original bytes, atomic inquiry binding, lost-session denial and restart readback. ClamAV 1.5.4/signature 28147 did not detect the standard test marker appended to a PNG in a raw scanner probe; strict image framing rejected it independently. This is not a clean-AV/CDR certificate. The changed broker image still needs final real HTTP/ERP regression.

Dockerfile.local copies only reviewed installed Pillow 12.3.0 libraries/metadata into the pinned official Python 3.11.15 slim base, not the donor application's code. The trusted parent must verify the donor's full local image ID before every build. This is a local candidate recipe, not a reproducible registry-backed production supply chain. Image b2c2c231860ade80ea0872cc35aae35777de37506e9987db558b811fbfa812ba passed 14 broker groups in 23.984 seconds; the unchanged decoder passed 20 groups in the preceding minimal image. The added group forces thread-start failure, checks connection/slot cleanup, and proves a subsequent handler succeeds. Current evidence is in outputs/upgrade-logs/2026-10-08-image-upload-acceptance.

RLIMIT_NPROC counts all processes/threads under the numeric UID, including cooperating services and test runners. An extra preparing Node parent caused resource pressure in real HTTP acceptance; replacing it with exec allowed the unchanged private-upload script to pass without raising limits. Use a dedicated UID and preserve per-container PID/memory/CPU limits. Production aggregate-UID capacity must be reviewed. Thread-start failure now returns only a fixed failure, closes the connection, releases the acquired slot and does not join an unstarted thread. Do not retain arbitrary old sockets or bypass unavailable inspection.

Docker's Linux environment stopped during ERP acceptance-tooling export. That build was terminated; the new ERP HTTP test and corrected full preflight have not run. No unsandboxed fallback, shared-volume reset/prune, production switch or final runtime promotion was performed. Recovery/cleanup is a remaining local-environment action, not evidence of deployment readiness.

To roll back, keep uploads disabled, preserve evidence and revert only this source integration in a new candidate/build. Retain all business data/originals/provenance, private archive/sync guards and receipts; never restore an old database or reopen uninspected new uploads. Previous independent-worker evidence remains frozen at outputs/upgrade-logs/2026-10-08-image-inspection; new integration evidence is outputs/upgrade-logs/2026-10-08-image-upload-integration. Preview/CMS/ERP and all old archives are unchanged. Full A12/C02 and A/B/C/D remain open; no DNS/finance/cloud/production migration or new APK/DMG.
