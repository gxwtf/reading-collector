# 远程 Agent Brief 写作规范

面向「端上派单 → 远程 agent 执行」的协作模式。本文只讲一件事：**怎么把任务写成远程 agent 能一次做对的 brief**。

## 1. 结论先行

给远程 agent 的 brief，**越像补丁越好**。

远程 agent 没有你的上下文：它看不到你刚才的排查过程，不知道你脑子里那个「显然要改的地方」，也不会主动追问。它唯一的信息来源就是 brief 文本本身。所以 brief 的形态应该接近 `git diff` 的输入侧——明确到「哪个文件的哪一段字符串换成哪一段字符串」，而不是「去把这个 bug 修一下」。

**空转失败的症状**：agent 3 步就调用 `done`，且目标文件根本没被修改。典型过程是：读一次文件 → 读一次 package.json 或随便再读一个文件 → 直接收工，`done` 里写「已分析问题，建议……」这类没有落地的总结。看到这种 `done`，不要重试同一个 brief，要重写 brief。

判断标准很简单：**任务结束后先看 `git status` / `git diff`**。文件没变，就是 brief 的问题，不是模型的问题。

## 2. 好的 brief

一份能用的 brief 至少包含下面五块，缺一块失败率就明显上升。

### 2.1 说清只改哪个文件

- 给出**完整相对路径**，例如 `src/components/reader/DialogShell.tsx`。
- 明确「只改这一个文件」，并说明其他文件一律不动。
- 如果确实需要改两个文件，就写成两个独立任务，不要合并成「顺手把 X 也改一下」。

### 2.2 贴「原字符串 → 新字符串」

最稳的写法是直接给替换对，让 agent 做机械替换：

```
文件：src/components/reader/DialogShell.tsx

原字符串：
  className="fixed inset-0 z-10"

新字符串：
  className="fixed inset-0 z-50"
```

要求：

- 原字符串必须在文件里**唯一**，否则 agent 会替换错位置或替换多处。不确定唯一性时，多带几行上下文。
- 不要写「把 z-index 调大一点」这种需要判断的描述，直接给最终值。

### 2.3 或者给 A/B/C/D 分段替换

改动超过一处时，按段编号，一段一个替换对，顺序执行：

```
A. 第 12 行附近：`z-10` → `z-50`
B. 第 40 行附近：`<div className="overlay">` → `<div className="overlay z-50">`
C. 文件末尾新增：`export const DIALOG_Z = "z-50";`
D. 第 58 行：删除 `console.log(...)` 整行
```

分段的好处是：agent 每完成一段都有明确进度，不会因为「改动太大不知道从哪下手」而提前收工；出问题时也能定位到具体哪一段没执行。

### 2.4 写清禁止项

brief 里必须显式列出禁止行为，否则 agent 会「出于谨慎」去探索：

- 不读 `package.json`、`pnpm-lock.yaml`、`tsconfig.json` 等配置文件（除非任务就是改它们）。
- 不探索目录结构，不 `ls` 全仓库，不搜索无关关键词。
- 不执行 `git push`、不建分支、不提交（除非明确要求）。
- 不动 brief 之外的其他文件，包括「顺手优化」和格式化。
- 不安装依赖，不跑 `pnpm install`。

### 2.5 验收标准与 done 内容

验收命令写死，要求两个命令都 exit 0：

```
验收：pnpm typecheck && pnpm build   # 两条都必须 exit 0
```

`done` 里必须包含：

1. 改了哪些文件、哪些行（或哪几段 A/B/C/D）。
2. 验收命令的实际结果（exit code，失败就贴报错首行）。
3. 是否需要重启服务。

只写「已完成」的 `done` 视为无效交付。

## 3. 反面例子

**2026-11-07 弹窗层级那单**（真实事故，作为标准反例）。

当时的 brief 全文大意：

> 修一个弹窗层级 bug，只改一个文件。

结果：agent 读了两次文件，又去读了 `package.json`，然后调用 `done`，`done` 里写「已定位到层级问题，建议调整 z-index」。**目标文件一个字都没改**，`git status` 干净。整单空转，白烧一轮。

原因拆解：

- 「修一个弹窗层级 bug」是**目标**，不是**指令**。agent 需要自己判断改哪里、改成什么，判断成本高于它的行动预算，于是它选择了成本最低的收工路径。
- 「只改一个文件」但没说是哪个文件，等于没约束。
- 没有验收命令，agent 无法自检，也没有「必须让 build 通过」的压力。

同一单重写后，拆成 **A–F 六段替换**（每段一个唯一原字符串 → 新字符串，含一处新增、一处删除），并附上 `pnpm typecheck && pnpm build` 验收要求，**一次通过**。

结论：同一个模型、同一个仓库，brief 从「描述目标」改成「描述补丁」，结果从空转变为一次过。**brief 的形态决定成败，不是模型能力。**

## 4. 边界

远程 agent 的能力边界要提前写进 brief，避免它尝试后失败、或者假装成功。

### 4.1 远程 agent 现在可以做的事

- **可以自行 `git add` / `git commit` / `git push`**：服务器上的 SSH key 对 `gxwtf/reading-collector` 有写权限，远程 agent 能自己提交并推送到 `main`。brief 里可以直接要求「提交并推送」，不必再留给端上。push 被拒时按 `git pull --rebase origin main` 再 push，最多重试两次。
- **可以重启服务**：`sudo -n systemctl restart gxreading` 与 `sudo -n systemctl restart gxreading-worker` 已在 NOPASSWD 白名单内，无需密码即可执行。查状态用 `sudo -n systemctl is-active gxreading` / `gxreading-worker`。

### 4.2 远程 agent 仍然不能做的事

- **不能装系统包**：`apt` / `apt-get` 一律不执行。
- **不能改 nginx**：站点配置、反代、证书相关文件都不动。
- **不能改 sudoers**：不新增、不修改任何提权规则。
- **不能动数据库**：不跑迁移、不删数据、不改表结构等不可逆操作。
- 不能看界面：无法打开浏览器验证视觉效果，UI 类任务只能靠代码与构建结果验收。
- 不能问用户：没有交互通道，遇到歧义只能按 brief 字面执行或在 `done` 里说明。

### 4.3 必须留在端上的事

- 装系统包、改 nginx、改 sudoers、数据库迁移与删数据等上面列出的禁止项。
- 发 PR、打 tag、发布等超出「提交并推送」的动作。
- 需要肉眼看界面 / 截图对比的验收。
- 需要向用户确认需求、取舍、命名的地方。

### 4.4 `--max-steps` 参考值

步数给太少会逼出「3 步收工」，给太多会让 agent 有余力乱探索。按任务形态给：

| 任务形态 | `--max-steps` |
| --- | --- |
| 只写/改文档 | 15 |
| 单文件补丁（A/B/C/D 分段替换） | 20 |
| 多文件重构 | 40 |

超过 40 步的任务，说明它应该被拆成多个 brief，而不是继续加步数。

- 2026-11-07 实测：远程 agent 用 GIT_SSH_COMMAND='ssh -o BatchMode=yes' git push origin main 成功
- 2026-11-07 实测：远程 agent 用 sudo -n systemctl restart gxreading 重启站点成功
