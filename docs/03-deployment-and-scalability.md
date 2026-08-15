# XPLOR — Deployment & Scalability Strategy

> **Type:** Foundational document. Describes the **intended hosting and scaling strategy** — the target
> deployment topology and the path from a zero-cost MVP to enterprise scale. It is **timeless**: it does
> not track what is deployed. For deployment status, see `docs/status-reports/`.

---

## 1. Philosophy

**Zero-cost MVP, no vendor lock-in.** The platform runs on generous free tiers today and lifts-and-shifts
to AWS tomorrow with **no code rewrites**. The enabling rule is **"Dockerize everything"**: the Express
API and the FastAPI render service ship as containers, so today's free PaaS and tomorrow's AWS
(ECS/EKS) run the *same image*.

The architecture splits **cheap web traffic** from **(eventually) expensive AI compute**: web traffic
lives on free cloud services; heavy GPU compute — needed only once image detection (Path B) ships —
runs on owned hardware exposed through a secure tunnel.

---

## 2. Phase 1 — Zero-Cost MVP

| Concern | Platform | Role |
|---------|----------|------|
| **Frontend** | Vercel or Cloudflare Pages (free) | Serves the static React SPA via edge CDN; zero-config Vite builds; GitHub CI/CD. |
| **Backend API** | Render, Railway, or Fly.io (free) | Dockerized long-running Express server. Handles routing, auth verification, DB access, render coordination, and **draining the Postgres job queue**. |
| **Database** | Neon PostgreSQL (~0.5 GB free) | Users, projects, versioned scenes (JSONB), subscriptions, jobs. **Doubles as the durable job queue** — no Redis in the MVP. |
| **Auth** | Firebase Authentication | Identity, Google OAuth, JWT issuance; verified server-side by Firebase Admin. |
| **Blob storage** | Cloudflare R2 (10 GB/mo, **zero egress**) | Floor-plan images, generated GLB meshes, VR outputs, asset files. The API mints pre-signed URLs; the frontend uploads **directly** to R2. |
| **Render service** | Dockerized FastAPI on the same free PaaS (CPU) | `POST /v1/render-glb` — validate `scene`, build GLB with `trimesh`. CPU-only, cheap. |

**Deliberate deviation:** we do **not** refactor Express routes into serverless functions. A Dockerized
long-running server stays cloud-agnostic and portable to ECS/EKS unchanged.

**Why Cloudflare R2:** 3D/GLB assets are bandwidth-heavy; R2's zero egress avoids the surprise
bandwidth bills that AWS S3's free tier can incur. The S3-compatible SDK means switching to S3 later is
an endpoint/key change.

**Why Neon:** raw PostgreSQL → ACID from day one, no AWS RDS overhead, and a standard `pg_dump` escape
hatch.

---

## 3. Image Detection Compute *(Path B — future)*

The GPU cost only appears when image detection ships. Until then, everything runs CPU-only on the free
tier above.

- **Platform:** local NVIDIA GPU + Docker + **Cloudflare Tunnels** (`cloudflared`).
- **Why:** cloud GPU (e.g. EC2 G4/G5) costs hundreds/month; a tunnel exposes owned hardware securely.
- **Workflow:** the FastAPI detection service loads CV models into local VRAM → `cloudflared` opens a
  secure outbound tunnel → the Express backend calls it → results (a `canvas` payload) are written back
  and any artifacts uploaded to R2.

---

## 4. Phase 2 — Enterprise AWS Migration

When XPLOR raises, hits free-tier limits, or needs SOC 2 / ISO 27001, migration is **infra-only**:

| Component | Phase 1 (Zero-Cost) | Phase 2 (AWS) | Migration effort |
|-----------|---------------------|---------------|------------------|
| Frontend | Vercel / CF Pages | Amplify or CloudFront + S3 | **Low** — update CI/CD |
| Backend API | Render/Railway (Docker) | ECS (Fargate) or EKS | **Very low** — deploy same image |
| Database | Neon | RDS (PostgreSQL) | **Medium** — `pg_dump`/restore, swap `DATABASE_URL` |
| Storage | Cloudflare R2 | S3 | **Very low** — change endpoint + keys (both AWS SDK) |
| Render / AI compute | CPU on PaaS / local GPU + CF Tunnels | EC2 (G5) or SageMaker | **Low** — deploy same FastAPI image, update URL |
| Queue | Postgres `SKIP LOCKED` polling | BullMQ + ElastiCache (Redis) | **Medium** — introduce Redis, port worker |

---

## 5. Operational & Security Requirements

1. **Secrets management** — all credentials (Neon URL, Firebase keys, R2 tokens) live in the
   Vercel/Render dashboards and local `.env` files. **`.env` is never committed** (see
   `05-development-guidelines.md`); every service ships a committed `.env.example`.
2. **CORS & health** — a configurable CORS allow-list (no wildcard in production) and `/live` + `/ready`
   health endpoints for the PaaS.
3. **Database backups** — scheduled logical backups (`pg_dump` via cron) even on the free tier.
4. **Tunnel security** *(only when Path B GPU is live)* — restrict Cloudflare Tunnels to the backend's
   IPs or a shared API key so nobody else can drive the GPU.
5. **CI gates** — GitHub Actions run server + client lint/build and Python tests before any deploy.

---

## 6. Zero-Cost Stack at a Glance

| Layer | Service | Free tier | Lock-in escape |
|-------|---------|-----------|----------------|
| Frontend | Vercel / Cloudflare Pages | Generous | Static build — portable anywhere |
| API | Render / Railway / Fly | 1 free service | Docker image → any host |
| DB | Neon Postgres | ~0.5 GB | `pg_dump` → RDS |
| Storage | Cloudflare R2 | 10 GB/mo, 0 egress | S3-compatible SDK |
| Auth | Firebase Auth | Generous | Migratable to Supabase |
| Queue | Neon (`SKIP LOCKED`) | Included | Swap to BullMQ/Redis |
| Render | FastAPI (CPU) on PaaS | Included | Docker → EC2/SageMaker |
| GPU (Path B) | Local GPU + CF Tunnel | Owned hardware | Docker → EC2 G5 |

**Target MVP infra cost: $0/month** until free-tier limits are hit — the only paid resource is optional
owned GPU hardware for image detection.
