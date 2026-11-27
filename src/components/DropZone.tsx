"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createEntries, type CreateEntryState } from "@/actions/entries";

const initial: CreateEntryState = { ok: false };

/** 一次最多传这么多文件，防止有人把整个文件夹拖进来把服务器打满 */
const MAX_FILES = 20;

const UNSUPPORTED = "这个格式暂不支持，目前可以拖链接、图片、.md、.epub";
const NOT_A_LINK = "没有识别到链接，请粘贴以 http 开头的地址";

type Props = {
  collections: { id: number; name: string }[];
  /** 当前所在分组的 id：投进来的东西直接归到这个组里 */
  activeCollectionId?: number;
};

/**
 * 投放区（设计说明 §4.4）：拖文件、粘链接、点一下选文件，三条路都通。
 *
 * 为什么不做「上传后自动判断类型」的黑盒：`kind` 只有 article / video /
 * podcast / document 四种，判断规则在 `src/lib/url.ts` 的 `detectKind()`，
 * 而文件的类型由扩展名直接决定，没有歧义。所以这里只按扩展名分派，
 * 真正的归类仍由服务端那条既有链路完成，不新增第二套规则。
 */
export function DropZone({ collections, activeCollectionId }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createEntries, initial);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const urlsRef = useRef<HTMLTextAreaElement>(null);
  /** 同步的 busy 标记：setBusy 是异步的，onDrop 里连拖两次会都读到旧的 false */
  const busyRef = useRef(false);

  const report = useCallback((text: string, bad = false) => setMsg({ text, bad }), []);

  /** 把一段文本当链接投进去；不是链接就给明确提示，不静默 */
  const submitText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (!/https?:\/\//i.test(trimmed)) {
        report(NOT_A_LINK, true);
        return;
      }
      if (!urlsRef.current) return;
      urlsRef.current.value = trimmed;
      setMsg(null);
      formRef.current?.requestSubmit();
    },
    [report],
  );

  /**
   * 页面级的粘贴兜底。
   *
   * 只在容器上挂 onPaste 不够：刚打开页面时焦点在 <body>，用户按 Ctrl+V
   * 什么都不发生——而文案写的正是「拖进来，或粘贴链接」。
   * 这里挂 document，但要跳过「正在别的输入框里打字」的情况，
   * 否则在搜索框里粘链接会被投放区截走。
   */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!/https?:\/\//i.test(text)) return;
      e.preventDefault();
      if (!urlsRef.current) return;
      urlsRef.current.value = text.trim();
      setMsg(null);
      formRef.current?.requestSubmit();
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      // 处理中不再接受新的一批：否则连拖两次会并发发两轮请求
      if (busyRef.current) return;
      const list = files.slice(0, MAX_FILES);
      const truncated = files.length - list.length;
      const md: File[] = [];
      const epub: File[] = [];
      const images: File[] = [];
      const rejected: string[] = [];

      for (const f of list) {
        const name = f.name.toLowerCase();
        if (f.type.startsWith("image/")) images.push(f);
        else if (/\.epub$/.test(name)) epub.push(f);
        else if (/\.(md|markdown|txt)$/.test(name) || f.type.startsWith("text/")) md.push(f);
        else rejected.push(f.name);
      }

      if (rejected.length > 0 && md.length + epub.length + images.length === 0) {
        report(UNSUPPORTED, true);
        return;
      }

      busyRef.current = true;
      setBusy(true);
      const notes: string[] = [];

      try {
        if (md.length + epub.length > 0) {
          const mdFd = new FormData();
          md.forEach((f) => mdFd.append("files", f));
          const epubFd = new FormData();
          epub.forEach((f) => epubFd.append("files", f));
          // 分组页里投进来的文件也要进这个组——UI 上已经写了「投进「X」」
          if (activeCollectionId) {
            mdFd.append("collectionId", String(activeCollectionId));
            epubFd.append("collectionId", String(activeCollectionId));
          }

          if (md.length > 0) {
            const res = await fetch("/api/entries/markdown", { method: "POST", body: mdFd });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) notes.push(data.error ?? "Markdown 导入失败");
            else notes.push(`Markdown 导入 ${data.added} 篇`);
          }
          if (epub.length > 0) {
            const res = await fetch("/api/entries/epub", { method: "POST", body: epubFd });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) notes.push(data.error ?? "EPUB 导入失败");
            else notes.push(`EPUB 导入 ${data.added} 本`);
          }
        }

        if (images.length > 0) {
          const fd = new FormData();
          images.forEach((f) => fd.append("files", f));
          const res = await fetch("/api/attachments", { method: "POST", body: fd });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            notes.push(data.error ?? "图片上传失败");
          } else {
            // 单张图没有正文可读，做成一条带图的 Markdown 条目才看得见
            const body = (data.attachments as { url: string }[])
              .map((a) => `![](${a.url})`)
              .join("\n\n");
            const save = await fetch("/api/entries/markdown", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                markdown: `${body}\n\n（图片收藏）`,
                title: images[0].name,
                collectionId: activeCollectionId ?? undefined,
              }),
            });
            notes.push(save.ok ? `图片导入 ${images.length} 张` : "图片已上传，但没能建成条目");
          }
        }

        if (rejected.length > 0) notes.push(`跳过不支持的文件：${rejected.slice(0, 3).join("、")}`);
        if (truncated > 0) notes.push(`一次最多处理 ${MAX_FILES} 个文件，其余 ${truncated} 个没有导入`);
        report(notes.join("；") || "导入完成");
        router.refresh();
      } catch {
        report("导入失败，请重试", true);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [activeCollectionId, report, router],
  );

  const active = busy || pending;

  return (
    <div
      id="drop"
      // tabIndex 让容器可获焦：点一下投放区再按 Ctrl+V 才有 onPaste。
      // 页面刚加载时焦点在 body，那条路径由上面的 document 级监听兜住。
      tabIndex={0}
      role="region"
      aria-label="投放区：拖入文件或粘贴链接"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        // 只有真正离开容器才算离开，子元素之间移动不闪烁
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
          void uploadFiles(files);
          return;
        }
        // 从别的标签页拖链接过来时，浏览器给的是 text/uri-list 或 text/plain
        const text = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
        if (text) submitText(text);
      }}
      onPaste={(e) => {
        // 焦点在投放区里任一处粘链接都能接住
        const text = e.clipboardData.getData("text/plain");
        if (!text) return;
        e.preventDefault();
        submitText(text);
      }}
      className={[
        "flex min-h-40 flex-col items-center justify-center rounded-2xl border-[1.5px] border-dashed px-6 py-8 text-center transition-colors outline-none",
        "focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-ring/25",
        dragging ? "border-brand bg-brand-soft/50" : "border-hairline-dashed hover:border-hairline-dashed/80",
      ].join(" ")}
    >
      <form ref={formRef} action={formAction} className="contents">
        <textarea ref={urlsRef} name="urls" className="sr-only" aria-hidden tabIndex={-1} />
        {activeCollectionId ? <input type="hidden" name="collectionId" value={activeCollectionId} /> : null}
      </form>

      <p className="text-[15px] text-ink">
        {active ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            正在处理…
          </span>
        ) : (
          "拖进来，或粘贴链接"
        )}
      </p>
      <p className="mt-1.5 text-[13px] text-ink-3">链接、文件、图片、视频都可以，自动归类</p>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          disabled={active}
          onClick={() => fileRef.current?.click()}
          className="h-11 rounded-xl border border-hairline px-4 text-[14px] text-ink-2 transition-colors hover:border-hairline-dashed hover:text-ink disabled:opacity-50"
        >
          选择文件
        </button>
        {collections.length > 0 ? (
          <span className="text-[13px] text-ink-3">
            {activeCollectionId
              ? `投进「${collections.find((c) => c.id === activeCollectionId)?.name ?? "当前分组"}」`
              : "也可以先选一个分组再投"}
          </span>
        ) : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length > 0) void uploadFiles(files);
        }}
      />

      {msg ? (
        <p className={["mt-3 text-[13px]", msg.bad ? "text-destructive" : "text-ink-2"].join(" ")}>
          {msg.text}
        </p>
      ) : state.error ? (
        <p className="mt-3 text-[13px] text-destructive">{state.error}</p>
      ) : state.ok ? (
        <p className="mt-3 text-[13px] text-ink-2">
          已加入 {state.added} 条{state.skipped ? `，跳过重复 ${state.skipped} 条` : ""}。抓取在后台进行。
        </p>
      ) : null}
    </div>
  );
}
