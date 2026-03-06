# 2026-03-06 Async Queue and GitLab Search

## Analysis

### Facts

- `POST /api/v1/ingest/import` currently performs clone + scan + sandbox synchronously inside `market-api`.
- `apps/ingest-worker` currently searches and then directly calls the synchronous import endpoint; it does not consume a queue.
- `WHITELIST_SOURCES` defaults to `github.com, gitlab.com, skills.sh`, but source search currently only implements GitHub and `skills.sh`.
- `/review` currently imports directly and has no visibility into queued work.

### Constraints

- Keep the existing synchronous `POST /api/v1/ingest/import` route working for compatibility.
- Keep JSON store as the default persistence layer.
- Do not change publish artifact formats or review/publish semantics.
- Avoid introducing external infra requirements for this slice.

### Success Criteria

- GitLab whitelisted search returns candidates through the existing search endpoint.
- `market-api` exposes a minimal ingest job queue API backed by the existing state store.
- `ingest-worker` can claim queued jobs, call the existing import endpoint, and report completion/failure.
- `/review` can enqueue imports and show queued/processing/completed/failed jobs.
- Automated tests cover GitLab search, queue lifecycle, worker processing, and UI section rendering.

### Risks

- Queue claim/complete semantics must remain atomic enough for a single JSON file store.
- UI must not imply immediate import completion once work is queued.
- GitLab API payloads differ from GitHub and may omit fields; parsing must be defensive.

## Design

### Option A: Full infra upgrade (PostgreSQL + durable broker)

- Introduce PostgreSQL store and a separate durable queue/broker.
- Pros: production-oriented, clear separation of concerns.
- Cons: much larger scope, new infra dependency, higher test burden.

### Option B: JSON-backed queue + worker polling existing API (**Recommended**)

- Add ingest jobs to the JSON state store.
- Add queue endpoints for enqueue / claim / complete / fail.
- Let `ingest-worker` poll the queue and reuse the existing synchronous import API for actual work.
- Add GitLab search support to honor the existing whitelist default.
- Pros: smallest safe slice, preserves contracts, delivers the missing worker behavior now.
- Cons: JSON store remains single-node/MVP grade.

### Option C: In-process background queue inside `market-api`

- `market-api` enqueues and processes jobs internally with timers.
- Pros: simpler implementation.
- Cons: does not actually deliver a separate worker, weaker operational separation.

## Plan

### Task 1: GitLab search (red -> green)

- **Files**: Add `apps/market-api/test/source-search.test.ts`; Modify `apps/market-api/src/services/source-search.ts`
- **Step 1**: Add a failing test that mocks GitLab API JSON and expects `provider === "gitlab"`.
- **Step 2**: Run `npm --workspace @skills/market-api test`
- **Expected (red)**: test fails because GitLab whitelist entries return no candidates.
- **Step 3**: Implement GitLab search via `<base>/api/v4/projects?search=...`.
- **Step 4**: Re-run `npm --workspace @skills/market-api test`
- **Expected (green)**: GitLab search test passes.

### Task 2: Async ingest queue (red -> green)

- **Files**: Modify `packages/shared/src/types.ts`; Modify `apps/market-api/src/state.ts`; Modify `apps/market-api/src/app.ts`; Add `apps/ingest-worker/src/worker.ts`; Modify `apps/ingest-worker/src/index.ts`; Add `apps/ingest-worker/src/worker.test.ts`; Modify `apps/market-api/test/api.test.ts`
- **Step 1**: Add failing API tests for enqueue / claim / complete / fail job lifecycle.
- **Step 2**: Add a failing worker test that claims a job and completes it through API calls.
- **Step 3**: Run `npm --workspace @skills/market-api test && npm --workspace @skills/ingest-worker test`
- **Expected (red)**: tests fail because queue state and worker logic do not exist.
- **Step 4**: Implement queue types, state transitions, API endpoints, and worker helpers.
- **Step 5**: Re-run the same commands.
- **Expected (green)**: queue lifecycle and worker tests pass.

### Task 3: Review console queue visibility (red -> green)

- **Files**: Modify `apps/market-api/src/web/review-console.html`; Modify `apps/market-api/test/review-ui.test.ts`
- **Step 1**: Extend the UI test to assert a queued imports section.
- **Step 2**: Run `npm --workspace @skills/market-api test`
- **Expected (red)**: test fails because UI has no queue status panel.
- **Step 3**: Update `/review` to enqueue imports and render job statuses.
- **Step 4**: Re-run `npm --workspace @skills/market-api test`
- **Expected (green)**: UI test passes.

### Task 4: Documentation closeout

- **Files**: Modify `README.md`; Modify `docs/plan/v1-index.md`; Modify `docs/plans/2026-03-05-publish-error-handling.md`; Modify `docs/plans/2026-03-05-sandbox-runtime-fallback.md`
- **Step 1**: Mark completed slices and document the new worker/queue flow.
- **Step 2**: Run `npm test`
- **Expected**: docs align with validated behavior.

## Review

- Implemented GitLab search for whitelisted GitLab sources.
- Added JSON-backed ingest jobs plus claim/complete/fail endpoints.
- Switched `/review` import actions to queue jobs and display queue state.
- Added `ingest-worker` processing helpers and tests.
- Validation: `npm --workspace @skills/market-api test && npm --workspace @skills/ingest-worker test` and `npm test`.
- Next smallest task: add PostgreSQL-backed `StateStore` behind config while keeping JSON as the default fallback.
