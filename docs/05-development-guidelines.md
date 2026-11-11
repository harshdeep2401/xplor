# XPLOR — Development Guidelines

> **Type:** Foundational document. The **engineering hygiene contract** every contributor follows: git
> workflow, commit conventions, code style, secrets handling, testing, and the basics. It is
> **timeless** — it defines how we work, not what is currently done.

---

## 1. Git Workflow — Trunk-Based

We use **trunk-based development** with short-lived branches and pull requests.

- **`main` is always releasable.** It is protected: **no direct pushes.** Every change lands via PR.
- **Branch off `main`, merge back to `main`.** Branches are **short-lived** (hours to a few days). Long
  divergence causes painful merges — split the work smaller instead.
- **One PR = one focused change.** If you can't describe it in a sentence, it's too big.
- **Rebase or merge `main` into your branch** before opening/updating a PR so it merges cleanly.
- **Squash-merge** PRs into `main` so history stays a clean series of feature-sized commits.
- Delete the branch after merge.

> We deliberately avoid long-lived integration branches. Integrate small and often against `main`.

### Branch naming
```
<type>/<short-kebab-summary>          e.g.  feat/scene-versioning
<type>/<issue-id>-<short-summary>     e.g.  fix/142-saveproject-ownership
```
`type` matches the commit types below (`feat`, `fix`, `chore`, `docs`, `refactor`, `test`).

---

## 2. Commit Conventions — Conventional Commits

Every commit message follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <imperative summary>

<optional body — what & why, not how>

<optional footer — BREAKING CHANGE:, Refs #123>
```

**Types:** `feat` · `fix` · `chore` · `docs` · `refactor` · `test` · `perf` · `build` · `ci`.

**Rules:**
- Summary in the **imperative mood**, ≤ ~72 chars, no trailing period. ("add scene versioning", not
  "added" / "adds".)
- **Atomic commits** — one logical change each. Don't mix a refactor with a feature.
- Scope is the area touched: `feat(2d-editor): …`, `fix(auth): …`, `chore(deps): …`.
- Breaking changes: add `!` after the type/scope **and** a `BREAKING CHANGE:` footer.

**Examples**
```
feat(scenes): add optimistic version save with 409 on stale baseVersion
fix(projects): enforce ownership check on PUT /projects/:id
docs(contracts): document canvas-v2 wall segment shape
chore(deps): bump prisma to 6.4.1
```

---

## 3. Pull Requests

- **Keep them small.** Small PRs get reviewed faster and break less.
- **Every PR needs a description:** what changed, why, and how it was tested. Link the issue (`Refs #…`).
- **At least one review approval** before merge.
- **CI must be green** before merge — no merging red or "will fix after."
- No merging your own PR without review unless the repo is a solo phase and it's explicitly agreed.

### PR checklist (put in the PR template)
- [ ] Scoped to one change; title is a Conventional-Commit summary.
- [ ] Acceptance criteria for the feature are met (see `04-feature-specification.md`).
- [ ] Input validation + authorization/ownership are in place where relevant.
- [ ] Tests added/updated; the full suite passes locally.
- [ ] Lint passes; no stray `console.log`/debug prints.
- [ ] No secrets, `.env`, `node_modules`, `venv`, or build output committed.
- [ ] `.env.example` updated if new config was introduced.
- [ ] Docs updated if behavior/architecture changed (foundational docs) — **status changes go in a
      status report, not the foundational docs.**

---

## 4. Code Style & Quality

- **Linting is the source of truth.** JS/TS: ESLint (+ Prettier). Python: a formatter + linter
  (e.g. Black + Ruff). CI runs them; fix warnings, don't suppress them without a reason.
- **One command before every commit:** `npm run check` in `client/` and in `server/` runs typecheck,
  ESLint, the Prettier check and the tests — the same steps CI runs. `npm run lint:fix` and
  `npm run format` fix what can be fixed automatically.
- **The setup:** one Prettier config for the repo (`.prettierrc.json`: single quotes, no semicolons,
  width 100, LF line endings — `.gitattributes` keeps LF on Windows checkouts); an ESLint flat config per
  package (`eslint.config.*`, typescript-eslint, plus the React hooks rules in the client). Beyond the
  defaults it rejects un-awaited promises (`void` a fire-and-forget call on purpose), `any`, `==`, and
  value imports used only as types. TypeScript runs `strict` plus `noUnusedLocals`,
  `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noImplicitOverride` (and `noImplicitReturns` in
  the client). Prefix an intentionally unused parameter with `_`.
- **A rule switched off needs a reason** written next to it — in the config, or in an
  `// eslint-disable-next-line <rule>` comment that says why.
- **Formatting is automated** — never hand-format; never mix a formatting sweep into a feature PR.
- **Naming:** clear and consistent. Match the surrounding code's conventions.
- **File & import casing must match on disk exactly.** macOS is case-insensitive but **Linux/CI is
  not** — `import './authService'` must match a file literally named `authService.js`. Mismatches that
  "work locally" will break the build.
- **No hardcoded hosts/URLs.** Read base URLs and endpoints from environment/config, never inline
  `http://localhost:...` in application code.
- **No dead code.** Remove obsolete/legacy files rather than leaving them orphaned in the tree.
- **Handle errors explicitly.** Don't swallow failures silently; surface actionable messages.
- **Server errors are thrown, and answered in one place.** Controllers and middleware `throw` an error
  from `server/errors/` (`BadRequestError`, `UnauthorizedError`, `NotFoundError`, `ConflictError`,
  `PayloadTooLargeError`, `UnprocessableError`, `ServiceUnavailableError`); Express 5 forwards thrown
  and rejected async errors to `middleware/errorHandler.ts`, which sends
  `{ message, code, details? }`. No `try/catch` just to send a 500, and no `res.status(4xx/5xx)` in
  controllers. Library errors (Zod, multer, bad JSON, Prisma P2025/P2002) are mapped there too;
  anything else is a 500 whose real message only appears outside production.
  - `message` is for the user (a sentence); `code` is stable UPPER_SNAKE_CASE the client may branch
    on (`getApiErrorCode` in `client/src/services/errors.ts`) — add a new code rather than reword a
    message the client depends on.
  - **401 means "not signed in" only** — the client signs the user out on it. Someone else's project or
    job is a **404** (`services/access.ts`: `getOwnedProject`, `assertOwnsProject`, `getOwnedJob`),
    so other users' ids are never confirmed.
- **Client render crashes** are caught by `components/ErrorBoundary.tsx` (around all routes; navigating
  clears it). Errors in handlers and async code still go to a toast.
- **Validate everything that crosses a boundary, with Zod.**
  - *Server input:* each route declares its params / query / body schemas (`server/schemas/*.ts`) and
    runs `validate({ params, query, body })` before the handler, which then gets typed, cleaned input
    (`Request<Params, unknown, Body>` with the `z.infer` types). Messages in user-facing schemas are full
    sentences: the first one is shown to the user. Failures answer 400 with
    `{ message, code: 'VALIDATION_FAILED', details: [{ path, message }] }`.
  - *Contracts stay JSON Schema* (`contracts/`, checked by Ajv) because the Python service shares them;
    `contract(validateX, 'name')` in `schemas/common.ts` plugs one into a Zod schema.
  - *Other inputs:* the AI service's response, the furniture catalog file and `Asset.metadata` rows are
    parsed with Zod too.
  - *Client:* responses the editors depend on are checked with `parseResponse(schema, data, what)` from
    `services/apiSchemas.ts`; keep those schemas in step with the server types they mirror.
- **UI (client):**
  - **Tell the user, not the console.** Any user action that fails shows a toast:
    `toast.error(getApiErrorMessage(err, 'Could not …'))` from `components/toast/toast.ts`
    (`toast.success` / `toast.info` too). Pass an `id` for something that can repeat (e.g. autosave), so it
    replaces itself instead of stacking. Form validation errors stay inline on the form.
  - **Use the shared pieces** in `components/ui/`: `Button` (`primary` / `secondary` / `ghost` / `danger`,
    `loading`), `Modal` (Esc / click-outside close, `busy`), `Field` (labelled input). Style links that look
    like buttons with `buttonClass(...)`.
  - **Colours come from the design tokens** in `styles/tokens.css`: Tailwind classes (`bg-surface`,
    `text-muted`, `border-line`, `bg-primary`…) or `rgb(var(--color-…))` in CSS. No new hard-coded hex
    colours. Tailwind's preflight is off, so add `border-solid` next to `border`.
  - **Icons are `lucide-react`**, not emoji.

---

## 5. Secrets & Configuration

- **Never commit secrets.** No real `.env`, keys, tokens, or credentials in the repo — ever. `.gitignore`
  excludes `.env` files; keep it that way.
- **Every service ships a committed `.env.example`** listing all required variable **names** (no values).
  Update it in the same PR that adds new config.
- **Config comes from environment variables**, injected via the host dashboard (Vercel/Render) in
  deployed environments and a local `.env` in development.
- **The server reads config only through `server/config/env.ts`**, which declares every variable with
  a Zod schema (types, defaults, production-only rules) and stops start-up with a message naming any bad
  value. Add a new variable there and to `.env.example`, never as a stray `process.env.X`.
- **If a secret is ever committed or leaked, rotate it immediately** — deleting the commit is not enough.

### Logging (server)

- **Log through `server/config/logger.ts` (pino), never `console`** — ESLint rejects `console` in server
  code (scripts and tests excepted). Inside a request use `req.log`, which carries the request id.
  Write `logger.info({ jobId, ms }, 'What happened')`: facts in the object, a short sentence as the
  message.
- Every request gets one line (method, full path, status, time, user id) at `info`, 4xx at `warn`, 5xx
  at `error` with the stack. Health probes aren't logged. Every response carries **`X-Request-Id`**
  (a caller may send its own); ask users for it when they report a problem.
- **Never log secrets or personal data**: passwords, tokens, `Authorization`/cookie headers and keys are
  redacted (`REDACT_PATHS`), but don't log request bodies, emails or whole user rows in the first place.
- Development prints readable lines; production (the Docker image sets `NODE_ENV=production`) prints
  JSON. `LOG_LEVEL` picks the level; tests are silent.

### Security (server)

- **Headers:** helmet on every response (nosniff, frame protection, HSTS, CSP, no `X-Powered-By`). Files
  are readable cross-origin so the client can load models and thumbnails; CORS still decides who may
  call the API.
- **Rate limits** (`middleware/security.ts`): all of `/api` (600 / 5 min per user or IP), failed sign-ins
  (10 / 15 min), floor-plan detection (20 / hour), other uploads (120 / 15 min). Over the limit → `429
  RATE_LIMITED` with `Retry-After`. Behind a proxy, set **`TRUST_PROXY`** or every user shares the
  proxy's allowance. `RATE_LIMIT=off` is refused in production.
- **Uploads:** type allow-lists per route, size limits, and `checkFileContent` checks the file's first
  bytes really are PNG / JPEG / WEBP / GLB. Storage keys can't escape `UPLOAD_DIR`. JSON bodies are
  capped at 2 MB.
- **Auth:** tokens are HS256 only (`services/tokens.ts`), 7 days; passwords bcrypt with 12 rounds; a
  wrong email takes as long as a wrong password and gets the same answer.
- **Dependencies:** CI runs `npm audit --omit=dev --audit-level=high` in client and server; fix findings
  with `npm audit fix` or an upgrade (the client pins `@grpc/grpc-js` via `overrides` until Firebase
  ships a fixed version).
- **Known gaps** (tracked, not yet fixed): uploaded files are public to anyone with the URL (until
  storage moves to R2 with signed URLs); the client keeps the session token in `localStorage`, so an
  XSS bug would expose it — keep React's escaping, never `dangerouslySetInnerHTML` user content.
- Client-side keys (e.g. Firebase web config) are public by nature but still belong in env config, not
  scattered through code.

---

## 6. Testing

- **Every feature ships with tests.** At minimum: one happy path and one failure path per feature (see
  the Definition of Done in `04-feature-specification.md`).
- **Server** (Vitest, `server/vitest.config.mts`): two kinds of tests.
  - *Unit* — `*.test.ts` next to the code. No database, network or `.env`: config is fixed in the
    Vitest config, the database is mocked (`vi.mock('../config/db')`), `fetch` is stubbed for the AI
    service. `npm run test:unit` (also `test:watch`).
  - *Integration* — `server/tests/integration/`. The real app (`createApp()` from `app.ts`, no port)
    over HTTP with Supertest, against the **test database**: a separate Neon branch whose URL is
    `DATABASE_URL` in `server/.env.test` (gitignored) locally, or the `TEST_DATABASE_URL` secret in CI.
    Every test starts from empty tables (the furniture catalog is seeded once and kept). Uploads go to
    a temporary `UPLOAD_DIR`; the AI service and Firebase are mocked. The config **refuses to run if
    the test URL points at the same Neon endpoint as `server/.env`**, and skips integration tests when
    no test database is configured. `npm run test:integration`.
  - Cover each route's happy path, its validation (400), auth (401), ownership (someone else's id →
    404) and its conflicts (409) — see the existing files for the pattern and `helpers.ts` for
    `signUp`, `createProject`, `convertedProject`.
  - `npm test` runs both; `npm run test:coverage` adds coverage with floors (statements 93%,
    branches 80%, functions 95%, lines 95%) — raise them as coverage grows, never lower them to pass.
- **Python service:** tests for schema validation and the render/detection outputs.
- **Client** (Vitest + jsdom, `client/vitest.config.js`):
  - *Logic* — keep editor logic in pure modules (e.g. `editor/canvas/editing.ts`,
    `editor/scene/wallPieces.ts`) next to a `*.test.ts`.
  - *Components* — `*.test.tsx` next to the component, with React Testing Library: find things the way a
    user does (`getByRole`, `getByLabelText`, visible text) and act with `userEvent`, not by reaching into
    state or class names. The API is faked with **MSW** (`src/test/server.ts`: `server.use(http.get(…))`
    per test; any request a test didn't fake fails it). Firebase is mocked with `vi.mock`.
  - Pages are rendered inside a `MemoryRouter` with stub routes, so navigation is asserted by what
    appears (e.g. "Dashboard").
  - The WebGL (3D) and Konva (2D) canvases don't run in jsdom: test their logic as pure functions and
    check the canvases by hand in the browser.
  - `npm test`, `npm run test:watch`, `npm run test:coverage` (floors: statements 95%, branches 85%,
    functions 95%, lines 96%; CI runs it).
- **CI runs the full suite on every PR.** A feature is not "done" until its tests exist and pass.
- Don't claim something is tested if it isn't — say what's covered and what isn't.

---

## 7. Database & Migrations

- **Schema changes go through Prisma migrations** — never hand-edit the live database.
- **Never edit or delete a migration that has been merged/applied.** Fix forward with a new migration.
- Give migrations meaningful names (`add_scene_unique_constraint`, not `update1`).
- Review schema changes carefully in PRs — they are the hardest thing to reverse.

---

## 8. Dependencies

- **Commit lockfiles** (`package-lock.json`, `Ai-service/uv.lock`) — reproducible installs matter.
- **Python deps are managed with [uv](https://docs.astral.sh/uv/)**, not pip: `Ai-service/pyproject.toml`
  lists direct dependencies, `uv.lock` pins everything, `.python-version` pins the interpreter (3.12,
  matching the Docker image). Add a dependency with `uv add <pkg>` (updates both files); never
  hand-maintain a `requirements.txt`. CI and the Dockerfile install with `uv sync --frozen`, so a stale
  lockfile fails the build.
- **Add dependencies deliberately.** Prefer the standard library / existing tools; justify new deps in
  the PR. Remove unused ones.
- Keep dependency bumps in their own `chore(deps):` commits/PRs.

---

## 9. The Basics (don't skip these)

- **Never commit** `node_modules/`, `venv/`, `dist/`/build output, `.env`, or OS junk (`.DS_Store`).
  `.gitignore` covers these — don't force-add around it.
- **Pull/rebase before you push.** Resolve conflicts locally; never force-push shared branches.
- **Keep the working tree clean** — commit or stash before switching context.
- **Commit and push only your own change.** If you didn't intend to touch a file, don't include it.
- **Write commits and PRs for the next person** (which is often future-you): explain *why*, not just
  *what*.
- **Leave the tree better than you found it** — small, safe cleanups are welcome; large drive-by
  refactors belong in their own PR.

---

## 10. Local Environment & Cross-Platform Development

The stack must work the same on macOS, Windows and Linux (CI and containers are Linux).

- **Set up from scratch on each machine** — never copy `node_modules/` or `.venv/` between machines or
  OSes (they contain platform-specific binaries). Run `npm ci` in `client/` and `server/`, and `uv sync`
  in `Ai-service/`.
- **Secrets travel by hand, not git:** `server/.env`, `client/.env` and `Ai-service/.env` (whose
  `FASTAPI_SECRET` must match the server's)
  are gitignored; copy them securely or recreate them from the `.env.example` files.
- **Model weights travel by hand, not git:** get `best.pt` from the project lead and put it at
  `Ai-service/Model/best.pt` (`*.pt` is gitignored). Without it the AI service runs but reports 503.
- **PyTorch comes from the CUDA 12.6 build** (`pyproject.toml` pins the index): it supports Pascal
  (GTX 10xx) through RTX 40xx GPUs and falls back to CPU without an NVIDIA GPU. The first `uv sync`
  downloads ~2.5 GB.
- **Local uploads are machine-local:** `server/uploads/` (floor plans, GLBs) is not in git, so projects
  created on one machine show missing images/GLBs on another until storage moves to R2.
- **Run commands:** API `npm run dev` (port 5001), client `npm run dev`, AI service
  `uv run uvicorn app.main:app --port 8000`, or everything backend via `docker compose up --build`.
  Tests: `npm test` in `server/`, `uv run pytest` in `Ai-service/`; `npm run check` in `client/` and
  `server/` for everything CI checks.
- **npm scripts must be shell-neutral.** npm runs scripts with `cmd.exe` on Windows, so POSIX shell syntax
  (`$(…)`, `find`, `rm -rf`, `VAR=x cmd`) breaks there. Prefer Node-native flags or cross-platform tools
  (e.g. run tests through `vitest`, never `rm -rf coverage && …`). Node ≥ 22 everywhere (CI and the
  server's Docker image use 22).
- **Casing and line endings:** keep import casing exact (see §4); let git normalize line endings rather
  than committing CRLF churn.
- **Docker on Windows** uses Docker Desktop (WSL 2 backend). Compose must be ≥ 2.17 for the server's
  `additional_contexts` (see `03` §3).

---

## 11. Where Things Live

- **Foundational docs** (`docs/01`–`05`) describe the intended product, architecture, deployment,
  features, and process. They are **timeless** — no build status inside them.
- **Status reports** (`docs/status-reports/`) capture point-in-time reality: what's built, what's
  broken, what's next. **All progress tracking goes here.**
- When behavior or architecture *changes*, update the relevant foundational doc **in the same PR**.
  When you want to record *progress*, add or update a status report instead.
