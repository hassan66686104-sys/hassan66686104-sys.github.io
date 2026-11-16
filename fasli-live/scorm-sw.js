/* Fasli LIVE – serves extracted SCORM packages from Cache Storage on the app's own origin
   so the SCO can find the SCORM API (window.parent.API / API_1484_11). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/scorm/")) return;
  e.respondWith(
    caches.open("fasli-scorm").then(async (c) => {
      const hit = await c.match(url.pathname);
      if (hit) return hit;
      const alt = await c.match(decodeURIComponent(url.pathname));
      return alt || new Response("الملف غير موجود في حزمة SCORM", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    })
  );
});
