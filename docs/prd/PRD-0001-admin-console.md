# PRD-0001 Admin Console (Management + UI)

## Vision

Deliver a single-page, internal admin console that lets reviewers manage the skills supply chain end-to-end (search -> import -> review -> publish -> verify install). The UI must make risk and provenance visible at a glance and minimize manual copy/paste steps.

## Scope

- A management console UI served by `market-api` at `/review`.
- Console supports search/import from whitelisted sources, review actions, and audit visibility.
- No authentication for v1 (internal-only assumption).

## Non-Goals

- Public marketplace UI.
- Multi-tenant auth/permissions.
- Comments, ratings, or community features.

## Requirements

### REQ-0001-001: Search and Import

- The console can search whitelisted sources by keyword via `POST /api/v1/ingest/search`.
- It can import a selected candidate via `POST /api/v1/ingest/import`.
- It displays import status and errors.

### REQ-0001-002: Review Queue

- The console lists pending ingests via `GET /api/v1/ingests?status=pending_review`.
- It exposes Approve/Reject actions via review endpoints.
- It shows scan issues, sandbox result, and risk level.

### REQ-0001-003: Published Visibility

- The console lists published skills via `GET /api/v1/skills`.
- It displays source URL, version, risk, and published time.

### REQ-0001-004: Audit and Install Details

- The console can fetch audit events via `GET /api/v1/audit/:skillId/:version`.
- The console can fetch install manifest via `GET /api/v1/install/:skillId/:version`.

### REQ-0001-005: UI Design

- Single-page UI that works on desktop and mobile.
- Clear visual hierarchy for search, review, and published sections.
- Uses a distinct visual style (not default browser look) with readable typography.

## Acceptance Criteria

- A reviewer can search, import, approve, and confirm published listing without leaving the page.
- Risk level, scan issues, and sandbox summary are visible before approval.
- Audit and install details can be inspected for a selected published version.
- UI loads in modern browsers without external assets.

## Risks

- Lack of auth for v1 requires network isolation.
- UI depends on existing API; endpoint changes must remain backward compatible.
