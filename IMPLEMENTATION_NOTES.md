# Implementation Notes

## 1. Overview and Component Architecture

The Angular 15 standalone app reviews Change Requests against the supplied Promise-based mock API. `AppComponent` owns `selectedId`, passes it to List and Detail, and handles List's `select` and Detail's `updated` outputs. `CrListComponent` loads organization-scoped summaries, derives filtered rows without changing source data, and highlights the current selection even after focus moves. `CrDetailComponent` loads the selected request and presents its diff, API-provided totals, audit history, and guarded actions. Local component state and parent-child events were sufficient; no global state library or new dependencies were needed.

Changes cover diff/permission fixes, required List/Detail behavior, responsive CSS, keyboard selection, and UTC timestamps. The ZIP had no Git history; the initial commit imports the starter with initial fixes, followed by focused commits.

## 2. State Management and Async Safety

- Explicit `ViewState` values cover idle/loading/loaded/empty/error; List distinguishes API-empty from filter-no-match. Detail uses `ngOnChanges` without duplicate initial requests, clearing old content during loading. Missing/inaccessible CRs show the API error.
- Request counters, captured user identity, and destruction guards reject stale results/errors. Acting-as clears selection and recreates both panes; `SessionService` is a mutable user holder, not a reactive stream.
- Approve and Reject share a submission lock through mutation and reconciliation. Buttons are disabled and the reason is read-only while pending.
- CR-A completing after selection moves to CR-B cannot replace CR-B's Detail, but confirmed status changes still refresh List in the same session. Old-session/destroyed-component results are ignored. Refresh preserves filters; filtering does not clear selection.
- A rejected mutation triggers one reconciliation read, never an automatic mutation retry. A successful read displays the current status and reports the failed response. If both calls fail for the current selection, the UI explicitly reports an unknown outcome; Retry only reads. A later read confirming a changed status refreshes List. A failed List refresh shows an error/retry rather than presenting old rows as fresh, while confirmed Detail remains visible.

## 3. Business Rules and Invariants

- Action handlers recheck loaded state, selected ID, matching organization, `PENDING_APPROVAL`, the existing `canApprovePolicy` helper, destruction, and the shared lock. Read-only users have disabled Approve and no Reject form. These UI guards are not backend security.
- Reject requires a nonblank reactive `FormControl` value, trims it before submission, and links validation feedback to the textarea. No arbitrary length rule was added. The reason resets on selection changes or a confirmed rejected status; it remains available when reconciliation still shows pending.
- Diff matches by SKU; strict differences in description, quantity, or unit price mean changed. Added, removed, and unchanged items remain visible without mutating inputs. Totals/delta use response fields and the existing currency formatter rather than introducing pricing rules.
- Timeline sorts a copied audit array oldest first, preserving original order for equal instants. Visible timestamps use fixed English months and UTC fields; `<time datetime>` retains the exact source ISO value. Empty history and no-change/empty previews have explicit messages.

## 4. Testing and Verification

**130/130 tests across four Jest suites passed at commit `8bddca9`** using Node 18.20.3. Jest + Angular TestBed exercise rendered DOM, filters, permissions/direct handler calls, validation, diff categories/totals, stable timeline ordering, frozen inputs, selection/session races, duplicate actions, and real mock `failNext` reconciliation. Deferred Promises and fake timers control race tests.

Verified checks: `npm test -- --runInBand`, `npm run typecheck`, `npm run lint`, and `npm run build` (production by default). Changed-file Prettier checks and `git diff --check` passed. Setup uses Node 18.20.3 and `npm ci` with the supplied lockfile/`.npmrc`. Use `npm exec --no -- prettier --check <file paths>` for formatting checks; `npm run format` writes TypeScript. **Fresh-clone verification has not yet been completed.**

Chrome smoke tests covered desktop, tablet, and mobile widths, available status/read-only states, actions and validation, keyboard focus/selection, filter hide/show, and readable timelines. Screenshots were inspected for overflow and alignment. This was not a cross-browser or comprehensive accessibility audit.

## 5. Trade-offs and Known Limitations

- The mock API mutates its store before its timer can reject a response. Failure therefore does not prove rollback; reconciliation observes current state without proving which operation caused it. There is no idempotency or concurrency guarantee.
- API methods check organization but do not fully enforce policies, allowed transitions, or rejection validation. The existing helper accepts `cr_a_u`, `cr_a_w`, and `cr_a_o`; ownership/workspace metadata is unavailable, so narrower scopes cannot be independently enforced.
- If an old selection's mutation and reconciliation both fail, no confirmed update is emitted and List may remain stale until another reload. Promises continue after invalidation. Session safety assumes switching through the shell and replacing the user object, not mutating it in place.
- SKU matching assumes uniqueness. Invalid audit timestamps are displayed unchanged; chronological ordering assumes valid instants. Narrow tables intentionally scroll horizontally.

## 6. AI Assistance Disclosure

ChatGPT and Codex assisted with planning, code generation/refactoring, testing, debugging, UI polish, and documentation. The supplied starter provided the scaffold, models, fixtures, services, and permission helpers. Candidate-directed AI-assisted changes cover App/List/Detail behavior and templates, diff fixes, regression tests, and CSS.

The candidate guided scope, reviewed reported results, and requested focused revisions. The coding agent executed the recorded checks and browser QA. No independent manual review of every generated line is claimed. No independently verified handwritten-only component breakdown is available, and no component is claimed to be exclusively handwritten.

## 7. Potential Production Improvements

Enforce authentication, organization/ownership/workspace authorization, valid transitions, and reason validation on the backend. Use transactional mutations, idempotency keys, concurrency/version checks, and server-authored audit timestamps. Add explicit session-change notifications and cancellable reads for a real HTTP integration, plus cross-browser and assistive-technology testing. These are follow-ups, not implemented guarantees.
