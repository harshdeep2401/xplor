# XPLOR — Zero-Cost MVP Deployment & Scalability Strategy

> **Revision:** 8 August 2026 · **Supersedes:** `XPLOR Zero-Cost MVP Deployment & Scalability Strategy.txt`
> **Target phase:** Pre-Seed / MVP (bootstrapping) → Series A (enterprise scale).

---

## Revision Notes (what changed since the original)

- Database decision **confirmed**: Neon PostgreSQL + Prisma (the "replaces MongoDB" note is now historical — MongoDB is gone).
- **Queue clarified:** the MVP explicitly uses **Postgres-backed job polling (`FOR UPDATE SKIP LOCKED`)** — no Redis/BullMQ until scale.
- **AI microservice re-scoped:** first deployment is a **stateless GLB renderer** (CPU, trimesh) rather than a GPU vision model, so the "local RTX + Cloudflare Tunnel" GPU path is **only needed once image-detection ships**. A CPU renderer can run on the same PaaS free tier as the API.
- Frontend host: **Vercel or Cloudflare Pages** (both viable; Pages keeps everything on Cloudflare).

---

## 1. Executive Summary

This is the bridging architecture: a **zero-cost MVP** on generous free tiers with **no vendor lock-in**. Core philosophy — **"Dockerize everything."** Containerizing the Express API and the FastAPI render service means today's free PaaS and tomorrow's AWS (ECS/EKS) are the *same image*, so scaling is a lift-and-shift, not a rewrite.

---

## 2. Phase 1 — The Zero-Cost MVP Architecture

Splits cheap web traffic from (eventually) expensive AI compute, using free cloud services for the former.

### 2.1 Frontend UI (React 19 / Vite)
- **Platform:** Vercel or Cloudflare Pages (free tier).
- **Role:** serves the static React SPA globally via edge CDN.
- **Why:** zero-config Vite builds, GitHub CI/CD, instant previews.

### 2.2 Backend API Gateway (Node.js / Express 5)
- **Platform:** Render, Railway, or Fly.io (free tier).
- **Architecture:** **Dockerized** Express app.
- **Deliberate deviation:** we do **not** refactor Express routes into serverless functions — a Dockerized long-running server stays cloud-agnostic and portable to ECS/EKS unchanged.
- **Role:** routing, auth verification (Firebase/JWT), DB reads/writes, coordinating the render service, and **draining the Postgres job queue**.

### 2.3 Database & ORM (PostgreSQL)
- **Platform:** Neon (free tier — ~0.5 GB).
- **Tooling:** Prisma ORM.
- **Role:** users, projects, versioned scenes (JSONB), subscriptions, jobs, and eventually `pgvector` embeddings.
- **Why:** raw Postgres → ACID from day one, no AWS RDS overhead; **also doubles as the durable job queue** (no Redis needed for the MVP).

### 2.4 Authentication
- **Platform:** Firebase Authentication (current) — identity, Google OAuth, JWT issuance; verified server-side by Firebase Admin.
- **Future:** optionally consolidate onto Supabase Auth to unify DB + auth under one provider.

### 2.5 Blob Storage (Floor Plans, GLB / 3D Models)
- **Platform:** Cloudflare R2 (free tier — 10 GB/mo, **zero egress**).
- **Why:** 3D/GLB assets are bandwidth-heavy; R2's zero egress avoids S3's surprise bandwidth bills.
- **Workflow:** the Express backend mints a **pre-signed URL** (AWS S3 SDK, R2-compatible); the frontend uploads **directly** to R2, bypassing the PaaS payload limit.

### 2.6 The Render / AI Microservice (FastAPI)
Two-stage plan — the GPU cost only appears in stage B:

**Stage A — GLB Renderer (MVP, CPU):**
- **Platform:** Dockerized FastAPI on the **same free PaaS** (Render/Railway) or locally.
- **Role:** `POST /v1/render-glb` — validate `scene-v1`, build GLB with `trimesh`. CPU-only, cheap.

**Stage B — Vision Detection (later, GPU):**
- **Platform:** local NVIDIA RTX + Docker + **Cloudflare Tunnels** (`cloudflared`).
- **Why:** cloud GPU (EC2 G4/G5) costs hundreds/month; a tunnel exposes the local GPU securely.
- **Workflow:** FastAPI loads CV models into local VRAM → `cloudflared` opens a secure outbound tunnel (e.g. `ai-api.xplor.com`) → Express sends a webhook → GPU processes → writes results to Neon and uploads to R2.

---

## 3. Phase 2 — Enterprise AWS Migration Path

When XPLOR raises, hits free-tier limits, or needs SOC2/ISO27001, migration is **infra-only, zero code rewrites**:

| Component | Phase 1 (Zero-Cost) | Phase 2 (AWS) | Migration effort |
|-----------|---------------------|---------------|------------------|
| Frontend | Vercel / CF Pages | Amplify or CloudFront + S3 | **Low** — update CI/CD |
| Backend API | Render/Railway (Docker) | ECS (Fargate) or EKS | **Very low** — deploy same image |
| Database | Neon | RDS (PostgreSQL) | **Medium** — `pg_dump`/restore, swap `DATABASE_URL` |
| Storage | Cloudflare R2 | S3 | **Very low** — change endpoint + keys (both AWS SDK) |
| Render/AI compute | CPU on PaaS / local GPU + CF Tunnels | EC2 (G5) or SageMaker | **Low** — deploy same FastAPI image, update webhook URL |
| Queue | **Postgres SKIP LOCKED polling** | BullMQ + ElastiCache (Redis) | **Medium** — introduce Redis, port worker |

---

## 4. Operational & Security Requirements (MVP)

1. **Secrets management** — keep `.env` values (Neon URL, Firebase keys, R2 tokens) in the Vercel/Render dashboards. **Never commit them.** (`.gitignore` already excludes env files.)
2. **Tunnel security** *(only when Stage B GPU is live)* — restrict Cloudflare Tunnels to the Express backend's IPs or a shared API key, so nobody else can drive your local GPU.
3. **Database backups** — even on Neon's free tier, run scheduled logical backups (`pg_dump` via cron).
4. **CORS & health** — configurable CORS allow-list; expose `/live` and `/ready` health endpoints for the PaaS.
5. **CI gates** — GitHub Actions running server + client lint/build and Python tests before deploy.

---

## 5. Zero-Cost Stack at a Glance

| Layer | Service | Free tier | Lock-in escape |
|-------|---------|-----------|----------------|
| Frontend | Vercel / Cloudflare Pages | Generous | Static build — portable anywhere |
| API | Render / Railway / Fly | 1 free service | Docker image → any host |
| DB | Neon Postgres | ~0.5 GB | Standard `pg_dump` → RDS |
| Storage | Cloudflare R2 | 10 GB/mo, 0 egress | S3-compatible SDK |
| Auth | Firebase Auth | Generous | Migratable to Supabase |
| Queue | Neon (SKIP LOCKED) | Included | Swap to BullMQ/Redis |
| Render | FastAPI (CPU) on PaaS | Included | Docker → EC2/SageMaker |
| GPU (later) | Local RTX + CF Tunnel | Owned hardware | Docker → EC2 G5 |

**Estimated MVP infra cost: $0/month** until free-tier limits are hit — the only paid resource is optional owned GPU hardware for Stage B.
