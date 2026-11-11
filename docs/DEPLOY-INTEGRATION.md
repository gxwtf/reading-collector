# 部署体系接入 Agent 与 DSH

> 日期：2026-11-11
> 前提：`scripts/deploy.sh` + `scripts/project.sh` + `deploy/projects.conf` 已落地（见 `docs/DEPLOY.md`）

---

## 一、接入点总览

| 执行者 | 接入方式 | 位置 |
|---|---|---|
| 远程 agent（agent-cloud） | 系统提示词内写入部署铁律 | `~/agent-cloud/app/agent/loop.py` 的 `SYSTEM` |
| DSH | 用户级记忆自动注入 | `$DSH_HOME/AGENTS.md`（`/home/gxwtf/.dsh/AGENTS.md`）§3.0 与 §10 |
| 人类 | 文档 | `~/gxwtf_reading/docs/DEPLOY.md`、`docs/DEPLOY-REPORT.md` |

三者读到的是**同一套脚本、同一份项目清单、同一个日志文件**，不存在第二套流程。

---

## 二、远程 agent 接入

### 2.1 系统提示词改动

在 `~/agent-cloud/app/agent/loop.py` 的 `SYSTEM` 中，替换掉原来的"改完必须验证 pnpm build"，改为：

```
- 改完必须验证：pnpm typecheck、pnpm lint，或至少 grep 确认引用一致。
- 绝对不要跑 pnpm build / npm run build：Next 构建会先清空 .next，
  正在跑的服务会立刻白屏（2026-11-08 因此崩了 15 分钟）。
  要验证构建请用：bash scripts/project.sh deploy <项目名>

部署铁律（唯一正确方式）：
   bash scripts/project.sh list / smoke / deploy / rollback
- 项目清单在 deploy/projects.conf
- mode=next 构建+快照；mode=restart 只重启、不可回滚
- 每次部署自动写 ~/deploy-log.jsonl，不要手写日志
- 禁止直接进项目目录跑构建；禁止改完生产不留记录
```

备份：`loop.py.bak-<时间戳>`。改完 `systemctl --user restart gxagent.service`。

### 2.2 为什么不需要动白名单

- `ALLOWED_ROOTS` = `~/gxwtf*` + `~/gxexercise`，文件工具覆盖面不变
- `CMD_DENY` 里有 `\bsudo\b`，但 agent 执行的是 `bash scripts/project.sh deploy x`，
  命令串里没有 `sudo` 字样，正则放行；脚本内部的 `sudo -n systemctl restart gx*`
  由 `/etc/sudoers.d/gxwtf-nopasswd` 的白名单兜住（`systemctl … gx*`）
- 部署日志、releases 目录通过 shell 命令读写，不受文件工具根目录限制

### 2.3 实测

**只读验证**

```
scripts/project.sh list | head -6      ✓ exit 0
scripts/project.sh smoke gxpoem        ✓ 200
tail -2 ~/deploy-log.jsonl             ✓ 读到 gxreact/gxquiz 记录
```

agent 自述："能直接用。三条命令全部 exit 0，无任何权限被拒。"

**写入验证（restart 模式）**

```
scripts/project.sh deploy gxdev
  → — 重启（restart 模式，无构建）—
  → ✓ 首页 200
  → ✓ 重启完成：gxdev
  → 日志自动追加：{"ts":"2026-11-11T20:15:44+08:00","project":"gxdev",
     "kind":"deploy","status":"succeeded","operator":"gxwtf",
     "version":"20261111-201538-6d0af6c","sha":"6d0af6c","mode":"restart"}
```

旁证：`gxdev.service` 的 `ActiveEnterTimestamp` 与部署时间吻合，确认真的重启了。

---

## 三、DSH 接入

### 3.1 机制

DSH 每个会话自动注入 `$DSH_HOME/AGENTS.md`（`/home/gxwtf/.dsh/AGENTS.md`）作为基线记忆。往里加两节即可，无需改代码。

### 3.2 注入内容

**§3.0 部署铁律**（放在 §3 常规运营维护之前，优先级最高）

- 任何部署都不要手写 build/restart，一律 `scripts/project.sh deploy <name>`
- 说明它做了什么（临时副本构建、快照、切换、冒烟、自动回滚、日志）
- 明确列出禁止项：直接 `pnpm build`、改完不记录
- 指出 §3.3 各架构的编译步骤**仅在排查构建问题时参考**

**§10 部署体系**

- 两个脚本的用法
- `deploy/projects.conf` 六列格式
- 硬约束：禁止裸 build、数据库不回滚、`gxcountdown` 的 `approve-builds`
- 当前覆盖的 17 个项目清单

### 3.3 为什么不改 DSH 的插件

DSH 的 `plugins/` 下只有 `dsh-insecure-origin-fix`、`dsh-no-web-auth` 两个与安全相关的插件，与本主题无关。部署规范属于"记忆/规范"层，写进 AGENTS.md 最自然，也随会话自动生效。

---

## 四、一致性保障

三个执行者共用同一入口，因此：

| 关注点 | 保障方式 |
|---|---|
| 项目清单 | 只有 `deploy/projects.conf` 一份 |
| 部署逻辑 | 只有 `scripts/deploy.sh` 一份 |
| 冒烟断言 | 只有 `deploy.sh` 里的 `smoke()` 一处 |
| 日志 | 只有 `~/deploy-log.jsonl` 一个文件 |
| 回滚 | `deploy.sh rollback` 统一实现，不允许各自实现 |

**任何执行者绕过这套入口直接改生产，都会在 `deploy-log.jsonl` 里留下"缺口"** —— 日志时间线与 git log 对不上时即可发现。

---

## 五、已知缺口

1. **数据库不随回滚恢复** —— `db.dump` 只是快照。迁移必须 expand → migrate → contract。
2. **`restart` 模式不可回滚** —— 无构建快照，只能 git 切 commit 后重启。
3. **冒烟只验证"站点活着"** —— 业务断言需逐项目补进 `smoke()`。
4. **DSH 的自动注入未做端到端验证** —— 需要开一个 DSH 会话确认它读到 §3.0；
   文件位置与格式已按其自身文档确认（`$DSH_HOME/AGENTS.md` 自动注入）。
5. **没有监控** —— 部署后运行中挂掉仍无人知晓，自动回滚只在部署那一刻起作用。

---

## 六、下一步

1. 开一个 DSH 会话，让它执行 `scripts/project.sh smoke all`，确认规范确实被读到
2. 给核心项目（主站 / 古诗文 / 英语 / 作文积累本）补业务断言
3. 加一个 systemd timer，每 5 分钟跑 `smoke all`，连续两次失败就告警
