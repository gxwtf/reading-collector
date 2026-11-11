# 以后怎么开发（2026-11-11 版）

> 这份是给"人"看的流程。Agent 和 DSH 的部署规范在 `docs/DEPLOY-INTEGRATION.md`，
> 具体命令在 `docs/DEPLOY.md`。三者是同一套东西。

---

## 一、先分清三种工作方式

| 场景 | 用什么 | 典型耗时 |
|---|---|---|
| 单点改动（改文案、调样式、修 bug） | **DSH 或 Claude Code 直接改**，改完 `deploy` 验证 | 10–30 分钟 |
| 批量/长任务（扫全仓、跨多文件重构、批量补测试） | **远程 agent** 派单 | 10–60 分钟 |
| 设计决策、数据库迁移、核心项目上线 | **人**（你）拍板 | — |

判断标准很简单：**能不能一次说清要改哪个文件的哪几行**。能 → DSH；不能 → 派 agent。

---

## 二、日常开发的标准动作

### 1. 开始前

```bash
cd ~/gxwtf_reading      # 部署器在这里（只此一份）
scripts/project.sh list # 看 17 个项目的状态
```

改哪个项目就进哪个目录，`git status` 确认工作区干净。

### 2. 改代码

按项目既有风格改，不做顺手重构。改完**必须**：

```bash
pnpm typecheck      # 或 npx tsc --noEmit
pnpm lint           # 有配的话
```

**不要在这时候跑 `pnpm build`** —— 会清空 `.next`，线上立刻白屏。构建交给部署器。

### 3. 验证构建（不碰线上）

```bash
cd ~/gxwtf_reading && scripts/project.sh deploy <项目名>
```

它会：临时副本构建 → 快照 → 切换 → 重启 → 冒烟。失败自动回滚。

如果只是想确认"能编译"，又不想重启服务：

```bash
cd ~/gxwtf_reading
PROJECT=<项目名> bash -c '. scripts/deploy.sh; build_only'
```

（构建产物落在 `~/.build-<项目>`，不影响线上。）

### 4. 出问题

```bash
scripts/project.sh rollback <项目名>   # next 模式，切回上一版
scripts/project.sh smoke <项目名>      # 只验证线上还活着
scripts/project.sh log                 # 看谁在什么时候部署了什么
```

`restart` 模式的项目没有快照，只能 `git checkout <上一个 commit>` 后重新 `deploy`。

### 5. 收尾

```bash
git add <明确路径>     # 不要 git add -A，工作区常有别人的 WIP
git commit -m "fix(范围): 中文描述"
git push
```

---

## 三、数据库改动：唯一必须遵守的硬规则

**永远分两次发布，不要一次改完。**

```
第一次发布（expand）
  ├─ 只加字段/表，且有默认值或允许 NULL
  ├─ 代码同时兼容新旧两种结构
  └─ 部署 → 观察一天

第二次发布（contract）
  ├─ 代码只走新结构
  └─ 再单独一次发布才删旧字段
```

理由：**`rollback` 只回代码，不回数据库**。如果一次发布里"删了列"，回滚后的旧代码读不到那一列，直接 500。

具体命令照旧：

```bash
npx prisma migrate dev --name 起个好名字
npx prisma generate
```

`pnpm dlx` 在本机有 bug，用 `npx`。

---

## 四、核心项目 vs 非核心

| 类型 | 项目 | 上线方式 |
|---|---|---|
| 核心 | 主站 gxwtf、古诗文 gxpoem、英语 gxenglish、作文积累本 gxwriting | 改完先冒烟，**工作日白天上线**，出问题立刻 `rollback` |
| 题库 | gxexercise（ti.gxwtf.cn） | Beta，可直接上，但要留记录 |
| 其他 | 账号、倒数日、将军棋、genbot、相册、projects… | 随时上 |

"记录"不需要额外动作——只要走 `deploy.sh`，`~/deploy-log.jsonl` 自动有。

---

## 五、什么时候派 agent，怎么派

**适合派：**

- "扫一遍所有项目，找出还在用旧 API 的地方"
- "把这 5 个文件的 `console.log` 清掉"
- "给 X 项目补 10 条冒烟断言"
- "调研 Y 方案，写一份文档"

**不适合派：**

- 改一行字（沟通成本大于动手）
- 需要你现场看效果调样式的
- 涉及数据库迁移的（必须人盯）

**派单写法**（这是有效率的唯一方式）：

```
在这次任务里只做三件事，按顺序：
1) 改 src/app/books/page.tsx 第 60 行附近：把「云书库」换成「广学读书」
2) 跑 pnpm typecheck，必须 exit 0
3) bash scripts/project.sh deploy gxreading，把输出贴进 done

不要探索其它文件，不要读 node_modules，不要 git push。
```

关键：**指定文件 + 原字符串→新字符串 + 明确的验收命令 + 禁止探索**。写成"帮我优化一下书库页"这种，会烧掉几百步还做不完。

---

## 六、绝对不要做的事

| 禁止 | 后果 |
|---|---|
| 在项目目录 `pnpm build` | 清空 `.next`，线上白屏（2026-11-08 发生过，15 分钟） |
| `git add -A` | 会把别人的 WIP 一起提交 |
| 改完生产不记录 | 日志与 git log 对不上，出问题查不到源头 |
| 一次发布里删列/改类型 | 回滚后旧代码崩 |
| 直接 `scp` 覆盖生产文件 | 没有快照，退不回去 |
| 同时改多个项目再统一部署 | 出问题分不清是谁的锅 |

---

## 七、一个完整的例子

需求：书库页按钮文案改成「广学读书」。

```bash
cd ~/gxwtf_reading

# 1. 改
vim src/app/books/page.tsx          # 改文案

# 2. 自查
pnpm typecheck                       # exit 0

# 3. 部署（构建+快照+重启+冒烟，约 1 分钟）
scripts/project.sh deploy gxreading

# 4. 看一眼
curl -s https://reading.gxwtf.cn/books | grep -o 广学读书

# 5. 提交
git add src/app/books/page.tsx
git commit -m "chore(书库): 云书库改名广学读书"
git push
```

出问题：

```bash
scripts/project.sh rollback gxreading   # 10 秒回到上一版
```

---

## 八、还没做的（别以为已经有了）

- **业务冒烟**：现在只验证"首页 200"，不验证"下单能成功"。核心项目的登录/读写断言还没写。
- **监控告警**：部署后运行中挂掉，没人知道。建议加一个 timer 每 5 分钟 `smoke all`。
- **影子环境**：没有第二套环境，"先测试再上线"目前等于"直接上线后冒烟"。

这三件事按顺序做，比任何"AI 自动上线"都值钱。
