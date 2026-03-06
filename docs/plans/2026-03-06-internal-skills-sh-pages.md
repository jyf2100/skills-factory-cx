# 2026-03-06 Internal leaderboard, audits, and categories

## Analysis

### 现状
- 已有内部目录首页 `/` 与详情页 `/skills/:skillId`。
- 当前 GitLab 聚合层只能输出 skills 列表、skill 详情、最近审计摘要。
- 尚未提供独立的 `leaderboard`、`audits`、`categories` 页面与对应 API。
- `skills.sh` 当前公开页面里：
  - 首页主打 `Skills Leaderboard`，有 `All Time / Trending / Hot` 三种榜单视图。
  - `audits` 页面展示逐技能的安全审核状态矩阵。
  - 目录内容天然依赖类别和仓库归属信息进行发现。

### 对标事实
- `skills.sh/` 展示榜单、搜索、目录入口。
- `skills.sh/audits` 展示独立安全审计专页，强调多维审核状态。
- 公开文档说明其榜单基于匿名安装遥测；本内部实现不能使用该外部遥测，只能使用本地 GitLab 发布物。

### 约束
- 数据来源仍必须是本地 GitLab raw 仓库。
- 不引入新的外部依赖包。
- 不破坏已上线的 `/`、`/skills/:skillId`、审核后台与发布链路。

### 成功标准
1. 新增 `GET /leaderboard` 页面与 `GET /api/v1/catalog/leaderboard`。
2. 新增 `GET /audits` 页面，并把 `GET /api/v1/catalog/audits` 扩展为专页可用数据。
3. 新增 `GET /categories` 页面与 `GET /api/v1/catalog/categories`、`GET /api/v1/catalog/categories/:slug`。
4. GitLab 聚合层能从 `SKILL.md` frontmatter 或正文中提取 `name / description / category / tags`。
5. 为 leaderboard、audits、categories 增加失败测试并跑绿。

## Design

### 方案 A：直接在页面里拼现有 `/api/v1/catalog/skills`
- 优点：改动少。
- 缺点：排行榜、分类、审计矩阵逻辑散落前端，难测试，且无法统一解析 frontmatter。

### 方案 B：在 `GitLabCatalogService` 增加统一聚合能力，再由页面消费专门 API
- 优点：聚合逻辑集中，便于测试，也便于后续扩展更多类似 `skills.sh` 的页面。
- 缺点：需要重构 catalog service 的数据模型。

### 推荐
- 采用方案 B。
- 排行榜分为 `all_time / trending / hot` 三种内部评分模型；页面层模仿 `skills.sh` 的结构，但明确展示内部评分而非外部安装遥测。
- 审计专页用 `Review / Static Scan / Sandbox` 三列映射本地可用审核证据。
- 分类页优先使用 frontmatter 的 `category` / `tags`，没有时归入 `uncategorized`。

## Plan

### Task 1: Rich GitLab catalog aggregation
- **Files**: Modify `apps/market-api/src/services/gitlab-catalog.ts`
- **Test**: Create `apps/market-api/test/catalog-extras.test.ts`
- **Expected**:
  - 支持 leaderboard、audits、categories 聚合
  - 支持从 `SKILL.md` 提取 category/tags

### Task 2: Public pages and routes
- **Files**: Modify `apps/market-api/src/app.ts`, `apps/market-api/src/web/catalog.html`, `apps/market-api/src/web/skill-detail.html`; Create `apps/market-api/src/web/leaderboard.html`, `apps/market-api/src/web/audits.html`, `apps/market-api/src/web/categories.html`
- **Test**: Modify/Create `apps/market-api/test/catalog-ui.test.ts`
- **Expected**:
  - 新增 `/leaderboard`、`/audits`、`/categories`
  - 页面结构对标 `skills.sh` 的榜单、审计、分类体验

### Task 3: Validate and ship
- **Commands**:
  - `cd apps/market-api && npx vitest run test/catalog-api.test.ts test/catalog-extras.test.ts test/catalog-ui.test.ts`
  - `npm run build`
  - 容器内 `curl` 验证 `/leaderboard`、`/audits`、`/categories` 与对应 API
  - `git add -A && git commit -m "feat: add internal catalog pages" && git push`
