# XPLOR — Status Report (Phase 3: Image → 2D → 3D Loop Closed)

- **Generated:** 2026-10-16
- **Nature:** Point-in-time record of Phase 3 completion, the AI-service tooling change, and the move of
  development to Windows. The living plan is `docs/06-roadmap.md`.
- **Method:** Automated checks (server unit tests + typecheck, client typecheck + build, schema validation
  in Ajv and Python `jsonschema`), the real AI service booted and exercised over HTTP with a synthetic
  plan, and a **manual browser click-through by the developer** (import → edit → 3D: "it works").
  **Not covered:** the Docker stack (no Docker on the Mac used), CI (nothing pushed yet).
- **Git state:** **all of the work below is uncommitted** in the Mac working tree (`main` @ `457e0a8`).

---

## 1. Summary

The headline loop now works: **upload a floor-plan image → detected walls appear in the 2D editor over
the uploaded image → user fixes them and calibrates the scale → Convert to 3D → walls, openings and room
floors.** The plumbing is sound; the **weak link is detection quality** — the OpenCV heuristic produces
rough output. A trained U-Net (walls + doors) is close to done on the Windows GPU machine and will replace
it behind the `detection-v1` contract.

**Overall:** 🟢 pipeline · 🟡 detection quality · ⚪ Docker unverified.

---

## 2. Delivered

### Contract
- **`contracts/detection-v1.schema.json`** — the detector output (walls as centre-line segments, doors/
  windows as centre + width, rooms as polygons, plus a `metadata` definition), mirroring Pydantic
  `DetectionResult` in `Ai-service/app/schemas.py`. Validated against real detector output in both Ajv and
  Python `jsonschema`; rejects bounding-box walls, 2-point rooms, zero thickness, unknown keys.

### Server (`server/`)
- **Bridge** `services/converter/detectionToCanvas.ts`: `detection-v1` → canvas elements → existing
  `normalizeCanvas` (openings snap to the nearest wall within 60 px) → `canvas-v2`.
- **Wall welding** `services/converter/weldWalls.ts`: snaps endpoints within 20 px onto corner/T-junction
  intersections and splits walls at junctions. Found necessary on the first real run: the detector traces
  wall *edges*, so corners never met and **no rooms formed** (no floors in 3D). After welding, the test
  plan went from 0 to 2 rooms.
- **Upload controller** (`uploadFloorPlan`): validates the AI result against `detection-v1`, writes
  `canvas-v2` to `project.canvas` (previously a raw `Scene` row the editor never read), sizes the canvas to
  the image, refuses non-empty projects with **409**, returns the updated project.
- Tests: **20/20 pass** (10 new: bridge golden + determinism + 3D conversion, weld cases, detector-style
  gaps closing into rooms). `tsc --noEmit` clean.

### Client (`client/`)
- **Dashboard → Import Floor Plan**: name + image → create project → upload → open editor with a result
  banner. A rejected upload deletes the empty project; a failed detection still opens the editor.
- **2D editor**: uploaded image as a **trace layer** (toggle + opacity, excluded from PNG export);
  **📏 Calibrate** tool (drag a known length, enter metres → `pixelsPerMetre`, autosaved).
- `tsc` + `vite build` clean.

### AI service (`Ai-service/`)
- Port default fixed **5000 → 5001** (`.env.example` + `config.py`); it previously could not fetch uploads.
- **Moved to uv:** `pyproject.toml` (7 direct deps, same pins), `uv.lock`, `.python-version` (3.12);
  `requirements.txt` removed; Dockerfile and CI use `uv sync --frozen`. `python-dotenv` dropped as a direct
  dep (still installed via `pydantic-settings`).

### Infra
- **Server Docker image now includes `contracts/`** (compose `additional_contexts` + `COPY --from=contracts`).
  The converter has loaded the schemas at startup since Phase 2, so the container would have crashed.
  **Not yet built** — verify on Windows.

---

## 3. Known Issues / Open Items

| Item | Severity | Notes |
|------|----------|-------|
| Detection quality | High | Misses walls, adds false ones (text/symbols), no doors/windows. Phase 3b (U-Net + evaluation script). |
| Docker stack unverified | High | Build + run `docker compose up --build` on Windows before relying on it. |
| Phase 3 uncommitted | High | Exists only on the Mac working tree; move it to Windows deliberately. |
| `server` `npm test` POSIX-only | Medium | `$(find …)` fails in Windows `cmd.exe`; use Git Bash/WSL for now. |
| Migration baseline | Medium | Unchanged since 2026-08-13 — never accept a `prisma migrate dev` reset. |
| Leftover JS duplicates | Low | `client/src/firebase.js`, `services/authservice.js`, `components/AuthVisual.jsx`. |
| Local uploads | Low | `server/uploads/` is machine-local; projects imported on the Mac will lack their trace image on Windows. |

---

## 4. Moving to Windows — checklist

1. Bring the working tree over (copy the repo without `node_modules/` and `.venv/`, or push a branch once
   ready) and copy `server/.env` + `client/.env`.
2. `npm ci` in `client/` and `server/`; `uv sync` in `Ai-service/`.
3. `docker compose up --build` → `docker compose ps` healthy, `curl localhost:5001/live`,
   `curl localhost:8000/health`; run the client with `npm run dev`; repeat the import checklist.
4. Commit Phase 3 + uv migration + docs once verified.

---

## 5. Next

Phase 3b (evaluation script → U-Net via ONNX + mask→vector → detector selection) in parallel with
Phase 4 (toast system → design tokens/shared primitives). See `docs/06-roadmap.md`.
