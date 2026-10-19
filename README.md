# Change Request Review UI - Angular Assessment

An Angular reviewer UI for **Change Requests (CRs)**: proposed amendments to a live Purchase Agreement.
Reviewers can filter requests, inspect line-item changes and audit history, and approve or reject pending requests according to the supplied policy helper.

This assessment uses the provided organization-scoped mock API (`src/api/cr-api.service.ts`); no backend was built.
See [CANDIDATE_BRIEF.md](./CANDIDATE_BRIEF.md) for the original scenario, tasks, acceptance criteria, and submission instructions.
See [IMPLEMENTATION_NOTES.md](./IMPLEMENTATION_NOTES.md) for architecture, decisions, known limitations, verification details, and transparent AI assistance disclosure.

## Stack and setup

Angular 15 standalone components, reactive forms, TypeScript, plain HTML/CSS, and Jest with Angular TestBed in jsdom.
Use **Node 18.20.3** as specified in `.nvmrc`; the verified npm version is **10.7.0**. `package.json` allows Node `>=18.20.0 <19` and does not pin npm. Do not assume compatibility with other Node major versions.

From the repository root, activate Node 18.20.3 using your version manager or a session-local portable runtime, then run:

```bash
node -v
npm -v
npm ci
npm start
```

If your version manager supports `.nvmrc`, `nvm use` selects the requested version. On nvm-windows, select it explicitly with `nvm use 18.20.3` after installing that version. A version manager is optional.
Keep the supplied `package-lock.json` and `.npmrc` (`legacy-peer-deps=true`); use `npm ci` for the locked install.
`npm start` runs `ng serve` at http://localhost:4200. Stop it with Ctrl+C.

## Verification commands

```bash
npm test -- --runInBand
npm run typecheck
npm run lint
npm run build
```

`build` uses the production configuration and writes to `dist/cr-review`. `lint` checks TypeScript.
Optional commands: `npm run test:watch` for Jest watch mode and `npm run format` to **rewrite TypeScript formatting**.
For a non-writing formatting check, use `npm exec --no -- prettier --check <file paths>` with explicit paths.

An isolated local Git clone at commit `395f898` was verified on the same Windows machine using Node 18.20.3 / npm 10.7.0:
`npm ci`, **130/130 Jest tests**, typecheck, lint, and production build all passed.
`npm start` served HTTP 200, and a Chrome smoke test covered List/Detail loading, selection, filtering, and action gating.
The install reported 100 npm audit vulnerabilities (3 low, 18 moderate, 75 high, 4 critical) and deprecation warnings; no dependency upgrades or audit fixes were applied.
This is a mock-backed assessment, not a production security or accessibility certification.

## Implemented behavior

- List loading, error/retry, API-empty, and filter-no-match states; status filtering preserves source rows and active selection.
- Persistent selected-row highlighting and native keyboard-accessible Review buttons.
- Detail reloads on selection changes and ignores stale asynchronous results.
- Added, removed, changed, and unchanged line-item previews, with quantity, description, unit price, totals, and delta.
- Chronological audit history with stable ties, readable UTC timestamps, and original ISO values in `<time datetime>`.
- Status- and permission-aware Approve/Reject handlers, nonblank trimmed rejection reasons, and a shared submission lock.
- Reconciliation after failed action responses, explicit unknown outcomes, read-only retry, and List refresh after confirmed status changes.
- Responsive CSS, visible keyboard focus, and accessible progress/validation feedback using existing semantic controls.

Use the **Acting as** switcher to try approver, viewer, and otherOrg fixtures. Switching users clears selection and reloads the panes.
The mock API exposes `latencyMs` and `failNext` for deterministic tests of slow/failing responses.

## Policy-string convention

`SessionService` supplies the current user and policies shaped `cr_{action}_{scope}`.

| Action | Meaning |
| --- | --- |
| `r` | Read |
| `a` | Approve |
| `x` | Apply |

| Scope | Meaning |
| --- | --- |
| `u` | User (own CRs) |
| `w` | Workspace |
| `o` | Organization |

For example, `cr_a_o` denotes organization approval permission; `cr_r_o` alone is read-only.
The existing approval helper accepts any approval-scope policy. Ownership/workspace metadata is unavailable, so the UI cannot independently enforce narrower scopes.
The mock API checks organization but does not fully enforce authorization or transitions; frontend guards do not replace backend security.

## CR statuses

`DRAFT -> SUBMITTED -> PENDING_APPROVAL -> APPROVED -> APPLIED`, with `REJECTED` / `CANCELLED` terminal.
Approve and Reject act only on `PENDING_APPROVAL` in the UI. The API owns transitions; the frontend consumes its responses.

## Component map and testing

- `src/app/`: selection, Acting-as switching, and parent-child List/Detail synchronization.
- `src/components/cr-list/`: summaries, status filtering, selection, and List states.
- `src/components/cr-detail/`: detail lifecycle, preview, timeline, actions, validation, and reconciliation.
- `src/components/diff.util.ts`: pure SKU-based line-item classification.
- `src/models/`, `src/common/`, `src/api/`, `src/session/`: supplied models, view state, money/policy helpers, fixtures, mock API, and session.
- `src/styles.css`: responsive visual presentation.

Tests include `src/app/app.component.spec.ts`, List/Detail component specs, and `src/components/diff.spec.ts`.
Component tests render with `detectChanges()`, settle the API, then render again. Deferred Promises and fake timers control race scenarios.
The two original starter defects are fixed; the original tests remain part of the expanded suite. Tests supplement the assessment brief rather than replace its requirements.

## Assessment submission

Preserve the full Git commit history without squashing, include root-level implementation notes, and provide the required **5-8 minute screen recording** showing List/Detail, a rejection, an error state, and one non-trivial decision.
Clean-clone installation/testing is required by the brief. AI use is permitted and disclosed in the implementation notes; be prepared to explain and modify the submitted code in the follow-up interview.
