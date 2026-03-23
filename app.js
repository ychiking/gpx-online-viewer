// ================= 地圖初始化 =================
const map = L.map("map", { tap: true }).setView([25.03, 121.56], 12);
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
const otm = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: 'OpenTopoMap' });

L.control.layers({ "標準地圖 (OSM)": osm, "等高線地形圖 (OpenTopo)": otm }).addTo(map);

let allTracks = [], trackPoints = [], polyline, hoverMarker, chart, markers = [], wptMarkers = [];
let pointA = null, pointB = null, markerA = null, markerB = null;
let currentPopup = null; 
let isMouseDown = false; 
let mapTipTimer = null;
let gpsMarker = null;

const routeSelect = document.getElementById("routeSelect");

let clickTimeout = null;

map.on('click', (e) => {
    // 使用延遲，讓 polyline 的 click 事件有機會先執行並取消這個 timer
    clickTimeout = setTimeout(() => {
        showFreeClickPopup(e.latlng);
    }, 200); // 200ms 的緩衝
});

// 專門處理「非路徑點」的彈窗
function showFreeClickPopup(latlng) {
    // 1. 使用 proj4 進行座標轉換 (從 WGS84 轉 TWD97)
    // 您的專案中已定義 WGS84_DEF 與 TWD97_DEF
    const twd97 = proj4(WGS84_DEF, TWD97_DEF, [latlng.lng, latlng.lat]);
    const x97 = Math.round(twd97[0]);
    const y97 = Math.round(twd97[1]);

    // 2. 建立彈窗內容，包含兩種座標格式
    const content = `
        <div style="min-width:180px; font-size:13px; line-height:1.6;">
          <b style="font-size:14px; color:#d35400;">📍 自選位置</b><br>
          <hr style="margin:5px 0; border:0; border-top:1px solid #eee;">
          <b>WGS84:</b> ${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}<br>
          <b>TWD97:</b> ${x97}, ${y97}
          <div style="display:flex; margin-top:10px; gap:8px;">
            <button onclick="setFreeAB('A', ${latlng.lat}, ${latlng.lng})" style="flex:1; background:#007bff; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold;">設定 A</button>
            <button onclick="setFreeAB('B', ${latlng.lat}, ${latlng.lng})" style="flex:1; background:#e83e8c; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold;">設定 B</button>
          </div>
        </div>`;
    
    L.popup().setLatLng(latlng).setContent(content).openOn(map);
}

window.setFreeAB = function(type, lat, lon) {
    // 建立一個不帶索引的點物件
    const p = { lat, lon, ele: 0, distance: 0, timeLocal: "無時間資訊", timeUTC: 0, idx: -1 };
    
    if (type === 'A') {
        pointA = p;
        if (markerA) map.removeLayer(markerA);
        // 加入 className: '' 移除 Leaflet 預設白框樣式
        markerA = L.marker([lat, lon], { 
            icon: L.divIcon({ 
                html: `<div style="background:#007bff;color:white;border-radius:50%;width:24px;height:24px;text-align:center;line-height:24px;font-weight:bold;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);">A</div>`, 
                iconSize: [24, 24], 
                iconAnchor: [12, 12],
                className: '' 
            }) 
        }).addTo(map);
    } else {
        pointB = p;
        if (markerB) map.removeLayer(markerB);
        markerB = L.marker([lat, lon], { 
            icon: L.divIcon({ 
                html: `<div style="background:#e83e8c;color:white;border-radius:50%;width:24px;height:24px;text-align:center;line-height:24px;font-weight:bold;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);">B</div>`, 
                iconSize: [24, 24], 
                iconAnchor: [12, 12],
                className: '' 
            }) 
        }).addTo(map);
    }
    map.closePopup()
    updateABUI();
    // map.closePopup();
};


// ================= 下拉選單切換事件 =================
routeSelect.addEventListener("change", (e) => {
    const selectedIndex = parseInt(e.target.value);
    loadRoute(selectedIndex);
});

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

// ================= A/B 點與解析邏輯 =================
window.clearABSettings = function() {
  pointA = null; pointB = null;
  if (markerA) { map.removeLayer(markerA); markerA = null; }
  if (markerB) { map.removeLayer(markerB); markerB = null; }
  updateABUI();
  map.closePopup(); 
};

document.getElementById("gpxInput").addEventListener("change", e => {
	window.resetGPS();
  const file = e.target.files[0];
  if (!file) return;
  
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
    
    // 「距離該路線 500 公尺內」的航點
    const routeWaypoints = allWpts.filter(w => {
      return points.some(p => {
        const d = Math.sqrt((w.lat - p.lat)**2 + (w.lon - p.lon)**2) * 111000; // 簡單距離計算
        return d < 500; // 單位：公尺，可以根據需要調整範圍
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
    const lat = parseFloat(pts[i].getAttribute("lat")), 
          lon = parseFloat(pts[i].getAttribute("lon"));
    const eleNode = pts[i].getElementsByTagName("ele")[0];
    const timeNode = pts[i].getElementsByTagName("time")[0];

    if (!isNaN(lat) && !isNaN(lon)) {
      const ele = eleNode ? parseFloat(eleNode.textContent) : 0;
      
      const utc = timeNode ? new Date(timeNode.textContent) : new Date(0); 
      const localTime = timeNode ? formatDate(new Date(utc.getTime() + 8*3600*1000)) : "無時間資訊";

      if (res.length > 0) {
        const a = res[res.length-1], R = 6371;
        const dLat = (lat-a.lat)*Math.PI/180, dLon = (lon-a.lon)*Math.PI/180;
        const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLon/2)**2;
        total += 2 * R * Math.asin(Math.sqrt(x));
      }
      
      res.push({ 
        lat, 
        lon, 
        ele, 
        timeUTC: utc, 
        timeLocal: localTime, 
        distance: total 
      });
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
  
  if (hoverMarker) {
    map.removeLayer(hoverMarker);
    hoverMarker = null; 
  }
  
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
    // 關鍵：阻止事件傳遞到下層的地圖 (map)
    L.DomEvent.stopPropagation(e); 
    
    if (clickTimeout) clearTimeout(clickTimeout); // 保險起見也清除 timer

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

// ================= 垂直控制項 =================
const CombinedControl = L.Control.extend({
    options: { position: 'topleft' }, 
    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        
        const createBtn = (html, title, border) => {
            const btn = L.DomUtil.create('a', '', container);
            btn.innerHTML = html; btn.href = '#'; btn.title = title;
            btn.style.cssText = `font-size:18px; background:white; text-align:center; line-height:30px; width:30px; height:30px; display:block; cursor:pointer; ${border ? 'border-bottom:1px solid #ccc;' : ''}`;
            return btn;
        };

        // 座標轉換
        const coordBtn = createBtn('🌐', '座標轉換', true);

        // 定位按鈕 
		const btnSize = "30px";       // 按鈕方框大小
        const arrowIconSize = "20px"; // 箭頭圖案大小
        const arrowColor = "#1a73e8"; // 箭頭顏色
        const locArrowAngle = "315deg"
        // ------------------------------------------

        const locBtn = L.DomUtil.create('a', '', container);
        locBtn.title = "目前位置定位";
        locBtn.style.cssText = `width:${btnSize}; height:${btnSize}; background:white; cursor:pointer; display:flex; align-items:center; justify-content:center; border-bottom:1px solid #ccc;`;
        
        // 使用 SVG 繪製按鈕內的箭頭圖示
        locBtn.innerHTML = `
            <svg width="${arrowIconSize}" height="${arrowIconSize}" viewBox="0 0 100 100" style="display:block; transform: rotate(${locArrowAngle})">
                <path d="M50 5 L90 90 L50 70 L10 90 Z" fill="${arrowColor}" />
            </svg>
        `;

        // 指北針按鈕
        const compassBtn = createBtn('🧭', '顯示/隱藏指北針', false);

        L.DomEvent.disableClickPropagation(container);
        
// 座標定位按鈕點擊事件
        L.DomEvent.on(coordBtn, 'click', (e) => { 
            L.DomEvent.stop(e); 
            const modal = document.getElementById('coordModal');
            
            map.closePopup();
   
            
            // 設定雙輸入介面 HTML
            modal.innerHTML = `
                <div style="background:white; padding:20px; border-radius:12px; width:300px; box-shadow:0 10px 25px rgba(0,0,0,0.5); position:relative; font-family: sans-serif;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                        <b style="font-size:18px; color:#1a73e8;">🌐 座標跳轉定位</b>
                        <span onclick="document.getElementById('coordModal').style.display='none'" style="cursor:pointer; font-size:24px; color:#999;">&times;</span>
                    </div>
                    
                    <div style="margin-bottom:20px; border:1px solid #eee; padding:10px; border-radius:8px;">
                        <label style="font-size:13px; font-weight:bold; color:#555;">1. WGS84 (緯度, 經度)</label>
                        <input type="text" id="jump_wgs" placeholder="例如: 24.123, 121.456" 
                               style="width:100%; padding:8px; margin-top:6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;">
                        <button onclick="executeJump('WGS')" 
                                style="width:100%; margin-top:8px; background:#1a73e8; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer; font-weight:bold;">確認 WGS84 定位</button>
                    </div>

                    <div style="margin-bottom:10px; border:1px solid #eee; padding:10px; border-radius:8px;">
                        <label style="font-size:13px; font-weight:bold; color:#555;">2. TWD97 (X, Y)</label>
                        <input type="text" id="jump_twd" placeholder="例如: 245678, 2765432" 
                               style="width:100%; padding:8px; margin-top:6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;">
                        <button onclick="executeJump('TWD')" 
                                style="width:100%; margin-top:8px; background:#34a853; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer; font-weight:bold;">確認 TWD97 定位</button>
                    </div>
                    <p style="font-size:11px; color:#ea4335; margin:5px 0 0 5px;">* TWD97 輸入 6 字查報可直接定位該 X 區域</p>
                </div>
            `;
            modal.style.display = 'flex'; 
        });

        L.DomEvent.on(locBtn, 'click', (e) => { 
            L.DomEvent.stop(e); 
            window.toggleGPS(locBtn); // 呼叫下方新增的切換函式
        });

        L.DomEvent.on(compassBtn, 'click', (e) => { 
            L.DomEvent.stop(e); 
            document.getElementById("mapCompass").classList.toggle("show"); 
        });
        
        return container;
    }
});
map.addControl(new CombinedControl());

// ================= 定位切換功能函式 =================
window.toggleGPS = function(btn) {
    // 如果標記已存在，表示目前是開啟狀態 -> 執行「取消定位」
    if (gpsMarker) {
        map.removeLayer(gpsMarker);
        gpsMarker = null;
        btn.style.background = "white"; // 還原按鈕顏色
        return;
    }

    if (!navigator.geolocation) {
        alert("您的瀏覽器不支援 GPS 定位功能");
        return;
    }

    // 執行定位
    navigator.geolocation.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        
        // 轉換座標為 TWD97
        const twd97 = proj4(WGS84_DEF, TWD97_DEF, [lon, lat]);

        // 地圖移至定位點
        map.setView([lat, lon], 16);
        btn.style.background = "#e8f0fe"; 
        
				const mapArrowAngle = "315deg"; 
        const arrowSize = 40;

        // 自定義箭頭圖示
        const arrowIcon = L.divIcon({
            className: 'custom-gps-arrow',
            html: `<div style="transform: rotate(${mapArrowAngle}); display: flex; justify-content: center;">
                     <svg width="40" height="40" viewBox="0 0 100 100">
                       <path d="M50 5 L95 90 L50 70 L5 90 Z" fill="#1a73e8" stroke="white" stroke-width="5"/>
                     </svg>
                   </div>`,
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });

        gpsMarker = L.marker([lat, lon], { icon: arrowIcon }).addTo(map);

        // 彈出 Tip
				const tipText = `
            <div style="font-size:13px; line-height:1.6; min-width:200px;">
                <b style="color:#1a73e8; font-size:14px;">📍 目前位置</b><br>
                <b>WGS84:</b> ${lat.toFixed(6)}, ${lon.toFixed(6)}<br>
                <b>TWD97:</b> ${Math.round(twd97[0])}, ${Math.round(twd97[1])}
                <hr style="margin: 8px 0; border: 0; border-top: 1px solid #eee;">
                <div style="color: #d35400; font-size: 10px; background: #fff5eb; padding: 4px; border-radius: 4px;">
                    ⚠️ 若定位不準，請檢查網頁應用程式權限設定：<br>
                    安卓Chrome: 權限 > 位置 > 開啟<b>「使用精確位置」</b>開關。
                </div>
            </div>
        `;
        gpsMarker.bindPopup(tipText).openPopup();

    }, (err) => {
        alert("無法獲取位置，請確認 GPS 已開啟並授權網頁存取");
    }, { enableHighAccuracy: true });
};

window.resetGPS = function() {
    if (gpsMarker) {
        map.removeLayer(gpsMarker);
        gpsMarker = null;
    }

    const locBtn = document.querySelector('a[title="目前位置定位"]');
    if (locBtn) {
        locBtn.style.background = "white";
    }
};


// ================= 座標轉換 TIP 邏輯 =================
const TWD97_DEF = "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs";
const WGS84_DEF = "EPSG:4326";

window.clearCoordInputs = function() {
    document.getElementById('wgs_input').value = "";
    document.getElementById('twd_input').value = "";
    window.showMsg('res_twd97', "結果顯示在此 (點擊可複製)");
    window.showMsg('res_wgs84', "結果顯示在此 (點擊可複製)");
};


window.showMsg = function(id, text, type = 'normal') {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = text;
    el.classList.remove('error-text', 'copy-success');
    if (type === 'error') el.classList.add('error-text');
    if (type === 'success') el.classList.add('copy-success');
};

window.getLocation = function() {
    if (!navigator.geolocation) { showMsg('res_twd97', "不支援定位", 'error'); return; }
    showMsg('res_twd97', "🔍 正在獲取 GPS...");
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            document.getElementById('wgs_input').value = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
            window.toTWD97();
        },
        (err) => { showMsg('res_twd97', "定位失敗 (權限或訊號)", 'error'); },
        { enableHighAccuracy: true, timeout: 8000 }
    );
};

window.toTWD97 = function() {
    try {
        const val = document.getElementById('wgs_input').value;
        const pts = val.replace(/[^\d.\-, ]/g, ' ').trim().split(/[\s,]+/).map(parseFloat);
        if (pts.length < 2 || isNaN(pts[0])) throw "格式錯誤";
        const res = proj4(WGS84_DEF, TWD97_DEF, [pts[1], pts[0]]);
        showMsg('res_twd97', `TWD97 (X,Y): <b>${Math.round(res[0])}, ${Math.round(res[1])}</b>`);
    } catch (e) { showMsg('res_twd97', "輸入錯的座標", 'error'); }
};

window.toWGS84 = function() {
    try {
        const val = document.getElementById('twd_input').value;
        const pts = val.replace(/[^\d.\-, ]/g, ' ').trim().split(/[\s,]+/).map(parseFloat);
        if (pts.length < 2 || isNaN(pts[0])) throw "格式錯誤";
        const res = proj4(TWD97_DEF, WGS84_DEF, [pts[0], pts[1]]);
        showMsg('res_wgs84', `WGS84 (緯度,經度): <b>${res[1].toFixed(6)}°, ${res[0].toFixed(6)}°</b>`);
    } catch (e) { showMsg('res_wgs84', "輸入錯的座標", 'error'); }
};

window.copyText = function(id) {
    const el = document.getElementById(id);
    const text = el.innerText;
    if (text.includes(': ')) {
        const content = text.split(': ')[1];
        const oldHtml = el.innerHTML;
        navigator.clipboard.writeText(content).then(() => {
            showMsg(id, "✅ 已複製", 'success');
            setTimeout(() => { showMsg(id, oldHtml); el.classList.remove('copy-success'); }, 1500);
        }).catch(() => showMsg(id, "複製失敗", 'error'));
    }
};

// ================= 彈窗訊息 (支援不在路徑上的簡化模式) =================
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
    	animation: false,
      responsive: true, maintainAspectRatio: false,
      events: ['mousedown', 'mouseup', 'click', 'touchstart', 'touchmove', 'touchend'],
      interaction: { intersect: false, mode: "index" },
      hover: {
      	mode: 'index',
      	intersect: false,
      	animiationDuration: 0
      },
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

// ================= 航點導向功能 =================
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

// ================= A/B 設定與資訊渲染 =================
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
    
    // 輔助函式：產生座標字串
    const getCoordHTML = (p) => {
        const twd97 = proj4(WGS84_DEF, TWD97_DEF, [p.lon, p.lat]);
        return `WGS84: ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}<br>TWD97: ${Math.round(twd97[0])}, ${Math.round(twd97[1])}`;
    };

    // --- 更新 A 點資訊顯示 ---
    if (pointA) {
        let html = getCoordHTML(pointA);
        if (pointA.idx !== -1) {
            html += `<br><span style="color:#666;">高度: ${pointA.ele.toFixed(0)}m, 里程: ${pointA.distance.toFixed(2)}km, ${pointA.timeLocal}</span>`;
        }
        infoA.innerHTML = html;
    } else {
        infoA.innerHTML = "尚未設定";
    }

    // --- 更新 B 點資訊顯示 ---
    if (pointB) {
        let html = getCoordHTML(pointB);
        if (pointB.idx !== -1) {
            html += `<br><span style="color:#666;">高度: ${pointB.ele.toFixed(0)}m, 里程: ${pointB.distance.toFixed(2)}km, ${pointB.timeLocal}</span>`;
        }
        infoB.innerHTML = html;
    } else {
        infoB.innerHTML = "尚未設定";
    }

    if (pointA && pointB) {
        boxRes.style.display = "block";
        const bearing = getBearingInfo(pointA.lat, pointA.lon, pointB.lat, pointB.lon);
        
        // 計算直線距離
        const R = 6371; 
        const dLat = (pointB.lat - pointA.lat) * Math.PI / 180;
        const dLon = (pointB.lon - pointA.lon) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(pointA.lat * Math.PI / 180) * Math.cos(pointB.lat * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const directDist = R * c;

        let analysisContent = "";

        // 判斷是否包含非路徑點
        if (pointA.idx === -1 || pointB.idx === -1) {
            analysisContent = `
                <div style="color:#d35400; font-weight:bold; margin-bottom:4px;">📍 直線分析 (非全路徑點)</div>
                直線距離：<b>${directDist.toFixed(2)} km</b><br>
                移動方位：<span style="color:#007bff; font-weight:bold;">往 ${bearing.name} (${bearing.deg}°)</span>`;
        } else {
            const start = Math.min(pointA.idx, pointB.idx), end = Math.max(pointA.idx, pointB.idx);
            const section = trackPoints.slice(start, end + 1);
            const { gain, loss } = calculateElevationGainFiltered(section);
            const timeDiff = Math.abs(pointA.timeUTC - pointB.timeUTC);
            
            analysisContent = `
                區間爬升：<b>${gain.toFixed(0)} m</b> / 下降：<b>${loss.toFixed(0)} m</b><br>
                沿路距離：<b>${Math.abs(pointA.distance - pointB.distance).toFixed(2)} km</b><br>
                直線距離：<b>${directDist.toFixed(2)} km</b><br>
                時　　間：<b>${Math.floor(timeDiff/3600000)} 小時 ${Math.floor((timeDiff%3600000)/60000)} 分鐘</b><br>
                移動方位：<span style="color:#007bff; font-weight:bold;">往 ${bearing.name} (${bearing.deg}°)</span>`;
        }

        infoRes.innerHTML = analysisContent;

        if (typeof markerB !== 'undefined' && markerB) {
            markerB.unbindTooltip();

            // --- 新增：動態方位判斷邏輯 ---
            let tooltipDir = 'right';
            let tooltipOffset = [15, 0];

            const diffLat = pointB.lat - pointA.lat;
            const diffLon = pointB.lon - pointA.lon;

            // 判斷是以東西向為主還是南北向為主
            if (Math.abs(diffLon) > Math.abs(diffLat)) {
                // 東西向為主
                if (diffLon >= 0) { 
                    tooltipDir = 'right';  // B在東方，彈向右邊
                    tooltipOffset = [15, 0];
                } else { 
                    tooltipDir = 'left';   // B在西方，彈向左邊
                    tooltipOffset = [-15, 0];
                }
            } else {
                // 南北向為主
                if (diffLat >= 0) { 
                    tooltipDir = 'top';    // B在北方，彈向上面
                    tooltipOffset = [0, -15];
                } else { 
                    tooltipDir = 'bottom'; // B在南方，彈向下面
                    tooltipOffset = [0, 15];
                }
            }

            markerB.bindTooltip(`
                <div onmousedown="event.stopPropagation();" onclick="event.stopPropagation();" style="font-size:13px; line-height:1.4;">
                    <b style="color:#28a745;">區間分析 (A ↔ B)</b><br>
                    ${analysisContent}
                    <div style="margin-top:8px; border-top:1px solid #eee; padding-top:4px; text-align:right;">
                        <a href="javascript:void(0);" onclick="event.stopPropagation(); clearABSettings();" style="color:#d35400; text-decoration:none; font-weight:bold; font-size:12px;">❌ 清除 A B 點</a>
                    </div>
                </div>`, { 
                    permanent: true, 
                    interactive: true, 
                    direction: tooltipDir, // 使用動態方向
                    offset: tooltipOffset, // 使用動態偏移量
                    className: 'ab-map-tooltip' 
                }).openTooltip();
        }
    } else {
        if (boxRes) boxRes.style.display = "none";
        if (typeof markerB !== 'undefined' && markerB) { markerB.unbindTooltip(); }
    }
    
    // 兩點皆為自由點位時觸發步道偵測
    if (pointA && pointB && pointA.idx === -1 && pointB.idx === -1) {
        if (typeof analyzeBestPath === 'function') {
            analyzeBestPath(pointA.lat, pointA.lon, pointB.lat, pointB.lon);
        }
    }
}

function renderRouteInfo() {
  const f = trackPoints[0], l = trackPoints.at(-1), dur = l.timeUTC - f.timeUTC, { gain, loss } = calculateElevationGainFiltered();
  const currentRoute = allTracks[routeSelect.value || 0];
  document.getElementById("routeSummary").innerHTML = `記錄日期：${f.timeLocal.substring(0, 10)}<br>路　　線：${currentRoute.name}<br>里　　線：${l.distance.toFixed(2)} km<br>花費時間：${Math.floor(dur/3600000)} 小時 ${Math.floor((dur%3600000)/60000)} 分鐘<br>最高海拔：${Math.max(...trackPoints.map(p=>p.ele)).toFixed(0)} m<br>最低海拔：${Math.min(...trackPoints.map(p=>p.ele)).toFixed(0)} m<br>總爬升數：${gain.toFixed(0)} m<br>總下降數：${loss.toFixed(0)} m`;
  const wptListContainer = document.getElementById("wptList");
  const navShortcuts = document.getElementById("navShortcuts");
  let listHtml = "";
  let shortcutsHtml = "";
  if (currentRoute.waypoints && currentRoute.waypoints.length > 0) {
    listHtml += `<h4 id="anchorWpt" style="margin: 20px 0 10px 0;">📍 航點列表</h4>`;
    listHtml += `<table class="wpt-table"><thead><tr><th style="width:10%">#</th><th style="width:40%">日期與時間</th><th style="width:50%">航點名稱</th></tr></thead><tbody>`;
    currentRoute.waypoints.forEach((w, i) => { 
      listHtml += `<tr><td><span class="wpt-link" onclick="focusWaypoint(${w.lat}, ${w.lon}, '${w.name}')">${i + 1}</span></td><td>${w.localTime}</td><td>${w.name}</td></tr>`; 
    });
    listHtml += `</tbody></table>`;
    shortcutsHtml += `<a href="#anchorWpt" class="shortcut-btn">📍 航點列表</a>`;
  }

  listHtml += `
    <h4 id="anchorPeak" style="margin: 30px 0 10px 0; font-size: 16px; color: #2c3e50; border-left: 5px solid #d35400; padding-left: 10px;">⛰️ 自動偵測：沿途山岳(200公尺內)</h4>
    <div id="aiPeaksSection">
        <div style="padding:20px; text-align:center; color:#666;">🔍 正在偵測中...</div>
    </div>`;
  
  shortcutsHtml += `<a href="#anchorPeak" class="shortcut-btn">⛰️ 沿途山岳</a>`;
  shortcutsHtml += `<a href="javascript:location.reload();" class="shortcut-btn">✕ 關閉檔案</a>`;

  wptListContainer.innerHTML = listHtml;
  wptListContainer.style.display = "block";
  navShortcuts.innerHTML = shortcutsHtml;
}
    


function formatDate(d) { return d.toISOString().replace("T", " ").substring(0, 19); }

// ================= 自動偵測經過山岳 (Overpass API) =================
async function detectPeaksAlongRoute() {
    const wptListContainer = document.getElementById("wptList");
    wptListContainer.style.display = "block";
    let aiSection = document.getElementById("aiPeaksSection");
    if (!aiSection) { aiSection = document.createElement("div"); aiSection.id = "aiPeaksSection"; wptListContainer.appendChild(aiSection); }
    aiSection.innerHTML = `<div id="aiLoading" style="padding:20px; text-align:center; color:#666;">🔍 正在比對地圖資料，偵測沿途山岳(200公尺內)...</div>`;

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

// 用來儲存自動抓取的步道線條，以便清除
let autoRouteLayer = null;

async function analyzeBestPath(latA, lonA, latB, lonB) {
    // 1. 定義搜尋範圍 (取 A, B 的矩形區域並稍微擴大)
    const minLat = Math.min(latA, latB) - 0.01;
    const maxLat = Math.max(latA, latB) + 0.01;
    const minLon = Math.min(lonA, lonB) - 0.01;
    const maxLon = Math.max(lonA, lonB) + 0.01;

    // 2. Overpass 查詢：抓取步道 (path)、足跡 (footway)、以及稜線可能的步道
    const query = `
        [out:json][timeout:25];
        (
          way["highway"~"path|footway|track"](${minLat},${minLon},${maxLat},${maxLon});
        );
        out body; >; out skel qt;
    `;

    const url = "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        // 清除舊的自動路徑
        if (autoRouteLayer) map.removeLayer(autoRouteLayer);

        // 3. 簡單解析 OSM 座標點並轉換為 GeoJSON
        // 註：這裏我們將抓到的路網直接顯示，讓使用者看到「有效路徑」在哪
        autoRouteLayer = L.geoJSON(osmtogeojson(data), {
            style: {
                color: "#FF5722",
                weight: 4,
                opacity: 0.7,
                dashArray: "5, 10" // 虛線表示這是系統建議路徑
            }
        }).addTo(map);

        // 如果您有安裝 osmtogeojson.js 函式庫，這裡能完美運作
        // 若無，則需要手動解析 node 與 way 的關係
        console.log("OSM 步道抓取完成，已標註於地圖");

    } catch (error) {
        console.error("OSM 資料請求失敗:", error);
    }
}

function renderPeakTable(peaks) {
    const aiSection = document.getElementById("aiPeaksSection");
    if (!aiSection || peaks.length === 0) return;
		let html = `<table class="wpt-table"><thead><tr><th style="width:10%">#</th><th style="width:40%">日期與時間</th><th style="width:50%">山名 (海拔)</th></tr></thead><tbody>`;
    peaks.forEach((p, i) => {
        const timeDisplay = p.distToTrack > 100 ? "------" : p.time;
        html += `<tr><td><span class="wpt-link" onclick="focusWaypoint(${p.lat}, ${p.lon}, '${p.name}', ${p.distToTrack}, '${p.ele}')">${i+1}</span></td><td>${timeDisplay}</td><td style="font-weight: bold; color: #007bff;">${p.name} (${p.ele}m)</td></tr>`;
    });
    aiSection.innerHTML = html + `</tbody></table>`;
}


window.jumpToLocation = function(lat, lon) {
    const twd97 = proj4(WGS84_DEF, TWD97_DEF, [lon, lat]);
    
    const content = `
        <div style="font-size:14px; line-height:1.5; min-width:180px;">
            <b style="color:#1a73e8; font-size:15px;">🎯 定位點資訊</b><hr style="margin:5px 0; border:0; border-top:1px solid #eee;">
            <div style="background:#f8f9fa; padding:8px; border-radius:4px;">
                <b>WGS84:</b><br>${lat.toFixed(6)}, ${lon.toFixed(6)}<br>
                <b style="display:inline-block; margin-top:5px;">TWD97:</b><br>${Math.round(twd97[0])}, ${Math.round(twd97[1])}
            </div>
        </div>
    `;

    document.getElementById('coordModal').style.display = 'none';
    map.setView([lat, lon], 16); 
    
    const jumpMarker = L.marker([lat, lon]).addTo(map)
        .bindPopup(content)
        .openPopup();

    map.once('click', () => map.removeLayer(jumpMarker));
};


window.executeJump = function(type) {
    if (type === 'WGS') {
        const val = document.getElementById('jump_wgs').value;
        const pts = val.replace(/[^\d.\-, ]/g, ' ').trim().split(/[\s,]+/).map(parseFloat);
        
        if (pts.length < 2 || isNaN(pts[0]) || isNaN(pts[1])) {
            showMapToast("請輸入有效的 WGS84 座標");
            return;
        }
        window.jumpToLocation(pts[0], pts[1]);

    } else {
        const val = document.getElementById('jump_twd').value.trim();
        const cleanVal = val.replace(/\D/g, '');

        // 邏輯辨認：六位數簡化座標
        if (cleanVal.length === 6) {
            const partX = cleanVal.substring(0, 3);
            const partY = cleanVal.substring(3, 6);
            const x = parseFloat("3" + partX + "00"); 
            const y = parseFloat("27" + partY + "00"); 
            const coord = proj4(TWD97_DEF, WGS84_DEF, [x, y]);
            window.jumpToLocation(coord[1], coord[0]);
        } else {
            // 標準 TWD97 (X, Y)
            const pts = val.split(/[\s,]+/).map(v => v.trim());
            const x = parseFloat(pts[0]);
            const y = parseFloat(pts[1]);
            
            if (isNaN(x) || isNaN(y)) {
                showMapToast("請輸入正確的 TWD97 或六位數座標");
                return;
            }
            const coord = proj4(TWD97_DEF, WGS84_DEF, [x, y]);
            window.jumpToLocation(coord[1], coord[0]);
        }
    }
};

// 在地圖上方顯示輕量提示 (代替 alert)
function showMapToast(message) {
    let toast = document.getElementById('map-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'map-toast';
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 20px;
            z-index: 10000;
            font-size: 14px;
            pointer-events: none;
            transition: opacity 0.5s;
        `;
        document.body.appendChild(toast);
    }
    toast.innerText = message;
    toast.style.opacity = '1';
    
    // 3秒後隱藏
    setTimeout(() => {
        toast.style.opacity = '0';
    }, 3000);
}