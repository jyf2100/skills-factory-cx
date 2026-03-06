# v1 Admin Console Plan

## Goal

Deliver a management UI that supports search/import, review queue actions, published visibility, and audit/manifest inspection.

## PRD Trace

- REQ-0001-001
- REQ-0001-002
- REQ-0001-003
- REQ-0001-004
- REQ-0001-005

## Scope

- Update `/review` HTML and client-side logic.
- Add a minimal UI test to confirm new sections render.

## Non-Scope

- Auth/permissions
- New backend endpoints

## Acceptance

- Search/import UI calls the existing API endpoints and renders results.
- Review queue renders pending items with risk and scan details.
- Published list renders items and allows viewing audit and install details.
- UI is responsive for narrow viewports.
- Tests pass.

## Files

- Modify: `apps/market-api/src/web/review-console.html`
- Add: `apps/market-api/test/review-ui.test.ts`

## Steps

1. **TDD Red**: Add UI test asserting key section headings are present and run tests (expect fail).
2. **TDD Green**: Redesign the HTML/CSS/JS for admin console and re-run tests (expect pass).
3. **Refactor**: Clean up UI scripts if needed, keep behavior unchanged.

## Risks

- UI complexity in a single HTML file; keep JS modular to avoid regressions.
