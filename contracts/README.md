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
| [`detection-v1.schema.json`](./detection-v1.schema.json) | Walls/rooms/doors/windows detected in a floor-plan image (Path B) | AI service (`POST /process-floor-plan`) | the detection → canvas-v2 bridge |

## The pipeline these contracts sit in

```
floor-plan image ──► detector ──► detection-v1 ──► bridge ──┐
                  (AI service)                              ▼
2D editor ───────────────────────────────────────────► canvas-v2 ──►  converter  ──► scene-v1 ──► GLB / VR (derived, regenerable)
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
- **detection-v1** — everything is in **source-image pixels** (origin top-left, +y
  downward). No real-world scale is applied; the bridge supplies it when producing
  canvas-v2. Walls are **centre-line segments** (two endpoints + `thickness`), never
  bounding boxes. Doors/windows are a **centre point** + `width` and get snapped to the
  nearest wall within 60 px; anything farther is dropped.
- Doors and windows are **parametric**: attached to a wall by id and positioned by a
  normalized offset along it (0 = start, 1 = end) — never free x/y. This is what makes the
  2D→3D conversion well-defined.

## Legacy canvas-v1 (still accepted on read)

The 2D editor **emits `canvas-v2`** (autosave via `client/src/editor/canvas/canvasV2.ts`). Older projects
may still hold the original flat shape — *canvas-v1* — in `project.canvas`:

```jsonc
{ "elements": [
  { "id": "...", "type": "wall",   "startX": 0, "startY": 0, "endX": 300, "endY": 0, "thickness": 8, "curvature": 0 },
  { "id": "...", "type": "door",   "x": 120, "y": 0, "width": 40, "height": 80, "rotation": 0 },
  { "id": "...", "type": "window", "x": 200, "y": 0, "startX": 180, "startY": 0, "width": 60, "height": 40, "rotation": 0, "curvature": 0, "attachedWallId": "..." },
  { "id": "...", "type": "label",  "x": 50, "y": 50, "text": "Kitchen", "fontSize": 16 }
] }
```

`normalizeCanvas` (server converter) migrates it to `canvas-v2` — filling in the project's scale/wall
height and snapping free-xy doors/windows to the nearest wall — and passes `canvas-v2` through unchanged.
The detection bridge reuses the same path. 3D edits are saved as versioned `scene-v1` rows.

## Validation

- **Node API** — Ajv (draft 2020-12) in `server/services/converter/validate.ts` compiles these files
  directly: `canvas-v2` and `scene-v1` at both converter boundaries, and `detection-v1` on every AI-service
  response before the bridge runs.
- **Python AI service** — produces `detection-v1` through the Pydantic models in `Ai-service/app/schemas.py`;
  the schema can be checked there with `jsonschema` (e.g. in tests or when integrating a new detector).

These files are the single source; consumers load them rather than redefining the shape.

## detection-v1: the swappable detector seam

`detection-v1` is the plug-and-play boundary for image detection. Any detector, whether the
current OpenCV heuristic (`Ai-service/app/services/detector.py`) or a future trained
model, must return this shape from `detect(image_bytes)`. Nothing downstream changes when
the detector is swapped. The schema mirrors the Pydantic `DetectionResult` in
`Ai-service/app/schemas.py`, and the two must be changed together. The companion
`metadata` envelope (`method`, image size, timings, counts) is defined under
`$defs/metadata`; set `method` to the detector's name.
