# XPLOR — Development Roadmap & Current Standing

> **Type:** Living planning document. It captures **where the project stands today** and **what to build
> next, in phases**. Unlike the timeless foundational docs (`01`–`05`), this doc has a time dimension and
> will be updated as phases complete. Detailed point-in-time progress lives in
> [`status-reports/`](./status-reports); the newest is
> [`STATUS-REPORT-2026-10-16-phase3b.md`](./status-reports/STATUS-REPORT-2026-10-16-phase3b.md).

- **Last updated:** 2026-11-11
- **Nature of this update:** **Phase 6 done (2026-11-11)** — the furniture suggestion engine (6.4): a
  rule-based recommender behind a swappable interface ranks what each room is missing and finds each piece
  a collision-free spot (sofa against a wall, coffee table in front of it, TV stand facing it, TV on the
  stand, nightstands by the bed's head, chairs round the table, mirror above the basin, doorways kept clear).
  A **Suggestions** panel in the 3D editor adds any of them in one click; catalog items dropped from the
  library now land where they're dropped.
- **Earlier on 2026-11-11:** **Phase 6 foundations (6.1–6.3)** — 3D saves are now
  structured `scene-v1` (furniture, lights and colours as data; no more glTF blob); converting the 2D
  plan again keeps the furniture; rooms get a name (from a 2D label inside them) and a type; files
  imported from disk are uploaded so they reload; the furniture library is our own **120-item Kenney
  CC0 catalog** in the `Asset` table, each model fitted to real-world dimensions. The old Railway
  furniture backend is gone (it had stopped responding). Next: the recommender (6.4).
- **Earlier, 2026-10-20:** **Phase 5 done** — the 2D editor works in metres (labels,
  properties, cursor) and has a Measure tool; selections can be built with Shift+click, moved by dragging
  or arrow keys, copied/pasted/duplicated; the 3D editor switches its handles between move, rotate and
  resize (W/E/R); the furniture search filters the list. Client unit tests now run in CI.
- **Earlier on 2026-10-20:** **Phase 4 done** — toast notifications replace silent
  failures everywhere; design tokens + shared `Button`/`Modal`/`Field`; the 3D editor moved onto the same
  look as the rest of the app; loading states; dead dependencies, duplicate files, emoji icons and dead
  landing links removed; the 2D canvas follows window resizes. Details in Phase 4 below.
- **Previous update (2026-10-16):** **Phase 3b largely done** — the trained MiT-B3 U-Net replaces the OpenCV
  heuristic (PyTorch on the GPU machine, mask → vector post-processing), with an evaluation script that
  scores it far above the heuristic. Plan change: **no ONNX**; the model runs in PyTorch on the team's GPU
  PC and is served to a cloud-hosted API **through a Cloudflare Tunnel** with a shared secret (3b.5,
  verified end to end). All development is now on Windows. *(Previous update, earlier 2026-10-16: Phase 3 complete.)*
- **Phase status:** Phase 0 ✅ · Phase 1 ✅ · Phase 2 ✅ · Phase 3 ✅ · **Phase 3b 🟡** (model integrated,
  evaluated, and remotely hostable; real-world images later) · **Phase 4 ✅** · **Phase 5 ✅** · **Phase 6 ✅**
  · **next:** deployment (Docker stack, cloud server, named tunnel) and real-world images (3b.6).

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
| **AI service** | **Working, trained model, runtime-verified** | FastAPI (`POST /process-floor-plan`) emitting `detection-v1` from the **trained MiT-B3 U-Net** (PyTorch, CUDA 12.6 build; ~0.25 s per plan on the GPU incl. vectorization) — walls, doors, windows, rooms. 503 with a reason when the model can't load (no fallback). Takes the image in the request (multipart) and requires `Authorization: Bearer <FASTAPI_SECRET>`. Managed with **uv**; 20 pytest tests. Hostable from the GPU PC via `Ai-service/compose.host.yml` (GPU container + Cloudflare quick tunnel), verified end to end. |
| **Database** | Working | Neon Postgres; `Asset`/`UserAsset`/`Scene`/`Job` tables present. Migration-history baseline outstanding (§8). |
| **Infra** | Foundation in place; **Docker stack unverified since Phase 2** | Docker (server + AI) + compose + CI (Phase 1); storage seam + health endpoints + env config (Phase 0). The server image was missing `contracts/` (fixed via a compose build context) but has not been rebuilt yet; the AI image (PyTorch + CUDA, ~11 GB, weights mounted, non-root) is built and verified on the GPU via `compose.host.yml`; the root `docker-compose.yml` stack (server + AI) is still to be run end to end. CI now runs the AI tests too. Uploads still local-disk behind the seam. |

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
- **Image import (Path B)**: Dashboard **Import Floor Plan** → upload → trained-model detection → `detection-v1`
  validated → bridge (wall welding + opening attachment) → `canvas-v2` in `project.canvas` → 2D editor
  with the image as a **trace layer** (toggle/opacity) → **Calibrate** sets real-world scale → Convert to 3D
  with rooms/floors. Detection failure still opens the editor with the image to trace by hand.

### 2.3 The honest gaps (what this roadmap targets)

1. **Detection is good; hosting is single-PC.** The trained model finds walls, doors and windows (see
   the Phase 3b report for scores); remaining errors are model-level (balcony railings as walls/wide
   windows, occasional furniture outlines as walls). It is served from one PC through a quick tunnel whose
   URL changes on restart until a domain + named tunnel exist. *(Phase 3b.5/3b.6.)*
2. ~~**UI is split-brain and gives no feedback.**~~ Fixed in Phase 4 (toasts, tokens, shared
   primitives). Remaining: the landing page keeps its own hand-written CSS (now on the token colours).
3. ~~**Obvious editor features missing.**~~ Done in Phase 5. Remaining: no grid snapping in 2D.
4. ~~**Furniture is manual.**~~ Done in Phase 6: structured saves, typed rooms, our own catalog and a
   recommender with one-click placement. Remaining: suggestions are rules, not learned; room types can only
   be set through a 2D label.
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

| # | Step | Status / notes |
|---|------|----------------|
| 3b.1 | **Evaluation script** — score detectors on CubiCasa5K test plans | ✅ `Ai-service/eval/evaluate.py`: wall pixel F1 (3 px tolerance), door/window centre-matching F1, and closed rooms counted through the server's real bridge + converter (`eval/bridge_rooms.ts`). Scores `opencv`, `unet`, and an `oracle` (vectorizer on ground truth). Local only (needs the dataset + weights). |
| 3b.2 | **Integrate the trained U-Net** — **PyTorch** (not ONNX) in the AI service + **mask → vector** post-processing | ✅ `segmenter.py` (MiT-B3 U-Net, same preprocessing as training, GPU when available) + `vectorize.py` (skeleton graph → straight, connected, axis-snapped walls with measured thickness; door/window centres + widths; room polygons). |
| 3b.3 | **Detector selection by config** — `DETECTOR=unet` (default) / `opencv` | ✅ No `hybrid` and **no automatic fallback**: if the model can't load, the service answers 503 with the reason. |
| 3b.4 | ~~Heuristic improvements~~ | Dropped — the model replaced the heuristic. |
| 3b.5 | **Remote AI host** — serve the model from the GPU PC to a cloud API through a Cloudflare Tunnel | ✅ Shared-secret auth (middleware, before the body is read; 401/413/503); Node **sends the image bytes** (multipart) — the AI service no longer fetches URLs; GPU Docker image (weights mounted, non-root, no published port) + `cloudflared` in `Ai-service/compose.host.yml`; quick tunnel now, named tunnel switchable via `COMPOSE_PROFILES` + `TUNNEL_TOKEN`; guide `docs/guides/ai-hosting.md`. Verified through a live quick tunnel. |
| 3b.6 | *(Later)* **Real-world test images** — non-CubiCasa plans and real phone photos | The model was only scored on CubiCasa5K (Finnish plans, simulated photos). |

**Result (400 test plans):** wall F1 **0.953** vs 0.470 for the heuristic; door / window F1 **0.92 /
0.88** (heuristic: none); rooms closed **86%** vs 17%. Details in the Phase 3b status report.

**Exit criteria:** ✅ the evaluation script runs locally; ✅ the model beats the heuristic on it;
✅ `detect()` returns valid `detection-v1`; ✅ typical imports form closed rooms without manual welding;
✅ a remote API can use the model securely over the tunnel.

### Phase 4 — UX Foundation & Visual Unification  ✅ **DONE (2026-10-20)**
**Goal:** the app feels like one finished product, and every failure is visible.

**Done:** (1) `components/toast/` — one store + `<Toaster />`, used by the dashboard, both editors and
exports; autosave failures show one sticky toast that clears on the next successful save; Convert to 3D
refuses to run on an unsaved drawing; unreachable server → "Cannot reach the server". (2)
`styles/tokens.css` + Tailwind colour mapping; `components/ui/` `Button`, `Modal`, `Field`; dashboard
dialogs, 3D editor (navbar, toolbar, panels, export dialog), status page and toasts use them; the 2D editor
CSS uses the tokens. (3) Loading states: login/sign-up buttons, dashboard project list, 3D editor; a 2D
project that fails to load shows the reason + a way back. (4) Removed `framer-motion`, `gsap`,
`react-icons`, the duplicate `firebase.js` / `authservice.js` / empty `AuthVisual.jsx`, debug logging and
emoji icons (now `lucide-react`); landing links/CTAs point at real sections/pages, placeholder social
links removed. (5) The 2D stage follows its container's size (ResizeObserver); dashboard and footer stack
on narrow screens. Not done: ESLint has no flat config yet (`npm run lint` fails), and the landing page
keeps its own CSS.

*Original plan:*

1. **Notification/toast system** — one shared mechanism; replace silent `console.error` on all user-facing
   failure paths. *(Biggest single UX win.)*
2. **Design system + shared primitives** — unify the two styling worlds; design tokens (color/spacing/type)
   + shared `Button`/`Modal`/`Input`/`Card`; reskin all pages + the 3D editor to one identity. *(Recommend
   consolidating on Tailwind — the 3D editor already uses it.)*
3. **Consistent loading/empty/error states**; auth submit spinners; editor loading states.
4. **Cleanup** — remove dead deps (`framer-motion`, `gsap`), duplicate legacy files, dead components; fix
   dead landing links/CTAs; standardize on `lucide-react`, retire emoji-as-UI.
5. **Responsiveness** — resize handling for the 2D Konva canvas; responsive layouts.

### Phase 5 — Obvious Editor Features  ✅ **DONE (2026-10-20)**
**Done:** 2D — wall dimension labels, canvas size, cursor coordinates and the properties panel (length,
thickness, opening width) are in **metres** via the project's px/m scale, with a `NumberInput` that allows
typing decimals; a **Measure** tool (drag, Shift = straight, not saved); **Shift+click** and Shift+box add
to a selection; dragging a wall or any part of a multi-selection **moves** it (one undo step); **arrow
keys nudge** 5 cm (Shift 50 cm); **Ctrl+C / Ctrl+V / Ctrl+D / Ctrl+A**; a Selection panel (duplicate,
delete) and a shortcut list. Pure logic in `editor/canvas/editing.ts` with tests; `client/npm test` added
to CI (Node 22). 3D — **Move / Rotate / Resize** toolbar + W/E/R keys (rotation snaps to 15°; collision
revert only applies while moving); the toolbar search **filters the furniture list** by name, file name
and tags. Removed the unused `TransformControlWrapper.tsx`. **Deferred:** 2D grid snapping (optional);
the owned asset route (it is Phase 6.3 below).

*Original plan:*
**2D:** real-world **metre** measurements (via the stored px/m scale) + a measurement tool; **group
move / copy-paste / duplicate / nudge** (multi-select is delete-only today); optional grid snapping.
**3D:** **gizmo mode toggle** (translate/rotate/scale); **functional asset search/filter**; route the asset
browser through an owned/local route instead of the hardcoded external URL (sets up Phase 6).

### Phase 6 — Scene-Aware Furniture Suggestion Engine  ✅ **DONE (2026-11-11)**
**Goal:** given the scene JSON (room size + objects already placed), recommend catalog furniture and
one-click place it.

**Done (6.1–6.3):**
1. **Structured asset persistence** ✅ — the 3D editor saves `scene-v1` (`client/src/editor/persist/sceneV1.ts`):
   walls/rooms as converted, plus `assets[]` (`kind`, `source`, `catalogId`, `baseSize`, `transform`),
   point lights and per-asset colour/texture materials. Every placed object is a wrapper whose content is
   fitted to `baseSize` metres with its bottom-centre at the origin, so transforms are unit-independent.
   `PUT /scene` validates against `scene-v1` (old glTF saves → 400; the editor says they can't be opened
   and suggests converting again) and sets each asset's `roomId`; re-converting carries assets, their
   materials and point lights over (`server/services/converter/sceneAssets.ts`). Models/textures from
   disk are uploaded (`POST /api/projects/:id/files`). Walls and floors are locked in 3D (edit them in 2D).
   Fixed on the way: floors counted as collisions (furniture couldn't be dragged in converted plans), and
   recolouring an object also recoloured its copies and undo history (shared materials).
2. **Room semantics** ✅ — `room.name` = the first 2D label inside the room; `room.type` from the name
   (keywords, e.g. "Master Bath" → bathroom) or else from area/shape (`roomSemantics.ts`). No new 2D UI:
   users name rooms by dropping a label in them.
3. **Local asset catalog** ✅ — `GET /api/assets` over the `Asset` table (no schema change: size, room
   types, tags and placement live in `Asset.metadata`), seeded by `npm run seed:assets` from
   `server/scripts/furniture-catalog.json`. 120 items from the **Kenney Furniture Kit 2.0 (CC0)**; models
   and previews in `server/public/furniture/`, served at `/static/furniture/…`. Kenney models aren't to
   scale (and not consistently), so each item has hand-set real-world dimensions it is fitted to on load;
   the most stretched are kitchen units (1.5× taller, Kenney's are squat cubes). Structural pieces (walls,
   floors, doorways, stairs) are left out — the 2D plan provides those.

**Done (6.4):**
4. **Recommender behind a swappable interface** ✅ — `server/services/recommender/`: `Recommender.recommend({
   scene, catalog, roomId?, limit? }) → RoomSuggestions[]` (`types.ts`); `getRecommender()` picks the
   implementation (`RECOMMENDER` env; today only `rules-v1`). **Rules** (`rules.ts`): per room type, a kit of
   roles (bed, nightstand, wardrobe, …) with weights, area-scaled counts, preferred variants (double bed from
   11 m², bathtub from 5 m², corner sofa from 25 m²) and anchors. Score = weight × share still missing
   (+0.15 when its anchor is already in the room); one suggestion per role, best first. Suggestions in one
   list build on each other (the TV goes on the *suggested* stand). **Placement** (`placement.ts`,
   `geometry.ts`): deterministic search over candidate spots — against a wall (longest first, sliding out
   from the middle; the TV stand picks the wall facing the sofa), in front of / beside / around / on /
   above an anchor, room centre, ceiling, inside a doorway (mats) — accepting the first that stays inside
   the room clear of the walls and doesn't collide (oriented-box test with height ranges; flat rugs only
   collide with each other; doorways keep a 0.9 m clear zone). Kenney models face +z, so "against a wall"
   turns +z into the room. **API:** `POST /api/projects/:id/suggestions` with the editor's current scene
   (unsaved edits count). **Client:** `SuggestionsPanel` (room picker, reasons, one-click **Add** at the
   suggested spot), refreshed 0.7 s after the scene changes; library drops are placed at the pointer
   (floor raycast). Catalog names tidied ("Coffee table", not "Table coffee"). 9 recommender tests on the
   real catalog (consistency, anchoring, doors, determinism).

*Later:* a learned ranking (co-occurrence from user scenes) behind the same interface; let users set a
room's type in 3D; suggest alternatives (`alternatives[]` is returned but not shown yet).

### Phase 7 — Deferred  *(not active)*
VR/WebXR preview (keep the stub), template-based generation, AI copilot. Revisit after Phases 3–6.

---

## 5. Decisions Locked

- **Monetization dropped for the capstone** — no metering/plan limits/billing (retained in docs as
  *deferred*).
- **Sequencing: core loop → UX → smart feature.**
- **Furniture engine is a scene-aware recommender** (room size + objects present), a light rule/ML model
  behind a swappable interface — *not* a flashy LLM.
- **Image detection ships behind a plug-and-play detection contract** (`detection-v1`); the
  deterministic 2D editor is the cleanup safety net; models improve without breaking downstream.
- **VR deferred** — keep the stub button, decide later.
- **Codebase is TypeScript-first** (client + server strict; AI service stays Python).
- (From earlier) storage abstracted now, R2 wired at deploy time; no live deploy yet.
- **Scale comes from user calibration** in the 2D editor (drag a known length) — not from a guess at upload
  time. OCR of dimension text may automate it later.
- **The uploaded image stays visible as a trace layer**, 1:1 with canvas pixels (canvas sized to the image).
- **Wall welding happens in the bridge, not the detector**, so every detector benefits.
- **Model inference runs in PyTorch, no ONNX** (2026-10-16, superseding "CPU via ONNX"). It runs on the
  team's GPU PC; CPU works (~1 s/plan) for anyone developing without an NVIDIA GPU. Torch comes from the
  **CUDA 12.6** build (needed for the Pascal Quadro P6000).
- **The AI service stays on the GPU PC** when the API moves to the cloud, reached through a **Cloudflare
  Tunnel** with a shared secret. In Docker it runs as a GPU image with the weights **mounted** from
  `Ai-service/Model/`, next to a `cloudflared` container.
- **No silent detector fallback:** an unavailable model makes the AI service report 503 and the import
  fail with the reason.
- **Model weights are distributed by the project lead**, never via git (`*.pt` is gitignored).
- **Python tooling is uv** (`pyproject.toml` + `uv.lock`), not pip/requirements.txt.
- **All development is on Windows** (GPU for training + Docker Desktop) as of 2026-10-16, and the repo
  must stay runnable by anyone on Windows with npm + uv.

---

## 6. Immediate Next Step

1. Run the root `docker-compose.yml` stack (server + AI) end to end; deploy the server and point it at the
   tunnel; get a domain for a permanent (named) tunnel.
2. Later: real-world test images (3b.6); tune the vectorizer where the evaluation shows losses (rooms that
   don't close even from ground truth).

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

- ~~**Merge-cleanup not yet committed.**~~ Resolved (`2909750`); the three leftover duplicate files were
  deleted in Phase 4.
- **Client dependency audit (2026-10-20):** `npm audit fix` (non-breaking) took the client from 24 issues
  to 11. The 4 left in the shipped app are all `@grpc/grpc-js` under Firebase's Firestore, a server-side
  library the browser app doesn't use (it only uses Firebase Auth); npm's suggested "fix" is a downgrade to
  firebase 9, so it was not applied. The other 7 are in build tools (old Tailwind 3 internals), which
  never ship to users; clearing them means the Tailwind 4 upgrade. Never run `npm audit fix --force`
  blindly (it jumps major versions).
- ~~**Phase 3 is uncommitted.**~~ Resolved (`fde4080`).
- **The AI host is one PC.** When it's off or asleep, imports fail (with a clear message; the editor still
  opens for manual tracing). Acceptable for a capstone; a cloud GPU is the scale path (`03`).
- **Model licence:** CubiCasa5K is CC BY-NC 4.0, so treat the model as non-commercial.
- **CI downloads CUDA PyTorch** (several GB) for the AI-service job; slow but correct.
- **Docker unverified.** The `contracts/` build-context fix has never been built; the server image would
  have crashed at startup since Phase 2.
- ~~**`server` `npm test` is POSIX-only.**~~ Resolved: it passes a glob to `node --test` (Node ≥ 22; CI
  moved to Node 22).
- **Detection is probabilistic.** The model still misfires on some plans (railings, furniture outlines),
  and is untested on real photos and non-Finnish plans; the deterministic 2D editor is the cleanup
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
