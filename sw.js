// sw.js
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 攔截來自分享的 POST 請求
  if (event.request.method === 'POST' && url.pathname === '/gpx-online-viewer/') {
    event.respondWith((async () => {
      const formData = await event.request.formData();
      const file = formData.get('gpx_file');
      
      const cache = await caches.open('incoming-gpx');
      await cache.put('/shared.gpx', new Response(file));
      
      // 導回主頁並帶上 shared 參數
      return Response.redirect('/gpx-online-viewer/?shared=1', 303);
    })());
  }
});