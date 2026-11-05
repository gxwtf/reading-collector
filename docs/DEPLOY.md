# 部署说明

目标形态：单台主服务器，`reading.gxwtf.cn` → Nginx → `127.0.0.1:3005`，
PostgreSQL 本机 `gxwtf_reading` 库，抓取/转写由独立 worker 进程消费任务。

## 0. 前置

| 项 | 要求 |
| --- | --- |
| Node.js | 20.9+（建议 22 LTS） |
| pnpm | 10.x |
| PostgreSQL | 14+，本机 5432 |
| Python | 3.9+（worker） |
| 外部命令 | `yt-dlp`、`ffmpeg`、`whisper-cli`（whisper.cpp） |

```bash
sudo -u postgres createuser gxwtf --pwprompt
sudo -u postgres createdb gxwtf_reading -O gxwtf
```

## 1. 首次部署

```bash
cd ~ && git clone https://github.com/gxwtf/reading-collector.git gxwtf_reading
cd gxwtf_reading

cp .env.example .env
# 必改：DATABASE_URL、SECRET_COOKIE_PASSWORD（≥32 位随机）、INTERNAL_API_KEY
openssl rand -base64 48   # 拿来生成上面两个密钥

pnpm install
pnpm exec prisma migrate deploy    # 仓库已有迁移时；首次见下一条
pnpm build
```

> **首次还没有迁移文件时**：先在一个能跑 Prisma 的环境（本机 localhost 库）执行
> `pnpm exec prisma migrate dev --name init`，把 `prisma/migrations/` 提交进仓库，
> 之后服务器一律用 `migrate deploy`。不要在生产库上跑 `migrate dev`。

### 注册 systemd 与 Nginx

```bash
sudo cp deploy/gxreading.service deploy/gxreading-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gxreading.service
sudo systemctl enable --now gxreading-worker.service

sudo cp deploy/nginx.conf.example /etc/nginx/conf.d/reading.gxwtf.cn.conf
sudo certbot --nginx -d reading.gxwtf.cn
sudo nginx -t && sudo systemctl reload nginx
```

重启统一走包装脚本：

```bash
sudo /usr/local/sbin/gxwtf-systemctl restart gxreading.service
sudo /usr/local/sbin/gxwtf-systemctl restart gxreading-worker.service
```

### 让 SSO 认这个站

广学账号侧按 `system`（请求 Host）做白名单，**上线前必须让运维把
`reading.gxwtf.cn` 加进 gxaccount 的 system 列表**，否则登录会被拒。
本地联调时 system 是 `localhost:3005`。

## 2. worker

```bash
cd ~/gxwtf_reading/worker
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python3 worker.py --dry-run     # 验证能否领到任务（需要站点已起）
```

`whisper-cli` 与模型：建议模型 `ggml-small.bin`（中英都够用），路径写进 `.env` 的 `WHISPER_MODEL`。
`.env` 里同时要有 `READING_BASE_URL=http://127.0.0.1:3005` 与 `INTERNAL_API_KEY`（与站点一致）。

## 3. 日常发布

```bash
cd ~/gxwtf_reading && git pull
pnpm install                       # 依赖变化时
pnpm exec prisma migrate deploy    # 有迁移时
pnpm build
sudo /usr/local/sbin/gxwtf-systemctl restart gxreading.service
sudo /usr/local/sbin/gxwtf-systemctl restart gxreading-worker.service
```

## 4. 排错

| 现象 | 原因 / 处理 |
| --- | --- |
| `pnpm build` 报 Turbopack 相关错误 | 本仓库固定 `next build --webpack`，别改成默认 Turbopack |
| 登录后立刻跳回 `/login` | gxaccount 白名单没加 `reading.gxwtf.cn`；或 `.env` 的 `SECRET_COOKIE_PASSWORD` 少于 32 位 |
| 登录回调跳到 `http://` | Nginx 没透传 `X-Forwarded-Proto` |
| worker 一直 401 | 站点与 worker 的 `INTERNAL_API_KEY` 不一致 |
| worker 领到任务但条目一直是「抓取中」 | worker 崩了或回填失败，看 `journalctl -u gxreading-worker -f` |
| 公众号/知乎抓不到正文 | 反爬或需登录，属于已知限制；条目会显示失败原因，可重试或手动补正文 |
| 视频转写慢慢慢 | whisper.cpp 是 CPU 推理，40 分钟音频约 3–8 分钟，正常 |

## 5. 备份

数据只有一处权威：PostgreSQL `gxwtf_reading`。建议纳入现有备份脚本：

```bash
pg_dump -U gxwtf -Fc gxwtf_reading > /var/backups/gxwtf_reading_$(date +%F).dump
```

`.env` 与 `prisma/migrations/` 不要丢——前者含密钥，后者是表结构来源。

## 6. 国内服务器补充（gxwtf 主服务器实测）

| 现象 | 处理 |
| --- | --- |
| `git clone/pull` 走 https 超时 | 服务器只有 SSH key 能出网：`git remote set-url origin git@github.com:gxwtf/reading-collector.git` |
| `certbot` 报 `acme-v02.api.letsencrypt.org` 超时 | 本机有 clash（127.0.0.1:7890），用 `sudo env HTTPS_PROXY=http://127.0.0.1:7890 certbot --nginx -d <域名>` |
| worker 抓不到维基/YouTube 等境外站点 | 给 worker 的环境加 `HTTP_PROXY` / `HTTPS_PROXY=http://127.0.0.1:7890`（httpx 自动读取），已写进服务器 `.env` |
| pip 装不上包 | `HTTPS_PROXY=http://127.0.0.1:7890 pip install …` |
| 公网打开是别的站点 | 新 vhost 少了 `listen 127.0.0.1:8143 ssl proxy_protocol;`，见 `/server/realip.md` |

重启服务走白名单包装器，新服务需先加进 `/usr/local/sbin/gxwtf-systemctl` 的 `ALLOWLIST`：

```bash
sudo /usr/local/sbin/gxwtf-systemctl restart gxreading.service
sudo /usr/local/sbin/gxwtf-systemctl restart gxreading-worker.service
```
