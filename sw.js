// يخلي التطبيق يفتح بسرعة وبدون إنترنت (البيانات بتتزامن لما يرجع النت)
const CACHE = "clinic-v16";
const SHELL = ["./", "index.html", "styles.css", "app.js", "fb.js", "ui.js", "staff.js", "card.js", "patient.js", "config.js", "manifest.json", "icon.svg", "icon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  // الشبكة أولاً (لتوصل التحديثات فوراً)، والكاش إذا ما في نت
  e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))));
});
self.addEventListener("notificationclick", (e) => { e.notification.close(); e.waitUntil(self.clients.openWindow("./#/meds")); });
