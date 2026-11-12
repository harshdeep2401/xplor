# XPLOR — Status Report (Phase 3b: Trained Model Integrated)

- **Generated:** 2026-10-16
- **Nature:** Point-in-time record of the trained floor-plan model replacing the OpenCV heuristic, its
  evaluation, and the related tooling changes. The living plan is `docs/06-roadmap.md`.
- **Method:** Automated checks (AI-service pytest, server typecheck + tests), the evaluation script over the
  CubiCasa5K test split, the real AI service exercised over HTTP on the Windows GPU machine, and
  detection output run through the server's real bridge + converter.
  **Not covered:** a browser click-through of the import flow with the new model, the Docker stack, CI
  (nothing pushed yet), real-world photos.
- **Git state:** branch `AIservice` @ `fde4080` + **uncommitted** changes described below (the developer
  commits).

---

## 1. Summary

Imports now use the **trained MiT-B3 + U-Net segmenter** (experiment `03_unet_mitb3`, model card at
`Ai-service/Model/ModelInfo.md`) instead of the OpenCV heuristic. The model labels every pixel as
background / wall / door / window / room; new post-processing turns that into `detection-v1` (straight,
connected walls with measured thickness, door/window centres and widths, room polygons). No contract or
downstream change was needed. Doors and windows are detected for the first time.

On the CubiCasa5K test split the model is far ahead of the heuristic on every measure (§3). It runs in
**PyTorch on the GPU** (~80 ms for the network, ~0.25 s per plan including vectorization).

**Overall:** 🟢 detection quality · 🟢 remote hosting over a tunnel (verified) · 🟡 root Docker stack
not yet run end to end.

---

## 2. Delivered

### AI service (`Ai-service/`)
- **Dependencies** (`pyproject.toml`, `uv.lock`): `torch` 2.14.1 + `torchvision` from the **CUDA 12.6**
  index (Pascal-compatible; also runs on CPU), `segmentation-models-pytorch` 0.5.0 (pinned: it defines the
  weight names), `scikit-image`; `pytest` as a dev dependency. Lock limited to Windows + Linux.
- **`app/services/segmenter.py`** — loads `Model/best.pt` once at startup (+ warm-up pass, which surfaces
  GPU/driver problems at boot), same preprocessing as training (`Model/predict.py`), GPU when available.
  Logits are resized to the image before argmax (smoother masks than resizing class ids).
- **`app/services/vectorize.py`** — mask → `detection-v1`: wall + opening pixels skeletonized and traced
  into a graph; segments simplified (Douglas-Peucker), corner spurs pruned, collinear pieces merged,
  near-horizontal/vertical walls snapped exactly (shared nodes keep walls connected), free ends extended,
  thickness from the distance transform; door/window blobs → centre + width; room regions → polygons.
  Thresholds scale with the measured wall thickness.
- **`app/services/detector.py`** — decodes the image (transparent PNGs flattened on white, EXIF
  orientation applied, 50 MP cap against decompression bombs) and dispatches on `DETECTOR`
  (`unet` default, `opencv` for comparison). The heuristic moved to `opencv_detecter.py`.
- **Availability:** if the model can't load, `/health` and `/process-floor-plan` return **503** with the
  reason — no fallback. Error text avoids local paths (it may travel over the tunnel later).
  Detection runs in a worker thread so `/health` stays responsive.
- **Tests:** `tests/` — 11 pytest tests (vectorization on synthetic plans; 503 behaviour without weights;
  image decoding). `eval/` — evaluation script (§3).
- **Settings** (`.env.example`): `DETECTOR`, `MODEL_PATH`, `MODEL_DEVICE`, `MAX_VECTORIZE_SIDE`,
  `MAX_IMAGE_PIXELS`. `.env` is now found relative to `Ai-service/`, whatever the working directory.

### Server (`server/`)
- `services/aiService.ts`: a non-2xx answer from the AI service now records its `detail` on the Job
  (e.g. "Model weights are missing…"), not just the status code.
- `npm test` is cross-platform (quoted glob to `node --test`; Node ≥ 22). 20/20 tests pass on Windows.

### CI / infra
- CI: server job on Node 22; AI-service job uses uv 0.12.24 and runs `pytest` (downloads CUDA torch).
- AI `Dockerfile`: uv 0.12.24, `--no-dev`, non-root user, weights **mounted** at `/app/Model` (not in
  the image; `.dockerignore` excludes `Model/`). Image ~11 GB (CUDA PyTorch); first build ~25 min.
- Root `docker-compose.yml`: AI weights mounted, `FASTAPI_SECRET` from both `.env` files, ports bound to
  `127.0.0.1`; `docker-compose.gpu.yml` add-on gives the AI service the GPU.

### Remote hosting (roadmap 3b.5)
- **Auth:** `app/security.py` — every request except `/` and `/health` needs
  `Authorization: Bearer <FASTAPI_SECRET>` (≥ 32 chars, constant-time compare), checked in middleware
  **before the body is read**; oversized uploads refused from `Content-Length` (413); no/weak secret →
  503. CORS middleware removed (server-to-server only). `ENABLE_DOCS` turns `/docs` off for hosting.
- **Image in the request:** `/process-floor-plan` now takes `multipart/form-data` (`jobId`, `projectId`,
  `image`); `image_fetcher.py` and `NODE_UPLOADS_BASE_URL` are gone, so the AI service never calls the
  API. `httpx` moved to dev dependencies; `python-multipart` added. Old `.env` keys are ignored.
- **Server:** `aiService.ts` uploads the buffered file with the secret; errors stored on the Job never
  include the AI service URL. `server/.env.example` documents `FASTAPI_SECRET` + `AI_SERVICE_TIMEOUT_MS`.
  A new 43-character secret was generated into `server/.env` and `Ai-service/.env` on this PC.
- **Hosting stack:** `Ai-service/compose.host.yml` — the AI container on the GPU (no published port,
  `restart: unless-stopped`) + `cloudflared` 2026.9.3; `COMPOSE_PROFILES=quick-tunnel` (random
  `*.trycloudflare.com` URL) or `named-tunnel` (+ `TUNNEL_TOKEN`). Guide: `docs/guides/ai-hosting.md`.
- **Verified through a live quick tunnel:** `/health` 200 with `device: cuda`; no / wrong secret → 401;
  `/docs` blocked; detection with the secret 200 in ~1.3 s round trip (~0.3 s on the PC); the server's
  real `aiService.ts` called through the tunnel → `completed`, and → "HTTP 401: Missing or wrong API
  key" with a wrong secret. The stack was stopped afterwards.
- Tests: AI service **20** (auth, multipart upload, size limit, 503 cases added); server 20, `tsc` clean.

### Docs
- `README.md` (model setup, `/health` states, Node 22+), `docs/01`–`05`, `contracts/README.md` updated for
  the trained model, PyTorch-not-ONNX, no-fallback, and weights distribution. Roadmap §3b rewritten.

---

## 3. Evaluation (CubiCasa5K test split)

`uv run python eval/evaluate.py --data C:/TrainXPLOR/data/processed/test` — all **400** test plans,
model on the Quadro P6000. Scores are on the **`detection-v1` output** (what the server receives), not on
pixels, so they include the vectorization step. Means over plans:

| Detector | Wall P | Wall R | **Wall F1** | **Door F1** | **Window F1** | **Rooms closed** | ms / plan |
|---|---|---|---|---|---|---|---|
| OpenCV heuristic (before) | 0.519 | 0.457 | **0.470** | **0.003** | **0.005** | **17.2%** | 99 |
| **Trained model (now)** | 0.956 | 0.951 | **0.953** | **0.920** | **0.883** | **86.3%** | 242 |
| Oracle (vectorizer on ground truth) | 0.993 | 0.976 | **0.984** | **0.997** | **0.999** | **86.1%** | 126 |

- **Walls:** detected walls drawn at their thickness vs. true wall + opening pixels, 3 px tolerance.
- **Doors / windows:** detected centres matched one-to-one to true blobs (hit = within half the true
  opening's length, ≥ 10 px). The heuristic detects none; its tiny non-zero score comes from plans with
  no doors/windows at all, which count as perfect.
- **Rooms closed:** the detection goes through the server's real bridge (welding + opening attachment) and
  converter; closed rooms in the 3D scene ÷ true rooms, capped at 100% per plan.
- Every one of the 1,200 detections passed `detection-v1` and `canvas-v2` validation.

**Reading the numbers**
- The model is **~2× the heuristic on walls**, and doors/windows go from never detected to ~0.9 F1.
- Plans where **every** room closes: heuristic 13/400, model **141/400**; at least 80% of rooms: 15 vs.
  **293**.
- The model matches the oracle on rooms (86.3% vs 86.1%), so the remaining room gap is **not the model**:
  it is in vectorization / welding / room counting. One likely factor, not yet verified: the true room
  count includes areas (e.g. balconies, open areas) that have no closed wall loop. Investigating this is
  the next tuning target.
- Caveat: the room metric doesn't penalise extra rooms. The model produces more closed rooms than the
  truth on 65/400 plans (oracle: 26), e.g. where railings or furniture outlines form extra loops.
- The model is slower (242 ms vs 99 ms per plan, of which ~80 ms is the network) but well within the
  server's 30 s timeout.

Per-plan results: `Ai-service/eval/results/per_plan.csv` (gitignored; rerun to regenerate).

---

## 4. Known Issues / Open Items

| Item | Severity | Notes |
|------|----------|-------|
| Quick-tunnel URL changes on restart | Medium | Update the server's `FASTAPI_WEBHOOK_URL` after each restart until a domain + named tunnel exist. |
| Root Docker stack not run end to end | Medium | The AI image is verified (`compose.host.yml`); `docker compose up` with the server image (contracts fix) still to run — needs the dev servers on :5001/:8000 stopped first. |
| Dev services need a restart | Medium | The new `FASTAPI_SECRET` is only picked up when the API and AI dev servers restart. |
| Browser check of import with the model | Medium | Pipeline verified via HTTP + the server bridge, not yet clicked through in the UI. |
| Model-level errors | Medium | Balcony railings → walls or very wide windows; some furniture outlines → short walls. Fixable in the editor. |
| Untested domains | Medium | Only CubiCasa5K (Finnish plans, simulated photos) scored; real photos later (3b.6). |
| Model licence | Low | CubiCasa5K is CC BY-NC 4.0: non-commercial. |
| Migration baseline | Medium | Unchanged since 2026-08-13 — never accept a `prisma migrate dev` reset. |
| Leftover JS duplicates | Low | `client/src/firebase.js`, `services/authservice.js`, `components/AuthVisual.jsx`. |

---

## 5. Next

Phase 4 (toast system → design tokens/shared primitives); run the root Docker stack end to end; deploy
the server against the tunnel. See `docs/06-roadmap.md`.
