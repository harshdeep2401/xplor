# XPLOR — Foundations Plan

> **For the Claude session that picks this up.** This plan strengthens the codebase *before* new
> features (wall clean-up, realism, walkthrough, suggestions v2, AI editor) are built on it. Read §0
> and §1 fully before touching code. Work the workstreams **in order**, one at a time; after each,
> report to the user and **stop** so they can review and commit.
>
> Written 2026-11-12, at the end of the maintainability (6 steps) and quality (phases A–D) work.

---

## 0. Ground rules (non-negotiable)

These come from the user and from incidents in earlier sessions.

1. **Never run any git command** — not `status`, `diff`, `add`, `commit`, `push`, `mv`, nothing. The
   user does all git. Tell them what to commit; don't do it.
2. **Never touch the main database destructively.** Never run `prisma migrate dev`, `migrate reset` or
   `db push` against `server/.env`'s `DATABASE_URL`. Main gets migrations only via
   `npm run db:deploy`, and only after the user says yes in chat.
3. **Tests use the Neon *test* branch** (`server/.env.test`, or `TEST_DATABASE_URL` in CI). Test
   configs refuse to run if it's the same Neon endpoint as `server/.env`. Keep that guard.
4. **Migration commands use Neon's *direct* host** (hostname without `-pooler`). Through the pooler,
   Prisma's session settings (e.g. `schema=`) leak onto pooled connections and break the app. See
   `server/scripts/checkMigrations.ts` for the pattern.
5. **LF line endings everywhere.** The repo has `.gitattributes eol=lf`. When editing a file, write LF
   even if it currently has CRLF.
6. **Ask before decisions that are the user's** (marked **ASK USER** below): product behaviour,
   paid services, deleting data or tables, anything outward-facing. Give a recommendation with the
   question.
7. **Browser checks:** Chrome on the user's PC (`DESKTOP-SV12RMI`) via the Chrome extension, with a
   throwaway user created through the API and its token put in `localStorage`. **Never submit the
   autofilled login** (that's the user's real account). Playwright (`client/e2e`) uses the installed
   Chrome and the test database — prefer it for repeatable checks.
8. **Report honestly.** If something wasn't verified, say so. Don't claim a check passed without
   running it.

## 1. Where things stand (read this, then verify)

**Stack.** Monorepo on Windows. `client/` React 19 + Vite 8 + TS strict (Konva 2D editor,
react-three-fiber 3D editor, Tailwind). `server/` Express 5 + Prisma 6 + Neon Postgres, run with
`tsx`. `Ai-service/` FastAPI + PyTorch (MiT-B3 segmentation), managed with `uv`, runs on the user's
GPU PC behind a Cloudflare tunnel. `contracts/` JSON Schemas (canvas-v2, scene-v1, detection-v1)
shared by all three.

**Read first:** `docs/05-development-guidelines.md` (the rules — code style, validation, errors,
testing, logging, security, migrations, "where things live"), `docs/06-roadmap.md` (product history),
`contracts/README.md`.

**Quality tooling in place.**
- `npm run check` in `client/` and `server/`: typecheck, ESLint (zero warnings), Prettier, tests.
- Server: Vitest unit tests (no DB) + integration tests (`server/tests/integration`, Supertest
  against `createApp()`, Neon test branch). Coverage floors in `server/vitest.config.mts`.
- Client: Vitest + jsdom + React Testing Library + MSW. Coverage floors in `client/vitest.config.js`.
- E2E: Playwright, `client/e2e/` (`npm run e2e`): 11 journeys (auth, 2D drawing/tools, 3D
  suggestions/drag-drop/keys/export). Starts API on :5101 and app on :5273 against the test DB.
- CI (`.github/workflows/ci.yml`): audit, lint, format, typecheck, tests (+ coverage and
  `db:check-migrations` when the `TEST_DATABASE_URL` secret exists), build. **E2E is not in CI yet.**
- Server: Zod validation (`server/schemas/`, `config/env.ts`), errors thrown from `server/errors/`
  and answered by `middleware/errorHandler.ts` as `{ message, code, details? }`, pino logging with
  request ids, helmet, rate limits, upload content sniffing, HS256-only JWT, bcrypt 12.
- Migrations: one baseline (`20261112000000_baseline`) + `20261112120000_lower_default_scale_and_wall_height`.
  `npm run db:check-migrations` proves they build `schema.prisma`.

**Commands to verify the baseline before starting** (all must pass; if not, fix or report first):
```
cd server && npm run check && npm run db:check-migrations
cd client && npm run check && npm run build && npm run e2e
```

**Known open items carried in** (not part of this plan unless listed below):
- The merge to `main` added a migration lowering defaults to 40 px/m and 1.0 m walls; it is applied
  to the test branch, **not yet to the main database** (the user decides when).
- One Playwright run in ~63 failed once and never reproduced. If it reappears, capture the trace.

---

## 2. Workstreams (do them in this order)

Each workstream lists: goal · why · scope · steps · done-when · decisions. Keep `docs/05` current as
you go (it is the rulebook other sessions read).

### F1 — Clear the leftovers (small, unblocks the rest)

**Goal.** Remove confusing legacy so later work builds on one clear model.

**Scope & steps.**
1. **Default wall height — ASK USER.** `main` changed the defaults to **1.0 m walls / 40 px/m**
   (`server/prisma/schema.prisma`, `server/services/converter/defaults.ts`,
   `client/src/editor/canvas/canvasV2.ts`, `client/src/editor/scene/room.ts`). Real rooms are
   2.4–2.8 m, which the realism work will need. Ask whether 1.0 m is intended; if not, a new migration
   + the constants back to sensible values (recommend 2.7 m; keep 40 px/m only if they confirm why).
2. **`_id` on projects.** The server adds `_id` (copy of `id`) to every project
   (`server/controllers/projectController.ts`, `withLegacyId`); only `client/src/pages/Dashboard.tsx`
   reads it. Switch the client to `id`, then remove `_id` from the server and the client `Project`
   type. Update integration tests that assert `_id`.
3. **Legacy canvas.** New projects are created with `canvas: { elements: [] }` (old format). Create
   them with an empty **canvas-v2** instead (`version`, scale, wall height, `walls: []`). Keep *reading*
   legacy canvases (old projects exist) — `normalizeCanvas` / `fromCanvasV2` already handle both.
4. **Unused tables — ASK USER before removing anything.** Never referenced in code: `AuditLog`,
   `EditorSession`, `UserAsset`, `UserSubscription`, `SubscriptionPlan` (also the `Job` queue columns
   `availableAt`, `lockedAt`, `lockExpiresAt`, `lockedBy`, `attempts`, `maxAttempts` — but **F4 will use
   those**, so keep them). Recommend: keep `SubscriptionPlan`/`UserSubscription` if paid plans are
   planned; drop `EditorSession`, `UserAsset`, `AuditLog` (or keep `AuditLog` if F6 adds audit
   logging). Dropping = migration via the direct URL on the test branch; main only via `db:deploy`
   with the user's yes.
5. **Small debris.** `client/src/components/Editor/Toolbar.tsx` takes `exportGLTF` and
   `onImportFromUrl` props it never uses (the page passes them): either surface them in the toolbar or
   remove them end-to-end. `hasRoom={scene.objects.some((o) => o.name === 'Room')}` in
   `client/src/pages/Editor.tsx` refers to a pre-scene-v1 object name — check `EditorCanvas`'s use of
   `hasRoom` and replace with something real (e.g. "has walls") or remove.

**Done when.** All checks green; no `_id`, no `{ elements: [] }` creation, decided tables handled,
`docs/05` and `contracts/README.md` updated where they mention these.

### F2 — One source of types for the contracts

**Goal.** Stop hand-mirroring the JSON-Schema contracts in TypeScript.

**Why.** Today `server/services/converter/types.ts`, `client/src/editor/canvas/canvasV2.ts`,
`client/src/editor/persist/sceneV1.ts` and `client/src/services/apiSchemas.ts` each restate parts of
canvas-v2 / scene-v1 / API shapes by hand. Every contract change risks silent drift.

**Steps.**
1. Generate TS types from `contracts/*.schema.json` (e.g. `json-schema-to-typescript`) into a shared,
   committed file per package (or a small `contracts/ts/` consumed by both via a path alias — pick the
   simplest that works with both tsconfigs and Vite). Add `npm run contracts:types` and a CI check
   that regenerating produces no diff.
2. Replace the hand-written contract types with the generated ones; keep editor-only working types
   (e.g. `EditorElement`) separate — they're not the contract.
3. API response schemas (`client/src/services/apiSchemas.ts`, Zod) stay hand-written but should
   reference the generated types where they mirror a contract.

**Done when.** One generated definition per contract type; CI fails if contracts and types drift.

### F3 — Split the remaining large files

**Goal.** Same layering as the 2D/3D editor splits (see `docs/05` "Where things live": pure logic in
`editor/`, hooks in `pages/<area>/`, rendering in `components/`).

**Targets.**
- `client/src/components/Editor/EditorCanvas.tsx` (~395 lines): pointer selection/raycasting, the
  transform + collision rules (`handleTransform`, `overlapping`, `solidBox`), grid geometry, camera
  framing. Move collision/overlap and grid geometry to pure modules in `client/src/editor/scene/`
  with unit tests; keep the R3F component thin.
- `client/src/pages/Dashboard.tsx` (~415 lines): project list, create-2D/3D modals, floor-plan upload
  flow → hooks in `pages/dashboard/` + components; component tests for the list and modals.
- `client/src/pages/SystemStatus.tsx` (~313) and `client/src/components/Editor/PropertiesPanel.tsx`
  (~260): split if it makes them clearer; not mandatory.

**Rule.** Behaviour unchanged. The Playwright journeys must pass after each move; add a Playwright
journey for the dashboard (create 2D, create 3D, delete, upload floor plan with a mocked AI service
via the API) before splitting `Dashboard.tsx`.

### F4 — Background jobs for floor-plan detection

**Goal.** `POST /api/projects/:id/upload-floor-plan` returns immediately; detection runs in the
background; the client follows the job.

**Why.** Today the upload request waits for the GPU PC (through a tunnel, up to
`AI_SERVICE_TIMEOUT_MS`). Slow or offline AI = hanging requests; no retries.

**Steps.**
1. The `Job` table already has queue columns (`status`, `availableAt`, `lockedAt`, `lockExpiresAt`,
   `lockedBy`, `attempts`, `maxAttempts`, `errorCode`, `errorDetails`). Write a small worker
   (`server/services/jobs/`) that claims jobs with `SELECT … FOR UPDATE SKIP LOCKED` (raw SQL via
   Prisma, in a transaction), runs the detection (`services/aiService.ts` + the existing
   detection-v1 → canvas-v2 bridge from `projectController.uploadFloorPlan`), and records the result.
   Retries with backoff for transport failures; no retry for "detection failed" results; lock
   expiry so a crashed worker's job is picked up again.
2. Run the worker in the server process (started from `server.ts`, not `app.ts`, so tests control it),
   with an env switch to disable it. Make it a separate process later if needed.
3. Upload endpoint: store the image, create the job, return **202** with the job. Keep the response
   shape the client needs.
4. Client (`Dashboard.tsx` upload flow → after F3 its hook): poll `GET /api/jobs/:id` until done, show
   progress, then open the 2D editor with the import result (today it navigates with
   `state.importResult`).
5. Tests: unit-test the claim/retry/expiry logic; integration-test the endpoint (202 + job) and the
   worker against the test DB with `processFloorPlan` mocked; a Playwright journey for upload →
   progress → editor.

**Done when.** No request waits on the AI service; retries and crash recovery are tested.

### F5 — Storage: R2 with private, signed links (local disk for dev/tests)

**Goal.** Uploads (floor plans, imported models/textures, GLB exports) live in Cloudflare R2 (S3
API); local disk remains the dev/test driver.

**Steps.**
1. `server/services/storage.ts` is already the only place that touches files (`putObject`,
   `deleteObject`, `getPublicUrl`, `keyFromPublicUrl`, keys per kind). Turn it into an interface with
   two drivers: local (today's) and R2 (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`).
   Pick by env (`STORAGE_DRIVER=local|r2`; the `R2_*` variables exist in `.env.example` — add them to
   `config/env.ts` with Zod, required when the driver is r2).
2. **Private by default:** store keys (not public URLs) in the DB where possible; serve files through
   short-lived **signed URLs** generated on request for the owner (e.g. a `GET` that returns or
   redirects to a signed URL). The furniture catalog (`server/public/furniture`) stays public/static.
3. **ASK USER** about migrating existing local uploads (script to copy `server/uploads/**` to R2 and
   rewrite stored URLs) vs starting fresh.
4. Tests: driver contract tests run against the local driver and (if credentials are present) a test
   bucket/prefix; integration tests keep using local disk.

**Done when.** No upload is publicly listable or guessable; dev and tests need no cloud account.

### F6 — Auth and account foundations

**Goal.** Close the public-launch security gaps in auth.

**Steps.**
1. **Session in an httpOnly cookie** (Secure, SameSite=Lax/Strict) instead of `localStorage`
   (`client/src/services/session.ts`, `apiClient.ts`, `authService.ts`; server sets/clears the cookie in
   `authController`, `protect` reads it). Add **CSRF protection** (SameSite + Origin/Referer check on
   state-changing requests, or double-submit token). Server-side logout. Keep the 7-day expiry or add
   refresh — recommend a short session + sliding renewal.
2. **Roles:** add `role` (`user` | `admin`) to `User`; restrict `GET /api/system/status` to admins
   (it shows hostname/platform).
3. **Password reset and email verification — ASK USER** which email provider (e.g. Resend, Postmark,
   SES). Token tables with expiry, single use, hashed tokens, rate-limited endpoints.
4. **Delete account:** removes the user, their projects (cascade exists) and their stored files (F5).
5. **ASK USER** to check git history for any committed real `.env`; rotate anything that leaked.
   Remind them the local `JWT_SECRET` is weak (production refuses it).
6. Tests for every flow (integration + Playwright for login/logout/reset).

**Done when.** No token readable by JavaScript; CSRF covered; reset/verify/delete work and are tested.

### F7 — Runtime foundations: shared rate limits, observability

**Steps.**
1. **Rate-limit store:** `express-rate-limit` uses memory (per process). Add an optional Redis store
   (`rate-limit-redis` + e.g. Upstash) chosen by env; memory remains the default for dev/tests.
   **ASK USER** about using a hosted Redis.
2. **Error tracking:** Sentry (or similar — **ASK USER**) in client and server; tag events with the
   request id (`X-Request-Id`, already exposed via CORS); scrub PII; source maps uploaded in CI.
3. **Health:** `/ready` already checks the DB; add AI-service reachability to the System Status page
   only (not to `/ready` — the server must stay ready when the GPU PC is off).
4. **Audit trail (optional):** if `AuditLog` was kept in F1, log security events (login, password
   change, account delete).

### F8 — AI service to the same standard

**Goal.** The Python service gets what the TS packages have, as the base for the upcoming wall
clean-up and evaluation work.

**Steps.**
1. `ruff` (lint + format) and `mypy` or `pyright` (typed config/schemas), wired into `uv run` scripts
   and CI.
2. Tests: extend `Ai-service/tests/` with coverage reporting; test the request validation, auth
   (shared secret), error responses and the detection-v1 output against `contracts/detection-v1.schema.json`.
3. Structured JSON logging with the job id / request id the server sends.
4. **Evaluation harness** (`Ai-service/eval/` exists): a scripted, repeatable run over a labelled set
   of plans producing wall/door/window metrics (count error, precision/recall, IoU) into
   `eval/results/`. This is the yardstick for the next phase (rule-based wall clean-up), so it must be
   in place before that work starts. **ASK USER** for the labelled plans they have.

### F9 — Edit command layer (largest; do after F1–F3)

**Goal.** Every change to a drawing (2D) or scene (3D) is a typed **command** dispatched through one
place. Foundation for reliable undo/redo, the conversational AI editor (agents call the same
commands), and later collaboration.

**Design (propose to the user before building — ASK USER to approve the design).**
- `client/src/editor/commands/`: a discriminated union per editor, e.g. 2D
  `{ type: 'addWall', wall } | { type: 'moveElements', ids, dx, dy } | { type: 'patchElement', id, patch } | …`,
  3D `{ type: 'addObject', … } | { type: 'transform', id, … } | { type: 'setMaterial', … } | …`.
- A pure `apply(state, command) → state` per editor (unit-tested), and history as a list of
  commands/snapshots with undo/redo. Every UI path (mouse tools, keyboard, panels, suggestions)
  dispatches commands instead of calling setters.
- 3D state currently mutates three.js objects in place (see `docs/05`: never inside a `setObjects`
  updater). The command layer should own those mutations so they happen exactly once.
- Commands are serialisable (JSON) and validated (Zod) — an agent or a server can send them.

**Steps.** Introduce for 2D first (its state is plain data), migrate each tool/panel, then 3D. Keep the
Playwright journeys green throughout; add unit tests per command.

**Done when.** No editor state changes outside `apply`; undo/redo is command-based; a test can drive a
whole drawing by dispatching commands only.

### F10 — (Optional, user deferred) E2E in CI

The user deferred "Phase E". Only do this if they ask: a CI job that runs `npm run e2e` with
Playwright's Chromium (`npx playwright install --with-deps chromium`) against the test DB, sharing the
`server-test-database` concurrency group so it never runs alongside the integration tests.

---

## 3. Order, dependencies, sizing

| # | Workstream | Depends on | Size |
|---|---|---|---|
| F1 | Leftovers | — | S |
| F2 | Contract types | F1 | M |
| F3 | Split large files | F1 | M |
| F4 | Background detection jobs | F3 (Dashboard hook) | M |
| F5 | R2 storage + signed URLs | — (before F6 delete-account) | M |
| F6 | Auth & accounts | F5 for file deletion | L |
| F7 | Rate-limit store, observability | — | S–M |
| F8 | AI service quality + eval harness | — (parallel-safe) | M |
| F9 | Edit command layer | F1–F3 | L |
| F10 | E2E in CI (only if asked) | — | S |

F8 can run in parallel with anything (separate service). F5–F7 overlap with deployment; if the user
starts deployment, do them together with it.

## 4. Definition of done for every workstream

- `npm run check` (client and server), `npm run build` (client), `npm run e2e` (client),
  `npm run db:check-migrations` (server, when the schema changed) — all green, and stated in the report.
- New behaviour has tests at the right level (unit for pure logic, integration for endpoints,
  component for UI, Playwright for user journeys). Coverage floors never lowered.
- `docs/05` updated for any new rule or structure; `.env.example` for any new variable;
  `contracts/README.md` for any contract change.
- A short report to the user: what changed, what was verified (with numbers), what wasn't, what to
  commit, decisions needed. Then stop.

## 5. After this plan

The next plan (to be written after F1–F9) covers the product work the user listed:
1. Rule-based **wall clean-up** for detection (merge double lines and collinear splits, Manhattan
   snapping, standard thickness classes with min/max), measured with the F8 harness; then OCR of room
   names and dimension text (automatic scale), then fixtures (toilets, sinks, counters, stairs).
2. **Realism**: tone mapping, HDRI, soft shadows/AO, PBR materials, ceilings and glass, time of day.
3. **3D walkthrough** (first person, dollhouse, guided tour) replacing "VR preview"; optional
   photoreal stills via headless Blender on the GPU PC.
4. **Suggestions v2**: furniture groups + a layout cost/optimiser.
5. **Catalog & content** toward Planner 5D quality (licensing, Draco/KTX2).
6. **Conversational AI editor** on top of the F9 command layer.
