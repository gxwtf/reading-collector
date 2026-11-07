# 阅读收集（reading）

把散落的链接收进一个云端阅读库：抓正文、转写音视频、AI 概括、划线批注、关键帧。
数据全在 PostgreSQL，不再依赖 Obsidian / Notion。

- 线上：<https://reading.gxwtf.cn>
- 仓库：<https://github.com/gxwtf/reading-collector>
- 端口 3005，服务 `gxreading.service`（worker 为 `gxreading-worker.service`）

## 文档

- [架构与数据流](architecture.md)
- [数据库结构](database.md)
- [开放 API](api.md)
- [需要登录态的站点](cookies.md)
- [MCP 服务](mcp.md)
- [改进路线](roadmap.md)
- [构建与部署](deployment.md)

## 功能一览

| 模块 | 说明 |
| --- | --- |
| 收藏 | 单条/批量导入、B 站收藏夹、B 站合集与分 P |
| 抓取 | 文章正文（httpx + trafilatura）、PDF（pypdf）、音视频转写（yt-dlp + whisper.cpp） |
| 阅读 | 两栏布局、只看概括、字号/行宽、深浅色 |
| 标注 | 正文划线 + 批注、视频关键帧 |
| 概括 | AI 生成「一句话结论 / 分章要点 / 金句」，可 BYOK |
| 组织 | 标签、手动分组、按类型自动分组、全文搜索、批量导出 |
| 视频 | 内嵌播放器 / 本地精确播放（可选）、逐行歌词式高亮 |
