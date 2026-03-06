# 2026-03-06 导入 everything-claude-code 到本地技能市场

## Analysis

### 现状
- 目标仓库 `https://github.com/affaan-m/everything-claude-code` 包含大量 `SKILL.md`，既有 `.agents/skills/*` 主技能，也有 `.cursor/skills/*` 和 `docs/*` 多语言副本。
- 现有 `importSkillFromSource()` 只会从一个仓库里挑选单个 `SKILL.md`，不适合直接导入整仓多个技能。
- 现有 `publishSkill()` 已具备完整发布能力：写入本地发布仓库、生成包与元数据、更新 `skills-index.json`、并推送到本地 GitLab 远端。

### 约束
- 不修改现有导入器逻辑，避免扩大影响面。
- 只发布一套 canonical 技能，避免把文档翻译副本也发布进市场。
- 当前本地市场访问端口已切到 `4311`。

### 成功标准
1. 仅发布目标仓库 `.agents/skills/*` 下的 16 个主技能。
2. 发布后本地 GitLab 仓库 `index/skills-index.json` 包含这些技能 ID。
3. `market-api` 页面/API 可看到至少一个新技能。
4. 发布过程中不修改业务代码；仅记录计划文档。

## Design

### 方案 A：直接调用现有 ingest API 导入仓库根
- 优点：复用现成 API。
- 缺点：只会挑选单个 `SKILL.md`，无法满足整批技能导入需求。

### 方案 B：临时脚本批量发布 `.agents/skills/*`
- 优点：复用 `scanner` / `sandbox` / `publishSkill`，不改业务代码；可精确控制只发布主技能目录。
- 缺点：需要一次性运行临时脚本，并同步写入状态与审计事件。

### 推荐
- 采用方案 B。
- 使用临时 Node 脚本读取 `.env` 和现有配置，遍历 `.agents/skills/*`，为每个目录构造 `IngestRecord` 与 `ReviewDecision`，调用 `publishSkill()` 完成本地市场发布。

## Plan

### Task 1: Red — 导入前检查
- **Commands**:
  - 查看目标仓库 `.agents/skills/*` 清单
  - 检查本地发布索引中是否尚未包含代表性技能（如 `api-design`）
- **Expected**:
  - 目标 16 个技能待导入
  - 当前索引不包含这些新技能或不完整

### Task 2: Green — 批量发布到本地市场
- **Commands**:
  - 运行临时发布脚本，遍历 `.agents/skills/*`
  - 调用 `publishSkill()` 生成包、元数据、索引并推送本地 GitLab
- **Expected**:
  - 发布完成且无报错
  - 本地 GitLab 原始索引和包路径可读

### Task 3: Review — 页面/API 验证
- **Commands**:
  - 读取本地 `skills-index.json`
  - 调用 `/api/v1/catalog/skills?query=api-design`
  - 必要时重启 `market-api`
- **Expected**:
  - 至少一个代表性技能在页面/API 中可见
