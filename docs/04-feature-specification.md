# XPLOR — Feature Specification

> **Type:** Foundational document. The **authoritative feature set** that drives development. It defines
> *what to build* and *how to know it is done* (acceptance criteria) for the MVP, and outlines the
> post-MVP direction. It is **timeless** — it describes target behavior, not build status. Track
> progress in `docs/status-reports/`.

---

## How to Read This Document

- **Epics** group related features by product area (`E#`).
- **Features** are individually shippable units (`F#.#`), each with **acceptance criteria** — the
  checklist that must be true for the feature to be considered done.
- **MVP** features are specified in full. **Future** features are outlined (intent + rough scope) and
  will be expanded to full detail when they are pulled into scope.
- Acceptance criteria are written to be testable. "Done" means every criterion is met **and** covered by
  at least one automated test (see `05-development-guidelines.md`).

**Definition of Done (applies to every feature):**
- [ ] All acceptance criteria met.
- [ ] Input validated against its contract / schema; errors return the correct status code.
- [ ] Ownership/authorization enforced where a resource is involved.
- [ ] At least one automated test covers the happy path and one failure path.
- [ ] No secrets or local-only artifacts introduced; `.env.example` updated if new config is added.

---

## Scope (Capstone)

The product is the **working, polished pipeline** and the backend that supports it:

> **Log in → create a project → get a floor plan into the 2D editor (draw it, *or* upload an image and
> have it detected) → convert it to a 3D scene → edit it in the 3D editor → save it durably**, with a
> cohesive UI, real error feedback, and a **scene-aware furniture suggestion engine**.

**In scope for the capstone:** the deterministic draw→3D core (E3–E7), **image detection Path B (FB)**, a
**smart furniture recommender (FR)**, and the **UX/polish** work (E9 + editor features below).

**Deferred / out of scope:** **payments and metering** (E8 F8.2/F8.3, FP) — *monetization is dropped for
the capstone*; **VR** (FV) — *the button is a deferred stub*. These are retained below for historical
context, marked **Deferred**.

> **Note on Jobs:** `Job` records remain (F8.1) as the async processing/observability unit for detection
> and conversion. What is dropped is **metering and plan enforcement** — Jobs are no longer billable.

---

## E1 — Accounts & Authentication

### F1.1 — Email/password registration
- [ ] User registers with name, email, password.
- [ ] Password policy enforced (min length + at least one capital); weak passwords rejected with a clear message.
- [ ] Duplicate email rejected.
- [ ] Password stored only as a bcrypt hash.
- [ ] On success, the server returns an application-issued JWT.

### F1.2 — Email/password login
- [ ] Valid credentials return a JWT; invalid return `401` without revealing which field was wrong.
- [ ] Accounts created via Google (no password) are told to use Google sign-in.

### F1.3 — Google sign-in
- [ ] Client obtains a Firebase ID token via Google popup.
- [ ] Server verifies the token with Firebase Admin, upserts the user, and returns the application JWT.

### F1.4 — Protected-route auth
- [ ] Every protected route requires a valid application JWT (`Authorization: Bearer`).
- [ ] Invalid/expired tokens return `401` and stop the request (no fall-through).
- [ ] `req.user` is populated from the database for downstream handlers.

### F1.5 — Session UX (frontend)
- [ ] Unauthenticated access to protected pages redirects to login.
- [ ] Token is stored client-side and attached to every API call.

---

## E2 — Project Management

### F2.1 — Create project
- [ ] User creates a project with a name and type (`2d`).
- [ ] Project is owned by the creating user; created empty (`canvas` = empty elements).

### F2.2 — List projects
- [ ] Dashboard lists **only the current user's** projects, newest first.
- [ ] Loading, empty, and populated states are all handled.

### F2.3 — Open / read project
- [ ] `GET /projects/:id` returns the project **only to its owner**; otherwise `401`/`404`.

### F2.4 — Save project canvas
- [ ] `PUT /projects/:id` persists the `canvas` payload.
- [ ] **Ownership is checked** before writing; a non-owner cannot overwrite a project.
- [ ] The `canvas` payload is validated against the `canvas` contract; invalid payloads return `400`.

### F2.5 — Delete project
- [ ] Owner can delete; cascades remove dependent scenes/jobs.
- [ ] Non-owner is refused.

---

## E3 — 2D Editor (Path A)

### F3.1 — Draw walls
- [ ] Click-drag creates a wall segment with configurable thickness.
- [ ] Straight and curved (quadratic) walls are supported.
- [ ] Live length feedback during drawing.

### F3.2 — Snapping
- [ ] 90° angle snapping while drawing (with a modifier override).
- [ ] Endpoint/midpoint snapping so connected walls share vertices.

### F3.3 — Doors
- [ ] A door is placed **attached to a wall** (snaps to the wall, inherits its angle).
- [ ] Door swing is visualized; door is movable along the wall and removable.

### F3.4 — Windows
- [ ] A window is placed **attached to a wall**, inheriting the wall's curvature.
- [ ] Window is resizable, movable along the wall, and removable.

### F3.5 — Edit & manipulate
- [ ] Select, move, delete elements; edit properties (thickness/curvature/length; door & window dimensions).
- [ ] Undo/redo across all edit actions.

### F3.6 — Canvas view controls
- [ ] Zoom (wheel + buttons) and **fit-to-screen**.
- [ ] **Pan** the canvas (drag-to-pan tool).

### F3.7 — Autosave & manual save
- [ ] Edits autosave (debounced) to `PUT /projects/:id` with a visible Saving/Saved/Error indicator.
- [ ] The persisted payload conforms to the `canvas` contract (including project scale and wall height).

### F3.8 — Export image
- [ ] Export the current plan as a PNG.

### F3.9 — Real-world measurements *(capstone polish)*
- [ ] Dimension readouts use the project's **metres** (via the stored px/m scale), not raw pixels.
- [ ] A measurement/dimension tool reports real-world lengths between two points.

### F3.10 — Group manipulation *(capstone polish)*
- [ ] A marquee/multi-selection can be **moved, duplicated (copy/paste), and nudged** as a group — not
      just deleted.
- [ ] The 2D canvas is **responsive** to window resize.

---

## E4 — Canvas → Scene Conversion (the deterministic core)

### F4.1 — Deterministic converter
- [ ] A validated `canvas` is converted to a `scene` (`rooms`, `assets`, `lighting`, `materials`).
- [ ] The same input always produces the same output (deterministic; no randomness).
- [ ] Walls (straight + curved), attached doors/windows, project scale, and wall height are all
      reflected in the resulting 3D geometry.
- [ ] Invalid or unclosed geometry is reported with an actionable error, not a silent/garbage scene.

### F4.2 — Convert action (frontend)
- [ ] From a 2D project, the user triggers "Convert to 3D."
- [ ] Conversion runs as a **job** the frontend can poll; the UI shows progress and a terminal result.
- [ ] On success, the user is taken to the 3D editor with the resulting scene loaded.

---

## E5 — Scene Storage & Versioning

### F5.1 — Create scene version
- [ ] Converting or saving inserts a new `Scene` row; the newest becomes the active version.
- [ ] `Scene(projectId, version)` is unique.

### F5.2 — Optimistic concurrency
- [ ] Saving includes the `baseVersion` the client edited from.
- [ ] A stale `baseVersion` (someone else saved first) returns **`409 Conflict`**; a fresh one succeeds
      and increments the version.

### F5.3 — Read scenes
- [ ] Fetch the active scene for a project and list version history — owner-scoped only.

---

## E6 — GLB Render Pipeline

### F6.1 — Render service (`/v1/render-glb`)
- [ ] A stateless FastAPI endpoint accepts a `scene`, validates it against `scene-v1`, and returns a GLB
      mesh built with `trimesh`.
- [ ] Invalid scenes return a structured `400`; the service is otherwise stateless (no DB writes).
- [ ] The service starts cleanly from a documented command and passes a `/health` check.

### F6.2 — Render worker → R2
- [ ] The DB worker leases a `render` job (`FOR UPDATE SKIP LOCKED`), calls the render service, and on
      success uploads the GLB to R2.
- [ ] The GLB artifact URL is recorded on the job; failures record an `errorMessage` and mark the job
      `failed` with retry/backoff.

### F6.3 — Load GLB in 3D editor
- [ ] The 3D editor loads the rendered GLB (the scene's derived mesh) for the project being opened.

---

## E7 — 3D Editor

### F7.1 — Scene load & persistence
- [ ] Opening a 3D project loads its **canonical scene** from the backend (not an empty scene).
- [ ] "Save" persists the edited scene back to the backend as a new version (see E5).

### F7.2 — Object placement & transforms
- [ ] Add objects; move/scale/rotate with on-canvas controls and numeric inputs.
- [ ] Transforms respect room bounds (no placing objects outside the space).

### F7.3 — Materials & lighting
- [ ] Edit object color and material; upload/replace textures.
- [ ] Add and configure lights (color, intensity), rendered in the scene.

### F7.4 — Asset library
- [ ] Browse a server-provided asset library.
- [ ] Place a library asset into the scene (drag-and-drop **with a working drop handler**, or click-to-place).
- [ ] Assets referenced in a saved scene have durable (R2) URLs — no local-only references persisted.

### F7.5 — Undo/redo
- [ ] Discrete edit actions are undoable/redoable without desync from transform drags.

### F7.6 — Transform gizmo modes *(capstone polish)*
- [ ] The viewport gizmo can switch between **translate / rotate / scale** (today it is translate-only).

### F7.7 — Asset search *(capstone polish)*
- [ ] The asset-library search box **filters** the catalog (today it is a dead control).
- [ ] The catalog is served from an **owned/local route**, not a hardcoded external URL.

---

## E8 — Jobs (async work) · ~~Metering~~ *(metering Deferred)*

### F8.1 — Job lifecycle
- [ ] Convert and render operations create `Job` records that move through
      `pending → processing → completed|failed`.
- [ ] `GET /jobs` (owner-scoped, filterable by project/status) and `GET /jobs/:id` (poll) are available.
- [ ] Terminal jobs record duration and, on failure, an error message.

### F8.2 — Editor-session metering — **Deferred (monetization dropped)**
- [ ] ~~The 3D editor pings `/editor/activity` every 5–10 minutes.~~
- [ ] ~~A continuous session is one job; after 1 hour it rolls into a new job.~~

### F8.3 — Plan-limit enforcement — **Deferred (monetization dropped)**
- [ ] ~~Before any job is created, the backend checks `jobsUsedThisPeriod < plan.jobsPerMonth`.~~
- [ ] ~~Over-limit requests return `403`; usage counters increment atomically with job creation.~~

---

## E9 — Platform Baseline (cross-cutting, MVP)

### F9.1 — Validation & errors
- [ ] All request bodies validated (Zod / schema); a single central error handler formats every error
      response.

### F9.2 — Health & CORS
- [ ] `/live` and `/ready` endpoints exist; CORS uses a configurable allow-list.

### F9.3 — Storage discipline
- [ ] Uploads go to R2 via pre-signed URLs; no user files are written to local disk in production.

### F9.4 — Config & secrets
- [ ] All services read config from env vars; each ships a committed `.env.example`; no secrets in the repo.

### F9.5 — CI
- [ ] CI runs lint + build + tests for server, client, and the Python service on every PR.

### F9.6 — User-facing feedback surface *(capstone polish)*
- [ ] Every user-triggered failure (fetch/create/save/convert/import/upload) surfaces a **visible
      notification** (toast), not a silent `console.error`.
- [ ] Loading and empty states are handled consistently across pages and both editors.
- [ ] The client presents **one cohesive visual identity** (shared design tokens + UI primitives), not the
      current split between the plain-CSS pages and the Tailwind 3D editor.

---

## F — Future Direction (outlined)

Each item below becomes a full epic (with acceptance criteria) when pulled into scope. **FB** and **FR**
are **Active for the capstone**; the rest remain future/deferred.

- **FB — Image Detection (Path B) · ACTIVE (capstone).** Upload a floor-plan image → CV detection → a
  `canvas-v2` payload matching the same contract Path A produces, so it reuses the entire E4–E7 pipeline.
  Ships the **current heuristic detector** behind a **stable, swappable detection contract**
  (`contracts/detection-v1`) so a stronger ML model can drop in without any downstream change. The
  deterministic 2D editor is the cleanup surface for rough detections.
- **FR — Smart Furniture Suggestion Engine · ACTIVE (capstone).** A **scene-aware recommender**: given the
  scene JSON (room type/size + the objects already placed), it ranks catalog assets to add, surfaced in a
  Suggestions panel with one-click deterministic placement inside the room. Starts as a light rule/ML model
  behind a swappable `recommend(sceneContext) → RankedAssets` interface (not necessarily vector search).
  Prerequisites: structured asset persistence in the scene (asset `roomId` + transform, not a baked glTF
  blob), room-type semantics, and an owned asset catalog.
- **FV — VR Pipeline · Deferred.** Convert a scene to a VR-compatible format, reduce scene complexity,
  store the VR output, and deliver an interactive walkthrough. *A stub button exists; deferred.*
- **FP — Billing & Payments · Deferred (dropped for capstone).** Payment provider integration, subscription
  lifecycle, webhooks, invoices — would layer on the (now-descoped) plan/usage model.
- **FA — Asset Management Backend.** Full CRUD for the asset library, categories, search, and user
  custom-asset uploads. *(A minimal owned catalog is delivered as part of FR; full CRUD is future.)*
- **FT — Template-Based Generation.** Pre-built layouts for faster onboarding.
- **FC — AI 3D Copilot.** Natural-language, context-aware design actions.
