# XPLOR — Backend Architecture & Implementation Plan

> **Revision:** 8 August 2026 · **Supersedes:** `XPLOR Backend Architecture & Implementation Plan.txt`
> **Status:** Reconciled with the committed codebase (Neon + Prisma + Express 5).

---

## Revision Notes (what changed since the original)

| Area | Original plan | Current reality |
|------|---------------|-----------------|
| ORM | Prisma **or** TypeORM | **Prisma** (chosen). Express **5**. |
| Auth | Passport.js + JWT | **Firebase Auth (client) + Firebase Admin + JWT + bcrypt** hybrid. |
| Queue | Redis + BullMQ from day one | **DB-backed job polling** first (zero-cost); Redis/BullMQ deferred to scale phase. |
| Storage | AWS S3 | **Cloudflare R2** (S3-compatible SDK), pre-signed URLs. Not yet wired. |
| AI service | GPU vision model (`/process-floor-plan`) | **Stateless GLB renderer** (`/v1/render-glb`) first; vision model deferred. |
| Schema | Target design | **Migrated to Neon** — full schema live; only `User`/`Project` wired to routes. |

---

## 1. Database Architecture

**Approach: PostgreSQL (Neon) + Prisma + Cloudflare R2. No Redis and no vector DB initially.**

**PostgreSQL (primary):**
- ACID compliance — critical for billing/subscriptions.
- JSONB columns hold complex 3D scene data efficiently.
- Natural fit for relational data (users → projects → scenes → jobs → billing).
- Complex queries for analytics and plan enforcement.
- Mature Node.js ecosystem (Prisma).

**Redis (deferred — scale phase):** session cache, BullMQ job queue, rate limiting, live editor state. **Not used in the MVP** — see the zero-cost strategy doc; jobs are polled from Postgres instead.

**Cloudflare R2 (blob storage):** floor-plan images, generated GLB/3D models, VR outputs, asset-library files. Zero egress fees.

**Vector DB (future, Phase 3+):** `pgvector` inside Neon for smart asset recommendations. Not critical for MVP.

---

## 2. Database Schema (as migrated — Prisma)

The Prisma schema in `server/prisma/schema.prisma` is **already migrated to Neon** with the full target model set. IDs use `cuid()`. Summary:

| Model | Purpose | Wired to routes? |
|-------|---------|------------------|
| `User` | Identity, plan link, auth provider | ✅ |
| `Project` | Project + JSONB `canvas`, type (`2d`/`3d`), status, floorPlanUrl | ✅ |
| `Scene` | Versioned `sceneData` JSONB, `isActive`, `@@index(projectId)` | ⏳ schema only |
| `Job` | `jobType`, `status`, timings, `errorMessage`, indexes on user/status/createdAt | ⏳ schema only |
| `EditorSession` | 1-hour session tracking, `autoSavedState` | ⏳ schema only |
| `SubscriptionPlan` | jobsPerMonth / adminLimit / screenLimit / furnitureLimit / pricing | ⏳ schema only |
| `UserSubscription` | status, period, `jobsUsedThisPeriod` | ⏳ schema only |
| `Asset` / `UserAsset` | Asset library + custom uploads | ⏳ schema only |
| `VrOutput` | VR artifact URL, format, size | ⏳ schema only |
| `AuditLog` | action/entity/ip/userAgent | ⏳ schema only |

> Legacy Mongoose-style `server/models/User.js` and `Project.js` remain in the tree but Prisma against Neon is the live data layer.

**Canonical JSONB contracts (to formalize):** `canvas-v2` (2D input: project scale, wall height, walls as straight/quadratic-Bézier segments, attached doors/windows) and `scene-v1` (3D output: rooms, assets, lighting, materials). These should ship as JSON Schema files under a `contracts/` directory and be validated on read/write.

---

## 3. Backend Architecture

Target service topology (build order left-to-right):

```
                    ┌──────────────────────────────┐
                    │      API Gateway / Express 5  │
                    │  auth · projects · (jobs)     │
                    └───────────────┬──────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            ▼                       ▼                        ▼
   ┌──────────────┐        ┌──────────────┐         ┌──────────────┐
   │  Main API    │        │ Render Svc   │         │  DB Worker   │
   │  (Node 20+)  │        │ (FastAPI)    │         │ (Node)       │
   │ auth·proj·   │  HTTP  │ scene-v1 →   │  polls  │ leases jobs, │
   │ jobs·billing │───────▶│ GLB (trimesh)│◀────────│ calls render │
   └──────┬───────┘        └──────────────┘         └──────┬───────┘
          │                                                │
          ▼                                                ▼
   ┌──────────────┐                                 ┌──────────────┐
   │ Neon Postgres│  ◀── durable job queue ───────  │ Cloudflare R2│
   │ (JSONB+jobs) │      (FOR UPDATE SKIP LOCKED)    │ (GLB/assets) │
   └──────────────┘                                 └──────────────┘
```

**No Redis in this diagram by design.** The job queue is a Postgres table drained by a Node worker using `SELECT … FOR UPDATE SKIP LOCKED` (atomic leasing, heartbeats, retries, backoff, expiry recovery). Redis/BullMQ is introduced only at the scale phase.

---

## 4. Technology Stack

**Main API (Node.js) — current `server/package.json`:**
```json
{
  "runtime": "Node.js 20+",
  "framework": "Express 5",
  "orm": "Prisma (@prisma/client)",
  "auth": "firebase-admin + jsonwebtoken + bcryptjs",
  "validation": "Zod (to add)",
  "fileUpload": "AWS S3 SDK → Cloudflare R2 (to add)",
  "queue": "Postgres FOR UPDATE SKIP LOCKED (BullMQ later)",
  "websocket": "Socket.io (for real-time editor, later)"
}
```

**Render / AI Service (FastAPI) — `ai-service/` (venv only today):**
```json
{
  "framework": "FastAPI + Uvicorn",
  "geometry": "trimesh, numpy",
  "http": "httpx",
  "validation": "jsonschema (scene-v1)",
  "role_now": "stateless POST /v1/render-glb",
  "role_later": "GPU floor-plan CV detection",
  "deployment": "Docker (to add)"
}
```

**Infrastructure:** Neon PostgreSQL 15+ · Cloudflare R2 · Docker + Compose (dev) → ECS/EKS (prod) · Redis + BullMQ (scale phase only).

---

## 5. Key Backend Modules

**Module 1 — Authentication & Authorization** *(auth built; plan check to add)*
```ts
// middleware/auth — verify Firebase/JWT token, attach req.user
export const authenticateJWT = (req, res, next) => { /* verify, attach user */ };

// plan enforcement (to implement once subscriptions are wired)
export const checkPlanLimits = async (req, res, next) => {
  const sub = await getActiveSubscription(req.user.id);
  if (sub.jobsUsedThisPeriod >= sub.plan.jobsPerMonth)
    return res.status(403).json({ error: 'Job limit exceeded' });
  next();
};
```

**Module 2 — Job Tracking (DB queue)** *(to build)*
```ts
async createJob(userId, projectId, jobType) {
  if (!(await this.checkJobLimit(userId))) throw new Error('Job limit exceeded');
  const job = await prisma.job.create({ data: { userId, projectId, jobType } });
  await this.incrementJobUsage(userId);            // metering
  // NO external queue: the worker polls `Job WHERE status='pending'`
  return job;
}
```
Worker drains with atomic leasing:
```sql
SELECT * FROM "Job"
WHERE status = 'pending'
ORDER BY "createdAt"
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

**Module 3 — File Upload → R2 (pre-signed)** *(to build)*
Backend issues a pre-signed PUT URL (AWS S3 SDK, R2 endpoint); the frontend uploads **directly** to R2, bypassing the API payload limit. Validate mime/size, optionally optimize images, store the returned object URL on the project/scene.

**Module 4 — Scene Render Job** *(to build)*
Worker leases a `render` job → `POST /v1/render-glb` to FastAPI with validated `scene-v1` → validates the GLB response → uploads GLB to R2 → writes the artifact URL into `Job.metadata` / `VrOutput`.

---

## 6. API Endpoints

Legend: ✅ live · ⏳ planned.

```
/api/v1
├── /auth        ✅ POST /register  ✅ /login  ⏳ /refresh  ⏳ /logout  ✅ Google
├── /users       ⏳ GET /me  ⏳ PATCH /me  ⏳ GET /subscription
├── /projects    ✅ GET /  ✅ POST /  ✅ GET /:id  ✅ PUT /:id (save)
│                ⏳ PATCH /:id  ⏳ DELETE /:id  ⏳ POST /:id/upload-floor-plan
├── /scenes      ⏳ GET /project/:projectId  ⏳ POST /  ⏳ PATCH /:id  ⏳ GET /:id/versions
├── /jobs        ⏳ GET /  ⏳ GET /:id  ⏳ POST /create  ⏳ GET /usage-stats
├── /editor      ⏳ POST /session/start  ⏳ /session/end  ⏳ /autosave  ⏳ WS /session/:id
├── /assets      ⏳ GET /library  ⏳ GET /:id  ⏳ POST /upload  ⏳ GET /search
├── /vr          ⏳ POST /generate  ⏳ GET /:id/status  ⏳ GET /:id/download
└── /billing     ⏳ GET /plans  ⏳ POST /subscribe  ⏳ POST /cancel  ⏳ GET /invoices
```

---

## 7. Implementation Phases (revised)

| Phase | Scope | State |
|-------|-------|-------|
| **0** | Security baseline: auth middleware, ownership checks, Zod validation, central error handler, health endpoints, CI (server/client/python lint+build) | 🟡 partial |
| **1** | Scene contracts (`canvas-v2`, `scene-v1`) + deterministic converter | 🔴 to build |
| **2** | Durable DB jobs (SKIP LOCKED worker) + scene versioning (`Scene(projectId, version)` unique, `409` on stale save) | 🔴 to build |
| **3** | End-to-end FE flow: 2D save → "Convert to 3D" → poll → 3D editor loads canonical scene | 🟡 FE editors exist; wiring pending |
| **4** | FastAPI `render-glb` + worker → R2 GLB artifacts; Docker/Compose; deploy prep | 🔴 to build |
| **5** | Billing & plan enforcement (Stripe/Razorpay) | 🔴 to build |
| **6** | VR pipeline | 🔴 to build |

---

## 8. Folder Structure (target)

```
xplor/
├── client/                 # React 19 + Vite (2D Konva + 3D R3F)   ✅
├── server/                 # Express 5 + Prisma
│   ├── config/  (db, firebaseAdmin)                                ✅
│   ├── controllers/ (auth, project, + scene/job/…)   ✅ / ⏳
│   ├── middleware/ (auth, + planLimits, errorHandler, validation)  🟡
│   ├── routes/ (authRoutes, projectRoutes, + scene/job/…)          🟡
│   ├── services/ (jobTracker, fileUpload, sceneManager, billing)   ⏳
│   ├── queues/workers/ (DB poller → render)                        ⏳
│   ├── prisma/ (schema.prisma, migrations)                         ✅
│   └── server.js                                                   ✅
├── ai-service/             # FastAPI render-glb (trimesh)          ⏳ (venv only)
├── contracts/              # canvas-v2.schema.json, scene-v1.schema.json  ⏳
├── docker-compose.yml                                              ⏳
└── docs/                                                           ✅
```

---

## 9. Critical Implementation Notes

**Editor-session metering** — frontend pings `/editor/activity` every 5–10 min; the tracker opens a session-job, and rolls to a new job after 1 hour of continuous activity.

**Plan enforcement** — check `UserSubscription.jobsUsedThisPeriod >= plan.jobsPerMonth` before every job creation.

**Scene versioning** — deactivate the current active scene, insert `version + 1` as active; `Scene(projectId, version)` is unique and stale saves (wrong `baseVersion`) must return **409**.

**Local-only assets** — imported models that exist only client-side are rejected from persistent scene saves until R2 asset upload exists.
