// 只缓存静态资源；页面与接口一律走网络，避免缓存登录态与数据
//
// 改缓存策略或修了静态资源相关的 bug 时**必须改版本号**：activate 里
// 会删掉所有非当前版本的缓存。`/_next/static/` 的文件名带内容哈希，
// 正常情况下不会错配；但页面 HTML 若被浏览器 HTTP 缓存住，引用的仍是
// 旧哈希，就会一直跑旧 JS——这次「改字体没效果」就是这类问题的表现。
const CACHE = "reading-static-v3";
const PRECACHE = ["/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest";

  if (isStatic) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
});
