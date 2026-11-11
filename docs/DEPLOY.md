# 部署与回滚（统一部署器）

所有部署都必须走 `scripts/deploy.sh`，禁止直接 `pnpm build` 或手改生产。

## 用法

```bash
scripts/deploy.sh deploy [--tag v1.2.3]   # 构建 → 快照 → 切换 → 重启 → 冒烟
scripts/deploy.sh rollback                # 回到上一个成功版本（自动冒烟）
scripts/deploy.sh smoke                   # 只跑基线
scripts/deploy.sh log                     # 最近 20 条部署记录
```

## 它做了什么

| 步骤 | 行为 |
|---|---|
| 构建 | rsync 到 `~/.build-<project>` 构建，线上 `.next` 全程不动（零停机） |
| 快照 | 新版本存 `~/releases/<project>/<tag>/next`，数据库 `pg_dump` 同目录 |
| 切换 | rsync 新构建到线上，`systemctl restart <service>` |
| 冒烟 | 健康检查 / 登录页 / 书库页 / 404 / 静态分片，任一失败即回滚 |
| 回滚 | 切回上一个 `next`，重启并再跑冒烟 |
| 日志 | `~/deploy-log.jsonl`，append-only，含操作者、版本、sha、结果 |

## 保留策略

`releases/<project>/` 保留最近 5 个版本，`current` 指向当前版本。

## 新项目接入清单

1. 复制 `scripts/deploy.sh`，改 `PROJECT/SERVICE/APP_URL`（或用环境变量覆盖）
2. 写该项目的冒烟条目：至少健康检查、首页 200、未登录跳转、一个写接口
3. 演练一次 `deploy` → `rollback`，确认 `current` 指回旧版本

## 已知限制

- **数据库回滚**：`db.dump` 只是快照，`rollback` 不会自动恢复数据库。涉及迁移的改动必须按 expand → migrate → contract 三步走，保证向前兼容。
- 冒烟只覆盖"站点活着"，不覆盖业务正确性；个性化断言由人补充后在 `smoke()` 里扩展。
- 单机环境，没有影子环境；测试环境方案见 `docs/DEPLOY.md` 待办。

## 全部项目接入（gxwtf 组织）

项目清单位于 `deploy/projects.conf`（TAB 分隔）：

```
name   目录   systemd 服务   URL   模式(next|restart)   可接受状态码（可选）
```

统一入口：

```bash
scripts/project.sh list                 # 17 个项目 + 服务状态
scripts/project.sh smoke all            # 全站冒烟
scripts/project.sh smoke gxwriting      # 单站
scripts/project.sh deploy gxreact       # next 模式：构建+快照+切换+冒烟
scripts/project.sh deploy gxquiz        # restart 模式：只重启+冒烟
```

接入新项目：在 `deploy/projects.conf` 加一行，跑一次
`scripts/project.sh smoke <name>` 确认可达，再用
`scripts/project.sh deploy <name>` 演练一次。

### 已知限制

- `restart` 模式不构建、不可回滚（回滚请用 git 切回上一个 commit 后重启）
- 部分 Next 项目（如 gxcountdown）使用 pnpm 10 的 `approve-builds` 机制，
  构建时会因 prisma 等依赖脚本被拦截而失败，需要在项目内执行
  `pnpm approve-builds` 后再部署
- 各项目目前只断言首页可达；业务级断言（登录、读写）需要在 deploy.sh 的
  `smoke()` 里按项目扩展
