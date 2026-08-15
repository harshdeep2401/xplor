# XPLOR — Development Roadmap & Current Standing

> **Type:** Living planning document. It captures **where the project stands today** and **what to build
> next, in phases**. Unlike the timeless foundational docs (`01`–`05`), this doc has a time dimension and
> will be updated as phases complete. Detailed point-in-time progress lives in
> [`status-reports/`](./status-reports); the newest is
> [`STATUS-REPORT-2026-08-11-post-migration.md`](./status-reports/STATUS-REPORT-2026-08-11-post-migration.md).

- **Last updated:** 2026-08-12
- **Branch:** `integrated-editors`
- **Phase status:** Phase 0 ✅ · Phase 1 ✅ · **Phase 2 ✅ complete** (contracts, converter, editor
  canvas-v2, convert-Job, scene versioning, openings, room floors, canonical-Scene persistence, GLB
  export) · **next: Phase 3** (metering, plan limits, Zod, R2)

---

## 1. Purpose

Give anyone working on XPLOR a single place to understand (a) the current state of the build, (b) the
sequence in which development should proceed, and (c) the reasoning behind that sequence. Read this
alongside `01-master-reference.md` (product), `02-backend-architecture.md` (target architecture),
`03-deployment-and-scalability.md` (deployment), and `04-feature-specification.md` (feature set).

---

## 2. Where We Stand Today

### 2.1 Snapshot

| Layer | State | Notes |
|-------|-------|-------|
| **Frontend** | Working, **100% TypeScript (strict)** | React 19 + Vite; 2D Konva editor + 3D R3F editor; build gates on `tsc`. |
| **Backend API** | Working, **100% TypeScript (strict)**, runs on `tsx` | Express 5 + Prisma; auth, projects, jobs. Boots + serves (verified against Neon + Firebase). |
| **AI service** | Exists, **not run/tested** | FastAPI image-detection (`/process-floor-plan`); boot blocker fixed; Python (out of TS scope). |
| **Database** | Working | Neon Postgres; Prisma migrations apply cleanly. |
| **Infra** | **Foundation in place** | Docker (server + AI) + compose + GitHub Actions CI landed (Phase 1). Storage seam + health endpoints + env-driven config landed (Phase 0). Still no `contracts/`; uploads still local-disk (behind the seam). |

### 2.2 What works (verified by live smoke test)

- Email + Google auth; **persistent session** (route guards + rehydration; no forced re-login).
- Create project; **2D editor** draw/edit (walls, curves, doors, windows, labels), snapping, undo/redo,
  zoom/fit, PNG export, **autosave + reload**.
- **3D editor**: add/move/scale/rotate objects, lights, colour/texture; **drag library assets to scale**;
  **Save to Backend → reopen restores the scene + room size**; back-to-dashboard; room-size (scale)
  readout.
- Dashboard lists projects with 2D/3D differentiation.
- API: boots, health of core routes, ownership/auth enforced (`saveProject` ownership fixed).

### 2.3 What is missing or fragile (the honest gaps)

1. **No 2D→3D deterministic converter.** The 2D and 3D editors are **not connected** — the core value
   prop ("draw → convert → 3D") does not exist yet. *This is the single biggest product gap.*
2. **Core pipeline works.** `canvas-v2` + `scene-v1` schemas validated at the converter boundaries; the 2D
   editor emits `canvas-v2`; **Convert to 3D** persists a versioned `Scene`; the 3D editor renders walls
   (with carved openings) and room floors, loads/saves from the canonical `Scene` (glTF wrapper), and
   re-converting supersedes prior 3D edits. Remaining refinement: **GLB export** (2.4), and eventually a
   real `glTF → scene-v1` serializer so 3D edits become structured scene data (today they're stored as an
   opaque glTF blob inside `Scene.sceneData`).
3. ~~**Portability landmines**~~ — **resolved in Phase 0.** Env-driven CORS, `apiClient` everywhere (no
   hardcoded URLs), `/live` + `/ready`, committed `.env.example` files, and a storage seam
   (`server/services/storage.ts`) now abstracts the still-local-disk uploads.
4. **No automated tests yet.** Docker + CI now exist (Phase 1: typecheck/build/compile gates), but there
   are no unit/integration tests — verification is still CI gates + manual smoke test.
5. **`Scene` lacks `@@unique([projectId, version])`** — required for correct optimistic versioning.
6. **AI service unproven at runtime**; Path B (image → canvas) not wired end-to-end.

---

## 3. Guiding Principles

- **Reliability-first, deterministic core before probabilistic AI** (`01` §1.4). Path A (structured
  editor) is the foundation; Path B (image detection) is additive, later.
- **The scene is canonical; GLB/VR are derived** and regenerable (`01` §3).
- **"Dockerize everything" for zero-rewrite platform shift** (`03` §1) — but Docker is *necessary, not
  sufficient*: storage-off-local-disk and config-from-env are what actually make a platform shift safe.
- **Contracts validated at the boundary; ownership on every route; optimistic scene versioning** (`02`).

---

## 4. The Roadmap (phased)

### Phase 0 — Portability Foundation  ✅ **DONE (2026-08-11)**

**Goal:** the same build artifact runs on any host by changing env only; nothing bakes in ephemeral-disk
or localhost assumptions. Each item is its own small PR.

| # | Step | Key files |
|---|------|-----------|
| 0.1 | CORS allow-list from `CORS_ORIGINS` env (no wildcard) | `server/server.ts` |
| 0.2 | Remove 2D editor's hardcoded `http://localhost:5001` (2 spots) → reuse existing `apiClient` | `client/src/pages/Editor2D.tsx`, `client/src/services/apiClient.ts` |
| 0.3 | Commit `.env.example` for client + server (names only; AI service already has one) | new `client/.env.example`, `server/.env.example` |
| 0.4 | Add `/live` + `/ready` (DB check via `prisma.$queryRaw`), central error handler, JSON 404 | `server/server.ts` |
| 0.5 | Storage seam: one `storage` module (`putObject`/`getPublicUrl`) wrapping today's local-disk write, so the later R2 swap is one file | new `server/services/storage.ts`, `server/middleware/uploadMiddleware.ts` |

**Exit criteria:** client `typecheck && build` green; server `tsc --noEmit` green; `curl /live` and
`/ready` → 200; `grep -r localhost:5001 client/src` empty; A/B/C/D smoke test still passes.

### Phase 1 — Docker + CI  ✅ **DONE (2026-08-12)**

**Goal:** realise doc-03 "same image everywhere" and gate every change. **Backend + AI service only —
the client is a static Vite build (Vercel/CF Pages), not containerized.** Keep the daily dev loop on
`tsx`/`vite`; Docker is for parity/deploy.

- ✅ `server/Dockerfile` (Node 20; `prisma generate` via postinstall; run `tsx server.ts`) + `.dockerignore`
- ✅ `Ai-service/Dockerfile` (Python 3.12 + `uvicorn`) + `.dockerignore`
- ✅ `docker-compose.yml` (repo root) runs server + AI service together; service-name wiring
  (`ai-service:8000`, `server:5001`), uploads volume, container healthchecks
- ✅ GitHub Actions (`.github/workflows/ci.yml`): client build (incl. typecheck), server typecheck,
  AI-service byte-compile

**Exit criteria:** ✅ `docker compose up` brought both containers up **`(healthy)`** — `/live`+`/ready`
(DB reachable) and AI `/health` all 200; all three CI job commands verified green locally. *(CI green on
an actual PR pending first push of the workflow.)*

### Phase 2 — Complete the Deterministic Pipeline  *(the actual product — highest value)*

**Goal:** connect draw-2D → convert → 3D. This is doc-04 **E4/E5/E6** — the missing heart of the MVP.

1. ✅ **Canonical contracts** (`contracts/`): `canvas-v2.schema.json` + `scene-v1.schema.json` authored
   and validated (2026-08-13), with `contracts/README.md` documenting units, the pipeline, and the gap to
   today's *canvas-v1*. **Still to do (folds into 2.2):** migrate the 2D editor payload toward `canvas-v2`
   (add project scale + wall height; parametric door/window offsets) and wire schema validation at the
   boundaries.
2. **Deterministic converter** `canvas → scene` (E4):
   - ✅ **Core module** — `server/services/converter/` (Node/TS): legacy canvas-v1 → canvas-v2 normalizer
     (parametric-opening snapping + default scale/wallHeight), deterministic canvas-v2 → scene-v1
     conversion, ajv validation at both boundaries, and a golden + determinism unit test suite
     (`npm test`, wired into CI). Same input → byte-identical scene.
   - ✅ **2D editor emits canvas-v2** — captures real `scale` (px/m) + `wallHeight` via top-bar inputs;
     persists the canvas-v2 contract (walls + parametric openings) instead of the legacy element list;
     loads both canvas-v2 and legacy projects. Client↔server geometry cross-checked (editor output
     validates against the schema and converts cleanly, preserving real metrics). Transform lives in
     `client/src/editor/canvas/` (`elements.ts`, `canvasV2.ts`).
   - ✅ **Convert Job + open 3D** — `POST /api/projects/:id/convert` runs the converter, persists a
     versioned `Scene`, and is tracked as a `Job` (jobType `canvas_to_scene`, using the real queue
     columns). `GET /api/projects/:id/scene` returns the active scene-v1. The 2D editor has a **Convert to
     3D** button (flush-save → convert → open 3D); the 3D editor **renders the converted walls** (scene-v1
     → Three.js boxes via `client/src/editor/scene/buildFromSceneV1.ts`). Verified end-to-end against the
     live DB (convert → v1, re-convert → v2, GET active v2).
   - ✅ **Openings carved** — walls render as a `THREE.Group` of box pieces with real door/window voids
     (left/right/header/sill via `client/src/editor/scene/wallPieces.ts`, unit-tested). Solid boxes only —
     no frames/glass yet (visual polish).
   - ✅ **3D-editor placement rules** — imported plans load centred at origin (Rule 2), grid sized to the
     plan (Rule 3), and camera framed to fit (Rule 4).
   - ✅ **Room-loop detection** — the converter derives room floor polygons from enclosed wall loops
     (`server/services/converter/detectRooms.ts`, planar-face traversal, unit-tested: single/adjacent
     rooms, open runs, dangling spurs), populates canonical `scene.rooms`, and the 3D editor renders
     filled floors (`buildFromSceneV1.ts`).
   - ✅ **Canonical Scene supersedes glTF-in-canvas** — the 3D editor now loads from and saves to the
     `Scene` table (`GET`/`PUT /api/projects/:id/scene`), not `project.canvas`. Fixes the data-loss bug
     (3D-save used to clobber the 2D drawing), adds optimistic concurrency (`baseVersion` → 409), and
     re-converting supersedes prior 3D edits (new active version). Legacy glTF-in-canvas projects still
     load via a read-only fallback.
   - ✅ **GLB export pipeline** — the 3D editor auto-stores a GLB snapshot on save
     (`POST /api/projects/:id/glb`): exported client-side (`buildGlbBlob`), persisted via the storage seam,
     recorded as a `VrOutput(format:'glb')`, and **pruned to the newest `GLB_KEEP` (default 2)** — rows +
     files. `GET /api/projects/:id/glb` returns the latest. (Scene JSONs are all kept; GLB binaries are
     retention-capped.)
3. ✅ **Scene storage + versioning** (E5): `Scene` already carries `@@unique([projectId, version])` +
   `sourceJobId` in the DB (see §2.3 note on schema reconciliation). Convert uses **optimistic
   versioning** — next version = max+1, and a concurrent convert racing for the same version hits the
   unique constraint → **409**. New scene is marked `isActive` and supersedes the prior active one.
4. **GLB render pipeline** (E6): expose `/v1/render-glb` (scene → GLB via `trimesh`) on FastAPI, or keep
   client-side GLB for MVP; introduce the DB worker (`FOR UPDATE SKIP LOCKED`) when moving off today's
   inline/sync processing.

**Exit criteria:** converter unit tests (same `canvas` → identical `scene`); a drawn 2D plan converts and
opens in 3D; `Scene.version` increments; stale save → 409.

### Phase 3 — Platform Baseline & Metering

Jobs lifecycle + plan-limit enforcement (E8), editor-session metering, Zod validation at all boundaries,
and **finalize R2** at deploy time (Phase 0's seam makes this a config swap). Add `/live`+`/ready`-driven
host health checks, scheduled `pg_dump` backups (`03` §5).

### Phase 4 — Probabilistic & Growth  *(future, `04` §F)*

Path B image detection (FastAPI `services/detector.py` already exists), VR pipeline, billing/payments,
asset-management backend, recommendations, templates, AI copilot.

---

## 5. Decisions Locked

- **Portability fixes before Docker** (Docker otherwise reproduces today's problems on every host).
- **Abstract storage now; wire R2 at deploy time** (no R2 account needed yet).
- **No live deploy yet** — build the deployment foundation as insurance, keep building features locally.
- Codebase is **TypeScript-first** going forward (client + server strict; AI service stays Python).

---

## 6. Immediate Next Step

The whole Path-A spine works end-to-end: **draw 2D → Convert to 3D → walls (with door/window openings)
render centred, grid-fit, and framed**, with a versioned canonical `Scene` persisted per conversion.
**Phase 2 is complete:** ~~(a) openings~~ ✅ → ~~(b) room-loop detection~~ ✅ → ~~(c) canonical `Scene`
supersedes glTF-in-`canvas`~~ ✅ → ~~(d) GLB export pipeline~~ ✅. The full deterministic pipeline
(draw 2D → convert → canonical versioned scene → 3D with openings/floors → stored GLB) works end to end.
**Next up is Phase 3** (plan-limit enforcement, editor-session metering, Zod validation at boundaries,
and finalizing R2 at deploy) — plus the migration-history baseline (§8) before any new schema change.

---

## 7. Sequencing Rationale (why this order)

- Phase 0 is cheap and makes **every future feature deployable**; skipping it means each new feature
  inherits the same portability debt.
- Phase 1 locks portability in and gates regressions **before** the codebase grows.
- Phase 2 is deliberately **after** the foundation because it is large and central — you want it built on
  a deployable, CI-gated base, not bolted onto an un-shippable one. It remains the **highest product
  priority**; the foundation exists to serve it, not to delay it indefinitely.

---

## 8. Risks & Honest Flags

- **Don't let the foundation eclipse the converter.** Phases 0–1 are enablers; Phase 2 is the product.
  Time-box the foundation.
- **3D-save shortcut vs canonical scene:** today's glTF-in-`canvas` will be superseded by the versioned
  `Scene` in Phase 2 — plan a small migration/compat path for any projects saved the old way.
- **AI service is unproven at runtime** and currently implements Path B (detection), not the
  `/v1/render-glb` renderer doc-02 designates for the MVP — reconcile in Phase 2.4.
- **Converter tests exist** (`server/services/converter/*.test.ts`, in CI); the rest of the app still
  relies on manual smoke tests.

### 2.3 note — schema reconciliation (⚠️ important, 2026-08-13)

While wiring the convert Job we found the **live Neon DB is ahead of every git branch**: two migrations
(`core_mvp_recovery`, `scene_job_idempotency`) were applied directly to the DB and **never committed**.
They add `Project.scalePixelsPerMeter` / `defaultWallHeightM`, `Scene.sourceJobId` +
`@@unique([projectId, version])`, and a full `Job` work-queue (`input`/`result`/`progress`/locking).
We **adopted the DB as source of truth** via `prisma db pull` + `prisma generate` (schema now matches
reality; server typecheck green; `migrate status` = up to date).

**Outstanding baseline caveat:** the two migration *files* are still missing locally, so `prisma migrate
dev` (creating a NEW migration) will report drift and offer to reset — **never accept that reset**. Before
the next schema change, either recover the original migration files from whoever applied them, or do a
team-coordinated squash/baseline of `_prisma_migrations`. Current work doesn't need new migrations, so
this isn't blocking.
