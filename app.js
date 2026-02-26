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
  
  // 【新增內容】：更新介面上的檔案名稱顯示
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
  const wpts = xml.getElementsByTagName("wpt");
  let waypoints = [];
  for (let w of wpts) {
    const lat = parseFloat(w.getAttribute("lat")), lon = parseFloat(w.getAttribute("lon"));
    const name = w.getElementsByTagName("name")[0]?.textContent || "未命名航點";
    const time = w.getElementsByTagName("time")[0]?.textContent;
    waypoints.push({ lat, lon, name, localTime: time ? formatDate(new Date(new Date(time).getTime() + 8*3600000)) : "無時間資訊" });
  }
  const trks = xml.getElementsByTagName("trk");
  for (let i = 0; i < trks.length; i++) {
    const pts = trks[i].getElementsByTagName("trkpt");
    const points = extractPoints(pts);
    if (points.length > 0) {
      allTracks.push({ name: trks[i].getElementsByTagName("name")[0]?.textContent || `路線 ${i + 1}`, points, waypoints });
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

// ================= 地圖載入與連動 =================
function loadRoute(index) {
  map.closePopup(); 
  // 【新增】切換路線時自動清空舊的 A/B 設定
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
    wm.on('click', () => { showCustomPopup(tIdx, w.name); });
    
    // --- 【修改這裡：增加高度圖連動邏輯】 ---
    wm.on('click', () => { 
      // 1. 顯示地圖上的彈窗
      showCustomPopup(tIdx, w.name); 
      
      // 2. 讓地圖上的藍色標記移動到該航點
      if (hoverMarker) {
        hoverMarker.setLatLng([w.lat, w.lon]);
      }

      // 3. 連動高度圖的小藍圓圈
      if (chart) {
        const meta = chart.getDatasetMeta(0);
        const point = meta.data[tIdx];
        
        // 顯示小藍圓圈
        chart.setActiveElements([{ datasetIndex: 0, index: tIdx }]);
        // 顯示高度圖黑色數據 Tip
        chart.tooltip.setActiveElements([{ datasetIndex: 0, index: tIdx }], { x: point.x, y: point.y });
        chart.update('none');

        // 設定 3 秒後黑色數據 Tip 消失，但藍圈留下
        if (window.chartTipTimer) clearTimeout(window.chartTipTimer);
        window.chartTipTimer = setTimeout(() => {
          if (!isMouseDown && chart) {
            chart.tooltip.setActiveElements([], { x: 0, y: 0 });
            chart.update();
          }
        }, 3000);
      }
    });
    // ------------------------------------
    
    
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
      
      // 顯示高度圖的黑色位置數據 Tip
      chart.setActiveElements([{ datasetIndex: 0, index: idx }]);
      chart.tooltip.setActiveElements([{ datasetIndex: 0, index: idx }], { x: point.x, y: point.y });
      chart.update('none');

      // 【修改點】點擊地圖路徑觸發高度圖 Tip 後，設定 3 秒閒置自動關閉
      if (window.chartTipTimer) clearTimeout(window.chartTipTimer);
      window.chartTipTimer = setTimeout(() => {
        // 如果此時滑鼠沒有在按住拖動，則關閉高度圖 Tip
        if (!isMouseDown && chart) {
          // chart.setActiveElements([]);
          chart.tooltip.setActiveElements([], { x: 0, y: 0 });
          chart.update();
        }
      }, 3000);
    }
  });

  hoverMarker = L.circleMarker([trackPoints[0].lat, trackPoints[0].lon], { radius: 6, color: "blue", fillColor: "#fff", fillOpacity: 1, weight: 3 }).addTo(map);
  drawElevationChart();
  renderRouteInfo();
}

function showCustomPopup(idx, title) {
  if (!trackPoints[idx]) return;
  const p = trackPoints[idx];
  const content = `
    <div style="min-width:180px; font-size:13px; line-height:1.5;">
      <b style="font-size:14px;">${title}</b><br>
      高度: ${p.ele.toFixed(0)} m<br>距離: ${p.distance.toFixed(2)} km<br>時間: ${p.timeLocal}<br>座標: ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}
      <div style="display:flex; margin-top:10px; gap:5px;">
        <button onclick="setAB('A', ${idx})" style="flex:1; background:#007bff; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold;">設定 A</button>
        <button onclick="setAB('B', ${idx})" style="flex:1; background:#e83e8c; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold;">設定 B</button>
      </div>
    </div>`;

  if (currentPopup && map.hasLayer(currentPopup)) {
    currentPopup.setLatLng([p.lat, p.lon]).setContent(content);
  } else {
    currentPopup = L.popup({ autoClose: true, closeOnClick: false, fadeAnimation: false })
    .setLatLng([p.lat, p.lon]).setContent(content).openOn(map);
  }
}

// 專為高度圖觸發設計的關閉定時器
function startHeightTipTimer() {
  if (mapTipTimer) clearTimeout(mapTipTimer);
  mapTipTimer = setTimeout(() => {
    // 檢查目前 Popup 的內容是否包含「高度圖位置」，若是則關閉
    if (currentPopup && map.hasLayer(currentPopup)) {
      const el = currentPopup.getElement();
      if (el && el.innerText.includes("位置資訊")) {
        map.closePopup();
      }
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
    if (e.button === 0) { 
      isMouseDown = true; 
      // 按住時，如果正在倒數關閉「高度圖位置」tip，立即取消倒數
      if (mapTipTimer) clearTimeout(mapTipTimer);
      handleSync(e); 
    }
  });
  
  // --- 【新增：手機觸控開始】 ---
  canvas.addEventListener('touchstart', (e) => {
    isMouseDown = true;
    if (mapTipTimer) clearTimeout(mapTipTimer);
    handleSync(e);
    // 阻止手機頁面捲動，確保能順利觸發圖表連動
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  // --- 【新增：手機觸控移動】 ---
  canvas.addEventListener('touchmove', (e) => {
    if (isMouseDown) {
      handleSync(e);
      if (e.cancelable) e.preventDefault();
    }
  }, { passive: false });
  
  window.addEventListener('mouseup', () => { 
    if (isMouseDown) {
      isMouseDown = false; 
      // 【修改點】放開滑鼠停止拖動時，啟動 3 秒倒數關閉
      startHeightOnlyTimer();
    }
    if (chart) {
      // chart.setActiveElements([]);
      chart.tooltip.setActiveElements([], { x: 0, y: 0 });
      chart.update('none'); 
    }
  });

		// --- 【新增：手機觸控結束】 ---
		  canvas.addEventListener('touchend', () => {
		    if (isMouseDown) {
		      isMouseDown = false;
		      startHeightOnlyTimer();
		    }
		    if (chart) {
		      // chart.setActiveElements([]);
		      chart.tooltip.setActiveElements([], { x: 0, y: 0 });
		      chart.update('none');
		    }
		  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    
    if (isMouseDown) {
      handleSync(e);
    } else {
      if (chart && chart.getActiveElements().length > 0) {
        // chart.setActiveElements([]);
        chart.tooltip.setActiveElements([], { x: 0, y: 0 });
        chart.update('none');
      }
    }
  });

  canvas.addEventListener('mouseleave', () => { 
    mouseX = null; 
    if (isMouseDown) {
      isMouseDown = false;
      // 【修改點】滑鼠移出圖表停止拖動時，啟動 3 秒倒數關閉
      startHeightOnlyTimer();
    }
    if (chart) {
      // chart.setActiveElements([]);
      chart.tooltip.setActiveElements([], { x: 0, y: 0 });
      chart.update('none');
    }
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

      // 【關鍵修改】：處理高度圖位置數據 Tip (黑色框) 的 3 秒自動關閉
      if (window.chartTipTimer) clearTimeout(window.chartTipTimer);
      
      // 只有在按住拖移時（isMouseDown 為 true）才啟動這個 3 秒閒置關閉邏輯
      if (isMouseDown) {
        window.chartTipTimer = setTimeout(() => {
          // 如果 3 秒後使用者還沒放開滑鼠（或滑鼠停住沒動），則強制隱藏黑色 Tip
          if (chart) {
            // chart.setActiveElements([]);
            chart.tooltip.setActiveElements([], { x: 0, y: 0 });
            chart.update('none');
          }
        }, 3000);
      }
    }
  }

  // Chart 初始化部分維持您提供的內容完全不變...
  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: trackPoints.map(p => p.distance.toFixed(2)),
      datasets: [{ 
        label: "高度 (m)", 
        data: trackPoints.map(p => p.ele), 
        fill: true, 
        backgroundColor: 'rgba(54, 162, 235, 0.2)', 
        borderColor: 'rgba(54, 162, 235, 1)', 
        tension: 0.1, 
        // --- 修改這裡 ---
		    pointRadius: 0,           // 平時隱藏，避免整條線都是點
		    pointHitRadius: 10,       // 增加觸控感應範圍
		    pointHoverRadius: 8,      // 拖移或選中時，藍色圓點的大小
		    pointHoverBackgroundColor: 'rgba(54, 162, 235, 0.8)', // 圓點顏色
		    pointHoverBorderWidth: 2,
		    pointHoverBorderColor: '#fff'
      }]
    },
    options: {
      responsive: true, 
      maintainAspectRatio: false,
      events: ['mousedown', 'mouseup', 'click', 'touchstart', 'touchmove', 'touchend'],
      interaction: { intersect: false, mode: "index" },
      plugins: {
        tooltip: {
          enabled: true,
          displayColors: false, 
          // 這裡維持您的邏輯：按住或有 ActiveElements 才顯示位置數據
          filter: () => isMouseDown || (chart && chart.getActiveElements().length > 0),
          callbacks: {
            title: () => "位置資訊", 
            label: function(context) {
              const p = trackPoints[context.dataIndex];
              return [
                ` \u25A0 距離: ${p.distance.toFixed(2)} km`, 
                ` \u25A0 高度: ${p.ele.toFixed(0)} m`,       
                ` \u25A0 時間: ${p.timeLocal.split(' ')[1]}` 
              ];
            }
          }
        }
      }
    },
    plugins: [{
      id: 'verticalLine',
      afterDraw: (chart) => {
        if (mouseX !== null) {
          const x = mouseX;
          const topY = chart.chartArea.top;
          const bottomY = chart.chartArea.bottom;
          const _ctx = chart.ctx;
          _ctx.save();
          _ctx.beginPath();
          _ctx.moveTo(x, topY);
          _ctx.lineTo(x, bottomY);
          _ctx.lineWidth = 1;
          _ctx.strokeStyle = isMouseDown ? 'rgba(0, 123, 255, 0.8)' : 'rgba(150, 150, 150, 0.4)';
          _ctx.setLineDash(isMouseDown ? [] : [5, 5]);
          _ctx.stroke();
          if (!isMouseDown) {
            _ctx.fillStyle = 'rgba(150, 150, 150, 0.8)';
            _ctx.font = '10px Arial';
            _ctx.fillText(' 按住拖動 ', x + 5, topY + 15);
          }
          _ctx.restore();
        }
      }
    }]
  });
}

// 【新增輔助函式】專門用來判斷並關閉「高度圖位置」
function startHeightOnlyTimer() {
  if (mapTipTimer) clearTimeout(mapTipTimer);
  mapTipTimer = setTimeout(() => {
    if (currentPopup && map.hasLayer(currentPopup)) {
      const content = currentPopup.getContent();
      // 只有內容包含 "高度圖位置" 時才關閉
      if (typeof content === 'string' && content.includes("位置資訊")) {
        map.closePopup();
      }
    }
  }, 3000);
}

// ================= 航點導向功能 =================
window.focusWaypoint = function(lat, lon, name) {
    // 1. 將地圖中心移動到該航點並放大
    map.setView([lat, lon], 16);
    
    // 2. 尋找最接近該座標的軌跡點索引，以利顯示彈窗數據
    let minD = Infinity, idx = 0;
    trackPoints.forEach((tp, i) => {
        let d = Math.sqrt((lat - tp.lat) ** 2 + (lon - tp.lon) ** 2);
        if (d < minD) {
            minD = d;
            idx = i;
        }
    });

    // 3. 更新地圖上的藍色圓圈標記位置
    if (hoverMarker) {
        hoverMarker.setLatLng([lat, lon]);
    }

    // 4. 顯示彈窗資訊
    showCustomPopup(idx, name);
    
    // --- 【新增：同步高度圖小藍圈】 ---
    if (chart) {
        // 設定高度圖選中該索引點（顯示小藍圓圈）
        chart.setActiveElements([{ datasetIndex: 0, index: idx }]);
        
        // 如果你希望點選航點時，高度圖「不出現」黑色數據框，只需執行上面那行。
        // 如果你希望「也要出現」黑色數據框，請加上下面這行：
        // chart.tooltip.setActiveElements([{ datasetIndex: 0, index: idx }], { x: 0, y: 0 });
        
        chart.update('none'); // 即時更新圖表狀態
    }
    // ------------------------------
    
    // 5. 滾動頁面回到地圖位置 (確保使用者看到地圖變化)
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
  updateABUI();
  map.closePopup(); 
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

function renderRouteInfo() {
  const f = trackPoints[0], l = trackPoints.at(-1), dur = l.timeUTC - f.timeUTC, { gain, loss } = calculateElevationGainFiltered();
  const currentRoute = allTracks[routeSelect.value || 0];
  
  // 更新路線總結資訊
  document.getElementById("routeSummary").innerHTML = `記錄日期：${f.timeLocal.substring(0, 10)}<br>路　　線：${currentRoute.name}<br>里　　程：${l.distance.toFixed(2)} km<br>花費時間：${Math.floor(dur/3600000)} 小時 ${Math.floor((dur%3600000)/60000)} 分鐘<br>最高海拔：${Math.max(...trackPoints.map(p=>p.ele)).toFixed(0)} m<br>最低海拔：${Math.min(...trackPoints.map(p=>p.ele)).toFixed(0)} m<br>總爬升數：${gain.toFixed(0)} m<br>總下降數：${loss.toFixed(0)} m`;
  
  const wptListContainer = document.getElementById("wptList");

  // 【修改重點】：判斷是否有航點資訊
  if (currentRoute.waypoints && currentRoute.waypoints.length > 0) {
    // 有航點時顯示表格
    let tableHtml = `<table class="wpt-table"><thead><tr><th style="width:10%">#</th><th style="width:40%">日期與時間</th><th style="width:50%">航點名稱</th></tr></thead><tbody>`;
    currentRoute.waypoints.forEach((w, i) => { 
      tableHtml += `<tr><td><span class="wpt-link" onclick="focusWaypoint(${w.lat}, ${w.lon}, '${w.name}')">${i + 1}</span></td><td>${w.localTime}</td><td>${w.name}</td></tr>`; 
    });
    wptListContainer.innerHTML = `<h4 style="margin: 20px 0 10px 0;">航點列表</h4>` + tableHtml + `</tbody></table>`;
    wptListContainer.style.display = "block"; // 確保容器是顯示狀態
  } else { 
    // 沒有航點時完全清空內容並隱藏容器
    wptListContainer.innerHTML = ""; 
    wptListContainer.style.display = "none";
  }
}

function formatDate(d) { return d.toISOString().replace("T", " ").substring(0, 19); }

