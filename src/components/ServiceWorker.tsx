"use client";

import { useEffect } from "react";

/** 注册 service worker（只在生产环境，且失败静默） */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const timer = setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  return null;
}
