# Cloud backup: one Worker, one KV blob, one phrase — 2026-08-08

Ticket #46. Owner: `staff-engineer`. Binding design for the optional
account-free cloud backup. An engineer implements from this note without
follow-up questions.

## 0. Decision

**Ship an optional cloud backup as a copy of the local data, never as the
primary store.** One Cloudflare Worker plus one KV namespace. One blob per
user. The KV key is the SHA-256 of a recovery phrase that the client
generates once. The client encrypts the payload with AES-GCM before upload;
the server stores ciphertext only. This is a backup, not multi-device sync:
the last write wins, and no merge logic exists anywhere.

Nothing in this design starts before two open tickets close, in this order:

1. **#8 stable item ids.** Verb ids come from the array index today
   (`String(index + 1)` in `src/data/verbData.ts`). A backup written before
   an id remap is corrupted by that remap. No Worker deploys and no upload
   code merges while #8 is open.
2. **#251 whole-app envelope with validated import.** The cloud blob's
   plaintext is exactly the byte output of the #251 export path. #10
   (import validation) landed on its own; #20 was closed as not planned and
   #251 supersedes it; #7 (SRS envelope v2) already landed. Note that the
   snapshot half of #20 is not carried by #251.

#24 (CSP) is closed. The CSP lives in `index.html:22` as a meta tag with
`connect-src 'self'`. The Worker origin is added to that directive in the
same PR that ships the upload code, not before (section 6).

Ticket #46 asks for a `connect-src` placeholder comment on #24. That is
deliberately NOT done: #24 is already closed, and widening or
pre-annotating `connect-src` before any code calls the Worker adds risk
with no benefit. The directive is edited in the upload PR instead (section
6). This is a knowing deviation from #46's wording, not an oversight.

## 1. What the app does today

- Export/import already exists: `Settings.tsx:61-92` downloads
  `exportData()` and feeds files to `importData()`. `exportData()`
  (`useSrsProgress.ts:305-307`) returns the SRS store only, as a
  `{version: 2, items}` envelope. #251 widens this to the whole app.
- Import validates structurally and rejects garbage without touching state
  (`parseImportedProgress`, `useSrsProgress.ts:97-151`). Restore from cloud
  reuses this path unchanged.
- The settings store is versioned as of #240; the SRS store is versioned
  (`STORAGE_VERSION = 2`). Both migrate on read. A restored old backup goes
  through the same migration, which is why restore costs no new code.
- The CSP meta tag is partly pinned by `src/test/csp-meta.test.ts`
  (`qa`-owned), which today asserts script-src, worker-src, form-action and
  tag ordering. Neither it nor `e2e/csp-violations.spec.ts` asserts anything
  about `connect-src`, so widening that directive would currently fail no
  test. The upload PR must ADD a `connect-src` assertion to
  `csp-meta.test.ts` (section 10, item 7).

## 2. The recovery phrase

- **Generation:** 8 words drawn with `crypto.getRandomValues` from the EFF
  large wordlist (7,776 words), joined by single spaces, lowercase. That is
  8 × log2(7776) ≈ 103 bits of entropy — brute force against either the KV
  key or the encryption key is not a realistic threat.
- **Wordlist shipping:** the list (~62 KB raw) lives in
  `src/lib/backup/wordlist.ts` and loads via dynamic `import()` only when
  the user enables cloud backup. It never enters the main bundle.
- **Normalization** before any derivation: Unicode NFKC, lowercase, trim,
  collapse internal whitespace to single spaces. Applied identically at
  generation and at restore entry.
- **Storage:** the phrase is stored locally in its own key,
  `ordboj-recovery-phrase`, as `{version: 1, phrase}`. Settings shows it
  again on demand. This is deliberate and safe under the threat model: the
  phrase defends against the server and the network, not against someone
  with access to this browser profile — that person already has the
  plaintext progress in `localStorage`. Auto-backup is impossible without
  local key material, so we store it.
- **Exclusion rule (binding constraint on #251):** the whole-app envelope
  enumerates its keys explicitly and must NOT include
  `ordboj-recovery-phrase`. The phrase is a device-local credential;
  restoring an old backup must never overwrite the current phrase.
- **Restore onto a device with no phrase:** the envelope carries the
  settings store but not the phrase. After a restore on a fresh browser
  `cloudBackupEnabled` can be true with no `ordboj-recovery-phrase` present.
  In that state the auto-backup timer must not run and must not generate a
  phrase; Settings shows "Cloud backup is off on this device — enter or
  create a recovery phrase to turn it back on."
- **Rotation:** generate a new phrase, upload under the new key, then
  `DELETE` the old key. No re-keying of an existing blob.

## 3. Blob format and crypto

Derivations from the normalized UTF-8 phrase:

- **Master secret** = PBKDF2-HMAC-SHA256 over the normalized phrase, 600,000
  iterations (OWASP 2023 figure), with the FIXED salt
  `SHA-256("ordboj-backup-kdf-v1")`, output 256 bits. Fixed rather than
  random because both derived values below must be reproducible from the
  phrase alone. Derive once per session and cache in memory; never
  recompute per upload.
  - **KV key** = lowercase hex of `HKDF-SHA256(master, info="ordboj-kv-key-v1")`,
    32 bytes (64 hex chars). Domain-separated from the encryption key, and —
    critically — an offline guess now costs a full 600,000-iteration PBKDF2,
    not one SHA-256.
- **Encryption key** = `HKDF-SHA256(master, info="ordboj-enc-v1" || salt)`,
  256 bits, used directly as an AES-GCM key, where `salt` is the random
  16-byte per-upload value in the header. The per-upload salt still gives a
  fresh key per upload without re-running PBKDF2. The KV key name is visible
  to the server, so it is an offline verifier for the phrase — that is
  unavoidable when the server must find the blob from the phrase alone.
  Domain separation plus the 600,000-iteration master derivation is what
  makes each offline guess expensive; without it the published SHA-256 key
  name would reduce the attacker's cost per guess to a single hash and make
  the iteration count meaningless.
- **Plaintext** = the #251 export JSON (compact, not pretty-printed),
  gzip-compressed with the native `CompressionStream('gzip')`. If
  `CompressionStream` or `DecompressionStream` is undefined (pre-16.4
  Safari), the cloud backup section renders as "not supported in this
  browser" and local export remains. No uncompressed fallback path ships.
- **Blob layout** (binary, total overhead 33 bytes):
  bytes 0–3 magic `OBK1` · byte 4 flags (bit 0 = gzip, always 1 today) ·
  bytes 5–20 salt (16) · bytes 21–32 IV (12, fresh random per upload) ·
  bytes 33+ AES-GCM ciphertext. No AAD.

A wrong phrase at restore hashes to a different KV key and surfaces as 404
("no backup found"), never as a decrypt failure. A GCM auth failure
therefore means a corrupted or foreign blob and gets its own message
(section 8).

## 4. Worker API

New top-level directory `workers/backup/` (Worker source plus
`wrangler.jsonc`), outside the Vite build. Worker name `ordboj-backup`, KV
namespace binding `ORDBOJ_BACKUPS`.

- `PUT /blob/:key` — body `application/octet-stream`. 204 on success.
- `GET /blob/:key` — the blob, or 404.
- `DELETE /blob/:key` — 204. Backs the "Remove cloud backup" button and
  phrase rotation.
- `:key` must match `^[0-9a-f]{64}$`; anything else is 400 before any KV
  call.
- **Size cap 1,048,576 bytes (1 MiB)**, checked against `Content-Length`
  and again against the actual body; over cap is 413. Headroom is real: a
  full future table (~1,537 verbs plus particle items, call it 2,000 SRS
  entries) is under 400 KB as compact JSON and under 50 KB after gzip —
  more than 20× margin.
- **Rate limit:** Workers Rate Limiting binding, split by method to fit the
  KV free tier's 1,000 writes/day. `GET`/`DELETE` `{limit: 10, period: 60}`
  per client IP. `PUT` `{limit: 2, period: 3600}` per client IP — at most 48
  writes/day from one IP, so roughly 20 hostile IPs are needed to reach the
  free write quota instead of one. `PUT` to a key with no existing blob is
  additionally limited to 1 per hour per IP, so creating new blobs is far
  more expensive than refreshing an existing one. Residual risk: a
  distributed attacker across many IPs can still exhaust the shared free
  write quota; the failure mode is a failed upload, and the local copy is
  untouched. The same per-IP budget also throttles benign users who share an
  IP — a home router, an office NAT, or mobile carrier CGNAT. Two people on
  one IP contend for 2 PUTs/hour, and because rotation (section 2) is itself
  a new-key PUT, two rotations inside an hour are rejected. The failure
  surfaces only as "Last attempt failed" in Settings. Accepted for hobby
  scale; if real users hit it, move the PUT limiter key from raw IP to
  `IP + KV-key-prefix` so distinct blobs on one IP do not contend.
- **CORS:** allowlist from an `ALLOWED_ORIGINS` env var — the production
  site origin plus `http://localhost:8080` for dev. `devops` fills the
  production origin at deploy time. OPTIONS preflight allows
  PUT/GET/DELETE and `content-type`, `Access-Control-Max-Age: 86400`.
- No auth, no user table, no email, no cookies, no logging of keys or
  bodies. KV metadata `{updatedAt}` on each write; no TTL — backups do not
  expire.
- **Toolchain integration (do this in the same PR as the Worker source).**
  `npm run typecheck` is `tsc --noEmit -p tsconfig.app.json`, whose
  `include` is `["src"]`, so Worker code is not typechecked by default. Add
  `tsconfig.worker.json` covering `workers/**` with
  `@cloudflare/workers-types`, register it under `references` in
  `tsconfig.json`, and extend the `typecheck` script to run it.
  `npm run lint` is `eslint .`, and the `ordboj/app` block matches
  `**/*.{ts,tsx}` with `globals.browser` plus the React, react-hooks and
  jsx-a11y presets, all wrong for Workers-runtime code; add a dedicated
  `ordboj/worker` flat-config block for `workers/**/*.ts` using
  `globals.serviceworker` and no React plugins. `npm run lint` runs
  `--max-warnings 20` against exactly 20 pre-existing warnings, so the
  Worker files must land at zero new warnings. `prettier --check .` already
  covers `workers/**`; no change needed there.

## 5. Client behavior

New module `src/lib/backup/` (wordlist, crypto, upload/restore client).

- **Triggers, and the write budget.** KV free tier allows 1,000 writes/day
  globally, so writes are budgeted client-side, never per answer:
  1. Explicit "Back up now" button in Settings. Always available once a
     phrase exists.
  2. Optional automatic backup, toggle default **off**. When on: a single
     `setTimeout` fires 60 seconds after the first `recordAnswer` of the
     browser session, guarded by a module-level once-per-session flag. If
     the tab closes before the timer fires, this session is skipped and the
     next session catches up. No upload on `pagehide`/`sendBeacon` — bodies
     can exceed the 64 KB keepalive limit and the write budget does not
     need it.
- **Failure is silent and harmless.** Upload runs from the already-persisted
  `localStorage` state; a failed or interrupted PUT changes nothing locally.
  No retry loop; the outcome (`lastCloudBackupAt`, last result) is recorded
  in the settings store and shown only in Settings as "Last cloud backup:
  …" / "Last attempt failed". No toast, no banner, no blocking UI anywhere
  in the practice flow. The settings store is versioned (#240). Adding
  `cloudBackupEnabled`, `lastCloudBackupAt` and `lastCloudBackupResult` is a
  stored-data-shape change: it needs a settings-store version bump with a
  forward migration that defaults the new fields, and the human's approval
  before merge, per CLAUDE.md.
- **Master key caching.** The master PBKDF2 derivation runs at most once per
  browser session and its result is held in memory only. The auto-backup
  timer must not trigger a fresh 600k derivation mid-session; if no cached
  master exists when the timer fires, skip this session rather than burn
  CPU during practice.
- **Restore is explicit only.** User types the phrase → GET → decrypt →
  gunzip → the #251 import path (validation, migration-on-read). Before
  applying, show a confirmation with the backup's `exportedAt` and item
  count. A restore never runs automatically, not even on first launch. No
  pre-import snapshot ships with this feature — see section 6.
- **Last write wins.** No ETag, no `If-Match`, no conflict detection. Two
  devices sharing one phrase overwrite each other; the UI copy says so
  (section 8). Sync is a separate design review if it is ever wanted.

## 6. Sequencing

| Step | Gate                                                                             |
| ---- | -------------------------------------------------------------------------------- |
| 1    | #8 merged (stable ids) — hard gate for everything below                          |
| 2    | #251 merged (whole-app envelope + validated import, phrase key excluded)         |
| 3    | Worker PR: `workers/backup/**` + deploy (`devops`), reviewed by `staff-engineer` |
| 4    | Client PR: `src/lib/backup/**`, Settings UI, CSP `connect-src` + csp-meta test   |
| 5    | Settings-store version bump: forward migration defaulting the three new fields   |

The CSP edit in step 4 appends the deployed Worker origin (the
`https://ordboj-backup.<subdomain>.workers.dev` URL, or a custom domain if
`devops` prefers) to `connect-src` in `index.html:22`. `index.html` is
`staff-engineer`-owned; the csp-meta test update is `qa`-owned; both land in
the same PR as the upload code so the placeholder never ships unused.

A pre-import snapshot ("undo my restore") is out of scope for this feature.
#20 proposed one and was closed NOT_PLANNED, and no ticket currently owns
it. If a snapshot is wanted later, it needs its own decision note and
ticket; this design does not gate on it and section 8's restore copy does
not promise it.

## 7. Cost

$0 at hobby scale: Workers free tier 100,000 requests/day and KV free tier
1,000 writes/day, 100,000 reads/day, 1 GB storage against a workload of a
few writes per day and one ~50 KB blob per user. The per-IP `PUT` ceiling in
section 4 is 48 writes/day, which is below the shared 1,000/day quota with
room for roughly 20 IPs at that ceiling simultaneously; a single hostile IP
can no longer exhaust the quota alone. If the Cloudflare free plan ever
ends, the feature is removed and local export/import remains the backup
story — that fallback is the deepest reason localStorage stays primary.

## 8. UI copy (exact strings, Settings only)

- On phrase creation: "Write these 8 words down and keep them safe. They
  are the only way to reach your cloud backup — there is no account and no
  reset. If you lose them, the cloud copy is unreachable. Your progress on
  this device is not affected."
- Auto-backup toggle description: "Backs up at most once per session. Your
  progress always stays on this device; the cloud copy is a spare."
- Restore, blob found: "Backup from {date} with {n} items. Restoring
  replaces the progress on this device. This cannot be undone."
- Restore, 404: "No backup found for this phrase. Check the words and their
  order."
- Restore, decrypt/format failure: "A backup was found but could not be
  read. It may be damaged. Your local progress is unchanged."
- Two-device note under the toggle: "This is a backup, not sync. If two
  devices use the same phrase, the newest backup replaces the older one."

All strings are English UI copy; no Swedish is involved in this feature.

## 9. Rejected alternatives

- **Supabase free tier** — pauses/deletes on inactivity; disqualified for
  irreplaceable data. **Firebase Spark** — SDK weight and it pushes auth.
  **Any account system** — the product premise is no accounts. **D1** —
  SQL for one opaque blob is overkill. (All per the ticket; confirmed.)
- **A bare unsalted `SHA-256(phrase)` as the KV key** — rejected: the key
  name is published to the server, so a one-round hash would be a cheap
  offline verifier and would reduce the PBKDF2 work factor to nothing.
  Section 3 derives both values from one slow master secret with HKDF
  domain separation instead.
- **Uncompressed fallback for old Safari** — a second format path forever,
  to serve browsers that lose nothing (local export still works).
- **Upload on pagehide** — unreliable over 64 KB and unnecessary given the
  once-per-session budget.
- **ETag/conflict detection** — sync smuggled into a backup ticket.
- **Turnstile/captcha on the Worker** — rejected for now because the
  tightened `PUT` budget in section 4 caps write abuse; the keyspace
  protects reads only and gives no write-side protection. If the write
  quota is ever exhausted in practice, Turnstile on `PUT` is the first
  escalation.

## 10. Ownership and acceptance

| Part                                                   | Owner             |
| ------------------------------------------------------ | ----------------- |
| This design; crypto/format review; `src/lib/backup/**` | `staff-engineer`  |
| `workers/backup/**`, wrangler config, deploy, env vars | `devops`          |
| Settings UI (phrase display, buttons, toggle, copy)    | `frontend-expert` |
| CSP line in `index.html`                               | `staff-engineer`  |
| csp-meta test update; round-trip and budget tests      | `qa`              |

Acceptance for `qa`, verbatim:

1. Round trip: export → encrypt → gzip → decrypt → import restores an
   identical store, including particle (`pv:`) keys.
2. Wrong phrase produces a different KV key (404 path), never a decrypt
   attempt against the real blob.
3. With auto-backup on and fake timers, a session with 50 answers issues
   exactly one PUT; a second PUT in the same session is impossible.
4. A failed PUT (network error, 413, 429) leaves `localStorage` byte-equal
   to its pre-upload state.
5. Restore of a blob whose envelope predates the current schema passes
   through migration-on-read and lands at the current version.
6. `ordboj-recovery-phrase` never appears inside an exported envelope.
7. The CSP `connect-src` lists exactly `'self'` plus the deployed Worker
   origin, and `csp-meta.test.ts` pins it.
8. Restoring an envelope onto a fresh browser (no `ordboj-recovery-phrase`
   present) leaves auto-backup off, generates no phrase, and shows the
   "enter or create a recovery phrase" message, even if the restored
   settings had `cloudBackupEnabled: true`.
