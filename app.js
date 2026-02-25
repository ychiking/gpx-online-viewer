// ================= 地圖初始化 =================
const map = L.map("map", { tap: true }).setView([25.03, 121.56], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { 
  attribution: "© OpenStreetMap" 
}).addTo(map);

let allTracks = [], trackPoints = [], polyline, hoverMarker, chart, markers = [], wptMarkers = [];
let pointA = null, pointB = null, markerA = null, markerB = null; 
const routeSelect = document.getElementById("routeSelect");

// ================= 圖示定義 =================
const startIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const endIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const wptIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/0.7.7/images/marker-shadow.png',
  iconSize: [15, 25], iconAnchor: [7, 25], popupAnchor: [1, -20], shadowSize: [25, 25]
});

const blueIconHtml = `<div style="background:#007bff;color:white;border-radius:50%;width:24px;height:24px;text-align:center;line-height:24px;font-weight:bold;border:2px solid white;box-shadow: 0 0 5px rgba(0,0,0,0.3)">A</div>`;
const pinkIconHtml = `<div style="background:#e83e8c;color:white;border-radius:50%;width:24px;height:24px;text-align:center;line-height:24px;font-weight:bold;border:2px solid white;box-shadow: 0 0 5px rgba(0,0,0,0.3)">B</div>`;

// ================= GPX 解析 =================
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
  for (let i = 0; i < trks.length; i++) {
    const nameNode = trks[i].getElementsByTagName("name")[0];
    const pts = trks[i].getElementsByTagName("trkpt");
    const points = extractPoints(pts);
    if (points.length > 0) allTracks.push({ name: nameNode ? nameNode.textContent : `路線 ${i + 1}`, points, waypoints });
  }
  if (allTracks.length === 0) return alert("找不到有效資料");
  document.getElementById("routeSelectContainer").style.display = allTracks.length > 1 ? "block" : "none";
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
  window.clearSpecificPoint('A'); window.clearSpecificPoint('B');
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

// ================= 原始計算邏輯 =================
function calculateElevationStats(points) {
  if (points.length < 3) return { gain: 0, loss: 0 };
  let cleanPoints = [];
  cleanPoints.push(points[0]);
  for (let i = 1; i < points.length; i++) {
    const prevEle = points[i-1].ele;
    const currEle = points[i].ele;
    if (Math.abs(currEle - prevEle) > 100) cleanPoints.push({ ...points[i], ele: prevEle });
    else cleanPoints.push(points[i]);
  }
  const smoothed = cleanPoints.map((p, i, arr) => {
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
  polyline.on('click', (e) => {
    let minD = Infinity, idx = 0;
    trackPoints.forEach((p, i) => {
      const d = Math.sqrt((e.latlng.lat - p.lat)**2 + (e.latlng.lng - p.lon)**2);
      if (d < minD) { minD = d; idx = i; }
    });
    window.showPointPopup(idx, "位置資訊");
  });

  const f = trackPoints[0], l = trackPoints.at(-1);
  markers.push(
    L.marker([f.lat, f.lon], { icon: startIcon }).addTo(map).bindPopup("起點"),
    L.marker([l.lat, l.lon], { icon: endIcon }).addTo(map).bindPopup("終點")
  );

  waypoints.forEach(w => {
    const wm = L.marker([w.lat, w.lon], { icon: wptIcon }).addTo(map);
    let minD = Infinity, trackIdx = 0;
    trackPoints.forEach((tp, i) => {
      const d = Math.sqrt((w.lat - tp.lat)**2 + (w.lon - tp.lon)**2);
      if (d < minD) { minD = d; trackIdx = i; }
    });
    wm.on('click', () => { window.showPointPopup(trackIdx, w.name, w.localTime); });
    wptMarkers.push({ name: w.name, time: w.localTime });
  });
  
  hoverMarker = L.circleMarker([f.lat, f.lon], { radius: 6, color: "blue", fillColor: "#fff", fillOpacity: 1 }).addTo(map);
  map.fitBounds(polyline.getBounds());
}

// 核心修正：將功能掛載至 window 確保手機版 HTML 能抓到
window.showPointPopup = function(index, title, timeLabel = null) {
  const p = trackPoints[index];
  const displayTime = timeLabel || p.timeLocal;
  // 重要：onclick 必須包含 window. 否則手機版常會找不到函數
  const content = `
    <div style="min-width:160px; font-family: sans-serif;">
      <b>${title}</b><br>
      高度: ${p.ele.toFixed(0)} m<br>里程: ${p.distance.toFixed(2)} km<br>時間: ${displayTime}<hr style="margin:8px 0;">
      <div style="display:flex; gap:6px;">
        <button onclick="window.setPoint('A', ${index})" style="flex:1; background:#007bff; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer;">設 A 點</button>
        <button onclick="window.setPoint('B', ${index})" style="flex:1; background:#e83e8c; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer;">設 B 點</button>
      </div>
    </div>`;
  hoverMarker.setLatLng([p.lat, p.lon]).bindPopup(content).openPopup();
};

window.setPoint = function(type, idx) {
  const p = trackPoints[idx];
  const info = `高度: ${p.ele.toFixed(0)}m, 里程: ${p.distance.toFixed(2)}km<br>時間: ${p.timeLocal}`;
  if (type === 'A') {
    pointA = { ...p, index: idx };
    if (markerA) map.removeLayer(markerA);
    markerA = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', html: blueIconHtml, iconSize:[24,24], iconAnchor:[12,12] }) }).addTo(map);
    document.getElementById("pointAInfo").innerHTML = `
      <div style="border-left:4px solid #007bff; padding-left:10px; position:relative;">
        <b>A 點</b> <button onclick="window.clearSpecificPoint('A')" style="position:absolute; right:0; top:0; background:none; border:1px solid #ccc; cursor:pointer; font-size:12px;">清除</button><br>${info}
      </div>`;
  } else {
    pointB = { ...p, index: idx };
    if (markerB) map.removeLayer(markerB);
    markerB = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', html: pinkIconHtml, iconSize:[24,24], iconAnchor:[12,12] }) }).addTo(map);
    document.getElementById("pointBInfo").innerHTML = `
      <div style="border-left:4px solid #e83e8c; padding-left:10px; position:relative;">
        <b>B 點</b> <button onclick="window.clearSpecificPoint('B')" style="position:absolute; right:0; top:0; background:none; border:1px solid #ccc; cursor:pointer; font-size:12px;">清除</button><br>${info}
      </div>`;
  }
  calculateSection();
  map.closePopup();
};

window.clearSpecificPoint = function(type) {
  if (type === 'A') { pointA = null; if (markerA) map.removeLayer(markerA); document.getElementById("pointAInfo").innerHTML = "A 點：尚未設定"; }
  else { pointB = null; if (markerB) map.removeLayer(markerB); document.getElementById("pointBInfo").innerHTML = "B 點：尚未設定"; }
  calculateSection();
};

window.swapAB = function() {
  if (!pointA || !pointB) return;
  const tA = pointA.index, tB = pointB.index;
  window.setPoint('A', tB); window.setPoint('B', tA);
};

function calculateSection() {
  const resDiv = document.getElementById("measureResult");
  if (!pointA || !pointB) { resDiv.innerHTML = "區間測量：請設定 A 點、B 點"; return; }
  const startIdx = Math.min(pointA.index, pointB.index);
  const endIdx = Math.max(pointA.index, pointB.index);
  const sectionPoints = trackPoints.slice(startIdx, endIdx + 1);
  const { gain, loss } = calculateElevationStats(sectionPoints);
  const dist = Math.abs(pointB.distance - pointA.distance).toFixed(2);
  const timeMs = Math.abs(pointB.timeUTC.getTime() - pointA.timeUTC.getTime());
  const hh = Math.floor(timeMs / 3600000), mm = Math.floor((timeMs % 3600000) / 60000);
  resDiv.innerHTML = `
    <div style="background:#f0f8ff; padding:10px; border-radius:8px; border:1px solid #36a2eb; margin-top:10px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
        <strong style="color:#007bff;">區間分析 (A ↔ B)</strong>
        <button onclick="window.swapAB()">對調</button>
      </div>
      區間總爬升：${gain.toFixed(0)} m<br>區間總下降：${loss.toFixed(0)} m<br>距離差：${dist} km<br>時間差：${hh} 小時 ${mm} 分鐘
    </div>`;
}

window.focusWaypoint = function(lat, lon, name) {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  map.setView([lat, lon], 16);
  let minD = Infinity, trackIdx = 0, wptTime = "";
  trackPoints.forEach((tp, i) => {
    const d = Math.sqrt((lat - tp.lat)**2 + (lon - tp.lon)**2);
    if (d < minD) { minD = d; trackIdx = i; }
  });
  const found = wptMarkers.find(w => w.name === name);
  if (found) wptTime = found.time;
  window.showPointPopup(trackIdx, name, wptTime);
};

function drawElevationChart() {
  const ctx = document.getElementById("elevationChart").getContext("2d");
  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: trackPoints.map(p => p.distance.toFixed(2)),
      datasets: [{ label: "高度 (m)", data: trackPoints.map(p => p.ele), fill: true, backgroundColor: 'rgba(54, 162, 235, 0.2)', borderColor: 'rgba(54, 162, 235, 1)', tension: 0.1, pointRadius: 0 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      // 點擊高度圖任意位置也會觸發彈窗，這在手機上操作最容易
      onClick: (event, elements) => { if (elements.length) window.showPointPopup(elements[0].index, "位置資訊"); }
    }
  });
}

function renderRouteInfo() {
  const f = trackPoints[0], l = trackPoints.at(-1);
  const dur = l.timeUTC.getTime() - f.timeUTC.getTime();
  const { gain, loss } = calculateElevationStats(trackPoints);
  const eles = trackPoints.map(p => p.ele);
  const currentRoute = allTracks[routeSelect.value || 0];
  document.getElementById("routeSummary").innerHTML = `
    記錄日期：${f.timeLocal.substring(0, 10)}<br>路線：${currentRoute.name}<br>里程：${l.distance.toFixed(2)} km<br>
    花費時間：${Math.floor(dur/3600000)} 小時 ${Math.floor((dur%3600000)/60000)} 分鐘<br>
    最高海拔：${Math.max(...eles).toFixed(0)} m<br>最低海拔：${Math.min(...eles).toFixed(0)} m<br>
    總爬升：${gain.toFixed(0)} m<br>總下降：${loss.toFixed(0)} m`;
  const wptListContainer = document.getElementById("wptList");
  if (currentRoute.waypoints && currentRoute.waypoints.length > 0) {
    let html = `<table class="wpt-table"><thead><tr><th style="width:40px;">#</th><th>日期與時間</th><th>名稱</th></tr></thead><tbody>`;
    currentRoute.waypoints.forEach((w, i) => {
      html += `<tr><td><span class="wpt-link" onclick="window.focusWaypoint(${w.lat}, ${w.lon}, '${w.name}')">${i + 1}</span></td><td>${w.localTime}</td><td>${w.name}</td></tr>`;
    });
    wptListContainer.innerHTML = `<h4 style="margin:20px 0 10px 0;">航點列表</h4>` + html + `</tbody></table>`;
  } else { wptListContainer.innerHTML = ""; }
}

function formatDate(d) { return d.toISOString().replace("T", " ").substring(0, 19); }