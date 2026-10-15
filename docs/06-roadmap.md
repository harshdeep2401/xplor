# XPLOR — Development Roadmap & Current Standing

> **Type:** Living planning document. It captures **where the project stands today** and **what to build
> next, in phases**. Unlike the timeless foundational docs (`01`–`05`), this doc has a time dimension and
> will be updated as phases complete. Detailed point-in-time progress lives in
> [`status-reports/`](./status-reports); the newest is
> [`STATUS-REPORT-2026-10-16-phase3.md`](./status-reports/STATUS-REPORT-2026-10-16-phase3.md).

- **Last updated:** 2026-10-16
- **Nature of this update:** **Phase 3 complete** — the image → 2D → 3D core loop works end-to-end
  (manually verified). Detection *quality* is now the weak link, so a parallel **Phase 3b (detection
  quality)** is added for the trained U-Net. Development moves to a Windows machine (GPU + Docker).
  *(Previous update, 2026-08-15: capstone pivot — monetization dropped, core loop + polish + furniture
  engine.)*
- **Phase status:** Phase 0 ✅ · Phase 1 ✅ · Phase 2 ✅ · **Phase 3 ✅** (image→2D→3D loop) ·
  **active: Phase 3b** (detection quality, in parallel) · **next: Phase 4** (UX foundation).

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
   **upload a floor-plan image → it populates the 2D editor → convert to a 3D model.** Done in Phase 3
   (2026-10-16); detection accuracy is being improved in Phase 3b.
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
| **Frontend** | Working, **100% TypeScript (strict)** | React 19 + Vite; 2D Konva editor + 3D R3F editor; build gates on `tsc`. **Import Floor Plan** flow, trace layer and Calibrate tool added (Phase 3). **UI is split-brain** (plain-CSS pages vs Tailwind 3D editor) and has **no notification surface** beyond the import banner. |
| **Backend API** | Working, **100% TypeScript (strict)**, runs on `tsx` | Express 5 + Prisma; auth, projects, jobs, convert, scene versioning, GLB retention. Verified against Neon + Firebase. |
| **AI service** | **Working, runtime-verified; detection quality low** | FastAPI OpenCV heuristic (`POST /process-floor-plan`) emitting `detection-v1`; managed with **uv** (`pyproject.toml` + `uv.lock`, Python 3.12). Misses walls and picks up text/symbols as walls; a trained **U-Net** is in training to replace it (Phase 3b). |
| **Database** | Working | Neon Postgres; `Asset`/`UserAsset`/`Scene`/`Job` tables present. Migration-history baseline outstanding (§8). |
| **Infra** | Foundation in place; **Docker stack unverified since Phase 2** | Docker (server + AI) + compose + CI (Phase 1); storage seam + health endpoints + env config (Phase 0). The server image was missing `contracts/` (fixed via a compose build context, 2026-10-16) but has not been rebuilt yet. Uploads still local-disk behind the seam. |

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
- **Image import (Path B)**: Dashboard **Import Floor Plan** → upload → OpenCV detection → `detection-v1`
  validated → bridge (wall welding + opening attachment) → `canvas-v2` in `project.canvas` → 2D editor
  with the image as a **trace layer** (toggle/opacity) → **Calibrate** sets real-world scale → Convert to 3D
  with rooms/floors. Detection failure still opens the editor with the image to trace by hand.

### 2.3 The honest gaps (what this roadmap targets)

1. **Detection quality is poor.** The heuristic misses walls and turns text, dimension lines and furniture
   symbols into walls; doors/windows are never detected. Users can fix everything in the editor, but it is
   slow. *(Phase 3b.)*
2. **UI is split-brain and gives no feedback.** Two visual identities, no shared primitives, and **every
   failure is a silent `console.error`** (no toast system). *(Phase 4.)*
3. **Obvious editor features missing.** 2D shows **pixels not metres**, and multi-select can only be
   deleted (no group move/copy-paste); 3D gizmo is translate-only and the asset search is a dead control.
   *(Phase 5.)*
4. **Furniture is manual and lossy.** Placement is a naive grid; assets are baked to an opaque glTF blob on
   save (no structured round-trip), rooms have no type, and there's no recommender. *(Phase 6.)*
5. **Docker stack not rebuilt** since the converter started loading `contracts/` (fix applied, unverified).
6. **Migration baseline** outstanding (§8a).

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

### Phase 3 — Close the Image → 2D → 3D Core Loop  ✅ **DONE (2026-10-16)**
**Goal:** upload an image → detected walls appear in the 2D editor → user cleans up → Convert to 3D
(existing pipeline) → 3D scene. Both input paths converge on `canvas-v2`.

**Delivered:** AI service booted + verified; `contracts/detection-v1.schema.json` (validated by Ajv and
Python `jsonschema` against real detector output); server bridge `detectionToCanvas.ts` + `weldWalls.ts`
(closes corners/T-junctions so rooms form) writing `canvas-v2` to `project.canvas`, canvas sized to the
image, 409 on non-empty projects; Dashboard **Import Floor Plan** flow (no polling needed: detection is
synchronous); editor **trace layer** + **Calibrate** tool + import banner; AI-service port default fixed
(5000 → 5001); AI service moved from `requirements.txt` to **uv**. Exit criteria met: `/health` 200,
golden `DetectionResult → canvas-v2` test, server `tsc` + `npm test` green (20 tests), manual end-to-end
import → 3D confirmed. *(Original plan below, kept for reference.)*

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

### Phase 3b — Detection Quality  ⟵ **ACTIVE (parallel with Phase 4)**
**Goal:** make imports need little cleanup, and *prove* it with numbers. Everything stays behind
`detection-v1`, so no downstream change is needed.

| # | Step | Notes |
|---|------|-------|
| 3b.1 | **Evaluation script** — run a detector over a fixed CubiCasa5K sample and score it against the ground-truth vectors (wall precision/recall, endpoint error, % rooms closed) | Do this first: it decides whether a model beats the heuristic, and gives the capstone a measurable result |
| 3b.2 | **Integrate the trained U-Net** — export to **ONNX**, run with `onnxruntime` on CPU in the AI service; add **mask → vector** post-processing (threshold → skeletonize → fit segments; door centres from connected components) to emit `detection-v1` | Trained on the Windows GPU machine; inference is CPU-friendly (seconds per plan), so it runs in Docker on any OS |
| 3b.3 | **Detector selection by config** — `DETECTOR` = `opencv` / `unet` / `hybrid` (e.g. model walls + model doors, heuristic fallback) | Switch detectors without code changes; A/B with 3b.1 |
| 3b.4 | *(Optional)* **Heuristic improvements** — mask text/dimension lines before Hough, estimate wall thickness, drop isolated short segments | Only if the model is delayed |

**Exit criteria:** the evaluation script runs in CI or locally; the chosen detector beats the heuristic on
it; `detect()` returns valid `detection-v1`; typical imports form closed rooms without manual welding.

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
- **Scale comes from user calibration** in the 2D editor (drag a known length) — not from a guess at upload
  time. OCR of dimension text may automate it later.
- **The uploaded image stays visible as a trace layer**, 1:1 with canvas pixels (canvas sized to the image).
- **Wall welding happens in the bridge, not the detector**, so every detector benefits.
- **Model inference runs on CPU via ONNX** in the AI-service container; the GPU is for training only.
- **Python tooling is uv** (`pyproject.toml` + `uv.lock`), not pip/requirements.txt.
- **Development continues on Windows** (GPU for training + Docker Desktop) as of 2026-10-16.

---

## 6. Immediate Next Step

1. **Set up the Windows machine** (`05` §10): move the uncommitted Phase 3 work over, `npm ci` / `uv sync`,
   copy the `.env` files, then **verify the Docker stack** (`docker compose up --build`) and repeat the
   import checklist against the containers.
2. **Commit Phase 3** (and the uv migration + docs) once verified.
3. **Phase 3b.1 → 3b.2:** build the evaluation script, then integrate the U-Net (ONNX + mask → vector).
4. **Phase 4** in parallel: toast system first.

Keep the migration-baseline caveat in mind (§8a — never accept a `prisma migrate dev` reset).

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

- ~~**Merge-cleanup not yet committed.**~~ Resolved (`2909750`). Three harmless leftovers remain to delete:
  `client/src/firebase.js` (identical to `firebase.ts`, but Vite resolves it first),
  `client/src/services/authservice.js` and `client/src/components/AuthVisual.jsx` (both unused).
- **Phase 3 is uncommitted** and exists only on the Mac working tree; it must be moved to the Windows
  machine deliberately (copy the tree or push a branch) before work continues there.
- **Docker unverified.** The `contracts/` build-context fix has never been built; the server image would
  have crashed at startup since Phase 2.
- **`server` `npm test` is POSIX-only** (`$(find …)`); it fails under Windows `cmd.exe`. Use Git Bash/WSL or
  make it portable (e.g. Node ≥ 21 `--test` globs, if CI moves off Node 20).
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
