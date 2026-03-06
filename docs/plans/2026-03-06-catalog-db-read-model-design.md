# 2026-03-06 目录页数据库读模型改造设计

## 1. Analysis

### 1.1 现状
当前公共目录页面（首页、排行榜、审计、分类、技能详情）都通过 `apps/market-api/src/services/gitlab-catalog.ts` 从本地 GitLab Raw 仓库实时聚合数据。

关键调用链：

- `GET /api/v1/catalog/skills` → `GitLabCatalogService.listSkills()`
- `GET /api/v1/catalog/skills/:skillId` → `getSkillDetail()`
- `GET /api/v1/catalog/leaderboard` → `getLeaderboard()`
- `GET /api/v1/catalog/audits` → `listAudits()`
- `GET /api/v1/catalog/audits/:skillId` → `getAuditDetail()`
- `GET /api/v1/catalog/audits/:skillId/:version` → `getAuditVersionDetail()`
- `GET /api/v1/catalog/categories` → `listCategories()`
- `GET /api/v1/catalog/categories/:slug` → `getCategoryDetail()`

所有这些方法最终都依赖同一个核心路径：

- `loadAggregates()` 先拉 `index/skills-index.json`
- 再对每个技能版本拉 4 份文件：
  - `metadata/<skill>/<version>.json`
  - `install-manifests/<skill>/<version>.json`
  - `attestations/<skill>/<version>.json`
  - `skills/<skill>/<version>/SKILL.md`

对应代码位置：
- `apps/market-api/src/services/gitlab-catalog.ts:381`
- `apps/market-api/src/services/gitlab-catalog.ts:400`

### 1.2 当前瓶颈
当前本地索引规模：

- 技能数：25
- 版本数：25

意味着**单次 catalog 聚合**的上游访问量约为：

- `1` 次索引请求
- `25 * 4 = 100` 次版本文件请求
- 合计：**101 次 GitLab Raw 请求**

而页面通常不是一次 API：

- 首页会并发请求：
  - `/api/v1/catalog/skills`
  - `/api/v1/catalog/audits?limit=6`
  - `/api/v1/catalog/categories`
- 这会导致首页一次打开约触发：`3 * 101 = 303` 次上游 Raw 请求

更严重的是，**详情页也会全量拉取整个目录**：

- `getSkillDetail(skillId)` 并不是只查目标 skill，而是先 `loadAggregates()` 再过滤
- `getAuditDetail(skillId)` / `getAuditVersionDetail(skillId, version)` 同样先全量拉取
- `getCategoryDetail(slug)` 先 `listCategories()`，而 `listCategories()` 也先全量拉取

因此当前问题不是前端渲染慢，而是：

1. 每次读请求都在做“全量构建目录读模型”
2. 所有页面都把 GitLab Raw 当数据库使用
3. 同一批数据在一次页面访问中被重复拉取和重复解析
4. Markdown 解析、排行榜打分、分类聚合也在每次请求中重复计算

### 1.3 已有资源
仓库已经具备 PostgreSQL 容器，但应用尚未接入：

- `infra/docker-compose.yml` 中已有 `postgres` 服务
- `apps/market-api` 当前没有任何 Postgres client / ORM 依赖

### 1.4 约束
- 不能影响现有 GitLab 发布链路的正确性；GitLab 仍然是发布事实源（source of truth）
- 本轮目标是**读性能**，不建议先把整个 ingest / review / publish 操作面一次性全迁移到数据库
- 需要保持现有 API 输出兼容，尽量不改前端页面请求协议
- 现有代码体量不大，不适合直接引入重量级 ORM 和复杂迁移系统

### 1.5 目标
本次改造的目标不是“把 GitLab 换掉”，而是：

- GitLab 继续作为发布产物仓库和事实源
- PostgreSQL 作为**目录读模型存储**
- 页面/API 统一从 PostgreSQL 查询展现
- 发布时写 GitLab，同时同步/投影到 PostgreSQL

### 1.6 成功标准
建议明确为以下可验证目标：

1. 首页不再访问 GitLab Raw；只读 PostgreSQL
2. 详情页只查询目标技能/版本，不做全量聚合
3. 首页 P95 响应时间控制在 `<= 250ms`（本地网络、100 skills / 300 versions 量级）
4. 技能详情页 P95 响应时间控制在 `<= 150ms`
5. 现有 catalog API 输出字段保持兼容
6. 发布一个新技能后，数据库读模型在 `<= 3s` 内可见
7. 提供全量回填与重建能力，数据库损坏时可由 GitLab 仓库重建

---

## 2. Design Options

### 方案 A：保留 GitLab Raw 读取，只加内存缓存

#### 思路
- 在 `GitLabCatalogService` 上层增加 LRU/TTL 缓存
- 减少重复请求

#### 优点
- 改动最小
- 上线快

#### 缺点
- 只能缓解，不能从根上解决
- 多实例时缓存不共享
- 重启失效
- 首页仍然是“大对象全量聚合”
- 详情页仍需从全量目录中过滤
- 很难支持复杂搜索/排序/分页

#### 结论
- 只能作为过渡补丁，不适合当前“页面明显慢”的主问题

### 方案 B：引入 PostgreSQL 作为 catalog 读模型（推荐）

#### 思路
- GitLab 仍保存发布包、元数据、attestation、SKILL.md
- 新增 Postgres catalog projection
- 发布成功后写 GitLab，并同步 upsert 到 Postgres
- 页面/API 只查 Postgres
- 提供 `rebuild` 任务可从 GitLab 仓库全量回填数据库

#### 优点
- 从根上解决读放大问题
- 支持索引、过滤、排序、分页
- 详情页按主键/索引查询，性能稳定
- 可以逐步迁移，不必一次性重构 ingest 全流程
- DB 可承载后续统计、收藏、推荐等功能

#### 缺点
- 引入数据库 schema 和同步逻辑
- 需要处理 GitLab 与 DB 一致性
- 需要补充迁移和回填工具

#### 结论
- 最符合当前问题与未来扩展方向

### 方案 C：把 GitLab 元数据同步成静态 JSON 索引文件，再由 API 读取本地 JSON

#### 思路
- 发布时把所有聚合结果写到一个或多个本地 JSON 快照
- API 从本地快照读取

#### 优点
- 不引入数据库依赖
- 读取速度显著优于 GitLab Raw

#### 缺点
- 并发更新和一致性较脆弱
- 过滤/搜索/分页能力弱
- 复杂统计和详情仍需应用层全量扫描
- 后续再次迁 DB 会产生二次迁移成本

#### 结论
- 可做临时中间态，但不是长期解法

### 推荐方案
采用 **方案 B：PostgreSQL 读模型**。

---

## 3. Recommended Architecture

### 3.1 总体架构

```text
GitHub / 外部来源
   ↓
Ingest / Review / Publish
   ↓
本地 GitLab 发布仓库（事实源）
   ↓                         ↘
Catalog Projection Job         包 / Raw 文件继续供安装与审计取证
   ↓
PostgreSQL 读模型
   ↓
Market API / Web Pages
```

### 3.2 设计原则
- **写入事实源**：发布链路先写 GitLab 事实源
- **读取读模型**：页面与 catalog API 只读 Postgres
- **可重建**：任意时候都可以从 GitLab 仓库重建 DB
- **渐进迁移**：先迁 public catalog；review console / jobs / ingests 后续再迁
- **接口兼容**：保留现有 API 输出 shape，避免前端大改

---

## 4. 数据模型设计

### 4.1 分层原则
建议采用：

- **规范化主表**：技能、版本、标签
- **轻度冗余读表**：当前版本快照（便于首页、分类、排行榜）

这样既避免纯大 JSON，又不必每次读都做多表复杂聚合。

### 4.2 表结构

#### `catalog_skills`
技能当前快照表，用于首页、分类、排行榜、列表页。

字段建议：

- `skill_id text primary key`
- `title text not null`
- `summary text not null`
- `category_slug text not null default 'uncategorized'`
- `category_label text not null default 'Uncategorized'`
- `latest_version text not null`
- `versions_count integer not null`
- `risk_level text not null`
- `published_at timestamptz not null`
- `source_url text not null`
- `package_url text not null`
- `reviewer text not null`
- `reviewed_at timestamptz null`
- `review_note text not null default ''`
- `scan_issue_count integer not null default 0`
- `review_status text not null`
- `static_scan_status text not null`
- `sandbox_status text not null`
- `readme_markdown text not null`
- `readme_html text not null`
- `score_all_time integer not null default 0`
- `score_trending integer not null default 0`
- `score_hot integer not null default 0`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

索引建议：

- `idx_catalog_skills_published_at (published_at desc)`
- `idx_catalog_skills_category (category_slug, published_at desc)`
- `idx_catalog_skills_risk (risk_level, published_at desc)`
- `idx_catalog_skills_score_all_time (score_all_time desc)`
- `idx_catalog_skills_score_trending (score_trending desc)`
- `idx_catalog_skills_score_hot (score_hot desc)`

#### `catalog_skill_versions`
版本级详情表，用于技能详情、审计详情、版本审计详情。

字段建议：

- `skill_id text not null`
- `version text not null`
- `title text not null`
- `summary text not null`
- `category_slug text not null`
- `category_label text not null`
- `risk_level text not null`
- `published_at timestamptz not null`
- `source_url text not null`
- `package_url text not null`
- `reviewer text not null`
- `reviewed_at timestamptz null`
- `review_note text not null default ''`
- `scan_issue_count integer not null default 0`
- `review_status text not null`
- `static_scan_status text not null`
- `sandbox_status text not null`
- `readme_markdown text not null`
- `readme_html text not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

主键与索引：

- `primary key (skill_id, version)`
- `idx_catalog_skill_versions_skill_published (skill_id, published_at desc)`
- `idx_catalog_skill_versions_reviewed (review_status, published_at desc)`
- `idx_catalog_skill_versions_category (category_slug, published_at desc)`

#### `catalog_skill_tags`
标签表。

字段建议：

- `skill_id text not null`
- `tag text not null`
- `created_at timestamptz not null default now()`

约束与索引：

- `primary key (skill_id, tag)`
- `idx_catalog_skill_tags_tag (tag, skill_id)`

#### 可选：`catalog_sync_runs`
记录回填/同步执行历史，用于运维观测。

字段建议：

- `id uuid primary key`
- `mode text not null` (`full_rebuild` / `upsert_skill` / `repair`)
- `started_at timestamptz not null`
- `finished_at timestamptz null`
- `status text not null`
- `skills_scanned integer not null default 0`
- `versions_scanned integer not null default 0`
- `error_message text null`

### 4.3 为什么不把所有数据塞单表 JSON
不推荐“一个技能一条 JSON 大记录”作为唯一结构，因为：

- 详情页与版本页仍需要反序列化整个对象
- 标签过滤、排行榜、审计筛选都不方便建索引
- 版本级详情与技能级快照读路径不清晰

因此推荐“版本表 + 当前快照表 + 标签表”的组合。

---

## 5. 查询设计（API 到 SQL 的映射）

### 5.1 `/api/v1/catalog/skills`
来源：`catalog_skills`

支持：
- query 模糊检索 `skill_id/title/summary/category/tags`
- 排序：`published_at desc`

实现建议：
- 初版用 `ILIKE`
- 二期引入 `pg_trgm` 做模糊索引

### 5.2 `/api/v1/catalog/skills/:skillId`
来源：
- 主信息查 `catalog_skills where skill_id = $1`
- 版本列表查 `catalog_skill_versions where skill_id = $1 order by published_at desc`
- 标签查 `catalog_skill_tags where skill_id = $1`

### 5.3 `/api/v1/catalog/leaderboard`
来源：`catalog_skills`

直接按以下列排序取前 N：
- `score_all_time`
- `score_trending`
- `score_hot`

说明：
- 分数在投影阶段计算并存表，避免每次请求重复计算

### 5.4 `/api/v1/catalog/audits`
来源：`catalog_skill_versions`

排序：
- `published_at desc`

支持直接按版本粒度分页，无需重建全量 aggregate。

### 5.5 `/api/v1/catalog/audits/:skillId`
来源：
- `catalog_skills` 获取最新状态
- `catalog_skill_versions` 获取该技能全部版本时间线

### 5.6 `/api/v1/catalog/audits/:skillId/:version`
来源：
- `catalog_skill_versions where skill_id = $1 and version = $2`

### 5.7 `/api/v1/catalog/categories`
来源：`catalog_skills`

查询：
- `group by category_slug, category_label`
- 聚合 `count(*)`, `max(published_at)`

### 5.8 `/api/v1/catalog/categories/:slug`
来源：
- `catalog_skills where category_slug = $1`
- 可追加 `q / risk / tag / sort`
- `available_tags` 可由当前分类结果 join `catalog_skill_tags` 获取

---

## 6. 同步设计

### 6.1 写入模式
推荐采用 **写 GitLab → 投影到 DB** 的顺序。

#### 发布路径
当前 `publishSkill()` 做了：
1. 写 `skills/`
2. 写包 `packages/`
3. 写 `metadata/`
4. 写 `attestations/`
5. 写 `install-manifests/`
6. 更新 `index/skills-index.json`
7. `git commit`
8. `git push`

建议改造后新增步骤：
9. `projectPublishedSkillToCatalogDb(published)`

### 6.2 一致性策略
不建议要求 GitLab 与 DB 的强事务一致性，因为：
- Git 操作与 Postgres 事务跨系统
- 失败恢复复杂

推荐采用：

#### 方案：最终一致 + 可重放
- GitLab 写入成功后，再 upsert DB
- 如果 DB upsert 失败：
  - 记录错误日志/同步状态
  - 不回滚 GitLab 发布
  - 由后台 repair/rebuild 重试修复

这是因为：
- GitLab 发布产物是事实源
- DB 是可重建读模型

### 6.3 全量回填（Backfill / Rebuild）
必须提供一个独立命令，例如：

```bash
npm --workspace @skills/market-api run rebuild-catalog-db
```

行为：
- 读取 `local-skills-repo/index/skills-index.json`
- 遍历所有技能和版本
- 读取 `metadata / install-manifests / attestations / SKILL.md`
- 重新生成 `catalog_skills / catalog_skill_versions / catalog_skill_tags`

该命令用于：
- 新环境初始化
- DB 丢失恢复
- 修复投影错误
- 回归校验

### 6.4 启动时行为
不建议应用启动自动全量重建 DB，因为：
- 启动时间不可控
- 容器重启会放大恢复成本

推荐：
- 启动时只做 schema migration + 健康检查
- 如果 DB 为空，API 可返回明确错误：`catalog db not initialized`
- 由运维/脚本主动执行 `rebuild`

---

## 7. 服务层重构方案

### 7.1 新的接口分层
建议把现有 `GitLabCatalogService` 拆成两层：

#### `CatalogReadRepository`
只关心数据库读取。

建议接口：
- `listSkills(query)`
- `getSkill(skillId)`
- `listSkillVersions(skillId)`
- `listAudits(limit)`
- `getAuditDetail(skillId)`
- `getAuditVersionDetail(skillId, version)`
- `listCategories()`
- `getCategoryDetail(slug, filters)`
- `getLeaderboard(limit)`

#### `CatalogProjector`
只关心从 GitLab 事实源/发布结果生成 DB 读模型。

建议接口：
- `projectVersionFromRepo(skillId, version)`
- `projectPublishedSkill(published, approval)`
- `rebuildAll()`
- `deleteSkillVersion(skillId, version)`（可选，便于未来撤销）

### 7.2 迁移路径
#### Phase 1
- 保留 `GitLabCatalogService` 作为 projector 的数据解析工具
- 新增 `PostgresCatalogRepository`
- API 路由改为优先读 DB

#### Phase 2
- 将 `GitLabCatalogService` 缩减为 `GitLabCatalogSourceReader`
- 仅供 rebuild / repair 使用

---

## 8. 依赖与技术选型

### 8.1 Postgres client
推荐：`pg`

原因：
- 轻量
- 依赖少
- 对当前项目体量更合适
- 可用原生 SQL 精准控制查询

### 8.2 Migration 方案
推荐：自带 `migrations/*.sql` + 极简 runner

原因：
- 比 ORM migration 更透明
- 便于排查线上 schema
- 与当前简单代码风格一致

### 8.3 不推荐 ORM 的原因
当前阶段不建议直接引入：
- Prisma
- TypeORM
- Sequelize

原因：
- 目标是尽快解决 catalog 读性能
- ORM 迁移成本、生成流程、抽象层次都偏重
- 当前团队更需要稳定和可控，而不是抽象花哨

---

## 9. API 兼容策略

### 9.1 保持现有响应 shape
前端页面已经按现有接口工作，因此建议：

- URL 不变
- 字段名不变
- 仅替换 service/repository 实现

### 9.2 Feature Flag
增加环境变量：

- `CATALOG_BACKEND=gitlab|postgres`

迁移阶段：
- 默认先 `gitlab`
- 新环境验证完成后切到 `postgres`
- 出问题可一键回退

### 9.3 双读校验（推荐灰度阶段）
在开发/灰度期增加开关：

- `CATALOG_COMPARE_READS=true`

行为：
- 主读 DB
- 异步对比一次 GitLab Raw 聚合结果
- 打日志比较关键字段是否一致

用于发现投影错误，而不影响用户响应。

---

## 10. 风险与应对

### 风险 1：GitLab 与 DB 不一致
应对：
- GitLab 作为事实源
- 提供 `rebuild`
- 提供 `sync_runs` 记录和告警

### 风险 2：一次性迁移过大
应对：
- 本轮只迁 public catalog 读路径
- review console / ingest jobs / state store 后续再迁

### 风险 3：标签与分类计算口径变化
应对：
- 复用现有 `parseSkillMarkdown()` 逻辑
- 先保持兼容，再逐步清洗数据质量

### 风险 4：搜索性能仍不足
应对：
- 初版 `ILIKE`
- 二期加 `pg_trgm`
- 三期如需要再上全文检索

### 风险 5：排行榜分数逻辑散落
应对：
- 把分数计算收敛到 projector
- 明确写入 `score_*` 字段

---

## 11. 分阶段实施计划

### Phase 0：观测与基线
目标：先量化问题

任务：
- 给 catalog API 增加响应耗时日志
- 统计每个接口的 GitLab Raw 请求数
- 输出首页/详情页基线耗时

### Phase 1：接入 Postgres 与 schema
目标：DB ready

文件：
- `apps/market-api/src/db/*`
- `apps/market-api/src/migrations/*`
- `apps/market-api/src/config.ts`

任务：
- 增加 `pg` 依赖
- 增加 DB 配置项
- 增加 migration runner
- 建 3 张 catalog 表 + 1 张 sync_runs 表

### Phase 2：实现 projector 与 rebuild
目标：能把 GitLab 仓库投影进 DB

文件：
- `apps/market-api/src/services/catalog-projector.ts`
- `apps/market-api/src/scripts/rebuild-catalog-db.ts`

任务：
- 从 `local-skills-repo` 全量读取并写 DB
- 校验技能数、版本数、标签数

### Phase 3：发布链路写透 DB
目标：新发布数据自动进入 DB

文件：
- `apps/market-api/src/services/publisher.ts`
- `apps/market-api/src/services/catalog-projector.ts`

任务：
- `publishSkill()` 成功后触发投影
- 失败时记录 sync 状态，支持 repair

### Phase 4：API 切换到 DB 读取
目标：页面不再打 GitLab Raw

文件：
- `apps/market-api/src/services/catalog-repository.ts`
- `apps/market-api/src/app.ts`

任务：
- 所有 `/api/v1/catalog/*` 从 DB 查询
- 保持接口 shape 不变

### Phase 5：灰度与回退
目标：平滑切换

任务：
- 引入 `CATALOG_BACKEND`
- 灰度验证结果一致性
- 默认切换到 `postgres`

### Phase 6：后续可选收口
目标：彻底 DB 化

任务：
- 把 `ingests/jobs/audit events/published state` 也迁到 Postgres
- 用 DB 替代当前 JSON store

---

## 12. TDD / 验证方案（供实施阶段使用）

### 12.1 Red 测试建议
1. `catalog-repository.test.ts`
   - `listSkills()` 支持 query
   - `getSkillDetail()` 只返回目标技能
   - `getCategoryDetail()` 支持 sort/q/risk/tag
   - `getAuditVersionDetail()` 返回版本级详情

2. `catalog-projector.test.ts`
   - 从仓库样本投影单技能
   - rebuild 能写出正确 skills/versions/tags 计数
   - 重复执行 idempotent

3. `catalog-api-db.test.ts`
   - `CATALOG_BACKEND=postgres` 时，catalog API 正常返回
   - shape 与当前接口兼容

### 12.2 关键验收命令
```bash
cd apps/market-api && npx vitest run test/catalog-repository.test.ts test/catalog-projector.test.ts test/catalog-api-db.test.ts
npm --workspace @skills/market-api run build
node apps/market-api/dist/scripts/rebuild-catalog-db.js
```

### 12.3 性能验收建议
以 100 skills / 300 versions 为目标数据规模：

- 首页 10 次连续请求平均 < 250ms
- 详情页 10 次连续请求平均 < 150ms
- 排行榜 10 次连续请求平均 < 120ms

---

## 13. 推荐落地结论

为了真正解决“页面加载非常慢”，建议不要继续把 GitLab Raw 当数据库用。

**推荐最终结论：**

1. **GitLab 保留为发布事实源**
2. **PostgreSQL 新增 catalog 读模型**
3. **发布成功后同步投影到 DB**
4. **页面/API 全部从 DB 查询**
5. **提供全量 rebuild 能力，保证 DB 可重建**
6. **分阶段推进：先 public catalog，后 operational state**

这是在当前仓库结构下，最稳、最可控、最能直接改善页面性能的方案。
