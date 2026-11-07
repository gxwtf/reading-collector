# 自建 Readest：网页版 + 本地版同步

Readest 官方免费版把第三方同步（WebDAV / Google Drive / S3 / Grimmory）锁在付费计划后面。
我们自建了**网页版**，并给出**本地版自编译**的做法，两边共用同一套同步后端。

## 一、现在能用的地址

| 用途 | 地址 |
| --- | --- |
| 网页版阅读器 | <https://reading.gxwtf.cn/readest> |
| 书库 / 笔记汇总 | <https://reading.gxwtf.cn/books> |
| 同步设置（含账号密码） | <https://reading.gxwtf.cn/readest-setup> |
| WebDAV 书库 | `https://reading.gxwtf.cn/dav`（reader / 见 `.env` 的 `WEBDAV_PASSWORD`） |
| 笔记 API（Grimmory 兼容） | `https://reading.gxwtf.cn`（readest / 见 `.env` 的 `READEST_PASSWORD`） |

服务端组件：

| 组件 | 位置 | 服务 |
| --- | --- | --- |
| Web 版 | `~/readest-web/apps/readest-app/.next/standalone/...` | `gxreadest.service`（127.0.0.1:3020，`READEST_BASE_PATH=/readest`） |
| WebDAV | `~/gxwtf_reading/worker/webdav.py` | `gxreading-dav.service`（127.0.0.1:3011） |
| 笔记 API + 站点 | `~/gxwtf_reading` | `gxreading.service`（127.0.0.1:3005） |
| 反代 | `/etc/nginx/sites-enabled/gxwtf` | `location ~ ^/readest(/|$)` → 3020 |

## 二、为什么免费版不行

`apps/readest-app/src/utils/access.ts`：

```ts
export const CLOUD_SYNC_REQUIRES_PREMIUM = true;   // 改成 false 才解锁
```

`isCloudSyncAllowed()` 直接读它，编译期常量 —— 所以官方安装包装不了，只能自己编。

## 三、网页版怎么构建（已在服务器上跑通）

```bash
cd ~/readest-web
pnpm install
# 打开 basePath（本仓库已改）：apps/readest-app/next.config.mjs
#   basePath: process.env.READEST_BASE_PATH || '',
#   assetPrefix: process.env.READEST_BASE_PATH || '',
cd apps/readest-app
BUILD_STANDALONE=true READEST_BASE_PATH=/readest pnpm build-web
S=.next/standalone/apps/readest-app
cp -r .next/static $S/.next/ && cp -r public $S/
PORT=3020 HOSTNAME=127.0.0.1 node $S/server.js
```

> 注意：`pnpm build-web` 默认走 `output: export`，`next start` 会报
> “does not work with output: export”。必须加 `BUILD_STANDALONE=true` 才是可运行的 Node 服务。

## 四、本地版（桌面 / 手机）怎么编

工具链：Node 20+、pnpm、Rust（rustup）、以及各平台原生依赖。

```bash
git clone https://github.com/readest/readest && cd readest
pnpm install
sed -i '' 's/CLOUD_SYNC_REQUIRES_PREMIUM = true/CLOUD_SYNC_REQUIRES_PREMIUM = false/' \
  apps/readest-app/src/utils/access.ts
```

- **macOS**：`pnpm build-macos-universial` → `.dmg`
- **Windows**：`pnpm build-win-x64`（需在 Windows 上跑）
- **Linux**：`pnpm build-linux-x64` → `.AppImage`
- **iOS**：`pnpm build-ios`（要 Xcode + 开发者账号）；没有账号就用 AltStore / Sideloadly 侧载，
  免费证书 **7 天过期**，到期重新签一次

iOS 侧载要点：改 `bundle id`（别和官方冲突）、填自己的 Team、`--export-method` 用 development。

## 五、装好后怎么连（两种客户端都一样）

1. 设置 → 集成 → **WebDAV**：服务器 `https://reading.gxwtf.cn/dav`、用户 `reader`、密码见 `.env`、根路径 `/`
2. 连上后打开 **上传书籍文件**，把本地书推上去
3. 设置 → 集成 → **Grimmory**：服务器 `https://reading.gxwtf.cn`、用户 `readest`、密码见 `.env`
4. 同步策略建议「总是用最新的」

顺序不能反：Readest 靠「文件大小 + 12 段 1KB 部分 MD5」认书，服务器上没有这本书，笔记就匹配不上。

## 六、验证清单

| 检查 | 方法 | 期望 |
| --- | --- | --- |
| 书上传成功 | `PROPFIND https://reading.gxwtf.cn/dav/ -Depth 1 -u reader:…` | 207，列表里有书名 |
| 服务端认得书 | `GET /api/v1/books`（Bearer token） | 返回 `primaryFile.fileSizeKb` |
| 笔记落库 | `POST /api/v1/annotations` 后 `GET /api/v1/annotations/book/{id}` | 能看到同一条 |
| 网页能看到 | 打开 `/books/{id}` | 引用 + 批注 |

## 七、常见坑

- **`next start` 报 output: export** → 用 `BUILD_STANDALONE=true`
- **nginx 前缀冲突**：`location /readest` 会把 `/readest-setup` 也吞掉，必须用 `location ~ ^/readest(/|$)`
- **Readest 内部链接**：basePath 已处理，但任何写死的 `/api/...` 会 404（我们不依赖它的云 API）
- **浏览器首次加载慢**：网页版要初始化 OPFS 与 WebAssembly，iOS Safari 上首次 5-10 秒属正常
- **侧载过期**：iOS 免费证书 7 天，AltStore 会自动续签，但设备要定期联网
