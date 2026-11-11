# 怎么改 DSH 配置（给同事）

> 适用于本机任意用户的 DSH 实例。gxwtf 的实例：`127.0.0.1:3081`；
> aabbccddwasd 的主实例：`0.0.0.0:3080`。

---

## 一、先搞清楚：你的 DSH 是哪个

```bash
systemctl --user status dsh-web.service | head -8
```

看两样：`ExecStart` 里的 `--port`，以及 `Environment=DSH_HOME=…`。

**关键原则：每个人只能改自己 `$DSH_HOME` 下的东西。**
gxwtf 的实例读 `/home/gxwtf/.dsh/`，aabbccddwasd 的实例读 `/home/aabbccddwasd/.dsh/`。
互相改不了（文件权限 700），也不需要改——各管各的。

---

## 二、四个文件，各管什么

| 文件 | 作用 | 改了要做什么 |
|---|---|---|
| `~/.dsh/profiles/web/cordis.patch.yml` | **真正的配置**：端口、模型、插件参数、trustedHosts | 重启服务 |
| `~/.dsh/profiles/web/package.json` | 装哪些 bundle / 插件 | `pnpm i` + 重启 |
| `~/.dsh/AGENTS.md` | 用户级记忆，每个会话自动注入 | 不用重启，下次会话生效 |
| `~/.config/dsh-web.env` | 密钥（API key、登录 token），0600 | 重启服务 |

⚠️ **不要改 `cordis.yml`** —— 它只是一个空壳，真正的配置是
"bundles 逐个叠加 + cordis.patch.yml 覆盖"组合出来的。文件里自己写了：
"Edit cordis.patch.yml, not this file."

---

## 三、标准改法（四步）

```bash
# 1. 改
vim ~/.dsh/profiles/web/cordis.patch.yml

# 2. 重启（不是 reload，DSH 没有热重载）
systemctl --user restart dsh-web.service

# 3. 看有没有起来
sleep 3
systemctl --user is-active dsh-web.service
journalctl --user -u dsh-web.service -n 40 --no-pager | tail -20

# 4. 验证端口还通
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3081/
```

如果挂错了进不去，最快的回退：

```bash
cp ~/.dsh/profiles/web/cordis.patch.yml.bak ~/.dsh/profiles/web/cordis.patch.yml
systemctl --user restart dsh-web.service
```

**改之前先备份**，这是唯一能保证 30 秒内恢复的办法：

```bash
cp ~/.dsh/profiles/web/cordis.patch.yml{,.bak-$(date +%m%d-%H%M)}
```

---

## 四、常见的三类改动

### 1. 换模型

```yaml
- id: agent-default-model
  config:
    provider: localserver
    model: deepseek-v4.1-flash     # ← 改这里
    reasoningEffort: high
```

`provider` 必须是已经在 `llm-pi-ai` 里定义过的；只改 `model` 不用动别处。

### 2. 加信任来源（外网访问打不开、/api 403 时）

```yaml
- id: connection
  config:
    trustedHosts: !!js "['39.105.54.184', '你的新域名', ...ctx.webStartup.trustedHosts]"
```

注意 `!!js` 后缀：引号里是 **JS 表达式**，由 loader 求值，不是普通字符串。
这也意味着**不能用 `yaml.safe_load` 校验**这个文件，会报未知标签——正常。

### 3. 关掉/换掉插件

改 `package.json` 的 `dsh.profile.bundles` 数组，然后：

```bash
cd ~/.dsh/profiles/web && pnpm install
systemctl --user restart dsh-web.service
```

本地插件放在 `~/.dsh/plugins/`，`package.json` 里用 `link:../plugins/xxx` 引用。

---

## 五、给同事加"部署规范"（如果你想让大家统一走 project.sh）

gxwtf 的 `~/.dsh/AGENTS.md` 里已经写了 §3.0 部署铁律和 §10 部署体系。
**这些不会自动出现在别人的实例里**，要手动复制。

让同事在自己机器上执行：

```bash
# 5.1 先备份
cp ~/.dsh/AGENTS.md{,.bak-$(date +%m%d-%H%M)}

# 5.2 在文件开头（第一个 ## 之前）插入这一段
cat >> /tmp/dsh-deploy-rule.md <<'MD'
## 部署铁律（优先于下面所有小节）

任何部署都不要手写 build/restart，一律走统一部署器：

```bash
cd ~/gxwtf_reading
scripts/project.sh list              # 17 个项目 + 状态
scripts/project.sh smoke all         # 全站冒烟
scripts/project.sh deploy <name>     # 构建→快照→切换→冒烟（失败自动回滚）
scripts/project.sh rollback <name>   # 回滚（仅 next 模式）
```

**禁止**在项目目录直接 `pnpm build`：Next 会先清空 `.next`，
线上立刻白屏（2026-11-08 实际发生过，约 15 分钟）。

项目清单 `deploy/projects.conf`，日志 `~/deploy-log.jsonl`（自动写，不要手写）。
数据库**不会**随 rollback 回滚，迁移按 expand → migrate → contract 三步走。
MD

# 5.3 合并（手动编辑更稳）
vim ~/.dsh/AGENTS.md   # 把 /tmp/dsh-deploy-rule.md 的内容贴到合适位置
```

不需要改 `cordis.patch.yml`，`AGENTS.md` 是纯文本记忆，下次会话自动生效。

---

## 六、权限边界（重要）

| 想做 | 能不能 |
|---|---|
| 改自己的 `~/.dsh/` | ✅ 直接改 |
| 改 gxwtf 的 `~/.dsh/`（aabbccddwasd 视角） | 需要 `sudo`，且改完要 `chown gxwtf:` 回去，否则 DSH 读不了 |
| 两个实例共用一个 `DSH_HOME` | ❌ 不要。会互相覆盖 session、storage、auth 会话 |
| 改端口撞车（都写 3080） | ❌ Linux 下 `0.0.0.0:3080` 和 `127.0.0.1:3080` 会冲突，后起的 `EADDRINUSE` |

---

## 七、排错速查

| 现象 | 原因 | 处理 |
|---|---|---|
| 重启后 502 / 连不上 | 端口被占 | `ss -lntp \| grep <port>` 看谁占了 |
| 页面能开，/api 全 403 | `trustedHosts` 没加 | 见 §4.2 |
| 登录页一直转 | `DSH_AUTH_TOKEN` 没加载 | 检查 `EnvironmentFile=` 指向的文件存在且 0600 |
| 改了没生效 | 只改 `cordis.yml` 或没重启 | 改 `cordis.patch.yml` + `restart` |
| 服务起不来 | YAML 语法错 | `journalctl --user -u dsh-web.service -n 40`，多半是缩进 |

---

## 八、一句话

**改 `cordis.patch.yml` → 备份 → `systemctl --user restart dsh-web.service` → 看 journalctl → curl 验端口。**
其余都是这三步的变体。配置不分"高级/低级"，只有"重启后能不能起来"。
