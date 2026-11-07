import { Search } from "lucide-react";

/** 纯 GET 表单：不依赖客户端状态，SSR 直接可见 */
export function SearchBox() {
  return (
    <form action="/" className="relative hidden shrink-0 md:block">
      <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        name="q"
        placeholder="搜索标题 / 正文"
        className="h-8 w-36 rounded-lg lg:w-56 border border-input bg-transparent pl-7 pr-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
    </form>
  );
}
