// ================= 地圖初始化 =================
const map = L.map("map", { tap: true }).setView([25.03, 121.56], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { 
  attribution: "© OpenStreetMap" 
}).addTo(map);

let allTracks = [], trackPoints = [], polyline, hoverMarker, chart, markers = [], wptMarkers = [];
const routeSelect = document.getElementById("routeSelect");

// ================= 定義圖示 =================
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

const wptIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [15, 25], iconAnchor: [7, 25], popupAnchor: [1, -20], shadowSize: [25, 25]
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

  const wpts = xml.getElementsByTagName("wpt");
  let waypoints = [];
  for (let w of wpts) {
    const lat = parseFloat(w.getAttribute("lat")), lon = parseFloat(w.getAttribute("lon"));
    const name = w.getElementsByTagName("name")[0]?.textContent || "未命名航點";
    const time = w.getElementsByTagName("time")[0]?.textContent;
    const localTime = time ? formatDate(new Date(new Date(time).getTime() + 8*3600000)) : "無時間資訊";
    waypoints.push({ lat, lon, name, localTime });
  }

  const trks = xml.getElementsByTagName("trk");
  if (trks.length > 0) {
    for (let i = 0; i < trks.length; i++) {
      const nameNode = trks[i].getElementsByTagName("name")[0];
      const pts = trks[i].getElementsByTagName("trkpt");
      const points = extractPoints(pts);
      if (points.length > 0) allTracks.push({ name: nameNode ? nameNode.textContent : `路線 ${i + 1}`, points, waypoints });
    }
  } else {
    const allPts = xml.getElementsByTagName("trkpt");
    const points = extractPoints(allPts);
    if (points.length > 0) allTracks.push({ name: "預設路線", points, waypoints });
  }

  if (allTracks.length === 0) return alert("找不到有效點位資料");
  
  const container = document.getElementById("routeSelectContainer");
  if (allTracks.length > 1) {
    container.style.display = "block";
    routeSelect.style.display = "inline-block";
  } else {
    container.style.display = "none";
  }

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
  const selectedRoute = allTracks[index];
  trackPoints = selectedRoute.points;
  if (polyline) map.removeLayer(polyline);
  if (hoverMarker) map.removeLayer(hoverMarker);
  markers.forEach(m => map.removeLayer(m));
  wptMarkers.forEach(m => map.removeLayer(m));
  markers = []; wptMarkers = [];
  if (chart) chart.destroy();
  
  calculateDistance();
  drawMap(selectedRoute.waypoints);
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

function drawMap(waypoints = []) {
  polyline = L.polyline(trackPoints.map(p => [p.lat, p.lon]), { color: "red", weight: 6, opacity: 0.7 }).addTo(map);
  map.fitBounds(polyline.getBounds());
  
  polyline.on('click', (e) => {
    let minD = Infinity, idx = 0;
    trackPoints.forEach((p, i) => {
      const d = Math.sqrt((p.lat - e.latlng.lat)**2 + (p.lon - e.latlng.lng)**2);
      if (d < minD) { minD = d; idx = i; }
    });
    if (chart) {
      chart.setActiveElements([{ datasetIndex: 0, index: idx }]);
      chart.tooltip.setActiveElements([{ datasetIndex: 0, index: idx }], { x: 0, y: 0 });
      chart.update();
      updateHoverMarker(idx);
    }
  });

  const f = trackPoints[0], l = trackPoints.at(-1);
  markers.push(
    L.marker([f.lat, f.lon], { icon: startIcon }).addTo(map).bindPopup("起點"),
    L.marker([l.lat, l.lon], { icon: endIcon }).addTo(map).bindPopup("終點")
  );

  waypoints.forEach(w => {
    const wm = L.marker([w.lat, w.lon], { icon: wptIcon }).addTo(map);
    wm.bindTooltip(`<b>${w.name}</b><br>時間: ${w.localTime}`, { direction: 'top', offset: [0, -10] });
    wptMarkers.push(wm);
  });
  
  hoverMarker = L.circleMarker([f.lat, f.lon], { radius: 6, color: "blue", fillColor: "#fff", fillOpacity: 1 }).addTo(map);
}

function updateHoverMarker(index) {
  const p = trackPoints[index];
  hoverMarker.setLatLng([p.lat, p.lon])
             .bindPopup(`<b>位置資訊</b><br>高度: ${p.ele.toFixed(0)} m<br>距離: ${p.distance.toFixed(2)} km<br>時間: ${p.timeLocal}<br>座標: ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`)
             .openPopup();
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
      responsive: true,
      maintainAspectRatio: false, // 關鍵：讓圖表隨容器變形而不強制維持比例
      scales: {
        x: {
          ticks: {
            maxRotation: 0, // 防止標籤旋轉擠壓
            font: { size: 10 } // 手機版適合的大小
          }
        },
        y: {
          ticks: { font: { size: 10 } }
        }
      },
      interaction: { intersect: false, mode: "index" },
      onHover: (event, elements) => { 
        if (elements.length) {
          updateHoverMarker(elements[0].index);
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
  const currentIndex = routeSelect.value || 0;
  const currentName = allTracks[currentIndex] ? allTracks[currentIndex].name : "路線";
  document.getElementById("routeSummary").innerHTML = `
    記錄日期：${f.timeLocal.substring(0, 10)}<br>
    路　　線：${currentName}<br>
    里　　程：${l.distance.toFixed(2)} km<br>
    花費時間：${Math.floor(dur/3600000)} 小時 ${Math.floor((dur%3600000)/60000)} 分鐘<br>
    最高海拔：${Math.max(...eles).toFixed(0)} m<br>
    最低海拔：${Math.min(...eles).toFixed(0)} m<br>
    總爬升數：${gain.toFixed(0)} m<br>
    總下降數：${loss.toFixed(0)} m
  `;
}

function formatDate(d) { return d.toISOString().replace("T", " ").substring(0, 19); }