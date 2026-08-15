# `contracts/` — canonical data contracts

> **Read [`docs/`](../docs) before touching anything here.** These schemas are the
> load-bearing agreement between the client, the Node API, and the Python AI service.
> See [`docs/02-backend-architecture.md`](../docs/02-backend-architecture.md) §4 and
> [`docs/06-roadmap.md`](../docs/06-roadmap.md) Phase 2.

Formal [JSON Schema](https://json-schema.org/) (draft 2020-12) files, validated on every
read and write:

| File | What it describes | Produced by | Consumed by |
|------|-------------------|-------------|-------------|
| [`canvas-v2.schema.json`](./canvas-v2.schema.json) | Structured 2D floor-plan input (Path A) | 2D editor | the converter |
| [`scene-v1.schema.json`](./scene-v1.schema.json) | Canonical 3D scene (source of truth) | the converter + 3D editor | GLB/VR render, storage |

## The pipeline these contracts sit in

```
2D editor ──► canvas-v2 ──►  converter  ──► scene-v1 ──► GLB / VR (derived, regenerable)
                          (deterministic)        ▲
                                    3D editor ────┘  (enriches assets / lighting / materials)
```

The **scene is canonical; GLB and VR are derived** and can always be regenerated from it
(`docs/01` §3). A change to either contract is a **versioned, breaking change** — bump the
version tag (`canvas-v2` → `canvas-v3`), never mutate a schema in place.

## Units & coordinate conventions

- **canvas-v2** — plan coordinates are in **canvas pixels** (origin top-left, +y downward,
  matching the 2D editor). `scale.pixelsPerMetre` converts them to metres. Vertical
  dimensions that have no pixel analogue (`wallHeight`, opening `height`/`sillHeight`) are
  given directly in **metres**.
- **scene-v1** — everything is in **metres**, right-handed **Y-up** (x = right, y = up,
  z = depth). The floor is `y = 0`. A canvas point `(px_x, px_y)` maps to floor
  `(px_x / pixelsPerMetre, px_y / pixelsPerMetre)` as `(x, z)`.
- Doors and windows are **parametric**: attached to a wall by id and positioned by a
  normalized offset along it (0 = start, 1 = end) — never free x/y. This is what makes the
  2D→3D conversion well-defined.

## Relationship to what the editor emits *today* (important)

The current 2D editor does **not** yet emit `canvas-v2`. It persists a bespoke flat shape —
call it *canvas-v1* — inside `project.canvas`:

```jsonc
{ "elements": [
  { "id": "...", "type": "wall",   "startX": 0, "startY": 0, "endX": 300, "endY": 0, "thickness": 8, "curvature": 0 },
  { "id": "...", "type": "door",   "x": 120, "y": 0, "width": 40, "height": 80, "rotation": 0 },
  { "id": "...", "type": "window", "x": 200, "y": 0, "startX": 180, "startY": 0, "width": 60, "height": 40, "rotation": 0, "curvature": 0, "attachedWallId": "..." },
  { "id": "...", "type": "label",  "x": 50, "y": 50, "text": "Kitchen", "fontSize": 16 }
] }
```

Key gaps `canvas-v2` closes, and which the **converter / editor-migration step (roadmap 2.2)**
is responsible for bridging:

- **no `scale`** — canvas-v1 has no px→metre factor; the editor must start capturing it.
- **no `wallHeight`** — there is no 3D height anywhere in canvas-v1.
- **free-xy openings** — doors carry raw `x/y/rotation` and only windows carry an
  `attachedWallId`; `canvas-v2` makes *both* parametric (`wallId` + `offset`).

Until that migration lands, `canvas-v2` is the **target** these live behind, not the wire
format in the database. Don't assume stored `project.canvas` validates against `canvas-v2` yet.

Likewise, today's 3D "Save to Backend" stores glTF JSON inside `project.canvas` — a pragmatic
shortcut that the versioned `scene-v1` supersedes in roadmap 2.3.

## Validation (to be wired in the converter step)

- **Node API** — validate with a Zod-wrapped schema check (or Ajv) at every boundary.
- **Python AI service** — validate with `jsonschema` against these same files.

These files are the single source; both services load them rather than redefining the shape.
