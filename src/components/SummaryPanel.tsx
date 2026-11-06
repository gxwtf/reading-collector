import { Quote } from "lucide-react";

/**
 * 概括的结构化渲染：把「一句话结论 / 分章要点 / 金句」分别按语义排版，
 * 比直接丢给 MDX 更像阅读卡片。视频/播客的时间戳渲染成可点击胶囊。
 */

type Block =
  | { type: "bullet"; text: string }
  | { type: "quote"; text: string }
  | { type: "para"; text: string };

type Section = { title: string; blocks: Block[] };

function parseSummary(md: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { title: "", blocks: [] };

  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const heading = line.match(/^#{2,4}\s*(.+)$/);
    if (heading) {
      if (current.blocks.length || current.title) sections.push(current);
      current = { title: heading[1].trim(), blocks: [] };
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      current.blocks.push({ type: "bullet", text: line.replace(/^[-*]\s+/, "") });
    } else if (/^>\s?/.test(line)) {
      current.blocks.push({ type: "quote", text: line.replace(/^>\s?/, "") });
    } else if (line === "---") {
      continue;
    } else {
      current.blocks.push({ type: "para", text: line });
    }
  }
  if (current.blocks.length || current.title) sections.push(current);
  return sections;
}

function toSeconds(stamp: string): number {
  const p = stamp.split(":").map(Number);
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return p[0] || 0;
}

/** 处理 **加粗** 与行首 [mm:ss] 时间戳 */
function Inline({ text, seekable }: { text: string; seekable: boolean }) {
  const nodes: React.ReactNode[] = [];

  let rest = text;
  if (seekable) {
    const m = rest.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*/);
    if (m) {
      const stamp = m[1];
      nodes.push(
        <a
          key="t"
          href={`#t=${toSeconds(stamp)}`}
          className="mr-1.5 inline-flex items-center rounded-md bg-brand/10 px-1.5 py-0.5 align-[1px] font-mono text-[11px] font-medium text-brand hover:bg-brand/20"
        >
          {stamp}
        </a>,
      );
      rest = rest.slice(m[0].length);
    }
  }

  const parts = rest.split(/(\*\*[^*]+\*\*)/g);
  parts.forEach((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      nodes.push(
        <strong key={`b${i}`} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>,
      );
    } else if (part) {
      nodes.push(<span key={`s${i}`}>{part}</span>);
    }
  });

  return <>{nodes}</>;
}

export function SummaryPanel({
  markdown,
  seekable,
}: {
  markdown: string;
  seekable: boolean;
}) {
  const sections = parseSummary(markdown);

  return (
    <div className="mt-3 space-y-4">
      {sections.map((section, si) => {
        const title = section.title || "";

        // 一句话结论：整段强调
        if (/结论|一句话/.test(title)) {
          const text = section.blocks.map((b) => b.text).join(" ");
          return (
            <div key={si} className="border-l-2 border-brand pl-3">
              <p className="text-[15px] font-medium leading-7 text-foreground">
                <Inline text={text} seekable={seekable} />
              </p>
            </div>
          );
        }

        // 金句：引用块
        if (/金句|原句/.test(title)) {
          return (
            <div key={si} className="space-y-2">
              <h3 className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Quote className="size-3" />
                {title}
              </h3>
              {section.blocks.map((b, i) => (
                <blockquote
                  key={i}
                  className="rounded-lg bg-muted/50 px-3 py-2 text-[13px] leading-6 text-muted-foreground"
                >
                  <Inline text={b.text} seekable={seekable} />
                </blockquote>
              ))}
            </div>
          );
        }

        // 分章要点：紧凑列表
        if (/要点|分章/.test(title)) {
          return (
            <div key={si} className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
              <ul className="space-y-2">
                {section.blocks
                  .filter((b) => b.type === "bullet")
                  .map((b, i) => (
                    <li key={i} className="flex gap-2 text-[13px] leading-6 text-muted-foreground">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand/70" />
                      <span className="min-w-0">
                        <Inline text={b.text} seekable={seekable} />
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          );
        }

        // 其它小节
        return (
          <div key={si} className="space-y-2">
            {title ? <h3 className="text-xs font-medium text-muted-foreground">{title}</h3> : null}
            {section.blocks.map((b, i) => (
              <p key={i} className="text-[13px] leading-6 text-muted-foreground">
                <Inline text={b.text} seekable={seekable} />
              </p>
            ))}
          </div>
        );
      })}
    </div>
  );
}
