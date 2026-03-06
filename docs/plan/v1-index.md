# v1 Index — Admin Console

## Vision

See PRD-0001 Admin Console.

## Milestones

- M1: Admin console UI (search/import/review/published/audit) delivered.
  - DoD: UI renders all sections, actions succeed via API, and tests pass.
  - Validation: `npm --workspace @skills/market-api test`
  - Status: DONE (validated on 2026-03-06 via `npm --workspace @skills/market-api test`)

## Plan Index

- v1-admin-console.md

## Traceability Matrix

- REQ-0001-001 -> v1-admin-console -> review UI search/import section -> `review-ui.test.ts`
- REQ-0001-002 -> v1-admin-console -> review queue -> `review-ui.test.ts`
- REQ-0001-003 -> v1-admin-console -> published section -> `review-ui.test.ts`
- REQ-0001-004 -> v1-admin-console -> audit/install panel -> `review-ui.test.ts`
- REQ-0001-005 -> v1-admin-console -> visual design spec -> manual review

## ECN Index

- None

## Differences

- None
