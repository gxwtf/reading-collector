# 2026-11-28 本地 PDF 文件入口

## 目标

让 `.pdf` 文件能像 `.md` / `.epub` 一样拖进投放区就入库，而不是只能贴链接。

## 现状（2026-11-28 实测）

投放区分派逻辑只认 `image/*` / `.epub` / `.md|.txt`，`.pdf` 落到 `rejected`，
提示「这个格式暂不支持」。PDF 只能通过「贴 arxiv 链接」走 worker 抓取。

## 已确认的前提（与用户确认）

| 项 | 结论 |
| --- | --- |
| 做到哪一步 | **完整方案**：解析文字 + 存原文件 |
| 单个文件上限 | **50MB** |

## 断言

| 断言 | 命令 / 操作 | 期望 |
| --- | --- | --- |
| 拖 .pdf 能导入 | `curl -F files=@x.pdf /api/entries/pdf` | 200，`added=1` |
| 抽出文字 | 同上，响应 `notes` 里带页数与字数 | 例如 `attn.pdf：15 页，33486 字` |
| 原文件落盘 | `ls $PDF_DIR` | 出现 `<sha256前32>.pdf` |
| 详情页能原样看 | 浏览器打开该条目 | `object[type=application/pdf]` 存在且渲染 |
| 未登录拒绝 | 不带 cookie POST | 401 |
| 非 PDF 文件拒绝 | 上传 .txt（改名为 .pdf） | `skipped`，提示「不是 PDF 文件」 |
| 超 50MB 拒绝 | 上传 51MB | `skipped`，提示「超过 50MB」 |
| 重复导入 | 同一文件传两次 | 第二次 `skipped`，提示「已经导入过」 |
| 扫描件不崩 | 上传无文字层 PDF | 仍入库、仍能原样看，提示「抽不出文字」 |
| 分组归属 | 带 `collectionId` 上传 | 条目进该分组；别人的 id 不生效 |
| 尖括号不炸 MDX | 上传含 `<pad>` 的 PDF | 详情页 200，不是 500 |
| e2e 回归 | `node scripts/e2e/smoke.mjs` | 10/10 |

## 失败文案

| 场景 | 用户看到 |
| --- | --- |
| 非 PDF | `<文件名>：不是 PDF 文件` |
| 超 50MB | `<文件名>：超过 50MB` |
| 重复 | `<文件名>：已经导入过` |
| 扫描件 | `<文件名>：已存原文件，但抽不出文字` |
| 服务端落盘失败 | `<文件名>：服务端保存失败` |
| 投放区拖入完全不支持的格式 | 「这个格式暂不支持，目前可以拖链接、图片、.md、.epub、.pdf」 |

## 边界

**做**
- 新依赖 `pdfjs-dist@6.5.438`（Mozilla 官方实现，约 2MB）
- 新 API `/api/entries/pdf`，复用现有 `PDF_DIR`
- DropZone 分派逻辑加 `.pdf` 分支
- 文件头嗅探 `%PDF-`，不信任扩展名与 Content-Type

**不做**
- 不抽图片、不做 OCR（扫描件仍只能看原文）
- 不做 PDF 页面渲染缩略图
- 不在请求链路里做超长任务：页数上限 300，超出的不抽

**基线数字**
- `Entry` 已有 `pdfPath` 列（2026-11-28 早些时候为「贴链接」路径加的）
- worker 落盘名从 `<entryId>.pdf` 改为 `<sha256前32>.pdf`，与站点侧对齐，
  同一个 PDF 无论走哪条路都只存一份

## 实测记录

| 断言 | 实测 | 结果 |
| --- | --- | --- |
| 拖 .pdf 能导入 | `code=200 time=1.63s`，`added=1` | 通过 |
| 抽出文字 | `attn.pdf：15 页，33486 字` | 通过 |
| 原文件落盘 | `bdfaa68d…f20.pdf` 2.2MB | 通过 |
| 详情页能原样看 | `object` 794×560，截图里浏览器 PDF 工具栏齐全（1/15 页） | 通过 |
| 未登录拒绝 | 401 | 通过 |
| 超 50MB 拒绝 | `big.pdf：超过 50MB` | 通过 |
| e2e 回归 | 10/10，退出码 0 | 通过 |
| 控制台 | `errors: []` | 通过 |

## 过程中踩的坑（pdfjs 在 Next 打包后）

按踩坑顺序：

1. **`isEvalSupported` 不在 `DocumentInitParameters` 类型里** —— 去掉即可，
   默认值本来就是 false。
2. **`PDFDocumentProxy.destroy()` 不存在** —— 那是 `PDFDocumentLoadingTask`
   上的方法。改成持有 task 并在 finally 里 `task.destroy()`。
3. **`Setting up fake worker failed: Cannot find module '.../pdf.worker.mjs'`**
   —— pdfjs 在 Node 下默认走 fake worker，加载器是
   `await import(GlobalWorkerOptions.workerSrc)`，而 workerSrc 默认是相对路径
   `"./pdf.worker.mjs"`。Next 的 webpack 打包后模块位置变了，这个相对路径解析不到。
4. **`GlobalWorkerOptions.workerSrc = null` → `Invalid workerSrc type`** —— 不行。
5. **用 `createRequire` 解析真实路径 → `e is not a function`** —— webpack 打包后
   `import.meta.url` 不可靠。
6. **最终解法**：pdfjs 的 `_setupFakeWorkerGlobal` 会优先看
   `globalThis.pdfjsWorker?.WorkerMessageHandler`，有就直接用、完全不碰文件系统。
   所以先 `await import("pdfjs-dist/legacy/build/pdf.worker.mjs")` 并挂到那个全局上。
   这条对本地 dev / `next start` / 生产部署都成立。

## 未实测

| 项 | 原因 |
| --- | --- |
| 线上部署后的大 PDF | 本机只测了 2.2MB；50MB 的解析耗时没测（可能十几秒，接近 nginx 60s 超时） |
| 手机上传 | 移动端 file picker 的行为没验 |
