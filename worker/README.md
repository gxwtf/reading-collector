# 抓取 / 转写 worker

站点只负责建任务和展示，重活在 worker 里跑。worker 通过 HTTP 与站点通信
（`INTERNAL_API_KEY` Bearer 鉴权），**不直连数据库**，因此可以单独重启、单独扩容。

## 依赖

| 组件 | 用途 |
| --- | --- |
| Python ≥ 3.9 | 运行 worker |
| `httpx` / `trafilatura` | 抓正文并转 Markdown（`pip install -r requirements.txt`） |
| `yt-dlp` | 下载音视频音轨、取标题与时长 |
| `ffmpeg` | 转 16kHz 单声道 wav |
| `whisper-cli` + 模型 | whisper.cpp 转写（模型默认 `ggml-small.bin`） |

> 不用 `faster-whisper`：它依赖 ctranslate2，musl 环境导入即段错误。

## 运行

```bash
export READING_BASE_URL=http://127.0.0.1:3005
export INTERNAL_API_KEY=与站点一致的内部密钥
export WHISPER_MODEL=/opt/whisper.cpp/models/ggml-small.bin
export ASR_LOCALE=zh-CN          # 必须与原声一致，选错是乱码

python3 worker.py                # 常驻
python3 worker.py --once         # 处理一条
python3 worker.py --dry-run      # 只领取，用来验连通性
```

## 任务协议

| 步骤 | 接口 |
| --- | --- |
| 领取 | `GET /api/worker/jobs?worker=<名字>` → `{ job: { id, entryId, url, kind } }` |
| 回填 | `POST /api/worker/jobs/<id>` → `{ status: "done" \| "failed", entry?, transcript?, error? }` |

`kind=fetch` 抓文章正文，`kind=transcribe` 走音视频转写。
领取是原子的（`FOR UPDATE SKIP LOCKED`），可以同时跑多个 worker。

## 失败语义

失败必须如实上报 `status: "failed"` 与 `error`，站点会把条目置为「抓取失败」并给出重试按钮。
抓不到正文的常见原因：反爬拦截、需要登录、依赖前端渲染。这些不要重试到死，直说原因即可。
