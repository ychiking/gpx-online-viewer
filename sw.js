self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 這裡的路徑也要加上專案名稱
  if (event.request.method === 'POST' && url.pathname.includes('/receive-gpx')) {
    event.respondWith((async () => {
      const formData = await event.request.formData();
      const file = formData.get('gpx_file');
      
      const cache = await caches.open('incoming-gpx');
      await cache.put('/shared.gpx', new Response(file));
      
      // 導向回正確的子目錄路徑
      return Response.redirect('/gpx-online-viewer/?shared=1', 303);
    })());
  }
});