# XPLOR — Status Report (Live Manual Test Pass)

- **Generated:** 2026-08-11 12:32 IST
- **Branch / HEAD:** `integrated-editors` @ `cb2cf1d`
- **Method:** **Manual / live smoke test** — the app was actually run (DB + server + client) and each
  feature exercised by hand. This complements the static-read audit in
  `STATUS-REPORT-2026-08-09.md`, which was source-only.
- **Not covered:** the AI service (`Ai-service/`) was **not started or tested** this pass.
- **Scope note:** This is a point-in-time snapshot. Target behavior lives in the foundational docs
  (`01`–`05`); this file records *what is actually working right now*.

---

## 1. Executive Summary

The **working spine is auth + the 2D editor + project persistence for 2D**. Everything past the 2D
save — 3D persistence, the 2D→3D bridge, dashboard project typing, and session persistence — is either
stubbed, broken, or missing. The 3D editor **looks polished but does not durably save**. Overall this
matches the 08-09 static audit; the live pass adds several concrete UX gaps not visible from source.

**Overall: Amber.** Frontend UX quality is high; backend persistence for the 3D half is the load-bearing
gap.

---

## 2. Confirmed Working (verified live)

| Area | Item | Notes |
|------|------|-------|
| Auth | Email register + login | Works end-to-end. |
| Auth | Google sign-in | Works end-to-end. |
| Projects | Create a 2D project | Appears in dashboard. |
| 2D editor | Draw (walls/doors/windows) | Works. |
| 2D editor | Add & remove objects | Works. |
| 2D editor | **Save to backend** | Works — persists. |
| 2D editor | Reload / reopen | Drawing comes back correctly. |
| 3D editor | Add lighting | Works. |
| 3D editor | Add objects / primitives | Works (in-session). |
| Data | Database + Prisma migrations | Working; migrations run cleanly. |

---

## 3. Not Working / Missing (verified live)

### 3.1 Authentication & Session
- **Session is not persisted.** The login/bearer token is not stored (or not rehydrated) across
  reloads/returns, so the user **cannot get back in without signing in again**. Every return trip forces
  a fresh login. *(High friction — affects every test cycle.)*

### 3.2 Dashboard
- **No 2D/3D differentiation.** All projects render the same way; you cannot tell a 2D project from a 3D
  one. Needs a visible type distinction.
- **"Same products" / generic feel.** The listing reads as generated/placeholder-like; wants a less
  generic, more real presentation.

### 3.3 2D Editor
- **No default toggle buttons.** Expected default toggles are absent from the toolbar/UI.
- **Scale is unclear / possibly undefined.** It is not evident that a project scale (px → real-world) is
  defined; if it is, **its value/units are not surfaced anywhere**. Needs to be explicitly defined and
  shown. *(This directly blocks correct 3D asset sizing — see 3.4.)*

### 3.4 3D Editor
- **No back button to the dashboard.** No way to navigate back out of the 3D editor.
- **Demo/library assets don't place to scale.** Demo assets need to be addable **and sized according to
  the project scale** for 3D — currently not working. *(Depends on 2D scale being defined, 3.3.)*
- **Does not durably save to the backend.** This is the key one: the project row *appears* updated on the
  backend, **but the newly added assets are not actually persisted** — reopening does not restore the
  edited 3D scene. Effectively 3D "Save" is non-functional for scene/asset content.
- **UX quality is high** — the interface itself is good; the gap is persistence + navigation, not polish.

### 3.5 Saving (summary)
- **2D save: works. 3D save: does not.** The 2D→3D conversion bridge remains absent (consistent with
  08-09 audit).

### 3.6 AI Service
- **Untested this pass.** Boot blockers were addressed in code today (see §5) but the service was not run.

---

## 4. Delta vs. the 08-09 Static Audit

- **Confirms:** 3D "Save to Backend" is effectively a no-op for scene content; no 2D→3D conversion; auth
  works but has no durable session; dashboard doesn't distinguish project types.
- **Adds (only visible by running):** missing 3D→dashboard back button; missing 2D default toggle
  buttons; scale not surfaced/defined in the 2D UI; demo assets don't size to scale; the "project row
  updates but assets aren't saved" nuance of the 3D save failure; general "too generic" dashboard feel.
- **No contradictions** with the static audit surfaced during the live pass.

---

## 5. Changes Applied This Session (unblockers)

Two boot/wiring blockers from the 08-09 audit were fixed in code (no feature behavior added):

1. **AI service import blocker.** Moved `Ai-service/schemas.py` → `Ai-service/app/schemas.py` so the
   package's `from app.schemas import …` (in `main.py`, `routers/floor_plan.py`, `services/detector.py`)
   resolves. `app/*.py` now parse cleanly. **Not yet run** — needs `pip install -r requirements.txt`
   then `uvicorn app.main:app` to verify `/health`.
2. **Server → AI wiring.** `server/services/aiService.js` now reads the existing `FASTAPI_WEBHOOK_URL`
   env var (full `…:8000/process-floor-plan` endpoint) instead of the nonexistent `AI_SERVICE_URL`, and
   calls it without re-appending the path.

> Reminder: these unblock **booting/reachability** only. The service still implements image detection
> (`/process-floor-plan`), not the `/v1/render-glb` renderer the docs designate as the MVP core.

---

## 6. Prioritized Next Steps

| P | Item | Why |
|---|------|-----|
| P0 | **Persist login session** (store + rehydrate bearer token) | Kills the re-login-every-time friction; unblocks all further testing. |
| P0 | **Make 3D "Save to Backend" actually persist** the scene/assets | Core broken promise; 3D half is unusable without it. |
| P1 | **Define & surface 2D project scale** (px → real units) | Prerequisite for correct 3D asset sizing. |
| P1 | **3D: back-to-dashboard button** | Basic navigation gap. |
| P1 | **Dashboard: 2D vs 3D differentiation** | Users can't tell projects apart. |
| P2 | **3D demo assets placed to scale** | Depends on P1 scale definition. |
| P2 | **2D default toggle buttons** | Toolbar completeness. |
| P2 | **Dashboard: less-generic presentation** | Polish / perceived quality. |
| P3 | **Run + verify AI service** (`/health`) | Confirm the unblockers; still off the MVP critical path. |
