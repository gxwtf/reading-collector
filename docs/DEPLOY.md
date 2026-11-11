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
