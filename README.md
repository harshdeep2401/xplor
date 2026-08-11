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
├── Ai-service/   FastAPI — floor-plan image detection (OpenCV)
└── docs/         Foundational docs (01–05) + status-reports/
```

## Tech stack

| Layer        | Technology |
|--------------|-----------|
| Frontend     | React 19, Vite, react-konva (2D), Three.js + React Three Fiber + drei (3D) |
| Main API     | Node 20+, Express 5, Prisma |
| Database     | PostgreSQL (Neon) |
| Auth         | Firebase Authentication + Firebase Admin + application JWT + bcrypt |
| AI service   | FastAPI, OpenCV, NumPy |
| Blob storage | Local disk today; Cloudflare R2 planned (see `docs/03`) |

---

## Getting started

Each service is run independently. You need **Node 20+**, **Python 3.10+**, and access to a PostgreSQL
database (Neon or local). None of the `.env` files are committed — create them from the notes below
(and from `Ai-service/.env.example`).

### 1. Database (Prisma / Neon)

```bash
cd server
npm install                 # runs `prisma generate` via postinstall
npx prisma migrate deploy   # apply existing migrations to your DATABASE_URL
```

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

### 4. AI service (`Ai-service/`) — optional for the core flow

```bash
cd Ai-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then edit as needed
uvicorn app.main:app --reload --port 8000   # health check: GET /health
```

---

## Conventions

Contribution rules (git workflow, commit conventions, code style, secrets handling) are defined in
[`docs/05-development-guidelines.md`](./docs/05-development-guidelines.md). In short: trunk-based
development, Conventional Commits, no secrets in the repo, and file/import casing must match on disk
(Linux/CI is case-sensitive).
