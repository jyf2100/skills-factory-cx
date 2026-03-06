# 2026-03-05 Publish Error Handling

## Scope

- Ensure approve endpoint returns a JSON error when publish (git push) fails
- Keep publish behavior unchanged when push succeeds

## Constraints

- No change to publish artifact format
- Keep git push optional (only when `GIT_REMOTE_URL` is set)

## Plan

### Task 1: Add failing test (red)

- **Files**: Modify `apps/market-api/test/api.test.ts`
- **Step 1**: Add test that sets `gitRemoteUrl` to a failing URL and calls approve
- **Step 2**: Run `npm --workspace @skills/market-api test`
- **Expected (red)**: test fails or request rejects due to unhandled publish error

### Task 2: Implement error handling (green)

- **Files**: Modify `apps/market-api/src/app.ts`
- **Step 1**: Wrap `publishSkill` in try/catch in approve route
- **Step 2**: Return `500` with error message when publish fails
- **Step 3**: Re-run `npm --workspace @skills/market-api test`
- **Expected (green)**: new test passes, existing tests unchanged

### Task 3: Review

- **Files**: None
- **Step**: Summarize change and note any remaining risks

## Review

- Validated with `npm --workspace @skills/market-api test` on 2026-03-06. API now returns `500` JSON with a `publish failed:` prefix when publish/push fails.
