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
- **Formatting is automated** — never hand-format; never mix a formatting sweep into a feature PR.
- **Naming:** clear and consistent. Match the surrounding code's conventions.
- **File & import casing must match on disk exactly.** macOS is case-insensitive but **Linux/CI is
  not** — `import './authService'` must match a file literally named `authService.js`. Mismatches that
  "work locally" will break the build.
- **No hardcoded hosts/URLs.** Read base URLs and endpoints from environment/config, never inline
  `http://localhost:...` in application code.
- **No dead code.** Remove obsolete/legacy files rather than leaving them orphaned in the tree.
- **Handle errors explicitly.** Don't swallow failures silently; surface actionable messages.

---

## 5. Secrets & Configuration

- **Never commit secrets.** No real `.env`, keys, tokens, or credentials in the repo — ever. `.gitignore`
  excludes `.env` files; keep it that way.
- **Every service ships a committed `.env.example`** listing all required variable **names** (no values).
  Update it in the same PR that adds new config.
- **Config comes from environment variables**, injected via the host dashboard (Vercel/Render) in
  deployed environments and a local `.env` in development.
- **If a secret is ever committed or leaked, rotate it immediately** — deleting the commit is not enough.
- Client-side keys (e.g. Firebase web config) are public by nature but still belong in env config, not
  scattered through code.

---

## 6. Testing

- **Every feature ships with tests.** At minimum: one happy path and one failure path per feature (see
  the Definition of Done in `04-feature-specification.md`).
- **Server:** unit + integration tests for controllers/services (auth, ownership, validation,
  versioning/409, plan limits).
- **Python service:** tests for schema validation and the render/detection outputs.
- **Client:** component/logic tests for editor behavior and API integration where practical.
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

- **Commit lockfiles** (`package-lock.json`, etc.) — reproducible installs matter.
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

## 10. Where Things Live

- **Foundational docs** (`docs/01`–`05`) describe the intended product, architecture, deployment,
  features, and process. They are **timeless** — no build status inside them.
- **Status reports** (`docs/status-reports/`) capture point-in-time reality: what's built, what's
  broken, what's next. **All progress tracking goes here.**
- When behavior or architecture *changes*, update the relevant foundational doc **in the same PR**.
  When you want to record *progress*, add or update a status report instead.
