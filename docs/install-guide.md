# 安装与使用手册

本手册面向第一次在本地安装 `skills-factory-cx` 的开发者，覆盖：环境准备、配置、启动、GitLab 发布配置、安装验证、常见问题。

## 1. 项目说明

项目包含 4 个主要部分：

- `market-api`：搜索、导入、审核、发布、安装清单、审计 API
- `ingest-worker`：异步导入队列 worker
- `find-skills`：安装和搜索 CLI
- `@skills/shared`：共享类型、签名、验签工具

默认本地端口：

- `4310`：`market-api`
- `8929`：本地 GitLab HTTP
- `2224`：本地 GitLab SSH
- `5432`：PostgreSQL
- `8081`：Nexus（可选）

## 2. 前置要求

安装前请先准备：

- Node.js `20+`
- npm `10+`
- Docker Desktop 或兼容的 Docker Engine + Compose
- Git
- 至少 `8 GB` 可用内存（GitLab 容器较重）

建议先检查：

```bash
node -v
npm -v
git --version
docker --version
docker compose version
```

## 3. 获取代码

```bash
git clone https://github.com/jyf2100/skills-factory-cx.git
cd skills-factory-cx
```

## 4. 初始化本地配置

复制环境文件：

```bash
cp .env.example .env
```

然后编辑本地 `.env`，至少确认这些变量：

```bash
MARKET_API_PORT=4310
MARKET_API_HOST=127.0.0.1
MARKET_API_BASE_URL=http://127.0.0.1:4310
DATA_DIR=.data
LOCAL_SKILLS_REPO=.data/local-skills-repo
POSTGRES_PASSWORD=请改成你自己的本地密码
GITLAB_ROOT_PASSWORD=请改成你自己的本地密码
GIT_PUSH_BRANCH=main
```

如果你要让审批发布自动推送到本地 GitLab，再额外配置：

```bash
GIT_REMOTE_URL=http://root:<你的 GitLab 密码>@127.0.0.1:8929/root/skills-repo.git
GITLAB_RAW_BASE_URL=http://127.0.0.1:8929/root/skills-repo/-/raw/main
# 若 market-api 跑在 compose 容器里，可选填内部访问地址
GITLAB_FETCH_BASE_URL=http://gitlab:8929/root/skills-repo/-/raw/main
```

如果访问 GitHub / GitLab 需要代理，还可以配置：

```bash
OUTBOUND_PROXY=http://127.0.0.1:7890
```

## 5. 安装依赖并构建

```bash
npm install
npm run build
```

常用脚本：

```bash
npm run dev:api
npm run dev:worker
npm run dev:cli
npm test
```

## 6. 启动方式

### 方式 A：本地 Node 直接运行

适合开发代码时快速调试。

终端 1：

```bash
npm run dev:api
```

终端 2：

```bash
npm run dev:worker
```

终端 3（可选）：

```bash
npm --workspace find-skills run dev -- search sample
npm --workspace find-skills run dev -- source list
```

### 方式 B：Docker Compose 启动服务

适合跑本地完整链路。

先确保已经构建过：

```bash
npm run build
```

启动 API 和 worker：

```bash
docker compose -f infra/docker-compose.yml up -d market-api ingest-worker
```

查看日志：

```bash
docker compose -f infra/docker-compose.yml logs -f market-api ingest-worker
```

停止服务：

```bash
docker compose -f infra/docker-compose.yml down
```

## 7. 启动本地 GitLab

如果你要验证真实 `approve -> publish -> git push -> raw 下载` 链路，需要本地 GitLab。

启动 GitLab：

```bash
docker compose -f infra/docker-compose.yml up -d gitlab
```

查看状态：

```bash
docker compose -f infra/docker-compose.yml ps
```

注意：

- 如果本机已经有独立运行的 `skills-gitlab`，要先停掉，避免 `8929` / `2224` 端口冲突
- GitLab 首次启动通常需要几分钟
- `.env` 中的 `GITLAB_ROOT_PASSWORD` 会作为初始化 root 密码

可用以下命令检查 GitLab 健康：

```bash
curl -I http://127.0.0.1:8929
```

## 8. 在 GitLab 创建发布仓库

本项目默认发布到：`root/skills-repo`

如果这是一个全新的 GitLab 实例，需要先创建仓库。可以登录 Web 界面创建，也可以进入容器执行脚本。

示例：

```bash
docker exec infra-gitlab-1 gitlab-rails runner "project = Projects::CreateService.new(User.find_by_username('root'), { name: 'skills-repo', path: 'skills-repo', namespace_id: User.find_by_username('root').namespace.id, visibility_level: Gitlab::VisibilityLevel::PRIVATE }).execute; puts(project&.full_path || project.errors.full_messages)"
```

创建后，确认 `.env` 中的地址可访问：

```bash
git ls-remote "http://root:<你的 GitLab 密码>@127.0.0.1:8929/root/skills-repo.git"
```

可访问的前台页面：

- `/`：技能目录首页
- `/skills/:skillId`：技能详情页
- `/leaderboard`：内部排行榜
- `/audits`：内部审计专页
- `/audits/:skillId`：单技能审计详情页
- `/categories`：分类浏览页
- `/categories/:slug`：分类独立详情页

## 9. 最小使用流程

### 9.1 打开审核台

浏览器打开：

```text
http://127.0.0.1:4310/review
```

### 9.2 搜索并导入 Skill

也可以直接走 API：

```bash
curl -sS -X POST http://127.0.0.1:4310/api/v1/ingest/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"sample"}'
```

### 9.3 审批发布

审批接口：

```bash
curl -sS -X POST http://127.0.0.1:4310/api/v1/reviews/<ingest_id>/approve \
  -H 'Content-Type: application/json' \
  -d '{"reviewer":"admin","note":"approve"}'
```

如果配置了 `GIT_REMOTE_URL`，审批时会：

- 生成包和元数据
- 生成 attestation / signature
- 提交到本地发布仓库
- 自动 `git push`

### 9.4 获取安装清单

```bash
curl -sS http://127.0.0.1:4310/api/v1/install/<skill_id>/<version>
```

如果配置了 `GITLAB_RAW_BASE_URL`，这里返回的 `package_url` 会直接指向本地 GitLab Raw 地址。

### 9.5 用 CLI 安装

```bash
npm --workspace find-skills run dev -- install \
  --from http://127.0.0.1:4310 \
  <skill_id> <version>
```

## 10. 验证清单

建议至少验证以下几项：

```bash
curl -sS http://127.0.0.1:4310/healthz
curl -sS http://127.0.0.1:4310/api/v1/public-key
docker compose -f infra/docker-compose.yml ps
npm test
```

如果发布链路已开启，再验证：

```bash
curl -I http://127.0.0.1:8929/root/skills-repo/-/raw/main/packages/<skill_id>/<version>.tgz
```

期望结果：

- `market-api` 健康检查返回 `200`
- `review` 页面可打开
- 审批成功后能获取安装清单
- GitLab Raw 包地址返回 `200`

## 11. GitHub 上传安全校验

仓库已内置 GitHub Actions：

- 工作流文件：`.github/workflows/upload-security-guard.yml`
- 触发时机：`push`、`pull_request`、手动触发
- 当前校验：`gitleaks` 明文凭据扫描

建议你在 GitHub 仓库设置里开启：

- Branch protection for `main`
- Require status checks to pass
- 把 `Upload Security Guard` 设为必过项

## 12. 常见问题

### 12.1 `git push` 失败

检查：

- `.env` 里的 `GIT_REMOTE_URL` 是否使用了正确密码
- GitLab 是否已启动
- `root/skills-repo` 是否已创建

### 12.2 安装清单返回了错误地址

检查：

- `.env` 的 `GITLAB_RAW_BASE_URL` 是否仍是 `http://127.0.0.1:8929/...`
- 如果改了 compose 启动命令，记得用 `docker compose up -d` 重建容器，而不是只 `restart`

### 12.3 Docker 内访问不到 GitLab

这是正常的：容器内不能直接把宿主机的 `127.0.0.1` 当成 GitLab。

本项目 compose 已经做了兼容：

- 优先走容器网络内的 `gitlab`
- 不存在时回退到 `host.docker.internal`

### 12.4 端口冲突

检查是否已有其他进程占用了：

- `4310`
- `8929`
- `2224`
- `5432`

## 13. 推荐首次安装顺序

```bash
git clone https://github.com/jyf2100/skills-factory-cx.git
cd skills-factory-cx
cp .env.example .env
# 编辑 .env
npm install
npm run build
docker compose -f infra/docker-compose.yml up -d gitlab
docker compose -f infra/docker-compose.yml up -d market-api ingest-worker
curl -sS http://127.0.0.1:4310/healthz
open http://127.0.0.1:4310/review
```

如果只想本地开发，不跑完整发布链路，也可以跳过 GitLab，只启动 `market-api` 和 `ingest-worker`。
