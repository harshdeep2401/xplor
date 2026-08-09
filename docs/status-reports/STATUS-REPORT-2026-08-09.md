# XPLOR — Codebase Status Report

> **Generated:** 2026-08-09 07:51 IST
> **Against:** git branch `integrated-editors` @ `52c643a` (working tree clean, 6 commits ahead of origin)
> **Method:** static read of the committed source tree — **no runtime execution**. Claims that depend on
> running the code (e.g. "does the FastAPI service boot") are marked *inferred from imports*.
> **Compared to:** `docs/01-master-reference.md`, `docs/02-backend-architecture.md`,
> `docs/03-deployment-and-scalability.md` (all revised 8 Aug 2026).

---

## 1. Executive Summary — Where We Stand

XPLOR today is a **working frontend prototype in front of a lean, partly-wired backend, with an AI
service that is real code but points the wrong way and does not currently start.** The best-developed
layer is the client: the landing/auth/dashboard flow and the **2D Konva editor** are genuinely
functional and talk to the real backend. The **3D editor** is a capable local toy that is **not
connected to persistence**. The backend does auth, project CRUD, floor-plan upload, and job
read/update — more than the reference docs credit it for on jobs — but has **no durable queue, no R2
upload, no plan enforcement, and a couple of real correctness/security bugs.** The AI microservice is
a classical-CV floor-plan detector that **contradicts the documented direction** (the docs say the AI
service was re-scoped to a GLB renderer and image detection deferred — the code did the opposite) and,
as committed, **fails to import** because of a missing module.

A second, important meta-finding: **the reference docs themselves are now out of date and internally
contradictory with the code.** Even the "reconciled" 8-Aug docs lag reality on jobs, misstate the AI
service direction, and describe a `Scene(projectId, version)` uniqueness constraint that does not
exist. A separate root-level `xplor_project_status.md` (15 Jun) is fully aspirational and should not
be trusted at all.

### RAG verdict

| Layer | Status | One-line reason |
|-------|--------|-----------------|
| **Frontend** | 🟢🟡 Green-ish | 2D editor + auth + dashboard genuinely work; 3D editor not persisted; no route guards. |
| **Backend** | 🟡 Amber | Auth/projects/jobs live; no queue/R2/billing; ownership + env bugs. |
| **DB / schema** | 🟢🟡 Green-ish | Full 13-model schema migrated; but half unused and missing a key unique constraint. |
| **AI service** | 🔴 Red | Real code, wrong direction, **won't boot** (missing `app/schemas.py`). |
| **Infra / CI / tests** | 🔴 Red | No Docker, no CI, no tests, no contracts; secrets on disk. |
| **Overall** | 🟡 **Amber** | A demoable slice exists; the end-to-end 2D→3D→VR pipeline does not. |

---

## 2. Working vs. Not Working — Layer by Layer

Legend: ✅ working · ⚠️ partial / caveated · ❌ absent or broken.

### 2.1 Frontend (`client/`)

React 19 + Vite 8, Konva 10 (2D), three 0.184 / @react-three/fiber 9 / drei (3D), Firebase 12,
react-router 7, axios + native fetch.

| Feature | State | Notes |
|---------|-------|-------|
| Build / tooling | ✅ | Modern stack, `dev`/`build`/`lint` scripts. `three-stdlib` used but undeclared (resolves via drei). |
| Routing | ✅ | `/`, `/login`, `/signup`, `/dashboard`, `/editor/2d/:id`, `/editor/3d/:id` (`src/App.jsx`). |
| Route protection | ⚠️ | **No route guard component / AuthContext.** Pages self-redirect on missing token; token in `localStorage` only. |
| Auth (email + Google) | ✅ | `src/services/authService.js`, `Login.jsx`, `Signup.jsx`. Google popup → backend `/auth/google-login`; backend JWT stored + sent as `Bearer` manually. |
| Dashboard — list/create projects | ✅ | **Real** `GET /projects` + `POST /projects` (2d/3d). Loading/empty/populated states handled. |
| **2D Konva editor** (`src/pages/Editor.jsx`, ~1218 lines) | ✅ | Walls (straight + `curvature` scalar), doors, windows, labels, 90° snap, endpoint/edge snap, zoom + Fit, undo/redo, **1500 ms debounced autosave** (`PUT /projects/:id`), PNG export. |
| 2D pan | ❌ | A `'pan'` tool is referenced in a comment but there is **no pan button and no drag-to-pan handler**; view moves only via zoom/Fit. |
| **3D R3F editor** (`src/pages/Editor.tsx`, `src/editor/**`) | ⚠️ | Primitive add, transforms (bounds-clamp + collision revert), color + texture upload, real point lights, GLB import/export, copy/paste all work — but **local state only**. |
| 3D — load a saved project | ❌ | `Editor.tsx` never reads `:projectId` / fetches; a saved 3D project **opens empty** (reads only `location.state`). |
| 3D — save / VR preview | ❌ | "Save to Backend" and "VR Preview" are **`console.log` stubs**. |
| 3D — asset-library placement | ❌ | `AssetList.tsx` lists assets (from a *different* railway host) as draggable tiles, but **no `onDrop`/`onDragOver` exists** — dropping does nothing. |
| **2D → 3D conversion** | ❌ | **Absent entirely.** No converter, no "Convert to 3D", no path between the two editors. |
| Config hygiene | ⚠️ | `.env` committed with **real Firebase keys**; no `.env.example`. Import-casing quirks (`authService` vs `authservice.js`; 2D editor hardcodes `http://localhost:5001/api`) that **break on case-sensitive Linux CI**. |

### 2.2 Backend (`server/`)

Express 5, Prisma 6, firebase-admin, jsonwebtoken, bcryptjs, multer. **Not installed:** BullMQ,
socket.io, zod, any AWS/S3 SDK, mongoose.

| Feature | State | Notes |
|---------|-------|-------|
| App entrypoint (`server.js`) | ✅ | Mounts `/api/auth`, `/api/projects`, `/api/jobs`; `express.json()`; CORS **hardcoded** to localhost; serves `/uploads` from **local disk**. |
| Health endpoints | ❌ | No `/live` / `/ready`. Only `GET /` → `"XPLOR API Running"`. |
| Global error handler | ❌ | None. Multer `fileFilter` errors are uncaught. |
| Auth (register / login / google) | ✅ | `authController.js`: bcrypt, local JWT (7d), Firebase ID-token verify **only** in `googleLogin`. |
| `protect` middleware | ⚠️ | **JWT-only** — verifies the app's own token, not Firebase, on protected routes (`authMiddleware.js`). Control flow after a failed verify is not `return`-guarded. |
| Project CRUD | ✅ | create / get / list / save(PUT) / delete (`projectController.js`), scoped to `req.user.id`. |
| **`saveProject` ownership** | ❌ **BUG** | PUT `/projects/:id` updates by id with **no ownership check** — any authenticated user can overwrite another user's canvas. |
| Floor-plan upload | ✅ | `POST /projects/:id/upload-floor-plan` → multer to **local disk** → creates `Job` → calls FastAPI **synchronously** → creates `Scene`. AI errors don't fail the request. |
| **Jobs** | ✅ | `GET /jobs`, `GET /jobs/:id`, `PATCH /jobs/:id/status` (`jobController.js`). **Docs 01/02 call these "schema only" — that is stale.** Status transitions are manual (a placeholder until a worker exists). |
| Durable queue / worker | ❌ | **No** BullMQ, no Redis, no `FOR UPDATE SKIP LOCKED`, no poller. Processing is inline + synchronous. |
| Services | ⚠️ | Only `aiService.js` exists. `jobTracker`, `fileUpload`, `sceneManager`, `billing` — **absent**. |
| `aiService.js` env keys | ❌ **BUG** | Reads `AI_SERVICE_URL` / `AI_SERVICE_TIMEOUT_MS`, which are **not in `.env`** (env has `FASTAPI_WEBHOOK_URL` / `FASTAPI_SECRET`) → silently defaults to `localhost:8000`. |
| Plan enforcement / billing | ❌ | Schema exists; **no logic**. No quota middleware. |
| R2 / S3 upload | ❌ | R2 keys sit in `.env` but **no code uses them**; uploads go to local disk. |
| `firebaseAdmin.js` robustness | ⚠️ | Crashes at import if `FIREBASE_PRIVATE_KEY` is unset (unguarded `.replace`). |
| Legacy Mongoose models | ⚠️ | `models/User.js` / `Project.js` present but **dead** (not imported; mongoose not installed). |

### 2.3 Database & Prisma schema (`server/prisma/`)

| Item | State | Notes |
|------|-------|-------|
| Schema migrated to Neon | ✅ | 13 models, **all `cuid()` IDs** (not uuid). 2 migrations: `..._add_core_models`, `..._align_with_architecture`. |
| Models wired to code | ⚠️ | Only `User`, `Project`, `Scene` (write-only), `Job` are used. **`Asset`, `UserAsset`, `VrOutput`, `AuditLog`, `SubscriptionPlan`, `UserSubscription`, `EditorSession` are migrated but referenced by no code.** |
| **`Scene(projectId, version)` unique** | ❌ | **Does not exist** — only a *non-unique* `@@index([projectId])`. Doc 02 §9 asserts this uniqueness + 409-on-stale-save; neither is implemented. |
| Job indexes | ✅ | `@@index` on `userId`, `status`, `createdAt`. |

### 2.4 AI service (`Ai-service/` — capital "A")

Real FastAPI app: `app/main.py`, `app/config.py`, `app/routers/floor_plan.py`,
`app/services/detector.py`, `app/services/image_fetcher.py`.

| Item | State | Notes |
|------|-------|-------|
| FastAPI app + endpoints | ⚠️ | `GET /`, `GET /health`, **`POST /process-floor-plan`** (image → wall/room JSON). |
| **Boots as committed?** | ❌ **BROKEN** | `main.py` (and the router) do `from app.schemas import …`, but **`app/schemas.py` does not exist** (only a top-level `Ai-service/schemas.py`). No `app/__init__.py`. → `ModuleNotFoundError` at import. *Inferred from imports + confirmed file absence.* |
| Detector | ⚠️ | `detector.py` is a real classical-CV pipeline (Canny + Hough + contours). Walls/rooms only; **doors/windows return empty** — self-described stub, not a trained model. |
| **`/v1/render-glb` (GLB renderer)** | ❌ | **Does not exist.** No `trimesh`, no GLB output. Deps: fastapi/uvicorn/pydantic/httpx/opencv/numpy. |
| Dockerfile | ❌ | Absent. |

### 2.5 Infra / cross-cutting

| Item | State | Notes |
|------|-------|-------|
| `contracts/` (`canvas-v2`, `scene-v1` JSON Schemas) | ❌ | **Absent anywhere in the repo.** |
| Docker / docker-compose | ❌ | Absent for all three services. |
| CI (`.github/workflows`) | ❌ | Absent — despite a commit titled "add and **test** job creation endpoints". |
| Tests (any language) | ❌ | **None** (no Jest/Vitest/Pytest files). |
| Secrets hygiene | ⚠️ | `.gitignore` correctly excludes `.env` ✅, but real `.env` files with secrets exist on disk (server + client). No `.env.example` for server/client. |
| Git | ✅ | Single repo; branch `integrated-editors`, clean, 12 commits total, 6 ahead of origin. |

---

## 3. Critical Issues (Act First)

1. **🔴 AI service won't start** — add `app/schemas.py` (or fix imports to the top-level `schemas.py`)
   and an `app/__init__.py`. Until then `POST /process-floor-plan` is unreachable and the upload flow's
   synchronous AI call always fails (silently — errors don't fail the request).
2. **🔴 Broken auth boundary on `saveProject`** — PUT `/projects/:id` has no ownership check; add the
   same `project.userId !== req.user.id → 401` guard used elsewhere.
3. **🟠 `aiService.js` env-key mismatch** — it reads `AI_SERVICE_URL`/`AI_SERVICE_TIMEOUT_MS` but `.env`
   defines `FASTAPI_WEBHOOK_URL`/`FASTAPI_SECRET`. Reconcile the names or it always hits `localhost:8000`.
4. **🟠 Committed secrets** — real Firebase keys are in `client/.env` (client keys, lower risk) and
   `server/.env` holds Firebase private key + R2 creds. They're gitignored now; rotate anything that was
   ever pushed and add `.env.example` files.
5. **🟠 Case-sensitivity landmines** — `authService`↔`authservice.js` and other casing/hardcoded-URL
   quirks work on macOS but **break on Linux CI/containers**. Fix before any Docker/CI work.

---

## 4. Reality vs. the Three Reference Docs

### 4.1 vs. `01-master-reference.md`

| Doc claims | Code shows | Verdict |
|------------|-----------|---------|
| First slice = native structured 2D editor → deterministic 2D→3D; image AI deferred | 2D editor ✅, but **no converter at all**, and the AI service **implements image detection** (not deferred) | ⚠️ Stale / **Contradiction** |
| Backend: auth + Project CRUD live; Scene/Job/… "scaffolded, not wired" | Auth + CRUD ✅; **Jobs are wired** (routes+controller); Scene is written on upload | ⚠️ Stale (jobs further along) |
| AI service = venv only, toward a stateless GLB renderer | Real FastAPI image-detector; **no GLB renderer**; won't boot | ❌ Contradiction |
| Dashboard fetches real projects | ✅ | ✅ Match |

### 4.2 vs. `02-backend-architecture.md`

| Doc claims | Code shows | Verdict |
|------------|-----------|---------|
| Prisma + Express 5 + Firebase/JWT/bcrypt | ✅ | ✅ Match |
| Only `User`/`Project` wired; Job "⏳ schema only" | Job **is** wired (list/get/patch) | ⚠️ Stale |
| Storage = Cloudflare R2 pre-signed (not yet wired) | Not wired **and** local-disk uploads exist instead; R2 SDK not installed | ⚠️ Stale (diverged to local disk) |
| AI service = `/v1/render-glb` (GLB, trimesh) | `/process-floor-plan` (OpenCV); no GLB, no trimesh | ❌ Contradiction |
| Job queue = Postgres `FOR UPDATE SKIP LOCKED` worker | **No queue/worker**; inline synchronous processing | ❌ Not built (as expected, but no scaffolding) |
| `Scene(projectId, version)` unique + 409 on stale save | **No unique constraint; no 409; no versioning endpoints** | ❌ Contradiction |
| Zod validation, error handler, health endpoints (Phase 0) | None present | ❌ Not built |

### 4.3 vs. `03-deployment-and-scalability.md`

| Doc claims | Code shows | Verdict |
|------------|-----------|---------|
| "Dockerize everything" | **No Dockerfiles / compose anywhere** | ❌ Not built |
| CPU GLB renderer on PaaS (Stage A) | No GLB renderer exists | ❌ Contradiction |
| R2 pre-signed uploads bypass PaaS | Local-disk uploads; R2 unused | ⚠️ Stale |
| CI gates (GitHub Actions), health endpoints, `pg_dump` backups | None of these exist | ❌ Not built |
| Neon + Prisma + Firebase Auth + `.env` gitignored | ✅ (all true) | ✅ Match |

> **Also note:** the root-level `xplor_project_status.md` (15 Jun 2026) claims contracts, a GLB
> renderer, a deterministic converter, Docker, CI, and 17 passing tests — **none of which exist.**
> It should be treated as an aspirational target and archived, not referenced.

---

## 5. Phase Scorecard (re-grading doc 02 §7 against code)

| Phase | Doc's claim | Actual | Grade |
|-------|-------------|--------|-------|
| **0** Security baseline (auth mw, ownership, Zod, error handler, health, CI) | 🟡 partial | Auth mw ✅; ownership partial (**`saveProject` gap**); no Zod/error-handler/health/CI | 🔴 Mostly not done |
| **1** Contracts + deterministic converter | 🔴 to build | Nothing exists | 🔴 Not started |
| **2** Durable jobs + scene versioning (409) | 🔴 to build | Job CRUD exists; **no worker, no versioning, no 409** | 🔴 Not started (partial job surface) |
| **3** E2E 2D→3D flow | 🟡 editors exist | Editors exist; **zero wiring between them** | 🔴 Not started |
| **4** FastAPI render-glb + R2 + Docker | 🔴 to build | FastAPI exists but **wrong endpoint + won't boot**; no R2/Docker | 🔴 Off-track |
| **5** Billing & plan enforcement | 🔴 to build | Schema only | 🔴 Not started |
| **6** VR pipeline | 🔴 to build | "VR Preview" = `console.log` | 🔴 Not started |

---

## 6. Risks & Recommended Next Steps (prioritized)

**P0 — stop-the-bleeding (days)**
1. Fix the AI-service import (`app/schemas.py` + `__init__.py`) so it boots; add a smoke test.
2. Add the ownership check to `saveProject`.
3. Reconcile `aiService.js` env keys with `.env`; add `.env.example` for server + client; rotate any
   previously-pushed secrets.
4. Add a global error handler + `/live` / `/ready` endpoints.

**P1 — decide direction, then build the missing spine (1–2 weeks)**
5. **Resolve the AI-service contradiction explicitly:** are we doing the documented GLB-renderer path,
   the image-detection path that's actually in the code, or both? Update the docs to match whichever
   wins — right now code and docs point in opposite directions.
6. Formalize `contracts/` (`canvas-v2`, `scene-v1`) and validate on read/write. Note the **current 2D
   canvas format is a bespoke flat `elements[]`, not `canvas-v2`** — the contract must either match it
   or a migration is needed.
7. Build the **2D→3D converter** and wire the 3D editor to load/save a canonical scene (today it's an
   isolated local toy).

**P2 — durability & deploy (2–4 weeks)**
8. Add `Scene(projectId, version)` uniqueness + versioning endpoints with 409-on-stale-save.
9. Move uploads to R2 pre-signed URLs; wire the durable Postgres job worker.
10. Dockerize all three services + a minimal GitHub Actions CI (lint/build/test) — **after** fixing the
    case-sensitivity issues, which will otherwise fail on Linux.

**P3 — monetization & VR** — billing/plan enforcement, then the VR pipeline (both greenfield).

---

## 7. Appendix

### 7.1 Live API endpoints (as mounted)

```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/google-login
GET  /api/projects/                          (protect)
POST /api/projects/                          (protect)
GET  /api/projects/:id                       (protect)
PUT  /api/projects/:id            (save)      (protect)   ⚠️ no ownership check
DELETE /api/projects/:id                     (protect)
POST /api/projects/:id/upload-floor-plan     (protect, multer .single('floorPlan'))
GET  /api/jobs/                              (protect)
GET  /api/jobs/:id                           (protect)
PATCH /api/jobs/:id/status                   (protect)
GET  /                                        "XPLOR API Running"
# AI service (does not boot as committed):
GET  /            GET /health            POST /process-floor-plan
```

### 7.2 Key dependency versions

- **client:** react 19.2, vite 8.0, konva 10.2 / react-konva 19.2, three 0.184 / @react-three/fiber 9.6
  / drei 10.7, firebase 12.12, react-router-dom 7.14, axios 1.15.
- **server:** express 5.2, @prisma/client 6.4, firebase-admin 13.8, jsonwebtoken 9.0, bcryptjs 3.0,
  multer 1.4, cors 2.8, dotenv 17.4.
- **Ai-service:** fastapi 0.115, uvicorn 0.34, pydantic 2.10, httpx 0.28, opencv-python-headless 4.10,
  numpy 2.2. (No trimesh, no jsonschema.)

### 7.3 Prisma models (13)

`User`, `SubscriptionPlan`, `UserSubscription`, `Project`, `Scene`, `Job`, `EditorSession`, `Asset`,
`UserAsset`, `VrOutput`, `AuditLog` — all `cuid()` IDs. Wired to code: `User`, `Project`, `Scene`
(write), `Job`. Unused: the other 7.

### 7.4 Git log (12 commits)

```
52c643a Merge branch 'job-creation' into integrated-editors
5778272 Removed venv from repository
f556e5a Merge branch 'ai-serv' into job-creation
c6abb56 updated docs
a08b7f3 Add AI service innitialization
2258a0d Add AI service
33f1d18 feat: add and test job creation endpoints
e0774ab feat: dashboard fetching recent projects from backend
84effc8 Fix repository structure issue
5727ff7 chore: removed unnecessary nesting layer
30a7033 cleanup: remove macOS metadata files
50ddf3f 2d editor edit
```

### 7.5 Notable absences

`contracts/` · Docker/compose · `.github/workflows` · tests (any) · R2 wiring · durable queue/worker ·
`jobTracker`/`fileUpload`/`sceneManager`/`billing` services · `/v1/render-glb` · 2D→3D converter ·
route guards · `.env.example` (server/client).

---

*This report reflects the committed tree at `52c643a`. It reconciles against code, not the reference
docs; where the two disagree, the disagreement is flagged above (§4). The reference docs should be
updated to match — most urgently the AI-service direction and the jobs/Scene-versioning status.*
