# 2026-03-06 Internal skills.sh clone backed by local GitLab

## Analysis

### 现状

- 当前仓库已有 `market-api`、`ingest-worker`、`find-skills`，但前台只有审核页 `review`，没有面向最终用户的 Skills 目录站。
- 已有发布链路会把 skill 包、metadata、attestation、install-manifest、index 写入本地 Git 仓库，并推到本地 GitLab。
- 现有公开查询接口 `GET /api/v1/skills` 的数据源是本地 JSON state，不是 GitLab 仓库本身。
- `GITLAB_RAW_BASE_URL` 已可返回对外可访问的 raw 包地址，但服务端如果运行在 compose 容器中，直接用 `127.0.0.1` 访问 GitLab raw 会失败。

### 对标对象（基于公开站点可见信息）

- `skills.sh` 有面向最终用户的目录首页、搜索/分类体验、技能详情页、审计/信任导向信息，以及从目录页直接进入安装动作。
- 站点核心是“可发现 + 可判断 + 可安装”，而不是后台审核视角。

### 约束

- 数据源必须来自本地部署的 GitLab，而不是当前 JSON state。
- 不依赖 skills.sh 私有后端；只能基于公开可见的信息和本仓库现有发布物实现内部等价版本。
- 保持现有审核/发布 API 不破坏。

### 成功标准

1. 新增一个面向终端用户的目录首页 `/`。
2. 新增技能详情页 `/skills/:skillId`。
3. 新增 GitLab-backed catalog API，数据直接来自 GitLab raw 仓库内容。
4. 目录页和详情页不依赖本地 state 即可读取已发布 skills。
5. 添加测试覆盖：页面存在性、GitLab 数据聚合、详情页数据读取。

### 风险

- GitLab raw 地址存在“对外地址”和“容器内地址”不一致的问题。
- 现有 metadata 字段较少，无法 1:1 复刻 skills.sh 的全部展示指标；需要从 `SKILL.md` 补足标题/摘要。
- 外部站点的完整交互细节不可见，只能做结构和体验上的内部等价实现。

## Design

### 方案 A：前台仍然读本地 JSON state
- 优点：开发快。
- 缺点：不满足“数据来源是本地 GitLab”。

### 方案 B：前台直接在浏览器里请求 GitLab raw
- 优点：概念简单。
- 缺点：受 CORS / 网络拓扑影响大；容器、宿主机、浏览器三方地址不一致。

### 方案 C：`market-api` 提供 GitLab-backed catalog 聚合层 + 前台目录页
- 优点：统一数据模型，便于做首页、详情页、审计摘要；同时能屏蔽容器内外地址差异。
- 缺点：需要新增聚合逻辑和展示页面。

### 推荐
- 采用方案 C。
- 先完成第一个闭环：目录首页 + 详情页 + GitLab-backed API。
- 后续再继续追加更细的 audits、排行榜、精选分类等模块。

## Plan

### Task 1: GitLab-backed catalog API
- **Files**: Create `apps/market-api/src/services/gitlab-catalog.ts`; Modify `apps/market-api/src/config.ts`, `apps/market-api/src/app.ts`
- **Test**: Create `apps/market-api/test/catalog-api.test.ts`
- **Expected**:
  - `GET /api/v1/catalog/skills` 返回 GitLab 聚合后的 skills 列表
  - `GET /api/v1/catalog/skills/:skillId` 返回详情和版本列表
  - `GET /api/v1/catalog/audits` 返回最近发布/审计摘要

### Task 2: Public catalog pages
- **Files**: Create `apps/market-api/src/web/catalog.html`, `apps/market-api/src/web/skill-detail.html`; Modify `apps/market-api/src/app.ts`
- **Test**: Create `apps/market-api/test/catalog-ui.test.ts`
- **Expected**:
  - `GET /` 返回目录页
  - `GET /skills/:skillId` 返回详情页
  - 页面文案和结构体现 skills.sh 风格的目录/详情体验

### Task 3: Runtime config for GitLab fetch base
- **Files**: Modify `.env.example`, `infra/docker-compose.yml`, `README.md`, `docs/install-guide.md`
- **Expected**:
  - 本地 dev 与 compose 容器都能读取 GitLab-backed catalog
  - `GITLAB_RAW_BASE_URL` 保持对外地址，新增/派生服务端 fetch 地址用于容器内部访问

### Task 4: Validation and ship
- **Commands**:
  - `npm --workspace @skills/market-api test`
  - `npm run build`
  - `git add -A && git commit -m "feat: add internal skills catalog" && git push`
