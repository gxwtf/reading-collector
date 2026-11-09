"use client";

// 打开阅读器前的引导页：把当前广学账号的 WebDAV 配置写进 Readest 的 IndexedDB 设置，
// 用户不用手填服务器地址 / 用户名 / 密码。
// Readest Web 端设置存在 IndexedDB：库 AppFileSystem(v1) → store files(keyPath: path) → 键 Settings/settings.json

import { useEffect, useState } from "react";

const DB_NAME = "AppFileSystem";
const DB_VERSION = 1;
const STORE = "files";
const SETTINGS_PATH = "Settings/settings.json";

type DavMe = {
  username: string;
  password: string;
  serverUrl: string;
  rootPath: string;
};

type WebdavSettings = {
  enabled: boolean;
  serverUrl: string;
  username: string;
  password: string;
  rootPath: string;
  syncProgress: boolean;
  syncNotes: boolean;
  syncBooks: boolean;
  strategy: string;
  deviceId: string;
  lastSyncedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "path" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("打开 IndexedDB 失败"));
  });
}

function readSettings(db: IDBDatabase): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(SETTINGS_PATH);
    request.onsuccess = () => {
      // Readest 的 files 记录形如 { path, content }，content 是 JSON 字符串
      const raw = request.result as { path?: string; content?: unknown } | undefined;
      const text = typeof raw?.content === "string" ? raw.content : "";
      if (!text) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(text) as unknown;
        resolve(parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {});
      } catch {
        resolve({});
      }
    };
    request.onerror = () => reject(request.error ?? new Error("读取设置失败"));
  });
}

function writeSettings(db: IDBDatabase, value: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ path: SETTINGS_PATH, content: JSON.stringify(value) });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("写入设置失败"));
    tx.onabort = () => reject(tx.error ?? new Error("写入设置被中止"));
  });
}

function newDeviceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function ReadestBootPage() {
  const [username, setUsername] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      let dav: DavMe;
      try {
        const response = await fetch("/api/dav/me", { cache: "no-store" });
        if (response.status === 401) {
          location.replace("/login?back=/readest");
          return;
        }
        if (!response.ok) throw new Error(`获取 WebDAV 配置失败：HTTP ${response.status}`);
        dav = (await response.json()) as DavMe;
      } catch (error) {
        console.error("[readest-boot] 获取 WebDAV 配置失败", error);
        location.replace("/readest");
        return;
      }

      if (!cancelled) setUsername(dav.username);

      try {
        const db = await openDb();
        try {
          const settings = await readSettings(db);
          const previous = (settings.webdav ?? {}) as Partial<WebdavSettings>;
          const webdav: WebdavSettings = {
            enabled: true,
            serverUrl: dav.serverUrl,
            username: dav.username,
            password: dav.password,
            rootPath: dav.rootPath,
            syncProgress: true,
            syncNotes: true,
            syncBooks: true,
            strategy: "silent",
            deviceId: previous.deviceId || newDeviceId(),
            lastSyncedAt: 0,
          };
          await writeSettings(db, { ...settings, webdav });
        } finally {
          db.close();
        }
      } catch (error) {
        // 写失败也要放行，不能把用户卡在这一页
        console.error("[readest-boot] 写入 Readest 设置失败", error);
      }

      location.replace("/readest");
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-sm space-y-2 py-16 text-center">
      <p className="text-sm text-muted-foreground">
        {username ? `正在为 ${username} 准备书库…` : "正在准备书库…"}
      </p>
      <p className="text-xs text-muted-foreground">首次打开会稍慢，之后会记住这台设备。</p>
    </div>
  );
}
