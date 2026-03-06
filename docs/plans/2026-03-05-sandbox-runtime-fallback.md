# 2026-03-05 Sandbox Runtime Fallback

## Scope

- When Podman is installed but unavailable, fall back to Docker (Docker Desktop is running)
- Allow a runtime override for deterministic tests

## Constraints

- Keep sandbox behavior the same for successful runs
- No changes to publish formats or API surface beyond sandbox behavior

## Plan

### Task 1: Tests (red)

- **Files**: Modify `apps/market-api/test`
- **Step 1**: Add test for fallback to Docker when Podman info fails
- **Step 2**: Add test for `SANDBOX_RUNTIME=none` override
- **Step 3**: Run `npm --workspace @skills/market-api test`
- **Expected (red)**: tests fail before implementation

### Task 2: Implementation (green)

- **Files**: Modify `apps/market-api/src/services/sandbox.ts`
- **Step 1**: Add `resolveRuntime()` with availability checks and override
- **Step 2**: Use `resolveRuntime()` inside `runSandboxCheck`
- **Step 3**: Re-run `npm --workspace @skills/market-api test`
- **Expected (green)**: tests pass

### Task 3: Review

- **Files**: None
- **Step**: Summarize change and any remaining risks

## Review

- Validated with `npm --workspace @skills/market-api test` on 2026-03-06. Runtime selection now prefers Podman, falls back to Docker when Podman is unavailable, and honors `SANDBOX_RUNTIME=none`.
