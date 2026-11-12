# XPLOR — Product Plan (after the foundations)

> **For the Claude session that picks this up.** This is the product roadmap that follows
> [`foundations-plan.md`](foundations-plan.md). **Do not start it until the foundations plan (F1–F9)
> is done** — the user chose "all foundations first". Read `foundations-plan.md` §0 (ground rules —
> they apply here unchanged) and §1 (how the code is organised) first.
>
> Work one workstream at a time, in the order of §3. Each workstream has a **minimum** scope (must
> ship) and a **stretch** scope (only if time allows). After each, report and stop for the user to
> review and commit.
>
> Written 2026-11-12 from the user's answers (§1).

---

## 1. Decisions the user made (the plan is built on these)

| Topic | Decision |
|---|---|
| Audience | Everyone eventually — **homeowners / DIY first** (Planner 5D-like), then builders & real estate, then designers. |
| Team & horizon | **The user + Claude**, planned as ~3 months. With "all foundations first" the realistic total is **~4–4.5 months**; see §3 cut lines. |
| Must-haves | **All four**: accurate plan import · realism + 3D walkthrough · smarter suggestions + catalog · public launch. |
| End goal | **Public beta with real users.** |
| Realism | **Real-time in the browser + photoreal still images** rendered with Blender on the user's GPU PC. |
| 3D content | **Free licensed only** to start (CC0 / CC-BY: Poly Haven, ambientCG, selected Sketchfab). |
| Plan inputs | **Clean digital images** (works today) and **CAD (DXF/DWG)**. Not PDFs or phone photos for now. |
| Multi-floor | **Later** (after this plan) — but keep the data model ready for it. |
| AI editor | **Small, now** — a first conversational editor with a handful of commands. |
| AI editor model | **A small local LLM on the GPU PC** (not a hosted API). |
| Hosting | **Low-cost managed, ~$0–25/month** (managed API host, static client host, Neon, R2, AI on the GPU PC via a named Cloudflare tunnel). |
| Pricing | **Free beta with usage limits** (caps on AI detections, photoreal renders and AI-editor messages per user). |

**Still open — ASK USER when the workstream starts:** default wall height (foundations F1), DWG
converter (P1), domain name and email provider (P7), exact quota numbers (P7), which local LLM
(P8), Redis/Sentry providers (foundations F7).

## 2. Product principles (apply to every workstream)

1. **Homeowner-first UX.** Every feature must be usable by someone who has never used a CAD tool:
   sensible defaults, one obvious button, undo for everything, no jargon in the UI.
2. **Deterministic core, AI at the edges.** The converter, placement and geometry stay rule-based
   and tested. AI (detection, OCR, LLM) proposes; deterministic code validates and applies. Every AI
   output passes the contracts (`contracts/*.schema.json`) and the F9 command validation.
3. **The GPU PC can be off.** Detection, OCR, photoreal renders and the AI editor run there. When it's
   unreachable the app still works; those features say "temporarily unavailable" and queued jobs
   (foundations F4) wait.
4. **Measure, don't eyeball.** Import accuracy has an evaluation set and numbers; realism has
   Playwright screenshot baselines; suggestions have rule-violation metrics; the AI editor has a prompt
   test set.
5. **Cost guard.** Every expensive action (detection, render, LLM message) is behind a per-user quota
   and the existing rate limits.

---

## 3. Order and cut lines

| Order | Workstream | Minimum | Stretch | Est. (solo + Claude) |
|---|---|---|---|---|
| 0 | Foundations F1–F9 | all (user's choice) | F10 e2e in CI | ~4–5 weeks |
| 1 | **P1 Accurate plan import** | wall clean-up + thickness + eval; DXF import | OCR scale & room names; DWG | ~2–3 weeks |
| 2 | **P2 Realism** | lighting, PBR materials, ceilings, glass, door/window models | time-of-day slider, style-based materials | ~2 weeks |
| 3 | **P3 3D walkthrough** | first-person walk + dollhouse view | guided tour, touch controls | ~1–1.5 weeks |
| 4 | **P5 Catalog & styles** | ~60–100 realistic items, normalised + compressed; 2 styles | 3+ styles, materials library | ~2 weeks |
| 5 | **P6 Suggestions v2** | furniture groups + layout scoring | optimiser, style-aware picks | ~1.5–2 weeks |
| 6 | **P7 Public launch** | deploy, quotas, accounts, onboarding, share link, legal pages | analytics, status page | ~1.5 weeks |
| 7 | **P8 Small AI editor** | 5–8 commands via local LLM, preview & confirm | multi-step requests, style changes | ~1.5–2 weeks |
| 8 | **P4 Photoreal stills** | one render per request (Cycles on GPU PC), quota-limited | camera presets, gallery | ~1.5 weeks |

**Cut lines if time runs short** (decide with the user): ship P7 (launch) after P1–P3 + a minimal P5,
and move P6/P8/P4 after launch. Launch must not slip behind the AI editor or photoreal renders.

---

## 4. Workstreams

### P1 — Accurate plan import

**Goal.** An uploaded plan becomes the right walls, at the right scale, first time: ~10 walls when the
plan has ~10, standard thickness, doors and windows on walls, rooms named.

**Background.** Detection is a MiT-B3 segmentation model in `Ai-service/` (detector + vectorisation
into detection-v1), bridged to canvas-v2 by `server/services/converter/detectionToCanvas.ts`, which
already welds endpoints (`weldWalls.ts`). Over-detection comes mainly from (a) both faces of a thick
wall detected as two walls, (b) one wall split into several collinear pieces, (c) short spurs and
noise. Thickness varies per segment.

**Minimum.**
1. **Measure first.** With the foundations F8 evaluation harness, record baseline numbers on the
   user's labelled set: wall count error, wall precision/recall (matched by overlap and angle),
   thickness error, door/window recall.
2. **Rule-based clean-up** in the AI service's post-processing (Python, next to the vectoriser, so
   detection-v1 leaves the service clean), each rule a tested function, applied in this order:
   - merge **parallel near-duplicate lines** (both faces of one wall) into one centre line whose
     thickness is the distance between them;
   - **Manhattan snapping**: snap walls within ~3–5° of horizontal/vertical exactly (configurable;
     skip for plans whose dominant angles aren't 0/90°);
   - **join collinear segments** separated by small gaps (and across door/window openings — the
     opening stays an opening, not a gap);
   - **thickness classes**: classify each wall as exterior (~0.20–0.30 m) or interior (~0.10–0.15 m)
     and snap to the class value; hard **min/max caps** (configurable, in metres once the scale is
     known, else in pixels relative to the image);
   - drop **spurs/noise** shorter than a threshold; re-weld endpoints and T-junctions;
   - snap doors/windows onto the nearest cleaned wall.
   All thresholds in one config object with documented defaults; no magic numbers in the code.
3. **Targets** (set after the baseline, agree with the user): e.g. wall count within ±15% on ≥80% of
   plans, no plan with 2× the true count. Results written to `Ai-service/eval/results/`, compared in
   the report.
4. **DXF import** (exact geometry, no AI): parse DXF on the server (e.g. a maintained JS DXF parser, or
   `ezdxf` in the AI service), map LINE/LWPOLYLINE on wall layers to walls, INSERT/blocks for
   doors/windows where recognisable, TEXT/MTEXT to labels; units from the DXF header → scale. A small
   UI step lets the user pick which layers are walls when names are ambiguous. Output canvas-v2 →
   the existing editor and converter.

**Stretch.**
5. **OCR** (on the GPU PC, e.g. PaddleOCR or Tesseract): room names → labels (which already type
   rooms in the converter); **dimension text** ("3.60 m", "12'6\"") matched to the wall it annotates →
   automatic scale (replaces manual Calibrate when found; the user can still override).
6. **DWG** — **ASK USER**: DWG needs a converter to DXF (e.g. ODA File Converter — check its licence
   for this use — or a paid conversion API). Until then, the UI asks for DXF.
7. Fixtures (toilet, sink, bath, counters, stairs) as extra model outputs → room typing and
   non-movable items. Only if eval shows room typing is the remaining weak spot.

**Done when.** Eval numbers meet the agreed targets and are in the report; DXF plans import exactly;
all import paths produce valid canvas-v2.

### P2 — Realism (real-time)

**Goal.** The 3D view looks like a home, not a game.

**Minimum.**
1. Renderer: physically based lighting, **ACES filmic tone mapping**, sRGB output, an **HDRI
   environment** (Poly Haven, CC0) for reflections and ambient light, soft shadows from a sun light,
   **ambient occlusion** (post-processing, e.g. N8AO or SSAO) with a quality toggle for weak laptops.
2. **PBR materials** for floors and walls (ambientCG/Poly Haven textures, compressed — KTX2): floor by
   room type (wood for living/bedrooms, tile for kitchen/bathroom), plain painted walls; the existing
   per-object colour/texture editing keeps working.
3. **Ceilings** (hidden in dollhouse view), **window glass** (transparent/physical material),
   **door and window models** placed in the converter's openings instead of empty holes.
4. **Performance budget:** 30+ fps on a typical laptop for a 3-room plan; measure and report. Use
   instancing and shared materials where it matters.
5. **Visual regression:** Playwright screenshot baselines of a fixed scene (fixed camera, lighting),
   with a tolerance, so later work can't silently degrade the look.

**Stretch.** Time-of-day slider (sun direction/colour, lamps and ceiling lights on at night with a
soft glow); per-style material sets (feeds P5).

**Note.** The default wall height (foundations F1 decision) must be realistic (~2.4–2.8 m) before this.

### P3 — 3D walkthrough (replaces "VR Preview")

**Minimum.**
1. **View modes** in the 3D editor: Edit (today's orbit), **Walk** (first person: WASD + mouse via
   pointer lock, eye height ~1.6 m, collision with walls so you can't walk through them, walk through
   door openings), **Dollhouse** (top-down orbit with ceilings hidden and walls cut away toward the
   camera).
2. Rename the navbar's "VR Preview" to the walkthrough entry point.

**Stretch.** **Guided tour**: a camera path from the entrance through rooms in a sensible order (rooms
and doors come from scene-v1; the order from a graph walk through doors), pausing in each room with
its name and area, ending in the dollhouse view; touch controls for tablets/phones; WebXR later on the
same walk mode.

### P5 — Catalog & styles (do before P6)

**Goal.** Realistic furniture that fits the homeowner's taste, at real size, fast to load.

**Minimum.**
1. **Sourcing:** curate ~60–100 realistic items covering the recommender's roles
   (`server/services/recommender/rules.ts`: bed, sofa, tables, chairs, storage, lamps, kitchen and
   bathroom fixtures…) from CC0 first (Poly Haven models), CC-BY where needed (record author, licence
   and source URL per item; show an attributions page). Realistic free furniture is limited — track
   coverage per role and report gaps to the user.
2. **Asset pipeline** (script, repeatable): normalise to metres with the origin at the base centre
   (as the editor expects), measure real dimensions into the catalog JSON, **Draco + KTX2
   compression**, render a consistent thumbnail per item (Blender on the GPU PC, or three.js
   offscreen), and seed the `Asset` table (existing `services/catalogSeed.ts` pattern; catalog JSON is
   validated with Zod).
3. **Styles:** 2 styles to start (e.g. modern, Scandinavian) as catalog tags + material sets.
   Keep the Kenney kit as the "simple" style/fallback.
4. Storage: catalog models can move to R2/CDN (foundations F5) if the repo gets too heavy — **ASK
   USER** (the 2.6 MB Kenney kit lives in the repo today).

**Stretch.** 3+ styles; a materials library (floors, walls, fabrics) users can apply; "restyle room".

### P6 — Suggestions v2

**Goal.** Suggestions a designer would make: complete, well-arranged groups, not single items.

**Background.** `server/services/recommender/` has a swappable `Recommender` interface; `rules-v1`
suggests one item per rule and places it deterministically (`placement.ts`, `geometry.ts`). Keep the
interface; add `rules-v2`.

**Minimum.**
1. **Furniture groups** per room type: e.g. living = sofa + coffee table + TV unit (+ rug, lamp);
   bedroom = bed + 2 nightstands (+ wardrobe); dining = table + n chairs; kitchen/bath fixtures along
   walls. Suggest and place a group as one unit; one-click "add group".
2. **Layout scoring:** score candidate placements on clear walking paths (door-to-door circulation),
   clearances (bed sides, chair pull-out, cabinet doors), facing (sofa↔TV, desk near window), keeping
   doors and windows unobstructed, and wall alignment. Choose the best of a deterministic candidate
   set. Same scene → same result.
3. **Style-aware picks** from P5's catalog tags (match the room's or project's style).
4. **Metrics:** for a fixed set of rooms, count rule violations (overlaps, blocked doors, missing
   clearances) and coverage (does each room get its essentials); compare v1 vs v2 in the report.

**Stretch.** A small optimiser (e.g. simulated annealing over the score) instead of candidate ranking;
"rearrange this room"; learn ordering from what users actually keep (log accept/remove — privacy-safe,
aggregated).

### P7 — Public launch (beta)

**Goal.** Real users can sign up and use it, at ~$0–25/month.

**Minimum.**
1. **Deploy** (combine with foundations F5–F7 if not done): API on a low-cost managed host (Render /
   Railway / Fly — pick by free-tier limits on sleep and memory), client as static files (Vercel /
   Netlify / Cloudflare Pages), Neon (main branch = production; keep the test branch for tests), R2
   for uploads, **named Cloudflare tunnel** to the GPU PC for the AI service. Run
   `npm run db:deploy` as a release step. `TRUST_PROXY` set; `NODE_ENV=production`; strong secrets.
   **ASK USER** for the domain.
2. **Quotas** per user per day (numbers — **ASK USER**; propose e.g. 5 detections, 3 photoreal renders,
   30 AI-editor messages): stored per user (reuse/replace the `SubscriptionPlan` tables per F1's
   decision), enforced server-side with a clear "you've reached today's limit" message (`429`/
   `QUOTA_EXCEEDED` in the standard error shape).
3. **Accounts** (foundations F6): sign-up, verify email, reset password, delete account.
4. **Onboarding:** a sample furnished project on first sign-in; a short first-run hint tour of the
   editors.
5. **Sharing:** a read-only link to a project's 3D view (walk/dollhouse), revocable; no account
   needed to view.
6. **Legal & trust:** privacy policy, terms, asset attributions page, cookie notice only if needed
   (no third-party tracking by default).
7. **Backups & monitoring:** Neon point-in-time restore confirmed; error tracking (F7) live; an uptime
   check on `/ready`.

**Stretch.** Privacy-friendly analytics (self-hosted or cookieless); a public status page.

### P8 — Small AI editor (conversational)

**Goal.** "Add a sofa facing the TV", "make the bedroom Scandinavian", "move the desk under the
window" — done by an AI that uses the same commands as the user, with a preview before applying.

**Background.** Built on foundations **F9** (typed, validated, serialisable edit commands). The model
runs **locally on the GPU PC** (user's choice).

**Minimum.**
1. **Local LLM service** on the GPU PC (e.g. Ollama or llama.cpp server), reachable through the same
   tunnel/auth pattern as the AI service. **ASK USER** about the model; propose a 7–8B instruct model
   with good JSON/tool output (e.g. Qwen 2.5 7B Instruct or Llama 3.1 8B Instruct), checking it fits
   in GPU memory next to the segmentation model (or load on demand).
2. **Reliability over cleverness** (small models are weak at free-form tool calls):
   - a small command set v1 (5–8): add item (by role/name, optional room and "near/facing" target),
     move/rotate item, delete item, change material/colour, set room type/name, "suggest for this
     room";
   - **constrained JSON output** (grammar / JSON-schema mode in the LLM server) matching the F9 command
     schemas; the server validates with Zod and resolves names to ids and positions
     deterministically (the LLM never invents coordinates — placement uses the recommender's
     geometry);
   - context sent to the model: a compact scene summary (rooms, items, styles), not the full scene.
3. **UX:** a chat panel in the 3D editor; each reply shows the planned commands as a **preview**;
   Apply / Discard; everything applied is undoable as one step.
4. **Evaluation:** a prompt test set (~50 requests with expected commands) run in CI-like fashion
   against the local model; report accuracy; refuse gracefully when unsure ("I can't do that yet").
5. **Quota** per user (P7) and "temporarily unavailable" when the GPU PC is off.

**Stretch.** Multi-step requests ("furnish the living room in modern style"); 2D editor commands;
asking clarifying questions.

### P4 — Photoreal stills (Blender on the GPU PC)

**Minimum.**
1. A render worker on the GPU PC: receives a job (foundations F4 queue pattern) with the scene as GLB
   (the editor already exports GLB), camera, lighting preset and HDRI; runs **Blender headless**
   (Cycles, GPU, denoiser) via a script; uploads the PNG to R2; marks the job done.
2. UI: "Render photo" from the current camera; progress; result in a per-project gallery; quota-limited.
3. Material mapping: make sure P2/P5 materials survive glTF → Blender (PBR glTF materials map well;
   test glass and emissive lights).

**Stretch.** Camera presets per room, 4K output, batch "render every room".

---

## 5. Keep the data model ready for later (no implementation now)

- **Multi-floor:** scene-v1 and canvas-v2 have no levels yet. When touching the contracts (F2), add
  nothing yet, but don't make choices that assume a single floor (e.g. avoid global "the floor" in new
  code; keep room/wall ids unique per project, not per plan). Write a short design note in
  `contracts/README.md` for how levels would be added (a `levels[]` with elevation, walls/rooms per
  level, stairs as openings between levels).
- **Collaboration / versioning:** F9's command log is the basis; don't design anything that requires
  mutating saved scenes outside commands.

## 6. Definition of done (every workstream)

Same as `foundations-plan.md` §4: all checks green and stated with numbers (`npm run check`, build,
`npm run e2e`, `db:check-migrations` when the schema changes; plus the workstream's own metric —
eval numbers, fps, screenshot diffs, suggestion violations, prompt-set accuracy), tests at the right
level, docs updated (`docs/05`, `.env.example`, `contracts/README.md`, `docs/06-roadmap.md` for
product status), a short honest report, then stop for the user's review and commit.
