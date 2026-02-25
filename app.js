// ================= 地圖初始化 =================
const map = L.map("map", { tap: true }).setView([25.03, 121.56], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { 
  attribution: "© OpenStreetMap" 
}).addTo(map);

let allTracks = [], trackPoints = [], polyline, hoverMarker, chart, markers = [], wptMarkers = [];
let pointA = null, pointB = null, markerA = null, markerB = null;
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
  iconSize: [20, 32], iconAnchor: [10, 32], popupAnchor: [1, -28], shadowSize: [32, 32]
});

// ================= A/B 點清除邏輯 =================
window.clearABSettings = function() {
  pointA = null;
  pointB = null;
  if (markerA) { map.removeLayer(markerA); markerA = null; }
  if (markerB) { map.removeLayer(markerB); markerB = null; }
  updateABUI();
  // 【關鍵：清除時同時關閉地圖上所有的彈窗】
  map.closePopup(); 
};

// ================= GPX 解析 =================
document.getElementById("gpxInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  
  // 上傳新檔案時，強制關閉舊彈窗
  map.closePopup(); 
  
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
    waypoints.push({ 
      lat, lon, name, 
      localTime: time ? formatDate(new Date(new Date(time).getTime() + 8*3600000)) : "無時間資訊" 
    });
  }

  const trks = xml.getElementsByTagName("trk");
  for (let i = 0; i < trks.length; i++) {
    const pts = trks[i].getElementsByTagName("trkpt");
    const points = extractPoints(pts);
    if (points.length > 0) {
      allTracks.push({ 
        name: trks[i].getElementsByTagName("name")[0]?.textContent || `路線 ${i + 1}`, 
        points, waypoints 
      });
    }
  }

  if (allTracks.length > 1) {
    document.getElementById("routeSelectContainer").style.display = "block";
    allTracks.forEach((t, i) => {
      const opt = document.createElement("option"); opt.value = i; opt.textContent = t.name;
      routeSelect.appendChild(opt);
    });
  } else {
    document.getElementById("routeSelectContainer").style.display = "none";
  }
  loadRoute(0);
}

function extractPoints(pts) {
  let res = [], total = 0;
  for (let i = 0; i < pts.length; i++) {
    const lat = parseFloat(pts[i].getAttribute("lat")), lon = parseFloat(pts[i].getAttribute("lon"));
    const ele = pts[i].getElementsByTagName("ele")[0], time = pts[i].getElementsByTagName("time")[0];
    if (!isNaN(lat) && !isNaN(lon) && ele && time) {
      const utc = new Date(time.textContent);
      if (res.length > 0) {
        const a = res[res.length-1], R = 6371;
        const dLat = (lat-a.lat)*Math.PI/180, dLon = (lon-a.lon)*Math.PI/180;
        const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLon/2)**2;
        total += 2 * R * Math.asin(Math.sqrt(x));
      }
      res.push({ lat, lon, ele: parseFloat(ele.textContent), timeUTC: utc, timeLocal: formatDate(new Date(utc.getTime() + 8*3600*1000)), distance: total });
    }
  }
  return res;
}

// ================= 過濾與計算邏輯 =================
function calculateElevationGainFiltered(points = trackPoints) {
  if (points.length < 3) return { gain: 0, loss: 0 };
  let cleanPoints = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prevEle = points[i-1].ele, currEle = points[i].ele;
    cleanPoints.push(Math.abs(currEle - prevEle) > 100 ? { ...points[i], ele: prevEle } : points[i]);
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

// ================= 地圖載入與顯示 =================
routeSelect.addEventListener("change", (e) => {
  clearABSettings(); // 切換路線自動清除 A/B
  loadRoute(parseInt(e.target.value));
});

function loadRoute(index) {
  // 【關鍵：載入新路線前，關閉所有舊彈窗】
  map.closePopup(); 
  
  const sel = allTracks[index]; 
  if (!sel) return;
  trackPoints = sel.points;

  if (polyline) map.removeLayer(polyline); 
  markers.forEach(m => map.removeLayer(m)); 
  wptMarkers.forEach(m => map.removeLayer(m));
  if (chart) chart.destroy(); 
  markers = []; wptMarkers = [];
  
  polyline = L.polyline(trackPoints.map(p => [p.lat, p.lon]), { color: "red", weight: 6, opacity: 0.7 }).addTo(map);
  map.fitBounds(polyline.getBounds());

  const mStart = L.marker([trackPoints[0].lat, trackPoints[0].lon], { icon: startIcon }).addTo(map);
  mStart.on('click', () => showCustomPopup(0, "起點"));
  const mEnd = L.marker([trackPoints.at(-1).lat, trackPoints.at(-1).lon], { icon: endIcon }).addTo(map);
  mEnd.on('click', () => showCustomPopup(trackPoints.length-1, "終點"));
  markers.push(mStart, mEnd);

  sel.waypoints.forEach(w => {
    let minD = Infinity, tIdx = 0;
    trackPoints.forEach((tp, i) => {
      let d = Math.sqrt((w.lat - tp.lat)**2 + (w.lon - tp.lon)**2);
      if (d < minD) { minD = d; tIdx = i; }
    });
    const wm = L.marker([w.lat, w.lon], { icon: wptIcon }).addTo(map);
    wm.on('click', () => showCustomPopup(tIdx, w.name));
    wptMarkers.push(wm);
  });

  polyline.on('click', (e) => {
    let minD = Infinity, idx = 0;
    trackPoints.forEach((p, i) => { const d = Math.sqrt((p.lat - e.latlng.lat)**2 + (p.lon - e.latlng.lng)**2); if (d < minD) { minD = d; idx = i; } });
    showCustomPopup(idx, "位置資訊");
  });

  hoverMarker = L.circleMarker([trackPoints[0].lat, trackPoints[0].lon], { radius: 6, color: "blue", fillColor: "#fff", fillOpacity: 1 }).addTo(map);
  drawElevationChart();
  renderRouteInfo();
}

window.focusWaypoint = function(lat, lon, name) {
  let minD = Infinity, idx = 0;
  trackPoints.forEach((p, i) => {
    const d = Math.sqrt((p.lat - lat)**2 + (p.lon - lon)**2);
    if (d < minD) { minD = d; idx = i; }
  });

  map.setView([lat, lon], 16);
  document.getElementById("map").scrollIntoView({ behavior: 'smooth', block: 'start' });

  setTimeout(() => {
    showCustomPopup(idx, name);
  }, 300);
};

function showCustomPopup(idx, title) {
  const p = trackPoints[idx];
  const content = `
    <div style="min-width:180px; font-size:13px; line-height:1.5;">
      <b style="font-size:14px;">${title}</b><br>
      高度: ${p.ele.toFixed(0)} m<br>
      距離: ${p.distance.toFixed(2)} km<br>
      時間: ${p.timeLocal}<br>
      座標: ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}
      <div style="display:flex; margin-top:10px; gap:5px;">
        <button onclick="setAB('A', ${idx})" style="flex:1; background:#007bff; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold;">設定 A</button>
        <button onclick="setAB('B', ${idx})" style="flex:1; background:#e83e8c; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold;">設定 B</button>
      </div>
    </div>`;
  L.popup().setLatLng([p.lat, p.lon]).setContent(content).openOn(map);
}

window.setAB = function(type, idx) {
  const p = trackPoints[idx];
  if (type === 'A') {
    pointA = { ...p, idx };
    if (markerA) map.removeLayer(markerA);
    markerA = L.marker([p.lat, p.lon], { icon: L.divIcon({ html: `<div style="background:#007bff;color:white;border-radius:50%;width:24px;height:24px;text-align:center;line-height:24px;font-weight:bold;border:2px solid white;">A</div>`, iconSize:[24,24], iconAnchor:[12,12], className:'' }) }).addTo(map);
  } else {
    pointB = { ...p, idx };
    if (markerB) map.removeLayer(markerB);
    markerB = L.marker([p.lat, p.lon], { icon: L.divIcon({ html: `<div style="background:#e83e8c;color:white;border-radius:50%;width:24px;height:24px;text-align:center;line-height:24px;font-weight:bold;border:2px solid white;">B</div>`, iconSize:[24,24], iconAnchor:[12,12], className:'' }) }).addTo(map);
  }
  updateABUI();
};

function updateABUI() {
  const infoA = document.getElementById("infoA"), infoB = document.getElementById("infoB"), boxRes = document.getElementById("boxRes"), infoRes = document.getElementById("infoRes");
  if (pointA) infoA.innerHTML = `高度: ${pointA.ele.toFixed(0)} m, 里程: ${pointA.distance.toFixed(2)} km<br>時間: ${pointA.timeLocal}`;
  else infoA.innerHTML = "尚未設定";
  
  if (pointB) infoB.innerHTML = `高度: ${pointB.ele.toFixed(0)} m, 里程: ${pointB.distance.toFixed(2)} km<br>時間: ${pointB.timeLocal}`;
  else infoB.innerHTML = "尚未設定";

  if (pointA && pointB) {
    boxRes.style.display = "block";
    const start = Math.min(pointA.idx, pointB.idx), end = Math.max(pointA.idx, pointB.idx);
    const section = trackPoints.slice(start, end + 1);
    const { gain, loss } = calculateElevationGainFiltered(section);
    const timeDiff = Math.abs(pointA.timeUTC - pointB.timeUTC);
    infoRes.innerHTML = `區間爬升：<b>${gain.toFixed(0)} m</b> / 下降：<b>${loss.toFixed(0)} m</b><br>距離差：<b>${Math.abs(pointA.distance - pointB.distance).toFixed(2)} km</b><br>時間差：<b>${Math.floor(timeDiff/3600000)} 小時 ${Math.floor((timeDiff%3600000)/60000)} 分鐘</b>`;
  } else if (boxRes) boxRes.style.display = "none";
}

// ================= 高度圖 =================
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
      onHover: (event, elements) => { if (elements.length) { const p = trackPoints[elements[0].index]; hoverMarker.setLatLng([p.lat, p.lon]); } },
      onClick: (event, elements) => { if (elements.length) showCustomPopup(elements[0].index, "高度圖選點"); }
    }
  });
}

function renderRouteInfo() {
  const f = trackPoints[0], l = trackPoints.at(-1), dur = l.timeUTC - f.timeUTC, { gain, loss } = calculateElevationGainFiltered();
  const currentRoute = allTracks[routeSelect.value || 0];
  document.getElementById("routeSummary").innerHTML = `
    記錄日期：${f.timeLocal.substring(0, 10)}<br>路線：${currentRoute.name}<br>里程：${l.distance.toFixed(2)} km<br>
    花費時間：${Math.floor(dur/3600000)} 小時 ${Math.floor((dur%3600000)/60000)} 分鐘<br>
    最高海拔：${Math.max(...trackPoints.map(p=>p.ele)).toFixed(0)} m<br>最低海拔：${Math.min(...trackPoints.map(p=>p.ele)).toFixed(0)} m<br>
    總爬升：${gain.toFixed(0)} m<br>總下降：${loss.toFixed(0)} m`;
  
  let tableHtml = `<table class="wpt-table"><thead><tr><th style="width:10%">#</th><th style="width:40%">日期與時間</th><th style="width:50%">航點名稱</th></tr></thead><tbody>`;
  currentRoute.waypoints.forEach((w, i) => {
    tableHtml += `<tr><td><span class="wpt-link" onclick="focusWaypoint(${w.lat}, ${w.lon}, '${w.name}')">${i + 1}</span></td><td>${w.localTime}</td><td>${w.name}</td></tr>`;
  });
  document.getElementById("wptList").innerHTML = `<h4 style="margin: 20px 0 10px 0;">航點列表</h4>` + tableHtml + `</tbody></table>`;
}

function formatDate(d) { return d.toISOString().replace("T", " ").substring(0, 19); }