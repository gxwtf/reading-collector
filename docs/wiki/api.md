# 开放 API

给脚本、快捷指令、个人 Obsidian 项目回灌链接用。认证走 Bearer，不依赖登录态。

## 配置

服务器 `~/gxwtf_reading/.env`：

```env
SECRET_API_KEY=<随机 48 位十六进制>
API_USER_ID=2691          # 这些请求记到哪个广学账号名下
```

改完 `sudo /usr/local/sbin/gxwtf-systemctl restart gxreading.service`。

## 入库

```bash
curl -X POST https://reading.gxwtf.cn/api/v1/entries \
  -H "Authorization: Bearer $SECRET_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "urls": ["https://mp.weixin.qq.com/s/xxx", "https://www.bilibili.com/video/BV1xx"],
    "tags": ["公众号", "视频"],
    "collectionId": 1
  }'
```

返回：

```json
{ "ok": true, "added": 1, "skipped": 1, "count": 2 }
```

- `added`：新入库；`skipped`：重复链接（只补标签/分组）
- 入库后自动排队：文章走 `fetch`，视频/播客走 `transcribe`

## 列表

```bash
curl https://reading.gxwtf.cn/api/v1/entries?limit=20 \
  -H "Authorization: Bearer $SECRET_API_KEY"
```

返回最近条目（id / 标题 / 链接 / 类型 / 阅读状态 / 抓取状态 / 创建时间）。

## 错误

| 状态码 | 含义 |
| --- | --- |
| 401 | 缺少或错误的 Bearer |
| 500 | 服务端没配 `SECRET_API_KEY` 或 `API_USER_ID` |
| 400 | 没有可识别的链接 |

## 其他内部接口

| 接口 | 用途 |
| --- | --- |
| `GET /api/health` | 健康检查（DB 延迟、uptime） |
| `GET /api/export?ids=1,2&format=md\|json` | 导出选中条目（需登录态） |
| `/api/media/<id>/*` | 精确播放的转码、状态与文件流（需登录态） |
| `/api/worker/jobs*` | worker 领任务/回填（`INTERNAL_API_KEY`） |
| `/api/bilibili/fav`、`/api/bilibili/collection` | 收藏夹 / 合集读取（需登录态） |
