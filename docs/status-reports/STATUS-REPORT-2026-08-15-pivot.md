# XPLOR — Status Report (Capstone Pivot + Current-State Audit)

- **Generated:** 2026-08-15
- **Nature:** Direction change + a fresh audit of the codebase, made to re-plan the roadmap. This report
  records **(a)** the pivot decision, **(b)** the verified current state of the three areas the pivot
  depends on, and **(c)** a regression that was found and fixed. Point-in-time only — the living plan is
  `docs/06-roadmap.md`; the foundational docs (`01`–`05`) carry no build progress.
- **Method:** Three parallel read-only code explorations (image→2D pipeline, UI/editor feature surface,
  asset/furniture foundation) + direct reads of the boundary files. Not a live browser smoke test.

---

## 1. The Pivot

XPLOR is now a **capstone project**. The direction changed as follows:

- **Monetization is dropped entirely** — no metering, plan limits, or billing. (Retained in the
  foundational docs as *deferred*, not deleted: `01` §7, `04` E8/FP, `02` reconciliation note.)
- **The goal is a polished, fully working product** around the core loop:
  **upload a floor-plan image → it populates the 2D editor → convert to a 3D model.**
- **Three priorities, in order:** (1) make the core loop work end-to-end; (2) polish — beautify the UI,
  fix UX, add obvious missing editor features; (3) add a **scene-aware furniture suggestion engine**.

**Decisions locked this session:**
- Sequencing: **core loop → UX → smart feature**.
- Furniture engine: analyze the **scene JSON** (room size + objects already present) → recommend; a light
  ML/rule model behind a **swappable interface**, *not* a flashy LLM.
- Image detection: ship the **current heuristic detector** now (deterministic 2D editor is the cleanup
  safety net), behind a **plug-and-play seam** so a stronger model drops in without breaking downstream.
- VR: **deferred** — keep the stub button, decide later.

---

## 2. Verified Current State

### 2.1 Image → 2D path — **~70% built, not missing**
- **Exists & correct:** a *real* OpenCV detector (`Ai-service/app/services/detector.py`,
  `method:"opencv-heuristic"`; doors/windows intentionally empty), a contract-correct server endpoint
  (`POST /api/projects/:id/upload-floor-plan` → `uploadFloorPlan`, `server/controllers/projectController.ts`),
  `Job` creation, and the AI client (`server/services/aiService.ts`, calls `POST /process-floor-plan`).
- **Two breaks make it non-functional end-to-end:**
  1. **No client upload UI** anywhere — nothing in `client/src` posts an image to the endpoint or polls the
     job.
  2. **Shape + storage mismatch** — detection is written as raw `DetectionResult` into a **`Scene`** row,
     but the 2D editor reads **`canvas-v2` from `project.canvas`**. The two never meet.
- **The fix is small:** `DetectionResult` walls (`{startX,startY,endX,endY,thickness}`) and openings
  (`{x,y,width}`) are the **same flat shape as legacy canvas-v1**, so the bridge maps detection → canvas-v1
  elements → reuses `server/services/converter/normalizeCanvas.ts` (already emits canvas-v2), written to
  `project.canvas`. That boundary is the plug-and-play ML seam (to be formalized as `contracts/detection-v1`).

### 2.2 Furniture foundation — **scaffolding exists; engine + linkage missing**
- **Exists:** `Asset`/`UserAsset` Prisma tables; a draggable asset browser
  (`client/src/components/Editor/AssetList.tsx`, currently pointing at a **hardcoded external Railway URL**);
  runtime GLB import + scale-normalization + grounding; a scene-v1 **`asset` contract**
  (`{id, source, transform, materialId}`).
- **Missing:** asset↔room linkage (`roomId`); room **type** semantics (`detectRooms.ts` yields polygon +
  area only); **structured asset persistence** — 3D saves bake to an opaque glTF blob, so placed furniture
  does not round-trip as data, and `buildFromSceneV1.ts` ignores the `assets[]` array; and the recommender
  itself (only a naive 4-wide grid places dropped assets today).

### 2.3 UI/UX — **split-brain, no notification surface**
- **Two visual identities:** landing/auth/dashboard/2D use hand-written dark-navy CSS
  (`client/src/styles/*.css`); the 3D editor uses Tailwind gray — "two products stitched together." No
  design tokens, no shared UI primitives.
- **No toast/notification system at all** — every failure path (fetch/create/save/convert/import/upload)
  is a silent `console.error`. This is the most pervasive UX gap.
- Also: dead landing links/CTAs, emoji-as-UI, non-responsive 2D canvas, 2D dimensions shown in **pixels**
  despite a stored px/m scale, translate-only 3D gizmo, dead deps (`framer-motion`, `gsap`), duplicate
  legacy files.

### 2.4 What already works (unchanged from prior reports)
The deterministic **draw→3D** spine: log in → create project → 2D draw/edit (walls, curves, doors,
windows, labels, snapping, undo/redo, autosave) → **Convert to 3D** → versioned canonical `Scene` with
carved openings + room floors → 3D editor (orbit, add/transform, materials/textures, GLB export with
retention) → save/reload. Server + client are TypeScript-strict; converter has unit tests in CI.

---

## 3. Regression Found & Fixed — merge reintroduced pre-TypeScript files

A merge of `main` + `integrated-editors` (unrelated histories) reintroduced **stale `.jsx`/`.js` files
that shadowed their `.tsx`/`.ts` counterparts**. Because Vite/tsx resolve `.jsx`/`.js` before `.tsx`/`.ts`
for extensionless imports, the app silently ran the **old editor-less code** — no projects visible, editors
unreachable (login still worked). The DB was never touched (33 projects intact).

**Fix (in the working tree, staged, not yet committed):** removed **18 stale duplicate files** (12 client
`.jsx`/`.bak`, 5 server `.js`, dead `server/models/`). Client rebuild restored the full editor bundle;
server typecheck clean; `GET /projects` returns the user's projects. **Action still pending: commit + push
these deletions so `main` is fixed.**

---

## 4. What's Next

The revised, capstone-focused roadmap is in `docs/06-roadmap.md`:
- **Phase 3** — close the image→2D→3D core loop (detection seam + bridge + upload UI).
- **Phase 4** — UX foundation & visual unification (toast system, design tokens, shared primitives).
- **Phase 5** — obvious editor features (2D metre measurements + group ops; 3D gizmo modes + asset search).
- **Phase 6** — scene-aware furniture suggestion engine (structured asset persistence, room semantics,
  owned catalog, swappable recommender).
- **Phase 7 (deferred)** — VR/WebXR, templates, copilot.

**Open technical debt:** commit the merge-cleanup deletions; recover the migration-history baseline before
any new schema change (the live Neon DB is ahead of git by two uncommitted migrations — never accept a
`prisma migrate dev` reset).
