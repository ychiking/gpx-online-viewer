// sw.js
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 接收來自 LINE 或系統分享的檔案
  if (event.request.method === 'POST' && url.pathname === '/gpx-online-viewer/') {
    event.respondWith((async () => {
      const formData = await event.request.formData();
      const file = formData.get('gpx_file');
      
      const cache = await caches.open('incoming-gpx');
      await cache.put('/shared.gpx', new Response(file));
      
      // 導向回主頁並帶參數
      return Response.redirect('/gpx-online-viewer/?shared=1', 303);
    })());
  }
});