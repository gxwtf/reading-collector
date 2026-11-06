# Agent 自我改进循环（Self-improve Loop）

目标：让 agent 每次都以**可验证的小步**改进代码，而不是一次改一大片。

## 循环

```
1. 度量（selfcheck）
   sh scripts/selfcheck.sh --build
   ↓ 得到：测试/类型/构建是否通过 + 异味计数 + 过时依赖

2. 选一件事
   · 有失败项 → 先修失败的（优先级最高，永远只修一个）
   · 全绿 → 从下面挑一条：
     a. 异味计数最高的那一类（TODO / console.log / as never）
     b. 一个文件里最长的函数（拆分）
     c. 一处会被误用的 API（补校验或类型）
     d. 一条没有测试的纯函数（补测试）

3. 改
   · 只动一个关注点；不顺手重排、不改格式
   · 涉及部署行为（用例、状态、路由）先想回滚路径

4. 验证
   pnpm test && pnpm typecheck && pnpm build
   （UI 改动再看一眼浅色/深色、桌面/手机）

5. 提交
   Conventional Commits + 中文；提交信息里写「为什么改」而不是「改了什么」

6. 部署（可选）
   构建通过才部署；部署后 curl /api/health + sh scripts/smoke.sh
   失败就回滚上一个提交，别在线上 debug
```

## 硬规则

- **一次只修一个失败项**：多个改动混在一起，出错时无法定位
- **不允许跳过验证**：`--no-verify`、假测试、注释掉断言都算违规
- **不碰生产数据**：需要迁移时先 `prisma migrate diff` 看 SQL，确认可逆再执行
- **不为了指标好看而删能力**：异味计数是线索，不是目标
- **改不动就停**：连续两轮没有进展，写下「卡在哪、需要什么信息」，交回给人

## 度量口径

`scripts/selfcheck.sh` 输出四类信号：

| 信号 | 含义 |
|---|---|
| 测试 / 类型 / 构建 | 硬门槛，红即停 |
| `TODO` / `FIXME` | 未完成或已知缺陷 |
| `console.log` | 调试残留（`error` 日志不算） |
| `as never` | 类型逃逸，通常是该抽类型了 |

## 何时跑

- 用户说「自我提升 / 优化代码 / 体检」
- 每次大功能落地后
- 定时任务（如需要）：`minis-scheduled create --prompt "跑一轮自我改进循环" --interval 6h`
  （iOS 上 app 不常驻，定时只在 app 存活时可靠触发；重要检查请用 Apple Shortcuts 自动化）
