"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

export function SearchBox() {
  const params = useSearchParams();
  const router = useRouter();
  const [value, setValue] = useState(params.get("q") ?? "");

  return (
    <form
      action="/"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        router.push(q ? `/?q=${encodeURIComponent(q)}` : "/");
      }}
      className="relative hidden md:block"
    >
      <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="搜索标题 / 正文"
        className="h-8 w-48 rounded-md border border-input bg-background pl-7 pr-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
    </form>
  );
}
