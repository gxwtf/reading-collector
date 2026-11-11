# 部署体系改造报告

> 日期：2026-11-11
> 范围：广学（gxwtf）全部 17 个项目
> 依据：《项目上线 Agent 第二版方案（修订稿）》第一阶段

---

## 一、一句话结论

把"AI 自主上线"改成"受控流程执行者"：**固定基线保底、快照可回滚、日志可审计**。第一阶段（不依赖 AI 决策的部分）已全部落地，17 个项目全部接入。

---

## 二、做了什么

### 1. 统一部署器 `scripts/deploy.sh`

| 子命令 | 作用 |
|---|---|
| `deploy [--tag v1.2.3]` | 构建 → 快照 → 切换 → 重启 → 冒烟 |
| `rollback` | 切回上一个成功版本，重启并再跑冒烟 |
| `smoke` | 只跑冒烟基线 |
| `log` | 最近 20 条部署记录 |

**关键设计：零停机**

构建在 `~/.build-<project>` 临时副本里进行（rsync 项目 → 硬链接复制 node_modules → 构建），全程不碰线上 `.next`；构建成功后才 rsync 回线上并重启。

这是 11-08 两次事故的直接产物：那次在仓库里裸跑 `pnpm build`，Next 先清空 `.next`，正在跑的服务立刻白屏 15 分钟。

**版本与回滚**

```
~/releases/<project>/<tag 或 时间-sha>/
├── next/        构建产物
└── db.dump      数据库快照
~/releases/<project>/current -> 上面某个版本（符号链接）
```

保留最近 5 个版本；`rollback` 会跳过符号链接、跳过当前版本、跳过失败版本。

**冒烟基线**

- `reading`：5 条（健康检查、登录页、未登录跳转、404、静态分片可访问）
- 其他项目：首页可达 + 项目可接受状态码（清单第 6 列）

### 2. 部署日志 `~/deploy-log.jsonl`

append-only，每行一个 JSON：

```json
{"ts":"2026-11-11T20:00:18+08:00","project":"reading","kind":"deploy",
 "status":"succeeded","operator":"gxwtf","version":"v-test",
 "sha":"782aeef","rollback_from":"20261111-195823-782aeef"}
```

### 3. 全项目接入 `deploy/projects.conf` + `scripts/project.sh`

```
name<TAB>目录<TAB>systemd 服务<TAB>URL<TAB>模式(next|restart)<TAB>可接受状态码
```

两种模式：

- **next**：Next.js 类项目，构建 + 快照 + 可回滚
- **restart**：无构建产物或非 Next 项目，只重启 + 冒烟

统一入口：

```bash
scripts/project.sh list           # 17 个项目 + 运行状态
scripts/project.sh smoke all      # 全站冒烟
scripts/project.sh deploy <name>  # 部署
scripts/project.sh rollback <name>
```

---

## 三、验证记录

### 全站冒烟：17 个站点，0 失败

```
✓ gxwtf        https://gxwtf.cn              200
✓ gxreact      http://127.0.0.1:3002         200
✓ gxquiz       https://quiz.gxwtf.cn         200
✓ gxaccount    https://account.gxwtf.cn      200
✓ gxpoem       https://poem.gxwtf.cn         200
✓ gxcountdown  https://countdown.gxwtf.cn    200
✓ gxexercise   https://ti.gxwtf.cn           200
✓ gxenglish    https://english.gxwtf.cn      200
✓ gxwriting    https://writing.gxwtf.cn      200
✓ gxgen_client https://generals.gxwtf.cn     200
✓ gxgen_server https://api.generals.gxwtf.cn 200
✓ gxgenbot     https://genbot.gxwtf.cn       405（POST-only）
✓ gxphotos     https://photos2.gxwtf.cn      200
✓ gxface       https://face.gxwtf.cn         404（API 根路径）
✓ gxdev        https://dev.gxwtf.cn          200
✓ gxprojects   https://projects.gxwtf.cn     200
✓ gxreading    https://reading.gxwtf.cn      200
```

### 部署与回滚演练

```
reading（next）   deploy → ✓ 成功 → rollback → ✓ 回滚到上一版 → 冒烟 0 失败
gxreact（next）   deploy → ✓ 构建完成 → ✓ 冒烟 0 失败
gxquiz（restart） deploy → ✓ 重启完成 → ✓ 冒烟 0 失败
```

### 日志验证

```
2026-11-11T20:00:18  reading  deploy/succeeded    v-test
2026-11-11T20:00:24  reading  rollback/succeeded
```

---

## 四、过程中修掉的真 bug

| # | 问题 | 根因 | 修法 |
|---|---|---|---|
| 1 | 回滚等于"回滚到当前版本"，白跑一遍 | `prev` 指向 `current` 符号链接 | 跳过符号链接、当前版本、失败版本 |
| 2 | 日志 JSON 被转义污染，值里全是反斜杠 | 在 shell 里手拼 JSON | 改成 `log_event kind status key=value`，由 Python 组 JSON |
| 3 | Turbopack 报 `node_modules points out of the filesystem root` | 用符号链接指向项目外目录 | 改 `cp -al` 硬链接复制 |
| 4 | 非 reading 项目冒烟全红 | 断言写死了 `/api/health` | 按项目分流：reading 跑 5 条，其余只查首页 |
| 5 | API 项目根路径 404/405 被误判失败 | 断言没有"预期状态码"概念 | 清单加第 6 列 |
| 6 | 内网地址（127.0.0.1:3002）被 `--resolve` 弄坏 | 统一加了 `--resolve` | 按 URL 是否为回环地址分支 |

---

## 五、与第二版方案的对应

| 方案要求 | 状态 |
|---|---|
| 固定冒烟基线 | ✅ 已建立，17 个项目全部有 |
| 部署前版本快照 | ✅ 构建产物 + db.dump |
| 固定回滚脚本（不 AI 现生成） | ✅ `deploy.sh rollback` |
| append-only 部署日志 | ✅ `~/deploy-log.jsonl` |
| 零停机部署 | ✅ 临时副本构建 |
| 禁止裸 `pnpm build` | ✅ 写入 `docs/AGENT-BRIEF.md` |
| 测试环境（影子） | ❌ 未做（单机无第二套） |
| 自动上线决策 | ❌ 明确不做（第一阶段） |
| 监控告警 | ❌ 未做 |

---

## 六、已知限制（必须知道）

1. **`restart` 模式不可回滚** —— 没有构建快照，回滚只能靠 git 切 commit 后重启。
2. **数据库不会自动回滚** —— `db.dump` 只是快照。涉及迁移的改动必须按 expand → migrate → contract 三步走，保证向前兼容；否则"5 分钟回滚"是假的。
3. **`gxcountdown` 构建失败** —— 它用 pnpm 10 的 `approve-builds` 机制，prisma 等依赖的构建脚本被拦截。需要在项目里执行一次 `pnpm approve-builds`。
4. **冒烟只覆盖"站点活着"** —— 不验证业务正确性。业务断言要人工补进 `smoke()` 并逐项目扩展。
5. **没有影子环境** —— 所有"部署到测试环境"的流程目前无法执行。
6. **没有监控** —— 部署后运行中挂掉，仍然无人知晓；自动回滚只在部署那一刻起作用。

---

## 七、建议的下一步

**优先级 1：补业务断言**

当前每项目只查首页。至少给核心项目（主站、古诗文、英语、作文积累本）加：

- 未登录访问受保护页 → 302/307
- 登录后访问核心页 → 200 且含关键字
- 关键写接口 → 200 且能读回

**优先级 2：数据库迁移规范**

在 `docs/DEPLOY.md` 之外单独写一份：字段只增不删、迁移必须两步发布（先加列再切代码）、回滚只回代码不回库。

**优先级 3：最小监控**

不需要复杂系统，一个 systemd timer 每 5 分钟 curl 全部项目的首页，连续 2 次失败就往群里发消息。这比任何"自动上线"都更有价值。

**优先级 4：影子环境（可选）**

同机不同端口 + 独立数据库，只给核心项目用。做完才能讲"部署到测试环境"。

---

## 八、一句话提醒

这套东西的价值不在"自动化"，而在**把每次部署变成可追溯、可复现、可回退的动作**。真正的风险从来不是"AI 会不会写错代码"，而是"出了问题没人知道、也退不回去"。
