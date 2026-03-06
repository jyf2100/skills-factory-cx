# 2026-03-06 Category detail and single-skill audit detail

## Analysis

### 现状
- `/categories` 仍是同页切换，不是独立的 `categories/:slug` 详情页。
- `/audits` 只有列表页，还不能进入单个 skill 的审计详情。
- 现有 `GitLabCatalogService` 已能产出分类聚合和审计列表，适合继续向详情页扩展。

### 约束
- 数据源继续保持本地 GitLab raw。
- 不引入新的外部依赖。
- 保持当前 `/categories`、`/audits` 列表页可用。

### 成功标准
1. 新增 `GET /categories/:slug` 独立页面。
2. 新增 `GET /audits/:skillId` 单技能审计详情页。
3. 新增 `GET /api/v1/catalog/audits/:skillId` 聚合接口。
4. 分类列表页改为跳转详情页，而不是仅前端同页切换。
5. 增加失败测试并跑绿。

## Design

### 方案 A：页面自己拼接多个现有接口
- 优点：实现快。
- 缺点：详情页需要自己做聚合，逻辑散落前端，不利测试。

### 方案 B：服务层新增详情聚合，页面只消费详情 API
- 优点：聚合逻辑集中，详情页结构清晰，便于后续继续扩成更多专页。
- 缺点：需要再扩 `GitLabCatalogService`。

### 推荐
- 采用方案 B。
- `categories/:slug` 用已有分类聚合结果渲染独立页面。
- `audits/:skillId` 产出单 skill 的最新审计总览 + 各版本审计记录。

## Plan

### Task 1: Service detail aggregation
- **Files**: Modify `apps/market-api/src/services/gitlab-catalog.ts`
- **Test**: Modify `apps/market-api/test/catalog-extras.test.ts`
- **Expected**:
  - `getCategoryDetail(slug)` 返回详情页足够字段
  - `getAuditDetail(skillId)` 返回 skill 审计详情及版本记录

### Task 2: Routes and pages
- **Files**: Modify `apps/market-api/src/app.ts`, `apps/market-api/src/web/categories.html`, `apps/market-api/src/web/audits.html`; Create `apps/market-api/src/web/category-detail.html`, `apps/market-api/src/web/audit-detail.html`
- **Test**: Modify `apps/market-api/test/catalog-ui.test.ts`
- **Expected**:
  - 新增 `/categories/:slug`
  - 新增 `/audits/:skillId`
  - 列表页跳转到独立详情页

### Task 3: Validation and ship
- **Commands**:
  - `cd apps/market-api && npx vitest run test/catalog-extras.test.ts test/catalog-ui.test.ts`
  - `npm run build`
  - 容器内 `curl` 验证 `/categories/development`、`/audits/skills` 和对应 API
  - `git add -A && git commit -m "feat: add internal detail pages" && git push`
