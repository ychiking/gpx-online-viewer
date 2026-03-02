// ================= 地圖初始化 =================
const map = L.map("map", { tap: true }).setView([25.03, 121.56], 12);

// 1. 定義 OpenStreetMap (預設)
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { 
  attribution: "© OpenStreetMap" 
});

// 2. 定義 OpenTopoMap (等高線地形圖)
const otm = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
  maxZoom: 17,
  attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
});

// 將預設地圖加入地圖物件
osm.addTo(map);

// 3. 建立底圖切換選單
const baseMaps = {
  "標準地圖 (OSM)": osm,
  "等高線地形圖 (OpenTopo)": otm
};

// 將切換按鈕加入地圖右上角
L.control.layers(baseMaps).addTo(map);

let allTracks = [], trackPoints = [], polyline, hoverMarker, chart, markers = [], wptMarkers = [];
let pointA = null, pointB = null, markerA = null, markerB = null;
let currentPopup = null; 
let isMouseDown = false; 
let mapTipTimer = null; // 用於高度圖觸發後的 3 秒自動關閉定時器

const routeSelect = document.getElementById("routeSelect");

// ================= 下拉選單切換事件 =================
routeSelect.addEventListener("change", (e) => {
    const selectedIndex = parseInt(e.target.value);
    loadRoute(selectedIndex);
});

// ================= 定義圖示 (保持不變) =================
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

// ================= A/B 點與解析邏輯 (保持不變) =================
window.clearABSettings = function() {
  pointA = null; pointB = null;
  if (markerA) { map.removeLayer(markerA); markerA = null; }
  if (markerB) { map.removeLayer(markerB); markerB = null; }
  updateABUI();
  map.closePopup(); 
};

document.getElementById("gpxInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  
  // 更新介面上的檔案名稱顯示
  document.getElementById("fileNameDisplay").textContent = file.name;
  
  map.closePopup(); 
  const reader = new FileReader();
  reader.onload = () => parseGPX(reader.result);
  reader.readAsText(file);
});

function parseGPX(text) {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  allTracks = [];
  routeSelect.innerHTML = "";
  
  // 1. 先取得所有原始航點 (wpt)
  const wpts = xml.getElementsByTagName("wpt");
  let allWpts = [];
  for (let w of wpts) {
    const lat = parseFloat(w.getAttribute("lat")), lon = parseFloat(w.getAttribute("lon"));
    const name = w.getElementsByTagName("name")[0]?.textContent || "未命名航點";
    const time = w.getElementsByTagName("time")[0]?.textContent;
    allWpts.push({ lat, lon, name, localTime: time ? formatDate(new Date(new Date(time).getTime() + 8*3600000)) : "無時間資訊" });
  }

  // 2. 處理每一條路線 (trk)
  const trks = xml.getElementsByTagName("trk");
  for (let i = 0; i < trks.length; i++) {
    const pts = trks[i].getElementsByTagName("trkpt");
    const points = extractPoints(pts);
    
    // 【關鍵修正】：只篩選出「距離該路線 500 公尺內」的航點
    const routeWaypoints = allWpts.filter(w => {
      return points.some(p => {
        const d = Math.sqrt((w.lat - p.lat)**2 + (w.lon - p.lon)**2) * 111000; // 簡單距離計算
        return d < 500; // 單位：公尺，您可以根據需要調整範圍
      });
    });

    if (points.length > 0) {
      allTracks.push({ 
        name: trks[i].getElementsByTagName("name")[0]?.textContent || `路線 ${i + 1}`, 
        points, 
        waypoints: routeWaypoints // 每個路線只帶入過濾後的航點
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
    if (Math.abs(diff) >= threshold) { if (diff > 0) gain += diff; else loss += Math.abs(diff); lastEle = smoothed[i]; }
  }
  return { gain, loss };
}

function getBearingInfo(lat1, lon1, lat2, lon2) {
    const toRad = deg => deg * Math.PI / 180;
    const toDeg = rad => rad * 180 / Math.PI;
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    let bearing = (toDeg(Math.atan2(y, x)) + 360) % 360;
    const directions = ["北", "東北", "東", "東南", "南", "西南", "西", "西北"];
    const index = Math.round(bearing / 45) % 8;
    return { deg: bearing.toFixed(0), name: directions[index] };
}

// ================= 地圖載入與連動 =================
function loadRoute(index) {
  map.closePopup(); 
  window.clearABSettings(); 
 
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
  mStart.on('click', () => { showCustomPopup(0, "起點"); });
  const mEnd = L.marker([trackPoints.at(-1).lat, trackPoints.at(-1).lon], { icon: endIcon }).addTo(map);
  mEnd.on('click', () => { showCustomPopup(trackPoints.length-1, "終點"); });
  markers.push(mStart, mEnd);

  sel.waypoints.forEach(w => {
    let minD = Infinity, tIdx = 0;
    trackPoints.forEach((tp, i) => {
      let d = Math.sqrt((w.lat - tp.lat)**2 + (w.lon - tp.lon)**2);
      if (d < minD) { minD = d; tIdx = i; }
    });
    const wm = L.marker([w.lat, w.lon], { icon: wptIcon }).addTo(map);
    
    wm.on('click', () => { 
      showCustomPopup(tIdx, w.name); 
      if (hoverMarker) { hoverMarker.setLatLng([w.lat, w.lon]); }
      if (chart) {
        const meta = chart.getDatasetMeta(0);
        const point = meta.data[tIdx];
        chart.setActiveElements([{ datasetIndex: 0, index: tIdx }]);
        chart.tooltip.setActiveElements([{ datasetIndex: 0, index: tIdx }], { x: point.x, y: point.y });
        chart.update('none');
        if (window.chartTipTimer) clearTimeout(window.chartTipTimer);
        window.chartTipTimer = setTimeout(() => {
          if (!isMouseDown && chart) {
            chart.tooltip.setActiveElements([], { x: 0, y: 0 });
            chart.update();
          }
        }, 3000);
      }
    });
    wptMarkers.push(wm);
  });

  polyline.on('click', (e) => {
    let minD = Infinity, idx = 0;
    trackPoints.forEach((p, i) => { 
      const d = Math.sqrt((p.lat - e.latlng.lat)**2 + (p.lon - e.latlng.lng)**2); 
      if (d < minD) { minD = d; idx = i; } 
    });
    hoverMarker.setLatLng([trackPoints[idx].lat, trackPoints[idx].lon]);
    showCustomPopup(idx, "位置資訊"); 
    if (chart) {
      const meta = chart.getDatasetMeta(0);
      const point = meta.data[idx];
      chart.setActiveElements([{ datasetIndex: 0, index: idx }]);
      chart.tooltip.setActiveElements([{ datasetIndex: 0, index: idx }], { x: point.x, y: point.y });
      chart.update('none');
      if (window.chartTipTimer) clearTimeout(window.chartTipTimer);
      window.chartTipTimer = setTimeout(() => {
        if (!isMouseDown && chart) {
          chart.tooltip.setActiveElements([], { x: 0, y: 0 });
          chart.update();
        }
      }, 3000);
    }
  });

  hoverMarker = L.circleMarker([trackPoints[0].lat, trackPoints[0].lon], { radius: 6, color: "blue", fillColor: "#fff", fillOpacity: 1, weight: 3 }).addTo(map);
  drawElevationChart();
  renderRouteInfo();
  detectPeaksAlongRoute();
}

window.toggleCompass = function() {
		const compass = document.querySelector(".map-compass");
    if (compass) { compass.classList.toggle("show"); }
};

const CompassControl = L.Control.extend({
    options: { position: 'topleft' }, 
    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const button = L.DomUtil.create('a', '', container);
        button.innerHTML = '🧭'; button.href = '#'; button.title = '顯示/隱藏指北針';
        button.style.fontSize = '20px'; button.style.backgroundColor = 'white'; button.style.textAlign = 'center';
        button.style.textDecoration = 'none'; button.style.lineHeight = '30px'; button.style.width = '30px';
        button.style.height = '30px'; button.style.display = 'block'; button.style.cursor = 'pointer';
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);
        L.DomEvent.on(button, 'click', function (e) { L.DomEvent.stop(e); window.toggleCompass(); });
        L.DomEvent.on(button, 'touchend', function (e) { L.DomEvent.stop(e); window.toggleCompass(); });
        return container;
    }
});
map.addControl(new CompassControl());

// ================= 彈窗訊息 (修改後：支援不在路徑上的簡化模式) =================
function showCustomPopup(idx, title, offPathEle = null, realLat = null, realLon = null) {
  if (!trackPoints[idx]) return;
  const p = trackPoints[idx];
  let content = "";
  let targetLatLng = [p.lat, p.lon];

  // 判定是否為不在路徑上的模式 (藉由傳入 offPathEle)
  if (offPathEle !== null) {
      content = `
        <div style="min-width:160px; font-size:13px; line-height:1.6;">
          <b style="font-size:14px;">${title}</b><br>
          高度: ${offPathEle} m<br>
          <span style="color:red; font-weight:bold;">⚠️ 不在路徑上</span>
        </div>`;
      // 如果有提供真實座標，彈窗對準真實座標
      if (realLat && realLon) targetLatLng = [realLat, realLon];
  } else {
      // 原始路徑點/航點彈窗邏輯
      content = `
        <div style="min-width:180px; font-size:13px; line-height:1.5;">
          <b style="font-size:14px;">${title}</b><br>
          高度: ${p.ele.toFixed(0)} m<br>距離: ${p.distance.toFixed(2)} km<br>時間: ${p.timeLocal}<br>座標: ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}
          <div style="display:flex; margin-top:10px; gap:5px;">
            <button onclick="setAB('A', ${idx})" style="flex:1; background:#007bff; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold;">設定 A</button>
            <button onclick="setAB('B', ${idx})" style="flex:1; background:#e83e8c; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold;">設定 B</button>
          </div>
        </div>`;
  }

  if (currentPopup && map.hasLayer(currentPopup)) {
    currentPopup.setLatLng(targetLatLng).setContent(content);
  } else {
    currentPopup = L.popup({ autoClose: true, closeOnClick: false, fadeAnimation: false })
    .setLatLng(targetLatLng).setContent(content).openOn(map);
  }
}

function startHeightTipTimer() {
  if (mapTipTimer) clearTimeout(mapTipTimer);
  mapTipTimer = setTimeout(() => {
    if (currentPopup && map.hasLayer(currentPopup)) {
      const el = currentPopup.getElement();
      if (el && el.innerText.includes("位置資訊")) { map.closePopup(); }
    }
  }, 3000);
}

// ================= 高度圖 =================
let mouseX = null; 

function drawElevationChart() {
  const canvas = document.getElementById("elevationChart");
  const ctx = canvas.getContext("2d");
  if (chart) chart.destroy();

  canvas.addEventListener('mousedown', (e) => { 
    if (e.button === 0) { isMouseDown = true; if (mapTipTimer) clearTimeout(mapTipTimer); handleSync(e); }
  });
  canvas.addEventListener('touchstart', (e) => {
    isMouseDown = true; if (mapTipTimer) clearTimeout(mapTipTimer); handleSync(e); if (e.cancelable) e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (isMouseDown) { handleSync(e); if (e.cancelable) e.preventDefault(); }
  }, { passive: false });
  window.addEventListener('mouseup', () => { 
    if (isMouseDown) { isMouseDown = false; startHeightOnlyTimer(); }
    if (chart) { chart.tooltip.setActiveElements([], { x: 0, y: 0 }); chart.update('none'); }
  });
  canvas.addEventListener('touchend', () => {
    if (isMouseDown) { isMouseDown = false; startHeightOnlyTimer(); }
    if (chart) { chart.tooltip.setActiveElements([], { x: 0, y: 0 }); chart.update('none'); }
  });
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect(); mouseX = e.clientX - rect.left;
    if (isMouseDown) { handleSync(e); } else {
      if (chart && chart.getActiveElements().length > 0) { chart.tooltip.setActiveElements([], { x: 0, y: 0 }); chart.update('none'); }
    }
  });
  canvas.addEventListener('mouseleave', () => { 
    mouseX = null; if (isMouseDown) { isMouseDown = false; startHeightOnlyTimer(); }
    if (chart) { chart.tooltip.setActiveElements([], { x: 0, y: 0 }); chart.update('none'); }
  });

  function handleSync(e) {
    const points = chart.getElementsAtEventForMode(e, 'index', { intersect: false }, true);
    if (points.length) {
      const idx = points[0].index;
      const p = trackPoints[idx];
      hoverMarker.setLatLng([p.lat, p.lon]);
      showCustomPopup(idx, "位置資訊");
      chart.setActiveElements([{ datasetIndex: 0, index: idx }]);
      chart.tooltip.setActiveElements([{ datasetIndex: 0, index: idx }], { x: 0, y: 0 });
      chart.update('none');
      if (window.chartTipTimer) clearTimeout(window.chartTipTimer);
      if (isMouseDown) {
        window.chartTipTimer = setTimeout(() => {
          if (chart) { chart.tooltip.setActiveElements([], { x: 0, y: 0 }); chart.update('none'); }
        }, 3000);
      }
    }
  }

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: trackPoints.map(p => p.distance.toFixed(2)),
      datasets: [{ 
        label: "高度 (m)", data: trackPoints.map(p => p.ele), fill: true, 
        backgroundColor: 'rgba(54, 162, 235, 0.2)', borderColor: 'rgba(54, 162, 235, 1)', tension: 0.1, 
		    pointRadius: 0, pointHitRadius: 10, pointHoverRadius: 8, pointHoverBackgroundColor: 'rgba(54, 162, 235, 0.8)', pointHoverBorderWidth: 2, pointHoverBorderColor: '#fff'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      events: ['mousedown', 'mouseup', 'click', 'touchstart', 'touchmove', 'touchend'],
      interaction: { intersect: false, mode: "index" },
      plugins: {
        tooltip: {
          enabled: true, displayColors: false, 
          filter: () => isMouseDown || (chart && chart.getActiveElements().length > 0),
          callbacks: {
            title: () => "位置資訊", 
            label: function(context) {
              const p = trackPoints[context.dataIndex];
              return [` \u25A0 距離: ${p.distance.toFixed(2)} km`, ` \u25A0 高度: ${p.ele.toFixed(0)} m`, ` \u25A0 時間: ${p.timeLocal.split(' ')[1]}`];
            }
          }
        }
      }
    },
    plugins: [{
      id: 'verticalLine',
      afterDraw: (chart) => {
        if (mouseX !== null) {
          const x = mouseX; const topY = chart.chartArea.top; const bottomY = chart.chartArea.bottom; const _ctx = chart.ctx;
          _ctx.save(); _ctx.beginPath(); _ctx.moveTo(x, topY); _ctx.lineTo(x, bottomY);
          _ctx.lineWidth = 1; _ctx.strokeStyle = isMouseDown ? 'rgba(0, 123, 255, 0.8)' : 'rgba(150, 150, 150, 0.4)';
          _ctx.setLineDash(isMouseDown ? [] : [5, 5]); _ctx.stroke();
          if (!isMouseDown) { _ctx.fillStyle = 'rgba(150, 150, 150, 0.8)'; _ctx.font = '10px Arial'; _ctx.fillText(' 按住拖動 ', x + 5, topY + 15); }
          _ctx.restore();
        }
      }
    }]
  });
}

function startHeightOnlyTimer() {
  if (mapTipTimer) clearTimeout(mapTipTimer);
  mapTipTimer = setTimeout(() => {
    if (currentPopup && map.hasLayer(currentPopup)) {
      const content = currentPopup.getContent();
      if (typeof content === 'string' && content.includes("位置資訊")) { map.closePopup(); }
    }
  }, 3000);
}

// ================= 航點導向功能 (修改為判斷路徑距離並傳遞高度) =================
window.focusWaypoint = function(lat, lon, name, distToTrack = 0, ele = null) {
    map.setView([lat, lon], 16);
    
    let minD = Infinity, idx = 0;
    trackPoints.forEach((tp, i) => {
        let d = Math.sqrt((lat - tp.lat) ** 2 + (lon - tp.lon) ** 2);
        if (d < minD) { minD = d; idx = i; }
    });

    if (hoverMarker) { hoverMarker.setLatLng([lat, lon]); }

    // 如果距離超過 100 公尺，執行簡化彈窗模式
    if (distToTrack > 100) {
        showCustomPopup(idx, name, ele, lat, lon);
    } else {
        showCustomPopup(idx, name);
    }
    
    if (chart) {
        chart.setActiveElements([{ datasetIndex: 0, index: idx }]);
        chart.update('none');
    }
    document.getElementById("map").scrollIntoView({ behavior: 'smooth' });
};

// ================= A/B 設定與資訊渲染 (保持不變) =================
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
  updateABUI(); map.closePopup(); 
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
        const bearing = getBearingInfo(pointA.lat, pointA.lon, pointB.lat, pointB.lon);
        const oppDir = { "北":"南", "南":"北", "東":"西", "西":"東", "東北":"西南", "西南":"東北", "東南":"西北", "西北":"東南" }[bearing.name];
        const analysisContent = `
            區間爬升：<b>${gain.toFixed(0)} m</b> / 下降：<b>${loss.toFixed(0)} m</b><br>
            距　　離：<b>${Math.abs(pointA.distance - pointB.distance).toFixed(2)} km</b><br>
            時　　間：<b>${Math.floor(timeDiff/3600000)} 小時 ${Math.floor((timeDiff%3600000)/60000)} 分鐘</b><br>
            移動方位：<span style="color:#007bff; font-weight:bold;">從 ${oppDir} 往 ${bearing.name} (${bearing.deg}°)</span>`;
        infoRes.innerHTML = analysisContent;
        if (typeof markerB !== 'undefined' && markerB) {
            markerB.unbindTooltip();
            markerB.bindTooltip(`
                <div style="font-size:13px; line-height:1.4;">
                    <b style="color:#28a745;">區間分析 (A ↔ B)</b><br>
                    ${analysisContent}
                    <div style="margin-top:8px; border-top:1px solid #eee; padding-top:4px; text-align:right;">
                        <a href="javascript:void(0);" onclick="clearABSettings();" style="color:#d35400; text-decoration:none; font-weight:bold; font-size:12px;">❌ 清除 A B 點</a>
                    </div>
                </div>`, { permanent: true, interactive: true, direction: 'right', offset: [15, 0], className: 'ab-map-tooltip' }).openTooltip();
        }
    } else {
        if (boxRes) boxRes.style.display = "none";
        if (typeof markerB !== 'undefined' && markerB) { markerB.unbindTooltip(); }
    }
}

function renderRouteInfo() {
  const f = trackPoints[0], l = trackPoints.at(-1), dur = l.timeUTC - f.timeUTC, { gain, loss } = calculateElevationGainFiltered();
  const currentRoute = allTracks[routeSelect.value || 0];
  document.getElementById("routeSummary").innerHTML = `記錄日期：${f.timeLocal.substring(0, 10)}<br>路　　線：${currentRoute.name}<br>里　　線：${l.distance.toFixed(2)} km<br>花費時間：${Math.floor(dur/3600000)} 小時 ${Math.floor((dur%3600000)/60000)} 分鐘<br>最高海拔：${Math.max(...trackPoints.map(p=>p.ele)).toFixed(0)} m<br>最低海拔：${Math.min(...trackPoints.map(p=>p.ele)).toFixed(0)} m<br>總爬升數：${gain.toFixed(0)} m<br>總下降數：${loss.toFixed(0)} m`;
  const wptListContainer = document.getElementById("wptList");
  if (currentRoute.waypoints && currentRoute.waypoints.length > 0) {
    let tableHtml = `<table class="wpt-table"><thead><tr><th style="width:10%">#</th><th style="width:40%">日期與時間</th><th style="width:50%">航點名稱</th></tr></thead><tbody>`;
    currentRoute.waypoints.forEach((w, i) => { 
      tableHtml += `<tr><td><span class="wpt-link" onclick="focusWaypoint(${w.lat}, ${w.lon}, '${w.name}')">${i + 1}</span></td><td>${w.localTime}</td><td>${w.name}</td></tr>`; 
    });
    wptListContainer.innerHTML = `<h4 style="margin: 20px 0 10px 0;">航點列表</h4>` + tableHtml + `</tbody></table>`;
    wptListContainer.style.display = "block";
  } else { 
    wptListContainer.innerHTML = ""; wptListContainer.style.display = "none";
  }
}

function formatDate(d) { return d.toISOString().replace("T", " ").substring(0, 19); }

// ================= 自動偵測經過山岳 (Overpass API) =================
async function detectPeaksAlongRoute() {
    const wptListContainer = document.getElementById("wptList");
    wptListContainer.style.display = "block";
    let aiSection = document.getElementById("aiPeaksSection");
    if (!aiSection) { aiSection = document.createElement("div"); aiSection.id = "aiPeaksSection"; wptListContainer.appendChild(aiSection); }
    aiSection.innerHTML = `<div id="aiLoading" style="padding:20px; text-align:center; color:#666;">🔍 正在比對地圖資料，偵測沿途山岳...</div>`;

    const samplingRate = Math.max(1, Math.floor(trackPoints.length / 50));
    const sampledPoints = trackPoints.filter((_, i) => i % samplingRate === 0);
    let aroundSegments = sampledPoints.map(p => `node(around:200,${p.lat},${p.lon})[natural=peak];`).join("");
    const fullQuery = `[out:json][timeout:30];(${aroundSegments});out body;`;

    try {
        const response = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: "data=" + encodeURIComponent(fullQuery) });
        const data = await response.json();
        if (!data.elements || data.elements.length === 0) { aiSection.innerHTML = `<div style="padding:20px; color:#999; font-size:13px; text-align:center;">ℹ️ 沿途未偵測到額外的山峰標記。</div>`; return; }

        const uniquePeaks = [];
        const seenNames = new Set();
        data.elements.forEach(el => {
            const name = el.tags.name || "未命名山峰";
            const ele = el.tags.ele || "未知";
            if (!seenNames.has(name)) {
                seenNames.add(name);
                let minMeterDist = Infinity, bestIdx = 0;
                // 使用 Haversine 公式計算最短距離(公尺)
                trackPoints.forEach((tp, i) => {
                    const R = 6371000;
                    const dLat = (el.lat - tp.lat) * Math.PI / 180;
                    const dLon = (el.lon - tp.lon) * Math.PI / 180;
                    const a = Math.sin(dLat/2) ** 2 + Math.cos(tp.lat * Math.PI / 180) * Math.cos(el.lat * Math.PI / 180) * Math.sin(dLon/2) ** 2;
                    const d = 2 * R * Math.asin(Math.sqrt(a));
                    if (d < minMeterDist) { minMeterDist = d; bestIdx = i; }
                });
                uniquePeaks.push({ name, ele, lat: el.lat, lon: el.lon, time: trackPoints[bestIdx].timeLocal, idx: bestIdx, distToTrack: minMeterDist });
            }
        });
        uniquePeaks.sort((a, b) => a.idx - b.idx);
        renderPeakTable(uniquePeaks);
    } catch (error) {
        aiSection.innerHTML = `<div style="padding:20px; color:#721c24; background-color:#f8d7da; border:1px solid #f5c6cb; border-radius:8px; text-align:center; margin:10px 0;"><p style="margin-bottom:10px;">❌ 山岳偵測連線失敗</p><button onclick="detectPeaksAlongRoute()" style="padding:8px 16px; background:#d35400; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">🔄 重新偵測</button></div>`;
    }
}

function renderPeakTable(peaks) {
    const aiSection = document.getElementById("aiPeaksSection");
    if (!aiSection || peaks.length === 0) return;
    let html = `<h4 style="margin: 30px 0 10px 0; font-size: 16px; color: #2c3e50; border-left: 5px solid #d35400; padding-left: 10px;">⛰️ 自動偵測：沿途山岳</h4><table class="wpt-table"><thead><tr><th style="width:10%">#</th><th style="width:40%">日期與時間</th><th style="width:50%">山名 (海拔)</th></tr></thead><tbody>`;
    peaks.forEach((p, i) => {
        // 修改處：若距離 > 100m，時間欄位顯示 "------"
        const timeDisplay = p.distToTrack > 100 ? "------" : (p.time || '---');
        
        // 傳遞 distToTrack 與原始高度 p.ele 到 focusWaypoint
        html += `<tr><td><span class="wpt-link" onclick="focusWaypoint(${p.lat}, ${p.lon}, '${p.name}', ${p.distToTrack}, '${p.ele}')">${i+1}</span></td><td style="font-size: 13px; color: #666;">${timeDisplay}</td><td style="font-weight: bold; color: #007bff;">${p.name} <small style="color: #888; font-weight: normal;">(${p.ele}m)</small></td></tr>`;
    });
    aiSection.innerHTML = html + `</tbody></table>`;
}