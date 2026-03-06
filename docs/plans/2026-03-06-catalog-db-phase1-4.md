# 2026-03-06 Catalog DB Read Model Phase 1-4

## Analysis
- 当前 `catalog` 路由全部通过 `GitLabCatalogService` 实时从 GitLab Raw 全量拉取并聚合，读放大严重。
- 仓库已具备 `postgres` 容器，但 `market-api` 尚未接入数据库客户端、schema、migration、rebuild、projector、DB repository。
- 本轮要覆盖设计文档里的 Phase 1 - Phase 4：
  1. 接入 Postgres 与 schema
  2. 实现 projector 与 rebuild
  3. 发布链路写透 DB
  4. catalog API 切换到 DB 读

## Constraints
- 不改现有页面/API 响应 shape。
- GitLab 仍是发布事实源；DB 是可重建读模型。
- 继续保留 JSON state store，避免把 ingest/jobs 一起迁移扩大范围。
- 尽量只引入轻量依赖：`pg`。

## Success Criteria
1. 应用启动时可自动跑 migration。
2. 存在 `rebuild-catalog-db` 脚本，可从 `local-skills-repo` 全量回填 Postgres。
3. 审批发布成功后，目标技能自动 upsert 到 DB。
4. `/api/v1/catalog/*` 统一从 Postgres 读取，页面无需改接口。
5. 提供针对 DB repository / projector / API 的失败测试并跑绿。

## Design
### Option A: 一次性用 ORM + 全量 state 迁移
- 优点：长期统一。
- 缺点：范围太大，当前目标是 catalog 性能，不适合本轮。

### Option B: 轻量 `pg` + SQL migrations + 独立读模型（推荐）
- 优点：最小依赖、最贴合当前项目、便于逐步迁移。
- 缺点：需要手写 SQL 和少量 repository 代码。

## Plan
### Task 1: DB Foundation
- **Files**:
  - Modify `apps/market-api/package.json`
  - Modify `apps/market-api/src/config.ts`
  - Create `apps/market-api/src/db/client.ts`
  - Create `apps/market-api/src/db/migrate.ts`
  - Create `apps/market-api/src/db/migrations/001_catalog_read_model.sql`
- **Expected**:
  - 可以连接 Postgres 并执行 migrations

### Task 2: Projector + Rebuild
- **Files**:
  - Create `apps/market-api/src/services/catalog-model.ts`
  - Create `apps/market-api/src/services/catalog-projector.ts`
  - Create `apps/market-api/src/scripts/rebuild-catalog-db.ts`
- **Expected**:
  - 能从 `local-skills-repo` 回填 DB
  - 能计算 readme_html / leaderboard scores / tags / status

### Task 3: Publish write-through
- **Files**:
  - Modify `apps/market-api/src/services/publisher.ts`
  - Modify `apps/market-api/src/app.ts`
- **Expected**:
  - approve publish 后自动同步 DB

### Task 4: DB-backed catalog API
- **Files**:
  - Create `apps/market-api/src/services/postgres-catalog.ts`
  - Modify `apps/market-api/src/app.ts`
  - Modify `apps/market-api/src/index.ts`
  - Modify `infra/docker-compose.yml`
  - Modify `.env` if needed
- **Expected**:
  - `/api/v1/catalog/*` 改从 DB 查询
  - 容器环境可直连 postgres service

### Task 5: TDD / Validate / Ship
- **Tests**:
  - Create `apps/market-api/test/catalog-db.test.ts`
  - Create `apps/market-api/test/catalog-projector.test.ts`
- **Commands**:
  - `cd apps/market-api && npx vitest run test/catalog-db.test.ts test/catalog-projector.test.ts test/catalog-ui.test.ts`
  - `npm --workspace @skills/market-api run build`
  - `node apps/market-api/dist/scripts/rebuild-catalog-db.js`
  - `docker compose -f infra/docker-compose.yml restart market-api`
  - `git add -A && git commit -m "feat: move catalog reads to postgres" && git push`
