# XPLOR — Backend Architecture

> **Type:** Foundational document. Describes the **intended technical architecture** — the target
> design every contributor builds toward. It is **timeless**: it does not track what is implemented.
> For implementation status, see `docs/status-reports/`.

> **Capstone reconciliation (2026-08-15).** Two parts of the *original* target design are now adjusted; the
> rest of this document stands:
> - **Billing / metering / plan enforcement is deferred** — monetization is dropped for the capstone.
>   Wherever this doc mentions `billing`, `SubscriptionPlan`/`UserSubscription` enforcement,
>   `checkPlanLimits`, `/editor/activity` metering, or the `/billing` API surface, treat it as **retained
>   design, not built**. `Job` remains as the async work/observability unit, minus the metering role.
> - **The FastAPI service currently implements Path B *detection*, not the GLB renderer.** Today it exposes
>   `POST /process-floor-plan` (image → `detection-v1`), and **GLB is produced client-side** (no
>   `/v1/render-glb` worker yet). The detection boundary is the stable, swappable contract
>   `contracts/detection-v1`; the Node API bridges it to `canvas-v2` (Module 5). The render-service design
>   below (Module 4 / §6) remains the eventual target.

---

## 1. Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite, Konva/react-konva (2D editor), Three.js + React Three Fiber + drei (3D editor) |
| Main API | Node.js 20+, Express 5 |
| ORM | Prisma (`@prisma/client`) |
| Database | PostgreSQL (Neon) |
| Auth | Firebase Authentication (client identity + Google OAuth) + Firebase Admin (server verification) + application-issued JWT + bcrypt |
| Render / AI service | FastAPI + Uvicorn (Python) |
| Geometry (render) | `trimesh`, `numpy` |
| Computer vision (detection) | OpenCV heuristic today; trained models (e.g. U-Net, ideally exported to ONNX for CPU inference) behind the `detection-v1` seam |
| Blob storage | Cloudflare R2 (AWS S3-compatible SDK) |
| Job queue | PostgreSQL (`FOR UPDATE SKIP LOCKED`) for the MVP; Redis + BullMQ at scale |
| Validation | Zod (Node), `jsonschema` (Python) |

**Guiding principles:**
- **PostgreSQL is the primary store.** ACID guarantees for billing/subscriptions; JSONB for scene data;
  relational integrity for `users → projects → scenes → jobs → billing`.
- **The database doubles as the job queue** in the MVP — no Redis until scale (see
  `03-deployment-and-scalability.md`).
- **Contracts are validated at the boundary.** `canvas` and `scene` payloads are validated against
  JSON Schema on every read and write.
- **The scene is canonical; GLB/VR are derived** and always regenerable.

---

## 2. Service Topology

```
                    ┌──────────────────────────────┐
                    │      API Gateway / Express 5  │
                    │  auth · projects · scenes ·   │
                    │  jobs · billing               │
                    └───────────────┬──────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            ▼                       ▼                        ▼
   ┌──────────────┐        ┌──────────────┐         ┌──────────────┐
   │  Main API    │        │ Render / AI  │         │  DB Worker   │
   │  (Node 20+)  │  HTTP  │  (FastAPI)   │  polls  │  (Node)      │
   │ auth·proj·   │───────▶│ scene → GLB  │◀────────│ leases jobs, │
   │ scene·job·   │        │ (trimesh);   │         │ calls render │
   │ billing      │        │ image→canvas │         │ → stores GLB │
   └──────┬───────┘        │ (CV)         │         └──────┬───────┘
          │                └──────────────┘                │
          ▼                                                ▼
   ┌──────────────┐                                 ┌──────────────┐
   │ Neon Postgres│  ◀── durable job queue ───────  │ Cloudflare R2│
   │ (JSONB+jobs) │      (FOR UPDATE SKIP LOCKED)    │ (GLB/assets) │
   └──────────────┘                                 └──────────────┘
```

The job queue is a Postgres table drained by a Node worker using `SELECT … FOR UPDATE SKIP LOCKED`
(atomic leasing, heartbeats, retries, backoff, expiry recovery). No Redis is required in the MVP.

---

## 3. Database Schema

The Prisma schema (`server/prisma/schema.prisma`) targets PostgreSQL. IDs use `cuid()`.

| Model | Purpose | Key fields / constraints |
|-------|---------|--------------------------|
| `User` | Identity, plan link, auth provider | `email @unique`, `password`, `googleId`, `authProvider`, `planId → SubscriptionPlan` |
| `SubscriptionPlan` | Plan definition | `jobsPerMonth`, `adminLimit`, `screenLimit`, `furnitureLimit`, `priceMonthly/Yearly Decimal(10,2)`, `features Json` |
| `UserSubscription` | Active subscription | `status`, `currentPeriodStart/End`, `jobsUsedThisPeriod`, `@@index([userId])` |
| `Project` | A user's project | `userId → User` (cascade), `type ('2d'\|'3d')`, `canvas Json`, `status`, `floorPlanUrl`, `thumbnailUrl`, `@@index([userId])` |
| `Scene` | Versioned 3D scene | `projectId → Project` (cascade), `version Int`, `sceneData Json`, `isActive`, **`@@unique([projectId, version])`** |
| `Job` | Metered unit of work | `userId`, `projectId`, `jobType`, `status`, `startedAt/completedAt`, `durationMinutes`, `errorMessage`, `metadata Json`, `@@index([userId]) @@index([status]) @@index([createdAt])` |
| `EditorSession` | 1-hour session tracking | `userId`, `projectId`, `jobId?`, `autoSavedState Json`, `@@index([userId, projectId])` |
| `Asset` / `UserAsset` | Asset library + custom uploads | `fileUrl`, `category`, `isPremium`; user link for custom uploads |
| `VrOutput` | VR artifact | `projectId`, `jobId`, `outputUrl`, `format`, `fileSizeMb` |
| `AuditLog` | Debug/analytics trail | `action`, `entityType`, `entityId`, `ipAddress`, `userAgent` |

> **`Scene(projectId, version)` is unique** — this constraint is what makes optimistic concurrency
> (§9, scene versioning) correct. It must exist in the schema.

---

## 4. Canonical Contracts (`contracts/`)

Formal JSON Schema files, validated on every read/write:

- **`detection-v1.schema.json`** — the output of image detection (Path B), in source-image pixels:
  - `walls` as centre-line segments (`startX/startY/endX/endY` + `thickness`), never bounding boxes
  - `doors` / `windows` as a centre point + `width`; `rooms` as polygons (informational)
  - the swappable seam: any detector, heuristic or trained, emits exactly this shape

- **`canvas-v2.schema.json`** — the structured 2D input:
  - project `scale` (px → real-world units) and `wallHeight`
  - `walls` as segments (straight and quadratic-Bézier), each with thickness
  - `doors` / `windows` **attached to walls** (parametric offset along a wall, not free x/y)
- **`scene-v1.schema.json`** — the canonical 3D output:
  - `rooms`, `assets`, `lighting`, `materials`

The Node API validates with Zod-wrapped schema checks; the Python service validates with `jsonschema`.
A change to either contract is a **versioned, breaking change** — bump the schema version, never mutate
in place.

---

## 5. Key Backend Modules

### Module 1 — Authentication & Authorization
- Email/password (bcrypt) and Google (Firebase ID token verified by Firebase Admin) both resolve to a
  single application-issued **JWT**. That JWT is what protected routes verify.
- Every protected route runs an **ownership check** — a resource is only accessible/mutable by its
  owning `userId`. No exceptions (including "save" endpoints).
- A `checkPlanLimits` middleware rejects job creation once
  `UserSubscription.jobsUsedThisPeriod >= plan.jobsPerMonth`.

### Module 2 — Job Tracking (DB queue)
- Job creation is transactional: check the plan limit → insert a `Job(status='pending')` → increment
  the usage counter.
- A **Node worker** drains the queue with `FOR UPDATE SKIP LOCKED`, leases a job, processes it, and
  records terminal state (`completed`/`failed`), duration, and any `errorMessage`.
- No external broker in the MVP; the `Job` table *is* the queue.

### Module 3 — File Upload → R2 (pre-signed)
- The API mints a **pre-signed PUT URL** (AWS S3 SDK against the R2 endpoint); the frontend uploads the
  file **directly to R2**, bypassing the API payload limit.
- The API validates mime/size, optionally optimizes images, and stores the resulting object URL on the
  project/scene. **Uploads do not persist to local disk.**

### Module 4 — Scene Conversion & Render
- **Convert:** a deterministic converter turns a validated `canvas` into a versioned `scene`
  (`canvas` → `scene`). This is the heart of the deterministic pipeline.
- **Render:** the worker leases a `render` job → `POST /v1/render-glb` on the FastAPI service with a
  validated `scene` → validates the returned GLB → uploads the GLB to R2 → records the artifact URL on
  the `Job`/`VrOutput`.

### Module 5 — Image Detection *(Path B)*
- `POST /projects/:id/upload-floor-plan` stores the image, creates a `Job`, and calls the FastAPI service
  (`POST /process-floor-plan`), which returns a **`detection-v1`** result in image pixels. The call is
  synchronous today (bounded by `AI_SERVICE_TIMEOUT_MS`); it moves to the DB queue if detection gets slow.
- The Node API validates the result against `detection-v1`, then a deterministic **bridge**
  (`services/converter/detectionToCanvas.ts`) produces the **same `canvas-v2` contract** the 2D editor
  produces, so it plugs into Module 4 unchanged:
  1. **Weld** detected walls (`weldWalls.ts`): snap endpoints within 20 px onto corner/T-junction
     intersections and split walls at junctions, so rooms close (room detection needs shared vertices).
  2. Map to canvas elements and reuse `normalizeCanvas` to attach doors/windows to the nearest wall.
  3. Write the result to `project.canvas` with the canvas sized to the image (1:1 pixels), so the editor
     shows the upload as a **trace layer**. Imports are refused (409) if the project already has a drawing.
- Detection is in image pixels and carries no real-world scale; the user sets `pixelsPerMetre` with the
  editor's **Calibrate** tool (a known length). Detection is probabilistic; the 2D editor is the cleanup
  surface.
- **Swapping detectors** means replacing `detect(image_bytes)` in the AI service with anything that returns
  `detection-v1`. Nothing downstream changes.

---

## 6. API Surface

```
/api
├── /auth
│   ├── POST /register
│   ├── POST /login
│   ├── POST /google-login
│   ├── POST /refresh
│   └── POST /logout
├── /users
│   ├── GET  /me
│   ├── PATCH /me
│   └── GET  /subscription
├── /projects
│   ├── GET    /                       (list, owner-scoped)
│   ├── POST   /                       (create)
│   ├── GET    /:id                    (owner-checked)
│   ├── PUT    /:id                    (save canvas, owner-checked)
│   ├── DELETE /:id                    (owner-checked)
│   └── POST   /:id/upload-floor-plan  (pre-signed R2)
├── /scenes
│   ├── GET   /project/:projectId      (active + history)
│   ├── POST  /                        (create version)
│   ├── PATCH /:id                     (optimistic update; 409 on stale)
│   └── GET   /:id/versions
├── /jobs
│   ├── GET   /                        (owner-scoped, filterable)
│   ├── GET   /:id                     (poll status)
│   ├── POST  /create
│   └── GET   /usage-stats
├── /editor
│   ├── POST /session/start
│   ├── POST /session/end
│   ├── POST /activity                 (metering ping)
│   └── POST /autosave
├── /assets
│   ├── GET  /library
│   ├── GET  /:id
│   ├── POST /upload
│   └── GET  /search
├── /vr
│   ├── POST /generate
│   ├── GET  /:id/status
│   └── GET  /:id/download
└── /billing
    ├── GET  /plans
    ├── POST /subscribe
    ├── POST /cancel
    └── GET  /invoices
```

Render / AI service (FastAPI):
```
GET  /health
POST /v1/render-glb            # scene → GLB (MVP)
POST /v1/detect-floor-plan     # image → detection-v1 (today: POST /process-floor-plan)
```

---

## 7. Critical Implementation Rules

- **Ownership everywhere.** Every route that reads or mutates a resource verifies `resource.userId ===
  req.user.id` (or the project's owner for nested resources) and returns `401`/`404` otherwise.
- **Scene versioning is optimistic.** To save, the client sends the `baseVersion` it edited from. The
  server deactivates the current active scene and inserts `version + 1` as active — but only if
  `baseVersion` matches the current active version. A stale `baseVersion` returns **`409 Conflict`**.
  `Scene(projectId, version)` uniqueness enforces this at the database level.
- **Editor-session metering.** The frontend pings `/editor/activity` every 5–10 minutes; the tracker
  opens a session-job and rolls to a new job after 1 hour of continuous activity.
- **Plan enforcement precedes work.** Check the quota before creating any job; never after.
- **No local-only assets in saved scenes.** A client-side imported model is rejected from a persisted
  scene until it has been uploaded to R2 and has a durable URL.
- **Health & observability.** The API exposes `/live` and `/ready`; a central error-handler is the only
  place that formats error responses.
- **Secrets never in code.** All credentials come from environment variables; contracts and env var
  names are documented in `.env.example` files (see `05-development-guidelines.md`).

---

## 8. Target Folder Structure

```
xplor/
├── client/                 # React 19 + Vite (2D Konva + 3D R3F)
├── server/                 # Express 5 + Prisma
│   ├── config/             # db, firebaseAdmin, r2
│   ├── controllers/        # auth, project, scene, job, billing, …
│   ├── middleware/         # auth, ownership, planLimits, validation, errorHandler
│   ├── routes/             # authRoutes, projectRoutes, sceneRoutes, jobRoutes, …
│   ├── services/           # jobTracker, fileUpload, sceneManager, converter, billing, aiService
│   ├── queues/workers/     # DB poller → convert/render
│   ├── prisma/             # schema.prisma, migrations
│   └── server.js
├── ai-service/             # FastAPI (uv: pyproject.toml + uv.lock): detection today, /v1/render-glb later
├── contracts/              # canvas-v2, scene-v1, detection-v1 JSON Schemas
├── docker-compose.yml
└── docs/                   # foundational docs + status-reports/
```
