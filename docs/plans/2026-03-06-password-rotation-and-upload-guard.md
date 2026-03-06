# 2026-03-06 Password rotation and upload guard

## Analysis

- `main` 历史已经清理，但本地运行中的 GitLab root 口令仍需轮换。
- 本地 `.env` 承载 compose 运行密码，并已被 `.gitignore` 排除。
- 仓库还没有 GitHub Actions，缺少 push/PR 时的自动安全检查。

## Design

### 方案 A：只改 `.env`
- 优点：快。
- 缺点：运行中的 GitLab 仍保留旧 root 密码，不足以完成真实轮换。

### 方案 B：改 `.env` + 更新运行中服务 + 加 GitHub secret scan
- 优点：本地运行态与配置一致，后续 push/PR 自动拦截明文泄露。
- 缺点：需要容器内执行一次密码修改命令。

### 推荐
- 采用方案 B。

## Plan

1. 在本地 `.env` 中生成并写入新的 `GITLAB_ROOT_PASSWORD` 与 `POSTGRES_PASSWORD`。
2. 同步更新 `.env` 里的 `GIT_REMOTE_URL` 凭据。
3. 对运行中的 GitLab 执行 root 密码轮换。
4. 重建 `market-api` 与 `ingest-worker` 容器，使其加载新的 `.env`。
5. 新增 GitHub Actions 工作流，在 `push` / `pull_request` 时运行 `gitleaks`。
6. 验证 compose 配置、GitLab 认证和 GitHub 工作流文件状态。
