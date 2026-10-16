# XPLOR

> ⚠️ **Please read the [`docs/`](./docs) before doing anything** — building, changing, or reviewing
> code. Start with [`docs/01-master-reference.md`](./docs/01-master-reference.md). The docs are the
> single source of truth for the product, architecture, features, and workflow.

XPLOR is an AI-enabled **2D → 3D → VR** visualization platform for real estate. It lets
non-technical users turn a floor plan into an interactive 3D (and, later, VR) walkthrough in minutes.

The product is built **reliability-first**: a *deterministic* pipeline (draw a plan in the native 2D
editor → convert → 3D scene → GLB) is the foundation, and probabilistic AI (image detection) is layered
on top only once the deterministic core is solid.

> **Authoritative docs live in [`docs/`](./docs).** Start with
> [`docs/01-master-reference.md`](./docs/01-master-reference.md). For "what is actually built vs.
> planned" at any point in time, see [`docs/status-reports/`](./docs/status-reports) — build status is
> tracked there, never in this README.

---

## Repository layout

```
xplor/
├── client/       React 19 + Vite — 2D editor (Konva) and 3D editor (Three.js / React Three Fiber)
├── server/       Express 5 + Prisma — auth, projects, jobs; PostgreSQL (Neon)
├── Ai-service/   FastAPI — floor-plan image detection (trained MiT-B3 U-Net, PyTorch), managed with uv
├── contracts/    JSON Schemas shared by all services: canvas-v2, scene-v1, detection-v1
└── docs/         Foundational docs (01–05), roadmap (06), status-reports/, reports/
```

## Tech stack

| Layer        | Technology |
|--------------|-----------|
| Frontend     | React 19, Vite, react-konva (2D), Three.js + React Three Fiber + drei (3D) |
| Main API     | Node 22+, Express 5, Prisma |
| Database     | PostgreSQL (Neon) |
| Auth         | Firebase Authentication + Firebase Admin + application JWT + bcrypt |
| AI service   | Python 3.12, FastAPI, PyTorch + segmentation-models-pytorch, OpenCV, scikit-image (deps via uv) |
| Blob storage | Local disk today; Cloudflare R2 planned (see `docs/03`) |

---

## Getting started

Each service is run independently. You need **Node 22+**, **[uv](https://docs.astral.sh/uv/)** (it
installs Python 3.12 for you), and access to a PostgreSQL database (Neon or local). Works on macOS,
Windows and Linux — see `docs/05-development-guidelines.md` §10 for cross-platform notes. None of the `.env` files are committed — create them from the notes below
(and from `Ai-service/.env.example`).

### 1. Database (Prisma / Neon)

```bash
cd server
npm install                 # runs `prisma generate` via postinstall
npx prisma migrate deploy   # apply existing migrations to your DATABASE_URL
```

> npm 11+ may skip install scripts ("install scripts not yet covered by allowScripts"). If the server
> then fails with `@prisma/client did not initialize yet`, run `npx prisma generate` once.

### 2. Main API (`server/`)

Create `server/.env` with at least:

```
PORT=5001
DATABASE_URL=postgresql://...            # Neon or local Postgres
JWT_SECRET=...                           # app JWT signing secret
FIREBASE_PROJECT_ID=...                  # + the other FIREBASE_* admin vars
FIREBASE_PRIVATE_KEY=...
FIREBASE_CLIENT_EMAIL=...
FASTAPI_WEBHOOK_URL=http://127.0.0.1:8000/process-floor-plan
FASTAPI_SECRET=...                       # shared secret with the AI service (step 4)
```

```bash
cd server
npm run dev                 # nodemon → http://localhost:5001
```

### 3. Frontend (`client/`)

Create `client/.env`:

```
VITE_API_URL=http://localhost:5001/api
VITE_FIREBASE_API_KEY=...                # + the other VITE_FIREBASE_* client vars
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

```bash
cd client
npm install
npm run dev                 # Vite → http://localhost:5173
npm run build               # production build
```

### 4. AI service (`Ai-service/`) — needed for Import Floor Plan

The service runs the trained floor-plan model (card: `Ai-service/Model/ModelInfo.md`). The weights are
**not in git** (190 MB): get `best.pt` from the project lead and put it at `Ai-service/Model/best.pt`.

```bash
cd Ai-service
uv sync                     # creates .venv (Python 3.12); first run downloads PyTorch (~2.5 GB)
cp .env.example .env        # then set FASTAPI_SECRET (below)
uv run uvicorn app.main:app --reload --port 8000
uv run pytest               # tests (no weights needed)
# add a dependency: uv add <package>   (updates pyproject.toml + uv.lock)
```

**Shared secret (required).** The server authenticates every call to the AI service. Generate a value
once and put the **same** string in `FASTAPI_SECRET` in both `Ai-service/.env` and `server/.env`
(at least 32 characters), then restart both:

```bash
uv run python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Check it at http://localhost:8000/health:
- `{"status":"ok","device":"cuda"}` — ready, on the NVIDIA GPU (~0.1 s per plan).
- `"device":"cpu"` — ready, no usable GPU (~1 s per plan). Fine for development.
- HTTP **503** `"status":"unavailable"` — `error` says why: usually the weights file is missing, or
  `FASTAPI_SECRET` is unset/too short. Imports then fail with that message; there is no silent fallback.

PyTorch is installed from the CUDA 12.6 build, which supports GPUs from the GTX 10xx / Pascal generation
up to RTX 40xx and also runs on machines without an NVIDIA GPU. RTX 50xx cards need a newer CUDA build.

The draw → 3D flow works without the AI service; the dashboard's **Import Floor Plan** needs it running.

### 5. Or run the backend in Docker

Needs the same `server/.env`, `Ai-service/.env` and `Ai-service/Model/best.pt` as above.

```bash
docker compose up --build                                                 # AI service on CPU
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build # AI service on the NVIDIA GPU
docker compose ps           # both should be healthy
```

The API is on http://localhost:5001 and the AI service on :8000 (this PC only). Run the client on the
host (`cd client && npm run dev`). Needs Docker Compose ≥ 2.17 (the API image pulls `contracts/` in
through an extra build context — see `docs/03` §3). The first build downloads PyTorch with CUDA
(several GB).

### 6. Hosting the AI service for a cloud server

When the server is deployed elsewhere, the AI service keeps running on the GPU PC and is reached through
a Cloudflare Tunnel (`Ai-service/compose.host.yml`). Step-by-step guide:
[`docs/guides/ai-hosting.md`](./docs/guides/ai-hosting.md).

---

## Conventions

Contribution rules (git workflow, commit conventions, code style, secrets handling) are defined in
[`docs/05-development-guidelines.md`](./docs/05-development-guidelines.md). In short: trunk-based
development, Conventional Commits, no secrets in the repo, and file/import casing must match on disk
(Linux/CI is case-sensitive).
