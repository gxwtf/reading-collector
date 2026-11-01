# 贡献指南

## 先跑起来

```bash
./scripts/install.sh --vault /path/to/vault --dry-run   # 只检查依赖
./scripts/install.sh --vault /path/to/vault             # 写配置
```

## 代码约定

- **不留硬编码路径。**任何路径、命令名、平台差异都走 `scripts/config.py`。
- **脚本可单独运行。**每个脚本都是独立 CLI，不依赖彼此的内部状态（只共用 `config`）。
- **失败要可诊断。**报错说清楚「缺什么」和「怎么补」，不要只抛 traceback。
- **从属步骤不阻塞。**Notion 镜像这类步骤失败就记一笔，不能中断主流程。
- Python 走标准库优先，新依赖要能 `pip install` 到纯 Python 环境。

## 加一个新的待办后端

在 `scripts/inbox.py` 里加函数，返回统一结构：

```python
def backend_todoist() -> list[dict]:
    return [{
        "id": "todoist-123",
        "title": "文章标题",
        "text": "链接文本",
        "urls": ["https://..."],
        "raw": {},          # 可选，原始响应
    }]
```

标记完成同样实现一个 `backend_todoist_done(todo_id) -> dict`，
然后接进 `main()` 的分派。

## 加一个新的语音识别后端

在 `scripts/transcribe.py` 的 `BACKENDS` 里注册：

```python
def asr_myengine(path: Path, locale: str, tries: int) -> str | None:
    ...  # 返回纯文本；失败返回 None，不要抛异常
BACKENDS["myengine"] = asr_myengine
```

**必须能串行调用**：系统识别服务并发会限流，实测 6 路并发时 61 个片段只成功 1 个。

## 测试清单

改完至少验证：

```bash
python3 scripts/config.py                      # 配置能加载
python3 scripts/inbox.py                       # 待办能读出
python3 scripts/inbox.py --backend file \
        --inbox examples/inbox-example.md      # 文件后端能读
python3 scripts/archive.py --title 测试 --url https://x --dry-run < /dev/null
bash scripts/install.sh --vault "$MINIS_VAULT" --dry-run
```

## 提交

```
feat: 加 Todoist 后端
fix:  修复 Delta 链接被截断
docs: 补充视频转写的语言说明
```

## License

提交即同意以 MIT 协议发布。
