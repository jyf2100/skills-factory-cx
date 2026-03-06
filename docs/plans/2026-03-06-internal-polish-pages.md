# 2026-03-06 Markdown rendering, version audit detail, and category filtering

## Analysis

### 现状
- `skills/:skillId` 详情页仍以纯文本展示 `readme_markdown`，缺少更好的可读性。
- `/audits/:skillId` 已有单技能审计详情，但还没有 `audits/:skillId/:version` 的版本级详情。
- `/categories/:slug` 已独立，但缺少排序和筛选能力。

### 约束
- 继续保持无新增外部依赖。
- 数据源继续来自本地 GitLab raw。
- 保持现有页面和 API 向后兼容。

### 成功标准
1. `GET /api/v1/catalog/skills/:skillId` 返回渲染后的 `readme_html`。
2. `GET /audits/:skillId/:version` 和 `GET /api/v1/catalog/audits/:skillId/:version` 可用。
3. `GET /api/v1/catalog/categories/:slug` 支持 `sort/q/risk/tag` 查询参数。
4. `GET /categories/:slug` 页面提供排序与筛选控件，并驱动上述查询参数。
5. 为以上行为增加失败测试并跑绿。

## Design

### 方案 A：前端自行做 markdown 渲染和筛选
- 优点：后端改动少。
- 缺点：逻辑散落前端，难测，且版本级审计聚合仍需后端支持。

### 方案 B：服务层统一产出 HTML 与筛选结果，前端只负责展示
- 优点：聚合逻辑集中，容易测试，也便于后续继续扩展更多页面。
- 缺点：服务层职责继续变重。

### 推荐
- 采用方案 B。
- 先做轻量安全 markdown renderer：标题、段落、列表、代码块、行内 code。
- 版本级审计详情复用已有单技能审计聚合结果。
- 分类筛选支持 `sort=latest|title|risk`、`q=`、`risk=`、`tag=`。

## Plan

### Task 1: Catalog service enhancements
- **Files**: Modify `apps/market-api/src/services/gitlab-catalog.ts`
- **Test**: Modify `apps/market-api/test/catalog-api.test.ts`, `apps/market-api/test/catalog-extras.test.ts`
- **Expected**:
  - `readme_html` 已渲染
  - `getAuditVersionDetail(skillId, version)` 可用
  - `getCategoryDetail(slug, filters)` 可用

### Task 2: Routes and pages
- **Files**: Modify `apps/market-api/src/app.ts`, `apps/market-api/src/web/skill-detail.html`, `apps/market-api/src/web/category-detail.html`; Create `apps/market-api/src/web/audit-version-detail.html`
- **Test**: Modify `apps/market-api/test/catalog-ui.test.ts`
- **Expected**:
  - `/audits/:skillId/:version` 页面可用
  - `skills/:skillId` 使用渲染后的 markdown HTML
  - `categories/:slug` 提供排序和筛选控件

### Task 3: Validate and ship
- **Commands**:
  - `cd apps/market-api && npx vitest run test/catalog-api.test.ts test/catalog-extras.test.ts test/catalog-ui.test.ts`
  - `npm run build`
  - 容器内 `curl` 验证 `/skills/skills`、`/audits/skills/0.1.0`、`/categories/development?sort=title&q=zustand`
  - `git add -A && git commit -m "feat: polish internal catalog pages" && git push`
