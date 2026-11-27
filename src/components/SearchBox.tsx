import { Search } from "lucide-react";

/** 纯 GET 表单：不依赖客户端状态，SSR 直接可见 */
export function SearchBox() {
  return (
    <form action="/" role="search" className="relative w-full max-w-[520px]">
      <label htmlFor="site-search" className="sr-only">
        搜索标题、原文或概括
      </label>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3"
      />
      <input
        id="site-search"
        name="q"
        type="search"
        placeholder="搜索标题、原文或概括"
        className="h-11 w-full rounded-xl border border-hairline bg-transparent pl-10 pr-3 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-3 focus-visible:border-hairline-dashed focus-visible:ring-[3px] focus-visible:ring-ring/30"
      />
    </form>
  );
}
