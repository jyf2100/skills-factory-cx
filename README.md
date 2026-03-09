# Local Skills Market (MVP)

- 安装与使用手册：`docs/install-guide.md`

本项目实现了本地 Skills 市场 MVP：

- `market-api`: 搜索/导入/审核/发布/安装清单/审计 API
- `ingest-worker`: 批量检索/导入 worker（对接 market-api）
- `find-skills`: 兼容旧命令的 CLI（推荐使用 `npx local-find-skills` / `npx local-install` / `npx local-verify`）
- `@skills/shared`: 类型、schema、签名验签工具

## Features (v1)

- 内部目录首页 `/`、技能详情页 `/skills/:skillId`、`/leaderboard`、`/audits`、`/categories`，整体体验对标 `skills.sh`，但数据源改为本地 GitLab
- 白名单来源校验（默认 `github.com` / `gitlab.com` / `skills.sh`）
- 导入后静态扫描 + rootless 容器沙箱检查
- 异步导入队列 + `ingest-worker` 轮询处理
- 单人审批（approve/reject）
- 发布到本地 Git 仓库结构（`skills/metadata/attestations/signatures/index`）
- 审批通过后提交并推送到本地 GitLab 仓库（可选配置），安装清单可指向 GitLab Raw 下载地址
- ed25519 签名，CLI 安装前强制哈希 + 签名校验
- 安装审计日志

## Quick Start

```bash
cp .env.example .env
# 运行入口现在会自动加载仓库根目录 `.env`
# compose 启动 postgres/gitlab 前，请先在本地 `.env` 中设置：
# POSTGRES_PASSWORD=...
# GITLAB_ROOT_PASSWORD=...
# 若访问 github 需要代理，设置：
# OUTBOUND_PROXY=http://127.0.0.1:7890
# 若要直接推送到本地 GitLab，设置：
GIT_REMOTE_URL=http://127.0.0.1:8929/root/skills-repo.git
GIT_PUSH_BRANCH=main
GITLAB_RAW_BASE_URL=http://127.0.0.1:8929/root/skills-repo/-/raw/main
# 可选：market-api 在容器内运行时可单独指定 GitLab raw 的内部访问地址
# GITLAB_FETCH_BASE_URL=http://gitlab:8929/root/skills-repo/-/raw/main
npm install
npm run build
npm run dev:api
```

另开终端：

```bash
npm run dev:worker
# 可选：生产者模式，按 query/source_url 入队
npm --workspace @skills/ingest-worker run dev
npm --workspace find-skills run dev -- search --from http://127.0.0.1:4311 sample
npm --workspace find-skills run dev -- source list
```

> 本地技能市场推荐命令：
>
> `npx local-find-skills --from http://127.0.0.1:4311 <keyword>`
>
> `npx local-install --from http://127.0.0.1:4311 <skill> <version>`
>
> `npx local-verify --from http://127.0.0.1:4311 <skill> <version>`

## API Endpoints

- `POST /api/v1/ingest/search`
- `POST /api/v1/ingest/import`
- `GET /api/v1/ingest/jobs`
- `POST /api/v1/ingest/jobs`
- `POST /api/v1/ingest/jobs/claim`
- `POST /api/v1/ingest/jobs/:job_id/complete`
- `POST /api/v1/ingest/jobs/:job_id/fail`
- `GET /api/v1/skills`
- `GET /api/v1/skills/:id`
- `GET /api/v1/skills/:id/versions/:version`
- `POST /api/v1/reviews/:ingest_id/approve`
- `POST /api/v1/reviews/:ingest_id/reject`
- `GET /api/v1/install/:skill_id/:version`
- `GET /api/v1/audit/:skill_id/:version`

Additional:

- `GET /api/v1/public-key`
- `GET /api/v1/packages/:skill_id/:version`
- `POST /api/v1/install-log/:skill_id/:version`
- `GET /review` (minimal reviewer console)
- `GET /leaderboard`
- `GET /audits`
- `GET /audits/:skillId`
- `GET /categories`
- `GET /categories/:slug`

## Local Skills Repository Layout

发布仓库在 `LOCAL_SKILLS_REPO`（默认 `.data/local-skills-repo`）：

- `skills/<skill_id>/<version>/`
- `metadata/<skill_id>/<version>.json`
- `attestations/<skill_id>/<version>.json`
- `signatures/<skill_id>/<version>.sig`
- `index/skills-index.json`
- `packages/<skill_id>/<version>.tgz`

## Testing

```bash
npm test
```

## Docker Compose

```bash
# 先确保 dist 为最新
npm run build

# 若本机已有 4311 端口监听，先停止本地 dev:api 进程
docker compose -f infra/docker-compose.yml up -d market-api ingest-worker
# 若要用 compose 自己管理 GitLab，先停止宿主机上的独立 GitLab 容器，再启动：
docker compose -f infra/docker-compose.yml up -d gitlab
docker compose -f infra/docker-compose.yml logs -f market-api ingest-worker
docker compose -f infra/docker-compose.yml down
```

说明：

- `market-api` 与 `ingest-worker` 现在可通过 compose 启动。
- compose 使用宿主机已构建的 `dist` 产物，因此在启动前需要先运行一次 `npm run build`。
- compose 运行时会强制将目录读模型切到 PostgreSQL（`CATALOG_BACKEND=postgres`，`POSTGRES_HOST=postgres`）。
- compose 运行时只会把 `GIT_REMOTE_URL` 改写到容器内的 `gitlab` 服务（或回退到 `host.docker.internal`）；`GITLAB_RAW_BASE_URL` 保持宿主机可访问地址，避免安装清单返回内网域名。
- 若要启动 compose 管理的 GitLab，请先停止现有独立 GitLab 容器，否则 `8929` / `2224` 会端口冲突。
- 新起的 compose GitLab 默认是全新实例；首次使用前需要在其中创建 `root/skills-repo`。

## Notes

- 当前实现是可运行 MVP，存储层使用 JSON 文件（`DATA_DIR/store.json`）。
- 生产可替换为 PostgreSQL + 队列（保持 API 契约不变）。
- `OUTBOUND_PROXY` 会同时用于 GitHub / GitLab 搜索与 `git clone` 导入流程。
- 若配置了 `GIT_REMOTE_URL`，审批发布会自动 `git push` 到该仓库；推送失败会阻断发布。
- 若配置了 `GITLAB_RAW_BASE_URL`，安装清单会返回 GitLab Raw 下载地址；否则回退为本地 API 下载地址。
- GitHub 仓库内置 `Upload Security Guard` 工作流；每次 `push` / `pull_request` 都会运行 `gitleaks` 进行明文凭据扫描。
