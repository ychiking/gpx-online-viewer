// ================= 地圖初始化 =================
const map = L.map("map", { tap: true }).setView([25.03, 121.56], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { 
  attribution: "© OpenStreetMap" 
}).addTo(map);

let allTracks = [], trackPoints = [], polyline, hoverMarker, chart, markers = [];
const routeSelect = document.getElementById("routeSelect");

// ================= 定義彩色大頭針圖示 =================
const startIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

const endIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

// ================= GPX 上傳與解析 =================
document.getElementById("gpxInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => parseGPX(reader.result);
  reader.readAsText(file);
});

function parseGPX(text) {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  allTracks = [];
  routeSelect.innerHTML = "";
  const trks = xml.getElementsByTagName("trk");
  if (trks.length > 0) {
    for (let i = 0; i < trks.length; i++) {
      const nameNode = trks[i].getElementsByTagName("name")[0];
      const pts = trks[i].getElementsByTagName("trkpt");
      const points = extractPoints(pts);
      if (points.length > 0) allTracks.push({ name: nameNode ? nameNode.textContent : `路線 ${i + 1}`, points });
    }
  } else {
    const allPts = xml.getElementsByTagName("trkpt");
    const points = extractPoints(allPts);
    if (points.length > 0) allTracks.push({ name: "預設路線", points });
  }
  if (allTracks.length === 0) return alert("找不到有效點位資料");
  routeSelect.style.display = allTracks.length > 1 ? "inline-block" : "none";
  allTracks.forEach((t, i) => {
    const opt = document.createElement("option"); opt.value = i; opt.textContent = t.name;
    routeSelect.appendChild(opt);
  });
  loadRoute(0);
}

function extractPoints(pts) {
  let res = [];
  for (let p of pts) {
    const lat = parseFloat(p.getAttribute("lat")), lon = parseFloat(p.getAttribute("lon"));
    const ele = p.getElementsByTagName("ele")[0], time = p.getElementsByTagName("time")[0];
    if (!isNaN(lat) && !isNaN(lon) && ele && time) {
      const utc = new Date(time.textContent);
      res.push({ lat, lon, ele: parseFloat(ele.textContent), timeUTC: utc, timeLocal: formatDate(new Date(utc.getTime() + 8*3600*1000)), distance: 0 });
    }
  }
  return res;
}

routeSelect.addEventListener("change", (e) => loadRoute(parseInt(e.target.value)));

function loadRoute(index) {
  trackPoints = allTracks[index].points;
  if (polyline) map.removeLayer(polyline);
  if (hoverMarker) map.removeLayer(hoverMarker);
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  if (chart) chart.destroy();
  calculateDistance();
  drawMap();
  drawElevationChart();
  renderRouteInfo();
}

function calculateDistance() {
  let total = 0;
  trackPoints.forEach((p, i) => {
    if (i > 0) {
      const a = trackPoints[i-1], b = p;
      const R = 6371, dLat = (b.lat-a.lat)*Math.PI/180, dLon = (b.lon-a.lon)*Math.PI/180;
      const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;
      total += 2 * R * Math.asin(Math.sqrt(x));
    }
    p.distance = total;
  });
}

function calculateElevationGainFiltered() {
  if (trackPoints.length < 3) return { gain: 0, loss: 0 };
  const smoothed = trackPoints.map((p, i, arr) => {
    const start = Math.max(0, i - 1), end = Math.min(arr.length - 1, i + 1);
    return arr.slice(start, end + 1).reduce((s, c) => s + c.ele, 0) / (end - start + 1);
  });
  let gain = 0, loss = 0, threshold = 4, lastEle = smoothed[0];
  for (let i = 1; i < smoothed.length; i++) {
    const diff = smoothed[i] - lastEle;
    if (Math.abs(diff) >= threshold) {
      if (diff > 0) gain += diff; else loss += Math.abs(diff);
      lastEle = smoothed[i];
    }
  }
  return { gain, loss };
}

function drawMap() {
  polyline = L.polyline(trackPoints.map(p => [p.lat, p.lon]), { color: "red", weight: 4 }).addTo(map);
  map.fitBounds(polyline.getBounds());
  const f = trackPoints[0], l = trackPoints.at(-1);
  markers.push(
    L.marker([f.lat, f.lon], { icon: startIcon }).addTo(map).bindPopup("起點"),
    L.marker([l.lat, l.lon], { icon: endIcon }).addTo(map).bindPopup("終點")
  );
  // 高度圖同步用的藍色圓點
  hoverMarker = L.circleMarker([f.lat, f.lon], { radius: 6, color: "blue", fillColor: "#fff", fillOpacity: 1 }).addTo(map);
}

function drawElevationChart() {
  const ctx = document.getElementById("elevationChart").getContext("2d");
  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: trackPoints.map(p => p.distance.toFixed(2)),
      datasets: [{ 
        label: "高度 (m)", data: trackPoints.map(p => p.ele), fill: true, 
        backgroundColor: 'rgba(54, 162, 235, 0.2)', borderColor: 'rgba(54, 162, 235, 1)', tension: 0.1, pointRadius: 0 
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      onHover: (event, elements) => { 
        if (elements.length) {
          const p = trackPoints[elements[0].index];
          // 這裡修正了同步顯示資訊 Tip 的功能
          hoverMarker.setLatLng([p.lat, p.lon])
                     .bindPopup(`<b>位置資訊</b><br>高度: ${p.ele.toFixed(0)} m<br>距離: ${p.distance.toFixed(2)} km<br>時間: ${p.timeLocal}<br>座標: ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`)
                     .openPopup();
        }
      }
    }
  });
}

function renderRouteInfo() {
  const f = trackPoints[0], l = trackPoints.at(-1);
  const dur = l.timeUTC.getTime() - f.timeUTC.getTime();
  const { gain, loss } = calculateElevationGainFiltered();
  const eles = trackPoints.map(p => p.ele);
  const currentName = allTracks[routeSelect.value] ? allTracks[routeSelect.value].name : "路線";
  document.getElementById("routeSummary").innerHTML = `
    記錄日期：${f.timeLocal.substring(0, 10)}<br>
    路線：${currentName}<br>
    里程：${l.distance.toFixed(2)} km<br>
    花費時間：${Math.floor(dur/3600000)} 小時 ${Math.floor((dur%3600000)/60000)} 分鐘<br>
    最高海拔：${Math.max(...eles).toFixed(0)} m<br>
    最低海拔：${Math.min(...eles).toFixed(0)} m<br>
    總爬升：${gain.toFixed(0)} m<br>
    總下降：${loss.toFixed(0)} m
  `;
}

function formatDate(d) { return d.toISOString().replace("T", " ").substring(0, 19); }