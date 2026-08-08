# XPLOR — Master Reference Document

> **Revision:** 8 August 2026 · **Supersedes:** `XPLOR Master Reference Document.txt`
> **Status:** Living document — reconciled against the committed codebase, not aspirational plans.

---

## Revision Notes (what changed since the original)

The original reference described an **AI-first** product (2D image → CV detection → JSON → 3D → VR). The product direction and the code have since shifted:

- **First vertical slice is now a *native structured 2D editor* path**, not image-based AI detection. Users draw walls/doors/windows directly; that structured canvas is deterministically converted to 3D. Image-based floor-plan detection is **deferred** (still the long-term IP, but not in the MVP).
- **Database is Neon PostgreSQL + Prisma** (the earlier "MongoDB/Mongoose" description is obsolete).
- **Auth is a Firebase + JWT hybrid**, not Passport.js.
- **VR and billing remain unbuilt**; the AI microservice is scaffolded (venv only) toward a **stateless GLB renderer**, not a GPU vision model — for now.

---

## 1. Product Definition

### 1.1 Core Idea
XPLOR is an **AI-enabled 2D → 3D → VR visualization platform for real estate**. It lets non-technical users generate interactive 3D/VR walkthroughs of spaces from a simple structured floor plan, in minutes.

### 1.2 Problem Statement
Traditional VR workflows require specialized tools (Blender, Unreal), technical expertise, days/weeks of effort, and significant cost. XPLOR removes the technical barrier, collapses the timeline to minutes, and lowers the cost of VR creation.

### 1.3 Value Proposition
- **"Draw / Upload → Customize → Experience in VR."**
- Fast, intuitive, scalable spatial visualization.
- Built for non-technical users.

---

## 2. User Journey (End-to-End Flow)

| Step | Stage | What happens |
|------|-------|--------------|
| 1 | **Entry** | User logs in (Firebase / email) → Dashboard. |
| 2 | **Project Creation** | Create a 2D or 3D project. |
| 3 | **2D Design** | User draws the layout in the **native Konva 2D editor** (walls, doors, windows, snapping, undo/redo, autosave). *(Image upload + AI detection is a future path.)* |
| 4 | **Conversion** | Structured canvas (`canvas-v2`) is deterministically converted to a versioned 3D scene (`scene-v1`). |
| 5 | **3D Editor (Web)** | Add/remove furniture, move/scale/rotate, edit materials/colors, add lighting, use the asset library, get recommendations. |
| 6 | **Save System** | Autosave + manual save; backend stores versioned scene JSON, assets, and configuration. |
| 7 | **VR Generation** | User clicks "Convert to VR"; the scene is converted to a VR-compatible format. *(Planned.)* |
| 8 | **VR Experience** | Interactive walkthrough on VR devices. *(Planned.)* |

**Source of truth:** Scene JSON (`scene-v1`) is canonical. GLB is a **derived artifact**.

---

## 3. Definition of a "Job"

A **Job** is any one of:
1. A **1-hour session** in the 3D editor.
2. A full **2D → VR** conversion.
3. A **3D editor → VR** conversion.

Jobs are the unit of plan metering (see §6).

---

## 4. Current System Architecture

### 4.1 Frontend — *Built*
- React 19 + Vite, deployed target Vercel / Cloudflare Pages.
- Landing site, Firebase auth pages, Dashboard (now fetching **real** projects from the backend).
- **2D editor:** Konva / react-konva — walls, doors, windows, 90° snapping, pan/zoom, undo/redo, debounced autosave, PNG export.
- **3D editor:** Three.js / React Three Fiber (`@react-three/drei`) — asset placement, transforms, materials, lighting.

### 4.2 Backend — *Partially built*
- Node.js 20+ / **Express 5**.
- **Live today:** authentication (register/login/Google via Firebase Admin + JWT + bcrypt) and Project CRUD (create / get / list / save) on Prisma.
- **Scaffolded but not yet wired to routes:** Scene, Job, EditorSession, SubscriptionPlan, UserSubscription, Asset, UserAsset, VrOutput, AuditLog (full Prisma schema exists).
- **Not yet built:** job tracking/queue worker, plan enforcement, file-upload → R2, scene versioning endpoints, editor-session tracking.

### 4.3 AI / Processing Layer — *Not built (scaffolded)*
- `ai-service/` currently holds only a Python venv (FastAPI, Uvicorn, **trimesh**, numpy, httpx, jsonschema) and an `.env`.
- **Intended near-term role:** a **stateless GLB renderer** (`POST /v1/render-glb`) that turns validated `scene-v1` JSON into GLB geometry.
- **Deferred role:** image-based floor-plan detection (CV model → JSON). This remains the core long-term IP but is out of the first slice.
- No Blender automation. Dockerization planned, not yet present.

### 4.4 3D Editor — *Functional prototype*
Import assets, object transforms, material/color editing, lighting.

### 4.5 VR Layer — *Planned*
Unreal- or WebVR-based pipeline for interactive walkthroughs. Not started.

---

## 5. Current Progress Status

### 5.1 Completed / Verified
- Vision, workflow, and UI/UX finalized.
- Landing + auth + dashboard (real project fetch).
- Native 2D editor (Konva) functional.
- 3D editor (R3F) functional prototype.
- Neon PostgreSQL + Prisma with the **full target schema** migrated.
- Backend auth + Project CRUD.

### 5.2 In Progress
- Wiring the scaffolded models (Scene/Job/EditorSession) to services and routes.
- Deterministic 2D→3D converter and durable job processing.
- Deployment hardening (Docker, env config, health checks).

### 5.3 Not Yet Built (Critical Gaps)
- Durable job tracking + worker (DB-backed queue).
- Scene versioning API + editor-session metering.
- File upload → Cloudflare R2 (pre-signed URLs).
- Billing & plan enforcement (schema exists; logic doesn't).
- Asset-management backend.
- FastAPI service (GLB render now; image detection later).
- VR production pipeline.

---

## 6. Pricing & Plans (System Constraints)

### 6.1 Enforced Limits (to be implemented)
The system must enforce, per plan: **jobs/month, admin limit, screen limit, furniture limit**, and add-on pricing. The `SubscriptionPlan` / `UserSubscription` tables already model these fields.

### 6.2 Plans
- **Neo** — entry tier
- **Addonno** — mid tier
- **Apice** — premium tier

Pricing logic is defined separately and **must be enforced at the backend level** (currently unenforced).

---

## 7. Key Technical Challenges

1. Structured floor plan → **accurate deterministic 3D** conversion.
2. Real-time 3D editor performance.
3. VR optimization.
4. Asset standardization.
5. State synchronization across systems (canvas ↔ scene ↔ GLB ↔ VR).

**Biggest risk:** pipeline reliability. Moving from image-AI to a **native structured editor** deliberately de-risks accuracy for the MVP — the converter is deterministic rather than probabilistic. Image AI reintroduces this risk later, on the team's timeline.

---

## 8. Future Enhancements (Planned)

- **Image-based floor-plan detection** (the originally-planned AI path, now deferred).
- **Smart Asset Suggestion Engine** — context-based recommendations (pgvector).
- **Template-based generation** — pre-built layouts for faster onboarding.
- **Assisted editing** — constraint-based, guided editing.
- **AI 3D Copilot (long term)** — natural-language, context-aware design actions.

---

## 9. Immediate Action Plan

**Phase 1 — Backend Foundation** *(in progress)*
Wire Scene/Job/EditorSession to routes · durable DB job queue · file upload → R2.

**Phase 2 — Editor Stabilization**
Rendering performance · undo/redo parity in 3D · scene validation against `scene-v1`.

**Phase 3 — Pipeline Reliability**
Deterministic converter hardening · strong `scene-v1` contract · actionable error handling.

**Phase 4 — VR Pipeline**
Scene → VR conversion · complexity reduction · output storage.

**Phase 5 — Monetization**
Usage tracking · plan enforcement · billing (Stripe / Razorpay).

---

## 10. Strategic Insight

XPLOR is a **spatial pipeline automation system**. The moat is **speed, simplicity, and reliability** — not UI polish or basic editor features. The MVP pivot to a native structured editor is a bet on *reliability first*: ship a deterministic pipeline now, layer probabilistic AI on top once the plumbing is proven.
