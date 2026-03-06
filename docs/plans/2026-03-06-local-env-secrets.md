# 2026-03-06 Local env secrets

## Analysis

- 仓库里跟踪了两个明文密码：`GITLAB_ROOT_PASSWORD` 与 `POSTGRES_PASSWORD`。
- `GITLAB_ROOT_PASSWORD` 同时出现在 `.env.example` 和 `infra/docker-compose.yml`。
- `POSTGRES_PASSWORD` 出现在 `infra/docker-compose.yml`。
- 本地 `.env` 已被 `.gitignore` 排除，适合作为开发机密钥承载位置。

## Design

### 方案 A：继续写死在 compose
- 优点：最省事。
- 缺点：继续把敏感信息留在仓库里，不可接受。

### 方案 B：改用本地 `.env` 注入
- 优点：密码移出版本库，兼容当前 compose 启动方式，改动最小。
- 缺点：首次拉仓库后需要本地填写 `.env`。

### 推荐
- 采用方案 B。

## Plan

1. 把本地 `.env` 补齐 `POSTGRES_PASSWORD` 与 `GITLAB_ROOT_PASSWORD`。
2. 修改 `infra/docker-compose.yml`，让 `postgres` 与 `gitlab` 通过 `env_file` 读取本地 `.env`。
3. 修改 `.env.example` 为占位符，不再提交真实密码。
4. 更新 `README.md`，说明 compose 所需本地环境变量。
5. 用 `docker compose -f infra/docker-compose.yml config` 验证配置仍可解析。
