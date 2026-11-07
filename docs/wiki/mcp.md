# MCP 服务

把阅读收集包成 MCP 工具，任何支持 MCP 的客户端（Claude Desktop、Minis、Cursor…）都能直接调用。

## 工具

| 工具 | 作用 |
| --- | --- |
| `save_url` | 收藏链接（可多个，可带标签） |
| `search` | 搜索标题/正文/来源/逐字稿/划线批注 |
| `list` | 最近收藏 |
| `get` | 单条详情（正文、概括、逐字稿） |

底层调用的是站点开放 API（`SECRET_API_KEY`）。

## 配置

```bash
# Minis
minis-mcp-cli add --name reading \
  --command python3 \
  --args /path/to/reading-collector/mcp/server.py \
  --env READING_API_BASE=https://reading.gxwtf.cn \
  --env READING_API_KEY=<服务器 .env 里的 SECRET_API_KEY>
```

Claude Desktop（`claude_desktop_config.json`）：

```json
{
  "mcpServers": {
    "reading": {
      "command": "python3",
      "args": ["/path/to/mcp/server.py"],
      "env": {
        "READING_API_BASE": "https://reading.gxwtf.cn",
        "READING_API_KEY": "<SECRET_API_KEY>"
      }
    }
  }
}
```

## 示例

> 「把这篇 https://sspai.com/post/118570 收进阅读收集」→ `save_url`
> 「我收藏过关于 agent 的文章吗」→ `search`
> 「把第 8 条读一遍，总结成三句话」→ `get` 后自行总结
