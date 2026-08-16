# XPLOR — Development Roadmap & Current Standing

> **Type:** Living planning document. It captures **where the project stands today** and **what to build
> next, in phases**. Unlike the timeless foundational docs (`01`–`05`), this doc has a time dimension and
> will be updated as phases complete. Detailed point-in-time progress lives in
> [`status-reports/`](./status-reports); the newest is
> [`STATUS-REPORT-2026-08-15-pivot.md`](./status-reports/STATUS-REPORT-2026-08-15-pivot.md).

- **Last updated:** 2026-08-15
- **Nature of this update:** **Capstone pivot.** Monetization is dropped; the goal is a **polished, fully
  working product** around the core loop (**upload image → 2D editor → 3D model**), plus a **scene-aware
  furniture suggestion engine**. This replaces the old Phase 3 (metering) and Phase 4 (growth).
- **Phase status:** Phase 0 ✅ · Phase 1 ✅ · Phase 2 ✅ (deterministic draw→3D pipeline) ·
  **next: Phase 3** — close the image→2D→3D core loop.

---

## 1. Purpose

Give anyone working on XPLOR a single place to understand (a) the current state of the build, (b) the
sequence in which development should proceed, and (c) the reasoning behind that sequence. Read alongside
`01-master-reference.md` (product), `02-backend-architecture.md` (target architecture),
`03-deployment-and-scalability.md` (deployment), and `04-feature-specification.md` (feature set).

---

## 1a. The Capstone Pivot (what changed and why)

XPLOR is now a **capstone project**. The plan is reframed around three goals, in priority order:

1. **Make the core loop actually work end-to-end.** The headline is
   **upload a floor-plan image → it populates the 2D editor → convert to a 3D model.** The draw→3D half is
   done; the image→2D half is ~70% wired and needs finishing.
2. **Polish.** Beautify the UI into one cohesive identity, fix the UX (real error feedback, loading/empty
   states, responsiveness), and add the obvious missing editor features.
3. **A smart feature.** A **scene-aware furniture suggestion engine** that reads the scene JSON (room size
   + objects already present) and recommends assets to place.

**Dropped/deferred:** **monetization** (metering, plan limits, billing) is out of scope — retained in the
foundational docs as *deferred*, not deleted. **VR** stays a deferred stub. See §5 for locked decisions.

---

## 2. Where We Stand Today

### 2.1 Snapshot

| Layer | State | Notes |
|-------|-------|-------|
| **Frontend** | Working, **100% TypeScript (strict)** | React 19 + Vite; 2D Konva editor + 3D R3F editor; build gates on `tsc`. **UI is split-brain** (plain-CSS pages vs Tailwind 3D editor) and has **no notification surface**. |
| **Backend API** | Working, **100% TypeScript (strict)**, runs on `tsx` | Express 5 + Prisma; auth, projects, jobs, convert, scene versioning, GLB retention. Verified against Neon + Firebase. |
| **AI service** | **Built, real detector, runtime-unproven** | FastAPI OpenCV detector (`POST /process-floor-plan`); server↔AI wiring is contract-correct; **no client UI + a shape/storage mismatch** keep it dead-ended (see §2.3). |
| **Database** | Working | Neon Postgres; `Asset`/`UserAsset`/`Scene`/`Job` tables present. Migration-history baseline outstanding (§8). |
| **Infra** | Foundation in place | Docker (server + AI) + compose + CI (Phase 1); storage seam + health endpoints + env config (Phase 0). Uploads still local-disk behind the seam. |

### 2.2 What works (the deterministic draw→3D spine)

- Email + Google auth; **persistent session** (route guards + rehydration).
- **2D editor**: draw/edit walls (straight + curved), doors, windows, labels; snapping; undo/redo;
  marquee-select; zoom/fit/pan; PNG export; per-project scale (px/m) + wall height; **autosave** as
  `canvas-v2`; **Convert to 3D**.
- **Deterministic converter**: `canvas-v2 → scene-v1` (walls with carved openings + room-loop floors),
  ajv-validated at both boundaries, unit-tested + determinism-checked in CI. Persists a **versioned
  canonical `Scene`** (optimistic `baseVersion` → 409).
- **3D editor**: loads the canonical scene; orbit/pan/zoom, auto-frame; add primitives; import GLB;
  drag-drop library assets (scale-normalized); translate gizmo with boundary/collision guards; material
  color + texture; undo/redo, copy/paste, delete, nudge; **Save** (new version) + **auto-store GLB**
  (retention-capped) + Export GLB/GLTF.
- Dashboard lists projects with 2D/3D differentiation.

### 2.3 The honest gaps (what this roadmap targets)

1. **Image→2D loop is unfinished.** The detector + server endpoint + job wiring exist, but there's **no
   client upload UI**, and detection is written as raw `DetectionResult` into a `Scene` row while the 2D
   editor reads `canvas-v2` from `project.canvas` — the two never meet. *(Phase 3.)*
2. **UI is split-brain and gives no feedback.** Two visual identities, no shared primitives, and **every
   failure is a silent `console.error`** (no toast system). *(Phase 4.)*
3. **Obvious editor features missing.** 2D shows **pixels not metres**, and multi-select can only be
   deleted (no group move/copy-paste); 3D gizmo is translate-only and the asset search is a dead control.
   *(Phase 5.)*
4. **Furniture is manual and lossy.** Placement is a naive grid; assets are baked to an opaque glTF blob on
   save (no structured round-trip), rooms have no type, and there's no recommender. *(Phase 6.)*
5. **AI service unproven at runtime**; must be booted and verified.
6. **Merge-cleanup + migration baseline** outstanding (§8).

---

## 3. Guiding Principles

- **Reliability-first: deterministic core, then polish, then probabilistic AI** (`01` §1.4). The draw→3D
  core is proven; the image path and the recommender build on top of it.
- **The scene is canonical; GLB/VR are derived** and regenerable (`01` §3).
- **Contracts validated at the boundary; ownership on every route; optimistic scene versioning** (`02`).
- **Swappable seams for probabilistic parts.** Both the image detector and the furniture recommender sit
  behind a stable contract/interface, so a better model drops in without touching downstream code.

---

## 4. The Roadmap (phased)

### Phase 0 — Portability Foundation ✅ **DONE (2026-08-11)**
Env-driven CORS, `apiClient` everywhere (no hardcoded URLs), `/live` + `/ready` + central error handler,
committed `.env.example` files, storage seam (`server/services/storage.ts`) over local-disk uploads.

### Phase 1 — Docker + CI ✅ **DONE (2026-08-12)**
`server/Dockerfile` + `Ai-service/Dockerfile` + `docker-compose.yml` (both containers healthy) + GitHub
Actions CI (client build, server typecheck, AI byte-compile). Daily loop stays on `tsx`/`vite`.

### Phase 2 — Deterministic Draw→3D Pipeline ✅ **DONE (2026-08-13)**
Canonical contracts (`contracts/canvas-v2` + `scene-v1`); deterministic `server/services/converter/`
(normalize → convert → validate, golden + determinism tests); 2D editor emits `canvas-v2`; **Convert to
3D** Job persisting a versioned `Scene`; carved openings + room-loop floors; canonical-Scene load/save
(supersedes the old glTF-in-`canvas` shortcut, fixing the data-loss bug); GLB export with retention.

---

### Phase 3 — Close the Image → 2D → 3D Core Loop  ⟵ **NEXT (highest value)**
**Goal:** upload an image → detected walls appear in the 2D editor → user cleans up → Convert to 3D
(existing pipeline) → 3D scene. Both input paths converge on `canvas-v2`.

| # | Step | Key files |
|---|------|-----------|
| 3.1 | **Run/verify the AI service** — boot it, confirm `/health` and `/process-floor-plan` on a sample image | `Ai-service/*`, `docker-compose.yml` |
| 3.2 | **Formalize the detection seam** — `contracts/detection-v1.schema.json` matching `DetectionResult`; document it (this is the plug-and-play boundary — any future model emits `detection-v1`) | new `contracts/detection-v1.schema.json`, `contracts/README.md`, `Ai-service/app/schemas.py` |
| 3.3 | **Detection → canvas-v2 bridge (server)** — map detection → canvas-v1 elements → reuse `normalizeCanvas`; persist **canvas-v2 to `project.canvas`** (not a `Scene` row); use project scale/height defaults | `server/controllers/projectController.ts` (`uploadFloorPlan`), new bridge in `server/services/converter/` |
| 3.4 | **Client upload UI + job polling** — file input in the new-project flow → `POST /upload-floor-plan` → poll `GET /jobs/:id` (progress + errors) → open 2D editor with detected walls | `client/src/pages/Dashboard.tsx`, `client/src/pages/Editor2D.tsx` |
| 3.5 | **End-to-end verify** — image → 2D walls → edit → Convert → 3D scene | — |

**Exit criteria:** AI `/health` 200; a sample image yields detected walls loaded from `project.canvas`;
Convert to 3D produces a scene; a golden `DetectionResult → canvas-v2` unit test passes; server
`tsc --noEmit` + `npm test` green.

### Phase 4 — UX Foundation & Visual Unification  *(polish, structural first)*
**Goal:** the app feels like one finished product, and every failure is visible.

1. **Notification/toast system** — one shared mechanism; replace silent `console.error` on all user-facing
   failure paths. *(Biggest single UX win.)*
2. **Design system + shared primitives** — unify the two styling worlds; design tokens (color/spacing/type)
   + shared `Button`/`Modal`/`Input`/`Card`; reskin all pages + the 3D editor to one identity. *(Recommend
   consolidating on Tailwind — the 3D editor already uses it.)*
3. **Consistent loading/empty/error states**; auth submit spinners; editor loading states.
4. **Cleanup** — remove dead deps (`framer-motion`, `gsap`), duplicate legacy files, dead components; fix
   dead landing links/CTAs; standardize on `lucide-react`, retire emoji-as-UI.
5. **Responsiveness** — resize handling for the 2D Konva canvas; responsive layouts.

### Phase 5 — Obvious Editor Features  *(polish, per-tool)*
**2D:** real-world **metre** measurements (via the stored px/m scale) + a measurement tool; **group
move / copy-paste / duplicate / nudge** (multi-select is delete-only today); optional grid snapping.
**3D:** **gizmo mode toggle** (translate/rotate/scale); **functional asset search/filter**; route the asset
browser through an owned/local route instead of the hardcoded external URL (sets up Phase 6).

### Phase 6 — Scene-Aware Furniture Suggestion Engine  *(the smart feature)*
**Goal:** given the scene JSON (room size + objects already placed), recommend catalog furniture and
one-click place it. Foundations first:

1. **Structured asset persistence** — stop baking 3D edits to a glTF blob; serialize/deserialize scene-v1
   `assets[]` (`source` + `transform` + new `roomId`); make `buildFromSceneV1.ts` hydrate `assets[]`.
2. **Room semantics** — give rooms a type/name (user-labeled in the 2D editor, heuristic default by area;
   the `room` contract already allows `name`).
3. **Local asset catalog** — replace the hardcoded external URL with a server `/assets` route over the
   `Asset` table + seeded furniture GLBs tagged by category + suitable room types.
4. **Recommender behind a swappable interface** — `recommend(sceneContext) → RankedAssets`; start
   rule/association-based (co-occurrence + room-area scaling), swappable for a light ML model later.
   Surface a **Suggestions panel** + deterministic non-overlapping placement in the room polygon.

### Phase 7 — Deferred  *(not active)*
VR/WebXR preview (keep the stub), template-based generation, AI copilot. Revisit after Phases 3–6.

---

## 5. Decisions Locked

- **Monetization dropped for the capstone** — no metering/plan limits/billing (retained in docs as
  *deferred*).
- **Sequencing: core loop → UX → smart feature.**
- **Furniture engine is a scene-aware recommender** (room size + objects present), a light rule/ML model
  behind a swappable interface — *not* a flashy LLM.
- **Ship the current image detector now**, behind a **plug-and-play detection contract**
  (`detection-v1`); the deterministic 2D editor is the cleanup safety net; improve the model later without
  breaking downstream.
- **VR deferred** — keep the stub button, decide later.
- **Codebase is TypeScript-first** (client + server strict; AI service stays Python).
- (From earlier) storage abstracted now, R2 wired at deploy time; no live deploy yet.

---

## 6. Immediate Next Step

**Phase 3.1 → 3.2:** boot and verify the AI service, then formalize `contracts/detection-v1` and build the
**detection → canvas-v2 bridge** (reusing `normalizeCanvas`) so an uploaded image populates the 2D editor
via `project.canvas`. Then add the client upload UI + job polling (3.4) and verify end-to-end (3.5).

**Before that, two housekeeping items (§8):** commit the merge-cleanup deletions, and keep the
migration-baseline caveat in mind (no `prisma migrate dev` reset).

---

## 7. Sequencing Rationale (why this order)

- **Core loop first** because it is the product's headline and is closest to done (~70% wired) — the fastest
  path to "everything works."
- **UX foundation before per-feature polish** so the toast system + design tokens + shared primitives exist
  before we touch each screen — every later fix is then cheaper and consistent, not repeated per page.
- **Editor features before the recommender** because the recommender depends on structured scene data and a
  clean asset pipeline, which the Phase 5 asset-route work begins.
- **Furniture engine last** because it needs the most foundation (structured persistence, room semantics,
  owned catalog) and is the highest-risk "smart" piece — best built on a polished, working base.

---

## 8. Risks & Honest Flags

- **Merge-cleanup not yet committed.** The 18-file deletion that fixes the stale `.jsx`/`.js` shadowing is
  staged in the working tree but uncommitted — `main` stays broken until it's committed + pushed.
- **Detection is rough.** The heuristic detector will misfire; the deterministic 2D editor is the cleanup
  surface. Keep the seam clean so a better model is a drop-in.
- **Structured-asset persistence is a real refactor.** Today 3D saves bake to a glTF blob; making furniture
  round-trip as data (Phase 6.1) also finally realizes "the scene is canonical" for 3D edits.
- **Tests are thin outside the converter.** Grow coverage as Phases 3–6 land (bridge, recommender).

### 8a. Schema reconciliation (⚠️ still outstanding, from 2026-08-13)

The live Neon DB is **ahead of every git branch**: two migrations (`core_mvp_recovery`,
`scene_job_idempotency`) were applied directly and never committed (they add
`Project.scalePixelsPerMeter`/`defaultWallHeightM`, `Scene.sourceJobId` + `@@unique([projectId, version])`,
and the full `Job` work-queue). We **adopted the DB as source of truth** via `prisma db pull` +
`prisma generate` (schema matches reality; typecheck green). **The migration files are still missing
locally**, so `prisma migrate dev` will report drift and offer to reset — **never accept that reset.**
Recover the files or do a coordinated baseline **before** the next schema change (e.g. the Phase 6 `Asset`
seed / asset `roomId`).
