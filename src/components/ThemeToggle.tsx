"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Check, Monitor, Moon, Sun } from "lucide-react";

const OPTIONS = [
  { value: "light", label: "浅色模式", icon: Sun },
  { value: "dark", label: "深色模式", icon: Moon },
  { value: "system", label: "跟随系统", icon: Monitor },
] as const;

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2];
  const Icon = mounted ? current.icon : Monitor;

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="切换主题"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Icon className="size-4" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-10 z-50 w-40 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {OPTIONS.map(({ value, label, icon: ItemIcon }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={theme === value}
              onClick={() => {
                setTheme(value);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted"
            >
              <ItemIcon className="size-4" />
              <span className="flex-1 text-left">{label}</span>
              {theme === value ? <Check className="size-3.5 text-brand" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
