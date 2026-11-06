# 构建与部署

## 服务器信息

| 项 | 值 |
| --- | --- |
| 域名 | `reading.gxwtf.cn` |
| 项目目录 | `~/gxwtf_reading` |
| 端口 | `3005` |
| 服务 | `gxreading.service` + `gxreading-worker.service` |
| 数据库 | PostgreSQL `gxwtf_reading` |
| 证书 | `/etc/letsencrypt/live/reading.gxwtf.cn/`（certbot 自动续签） |
| 媒体缓存 | `~/reading-media/<entryId>.mp4`（精确播放用） |

## 上线流程

```bash
cd ~/gxwtf_reading
git pull
pnpm install                       # 依赖变化时
pnpm exec prisma migrate deploy    # 有迁移时
pnpm test                          # lib 单元测试
pnpm typecheck                     # 类型检查
pnpm build                         # 必须先构建成功
sudo /usr/local/sbin/gxwtf-systemctl restart gxreading.service
sudo /usr/local/sbin/gxwtf-systemctl restart gxreading-worker.service
curl -s localhost:3005/api/health  # {"ok":true,"db":"up"}
sh scripts/smoke.sh http://127.0.0.1:3005
```

> 构建脚本固定 `next build --webpack`，不要改回 Turbopack。

## worker

```bash
cd ~/gxwtf_reading/worker
python3 worker.py --once     # 处理一条，调试用
python3 worker.py --dry-run  # 只领取不回填
```

依赖：`httpx`、`trafilatura`、`yt-dlp`、`ffmpeg`、`whisper-cli`（模型默认 `ggml-tiny.bin`）。
`.env` 里需要 `INTERNAL_API_KEY`、`WHISPER_MODEL`、`WHISPER_CLI`、`HTTP(S)_PROXY`（服务器出网受限）。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| 502 | `journalctl -u gxreading`；多半是构建失败没产物 |
| 登录后跳回 /login | 广学账号白名单没加 `reading.gxwtf.cn`，或 cookie 密钥不足 32 位 |
| 回调跳到 http | Nginx 没透传 `X-Forwarded-Proto` |
| 公网打开是别的站 | 少了 `listen 127.0.0.1:8143 ssl proxy_protocol;` |
| worker 一直 401 | 两边 `INTERNAL_API_KEY` 不一致 |
| B 站转写失败 | 检查代理；`yt-dlp` 需要 `HTTP_PROXY` |
| 精确播放准备卡住 | `pending` 超 30 分钟可重新点「准备视频」 |
