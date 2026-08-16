# XPLOR — Master Reference

> **Type:** Foundational document. Describes *what XPLOR is and how it is meant to work* — the product
> vision, user journey, and core concepts. It is intentionally **timeless**: it does not track build
> progress. For "what is built vs. not," see the reports in `docs/status-reports/`.

---

## 1. Product Definition

### 1.1 Core Idea
XPLOR is an **AI-enabled 2D → 3D → VR visualization platform for real estate**. It lets non-technical
users turn a simple floor plan into an interactive 3D and VR walkthrough of a space, in minutes.

### 1.2 Problem
Traditional VR/3D visualization workflows require specialized tools (Blender, Unreal), technical
expertise, days-to-weeks of effort, and significant cost. XPLOR removes the technical barrier,
collapses the timeline to minutes, and drives the cost of VR creation toward zero.

### 1.3 Value Proposition
- **"Draw / Upload → Customize → Experience in VR."**
- Fast, intuitive, scalable spatial visualization.
- Built for non-technical users.

### 1.4 Strategic Insight
XPLOR is a **spatial pipeline automation system** built **reliability-first**: a *deterministic* pipeline
is the foundation, and probabilistic AI is layered on top only once the deterministic plumbing is proven.
The core moat is **speed, simplicity, and reliability**.

> *Capstone note:* in the current capstone phase, **a cohesive UI, strong UX, and smart assistive features
> (e.g. a furniture suggestion engine) are explicitly in scope** — see `06-roadmap.md`. This does not
> change the ordering: the deterministic core is proven first, and polish + smart features build on top of
> it, not instead of it.

---

## 2. The Two Input Paths

XPLOR accepts a floor plan through one of two paths. Both converge on the **same canonical 3D
representation** and the same downstream renderer, editor, and VR pipeline.

| Path | Input | How the structured plan is produced | Nature |
|------|-------|-------------------------------------|--------|
| **A — Structured Editor** (foundational) | User draws the layout | The native 2D editor emits a structured canvas directly | **Deterministic** |
| **B — Image Detection** (now in scope) | User uploads a floor-plan image | A computer-vision service detects walls/rooms and emits the same structured canvas | **Probabilistic** |

**Design rule:** Path B is *additive*. It produces the same structured canvas contract that Path A
produces, so everything downstream (conversion → 3D → VR) is shared and unaware of which path was used.
Path A is the foundation; Path B is built on top of a working backend, not before it.

---

## 3. Canonical Data Model

Two contracts are the backbone of the platform. Everything is expressed in terms of these.

- **`canvas` contract** — the structured 2D layout: project scale, wall height, walls, and attached
  doors/windows. Produced by the 2D editor (Path A) or the detection service (Path B).
- **`scene` contract** — the canonical 3D scene: rooms, assets, lighting, materials. Produced
  deterministically from `canvas`.

**Source of truth:** the **`scene` JSON is canonical**. The GLB mesh and any VR output are **derived
artifacts** — always regenerable from the scene. The formal JSON Schemas for these contracts live in
`contracts/` and are validated on read and write (see `02-backend-architecture.md`).

---

## 4. User Journey (End-to-End)

| Step | Stage | What happens |
|------|-------|--------------|
| 1 | **Entry** | User logs in → Dashboard. |
| 2 | **Project Creation** | User creates a project. |
| 3 | **2D Design** | User draws the layout in the native 2D editor **(Path A)** — or uploads a floor-plan image for detection **(Path B, future)**. Either way the result is a structured `canvas`. |
| 4 | **Conversion** | The `canvas` is deterministically converted to a versioned `scene`. |
| 5 | **3D Rendering** | The `scene` is rendered to a GLB mesh and loaded into the 3D editor. |
| 6 | **3D Editing** | Add/remove furniture, move/scale/rotate, edit materials/colors, add lighting, use the asset library, get recommendations. |
| 7 | **Save** | Autosave + manual save; the backend stores the versioned `scene`, assets, and configuration. |
| 8 | **VR Generation** | User converts the scene to a VR-compatible format. |
| 9 | **VR Experience** | Interactive walkthrough on VR devices. |

---

## 5. Definition of a "Job"

A **Job** is a **tracked unit of asynchronous work** — something the backend records, runs, and lets the
client poll to completion. Examples: **floor-plan image processing** (Path B detection) and a
**`canvas → scene` conversion**. Each Job moves through `pending → processing → completed | failed` and
carries its input, result, progress, and any error, so the UI can show progress and a terminal outcome.

> *Capstone note:* Jobs were originally **also** the unit of metered/billable work tied to plan limits.
> **Monetization is deferred for the capstone** (see §7), so Jobs today are purely a processing and
> observability mechanism — not a billing one.

---

## 6. System Overview

XPLOR is composed of four cooperating parts. Each is specified in detail in
`02-backend-architecture.md`.

- **Frontend** — the web application: landing, auth, dashboard, the 2D editor, and the 3D editor.
- **Main API** — authentication, project management, scene/versioning, and job tracking. *(Billing is
  deferred — see §7.)*
- **Render / AI service** — a stateless service that (a) renders a `scene` to a GLB mesh, and
  (b, future) detects structure from a floor-plan image.
- **Data & storage** — a relational database (canonical records, JSONB scenes, the job queue) and blob
  storage (images, GLB meshes, VR outputs, asset files).

---

## 7. Pricing & Plans — *Deferred (out of scope for the capstone)*

> **Monetization is not part of the current capstone build.** This section is retained for historical
> context and a possible future commercial version. None of it is enforced today, and the metering /
> plan-limit features it implied have been **descoped** (see `04-feature-specification.md`, E8/FP).

The original commercial design enforced, **per plan**, limits on **jobs per month, admin, screens, and
furniture**, plus add-on pricing, across three tiers (**Neo** / **Addonno** / **Apice**). If XPLOR is ever
taken commercial, this is where that model would be reintroduced — layered on top of the Job model in §5,
which already records the work that would be metered.

---

## 8. Key Technical Challenges & Risk

1. Structured floor plan → **accurate deterministic 3D** conversion.
2. Real-time 3D editor performance.
3. VR optimization (scene-complexity reduction).
4. Asset standardization.
5. State synchronization across systems (`canvas` ↔ `scene` ↔ GLB ↔ VR).

**Biggest risk:** pipeline reliability. Choosing a native structured editor (Path A) as the foundation
deliberately de-risks accuracy — the converter is deterministic rather than probabilistic. Image
detection (Path B) reintroduces this risk later, on the team's timeline, without disturbing the proven
core.

---

## 9. Enhancements Beyond the Core Pipeline

**Now in scope (capstone):**
- **Image-based floor-plan detection** (Path B) — the probabilistic input path. The current heuristic
  detector ships behind a **stable, swappable seam** (a fixed detection contract) so a stronger model can
  replace it without any downstream change.
- **Smart Asset Suggestion Engine** — a **scene-aware furniture recommender**: it reads the scene (room
  size + the objects already present) and recommends assets to place. Starts as a light rule/ML model
  behind a swappable interface (not necessarily vector search).

**Later:**
- **VR walkthrough** — the namesake experience; a stub button exists and the feature is deferred.
- **Template-based generation** — pre-built layouts for faster onboarding.
- **Assisted editing** — constraint-based, guided editing.
- **AI 3D Copilot (long term)** — natural-language, context-aware design actions.

---

## 10. Document Map

- **`01-master-reference.md`** *(this doc)* — product vision, user journey, core concepts.
- **`02-backend-architecture.md`** — technical architecture, data model, modules, API.
- **`03-deployment-and-scalability.md`** — hosting, zero-cost MVP strategy, scale path.
- **`04-feature-specification.md`** — the feature set that drives development (MVP + future).
- **`05-development-guidelines.md`** — git workflow, conventions, and engineering hygiene.
- **`status-reports/`** — point-in-time snapshots of what is actually built. *All progress lives here,
  never in the foundational docs above.*
