# 2026-03-05 Local Skills Market Implementation

## Scope

- 实现端到端主链路：导入 -> 扫描 -> 审批 -> 发布 -> 安装验签
- 提供 `market-api` 与 `find-skills` CLI
- 提供最小审核控制台和自动化测试

## Decisions

- 技术栈：TypeScript/Node.js
- 数据层：MVP 使用 JSON store，接口保留可迁移性
- 签名：ed25519
- 沙箱：优先 podman，其次 docker，均不存在则返回 `ran=false`

## Delivered Files

- `apps/market-api/*`
- `packages/find-skills/*`
- `packages/shared/*`
- `infra/docker-compose.yml`
- `README.md`

## Validation Commands

```bash
npm install
npm run build
npm test
```

## Known Gaps

- 未接入真实 PostgreSQL schema/migration
- 审核控制台仍为单文件 HTML 控制台（MVP 级）
