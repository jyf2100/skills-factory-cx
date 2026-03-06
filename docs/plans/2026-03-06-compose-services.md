# 2026-03-06 Docker Compose App Services

## Analysis

### Facts

- `market-api` 和 `ingest-worker` 目前只能通过本地 Node 进程启动。
- `infra/docker-compose.yml` 只包含 `postgres`、`gitea`、`nexus`，并不包含应用服务。
- 项目已经接到了本机 Docker 中运行的 `skills-gitlab`，地址为 `http://127.0.0.1:8929`。
- 容器内不能用 `127.0.0.1:8929` 访问宿主机 GitLab，必须改用 `host.docker.internal`（并为 Linux 保留 `host-gateway` 映射）。

### Constraints

- 保持现有本地 `.env` 工作方式不变。
- 不要求把现有外部 `skills-gitlab` 纳入本仓库 compose 生命周期。
- Compose 启动后，`market-api` 应可对宿主机 GitLab 执行 push。
- 尽量避免为运行时引入额外手工步骤。

### Success Criteria

- `docker compose -f infra/docker-compose.yml config --services` 包含 `market-api` 和 `ingest-worker`。
- `market-api` 和 `ingest-worker` 有可构建镜像与明确启动命令。
- Compose 中为应用服务覆盖容器内可访问的 GitLab / API 地址。
- README 给出 compose 启动说明。

### Risks

- 若继续使用宿主机 GitLab，容器内网络地址必须正确覆盖。
- Monorepo workspace 镜像构建需要同时处理多个 package。
- 宿主机上已有 4310 监听时，compose 端口映射会冲突。

## Design

### Option A: 继续用宿主机 Node 进程

- 不改 compose，只保留当前做法。
- 优点：最少改动。
- 缺点：不能满足 compose 启动需求。

### Option B: 为应用服务添加 Compose + Dockerfile（推荐）

- 新增一个 monorepo Dockerfile，构建出可运行的 workspace 产物。
- `docker-compose.yml` 增加 `market-api` 和 `ingest-worker`，并覆盖容器内环境变量。
- 优点：可复现、与当前本机 `skills-gitlab` 兼容。
- 缺点：需要额外维护 Docker 构建层。

### Option C: Compose 仅使用 `node:20` 挂载源码现场运行

- 服务直接 bind mount 源码并执行 `npm run dev:*`。
- 优点：实现快。
- 缺点：依赖宿主机状态，启动慢，行为更偏开发态。

## Plan

### Task 1: Compose red baseline

- **Files**: None
- **Step 1**: Run `docker compose -f infra/docker-compose.yml config --services`
- **Expected (red)**: output does not include `market-api` or `ingest-worker`

### Task 2: Buildable app image

- **Files**: Add `Dockerfile`; Add `.dockerignore`
- **Step 1**: Create a monorepo image that installs deps and builds all workspaces.
- **Step 2**: Validate with `docker build -t skills-factory-app .`
- **Expected (green)**: image builds successfully.

### Task 3: Compose app services

- **Files**: Modify `infra/docker-compose.yml`
- **Step 1**: Add `market-api` and `ingest-worker` services using the new image.
- **Step 2**: Override env vars for container networking (`host.docker.internal`, service DNS, `0.0.0.0`).
- **Step 3**: Validate with `docker compose -f infra/docker-compose.yml config --services`
- **Expected (green)**: output includes both services.

### Task 4: Documentation closeout

- **Files**: Modify `README.md`
- **Step 1**: Document compose startup / stop commands and port conflict note.
- **Step 2**: Validate with `docker compose -f infra/docker-compose.yml config`
- **Expected**: docs and compose file stay aligned.

## Review

- Red baseline confirmed: original compose file lacked `market-api` and `ingest-worker`.
- Initial Dockerfile-based workspace image was blocked by an npm-in-container workspace install failure (`tsc` never became available after `npm install` / `npm ci`).
- Final implementation uses `node:20-bookworm-slim` services with the repo bind-mounted and host-built `dist` artifacts.
- Compose now starts both `market-api` and `ingest-worker`, and `market-api` is reachable on host port `4310`.
- Compose startup rewrites GitLab host references from `127.0.0.1` / `localhost` to `host.docker.internal` inside containers.
- Validation: `docker compose -f infra/docker-compose.yml config --services`, `npm run build`, `docker compose -f infra/docker-compose.yml up -d market-api ingest-worker`, and `curl http://127.0.0.1:4310/healthz`.
- Next smallest task: either replace the old `gitea` service with a compose-managed `gitlab`, or make the worker poll loop emit structured health logs.
