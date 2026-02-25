// sw.js
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 攔截分享目標路徑
  if (event.request.method === 'POST' && url.pathname === '/receive-gpx') {
    event.respondWith((async () => {
      const formData = await event.request.formData();
      const file = formData.get('gpx_file');
      
      // 將檔案存入 Cache 供頁面讀取
      const cache = await caches.open('incoming-gpx');
      await cache.put('/shared.gpx', new Response(file));
      
      // 導向回主頁並帶參數
      return Response.redirect('/?shared=1', 303);
    })());
  }
});