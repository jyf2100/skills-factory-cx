# 2026-03-06 公共目录 UI 中文化与主题统一

## Analysis

### 现状
- `leaderboard.html` 已经有比较完整的暗色品牌风格：深色背景、径向渐变、圆角卡片、胶囊按钮、品牌蓝紫渐变。
- 其他公共页面（`catalog` / `audits` / `categories` / `skills` / `audits detail` / `categories detail`）风格分裂，存在浅色背景、不同色板、不同卡片和导航样式。
- 页面文案仍以英文为主，和当前内部中文使用场景不一致。
- 当前页面全部为独立 HTML，样式内联，维护成本高。

### 约束
- 不新增第三方前端依赖。
- 保持现有页面路由和 API 路由不变。
- 构建流程继续使用 `cp -R src/web dist/`，因此共享资源应放在 `src/web` 内。

### 成功标准
1. 公共目录页面统一采用 leaderboard 的暗色品牌风格。
2. 公共目录页面标题、导航、主要说明文案切换为中文。
3. 动态状态标签（如 review/sandbox/scan/risk）在页面展示中转为中文。
4. 失败测试覆盖中文标题和共享主题资源接入。
5. 构建、目标测试通过；本地服务页面可访问。

## Design

### 方案 A：每个页面继续内联复制 leaderboard 风格
- 优点：改动直观，不涉及静态资源路由。
- 缺点：重复度高，后续再调样式成本大，容易漂移。

### 方案 B：抽共享主题 CSS，页面只保留少量局部样式
- 优点：最符合“统一风格”目标；后续新增页面也能复用；改动可控。
- 缺点：需要补一个静态资源路由，并同步修改多个页面模板。

### 推荐
- 采用方案 B。
- 新增 `src/web/assets/theme.css`，沉淀 leaderboard 的导航、hero、卡片、列表、表格、pill、按钮、表单等通用样式。
- 公共页面统一换成中文文案，并在页面脚本里加轻量映射函数，把状态字段翻译成中文展示。

## Plan

### Task 1: TDD Red — 页面中文与主题接入测试
- **Files**: Modify `apps/market-api/test/catalog-ui.test.ts`
- **Expected**:
  - 目录首页、榜单、审计、分类及详情页断言中文标题
  - 至少一个页面断言共享主题 `assets/theme.css`

### Task 2: Green — 共享主题与公共页面中文化
- **Files**:
  - Create `apps/market-api/src/web/assets/theme.css`
  - Modify `apps/market-api/src/app.ts`
  - Modify `apps/market-api/src/web/catalog.html`
  - Modify `apps/market-api/src/web/leaderboard.html`
  - Modify `apps/market-api/src/web/audits.html`
  - Modify `apps/market-api/src/web/categories.html`
  - Modify `apps/market-api/src/web/skill-detail.html`
  - Modify `apps/market-api/src/web/category-detail.html`
  - Modify `apps/market-api/src/web/audit-detail.html`
  - Modify `apps/market-api/src/web/audit-version-detail.html`
- **Expected**:
  - 页面统一暗色主题、中文导航与主文案
  - 状态标签与说明文案中文化

### Task 3: Refactor / Verify / Ship
- **Commands**:
  - `cd apps/market-api && npx vitest run test/catalog-ui.test.ts`
  - `npm --workspace @skills/market-api run build`
  - `docker compose -f infra/docker-compose.yml restart market-api`
  - `git add -A && git commit -m "feat: unify catalog ui theme in chinese" && git push`
