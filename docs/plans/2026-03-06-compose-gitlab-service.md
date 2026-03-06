# 2026-03-06 Replace Gitea with GitLab in Compose

## Analysis

### Facts

- `infra/docker-compose.yml` still defines `gitea`, not `gitlab`.
- The project is currently configured to publish to GitLab URLs (`GIT_REMOTE_URL`, `GITLAB_RAW_BASE_URL`).
- A standalone host container named `skills-gitlab` already exists and occupies ports `8929` and `2224`.
- `market-api` / `ingest-worker` currently run in compose and can publish via the host GitLab path.

### Constraints

- Do not break the current working path that uses the existing standalone `skills-gitlab` container.
- Make compose ready to run a managed GitLab service when the standalone one is stopped.
- Keep host-run local processes working with `127.0.0.1:8929`.

### Success Criteria

- `docker compose -f infra/docker-compose.yml config --services` shows `gitlab` and no longer shows `gitea`.
- App containers can resolve GitLab through compose service DNS when available, otherwise fall back to host Docker gateway.
- README explains the port-conflict rule and startup commands.

### Risks

- Starting compose-managed GitLab will conflict with the existing standalone `skills-gitlab` while both want `8929` / `2224`.
- A fresh compose-managed GitLab will not automatically contain the existing `root/skills-repo` project.

## Design

### Option A: Hard switch to compose-only GitLab

- Replace `gitea` with `gitlab` and require users to stop/remove the standalone container first.
- Pros: simplest config.
- Cons: temporarily breaks the current working setup.

### Option B: Compose GitLab + runtime fallback (**Recommended**)

- Replace `gitea` with `gitlab` in compose.
- Let app containers prefer in-network `gitlab`, but fall back to `host.docker.internal` if `gitlab` is not running.
- Pros: adds compose-managed GitLab without breaking the current host GitLab workflow.
- Cons: slightly more shell logic in compose commands.

## Plan

### Task 1: Red baseline

- **Files**: None
- **Step 1**: Run `docker compose -f infra/docker-compose.yml config --services`
- **Expected (red)**: output shows `gitea` and does not show `gitlab`

### Task 2: Replace service

- **Files**: Modify `infra/docker-compose.yml`
- **Step 1**: Replace `gitea` with `gitlab/gitlab-ce`
- **Step 2**: Update app service command wrappers to prefer `gitlab` DNS and fall back to `host.docker.internal`
- **Step 3**: Re-run `docker compose -f infra/docker-compose.yml config --services`
- **Expected (green)**: output shows `gitlab`, `market-api`, `ingest-worker`

### Task 3: Documentation

- **Files**: Modify `README.md`; Modify `.env.example`
- **Step 1**: Document how to use compose-managed GitLab and the port conflict with standalone `skills-gitlab`
- **Step 2**: Keep host-side default URLs unchanged (`127.0.0.1:8929`) for local processes

## Review

- Replaced `gitea` with a compose-managed `gitlab` service definition.
- Kept host-side defaults (`127.0.0.1:8929`) unchanged for local Node processes.
- Updated app containers to prefer compose DNS `gitlab` and fall back to `host.docker.internal` when compose GitLab is not running.
- Validated that `docker compose -f infra/docker-compose.yml config --services` now lists `gitlab` and no longer lists `gitea`.
- Revalidated that `market-api` and `ingest-worker` still start successfully without starting compose GitLab.
- Known follow-up: to actually boot compose GitLab on `8929` / `2224`, stop the existing standalone `skills-gitlab` first.
