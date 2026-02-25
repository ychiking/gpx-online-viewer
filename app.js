// ================= 地圖初始化 =================
const map = L.map("map", { tap: true }).setView([25.03, 121.56], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap",
}).addTo(map);

let trackPoints = [];
let polyline;
let hoverMarker;
let chart;

// ================= GPX 上傳 =================
document.getElementById("gpxInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => loadGPX(reader.result);
  reader.readAsText(file);
});

// ================= 解析 GPX =================
function loadGPX(text) {
  if (polyline) map.removeLayer(polyline);
  if (hoverMarker) map.removeLayer(hoverMarker);
  if (chart) chart.destroy();

  trackPoints = [];

  const xml = new DOMParser().parseFromString(text, "application/xml");
  const pts = xml.getElementsByTagName("trkpt");

  for (const p of pts) {
    const lat = parseFloat(p.getAttribute("lat"));
    const lon = parseFloat(p.getAttribute("lon"));

    const eleNode = p.getElementsByTagName("ele")[0];
    if (!eleNode) continue;

    const ele = parseFloat(eleNode.textContent);
    if (isNaN(ele)) continue;

    const timeNode = p.getElementsByTagName("time")[0];
    if (!timeNode) continue;

    const utcDate = new Date(timeNode.textContent);
    // 雖然顯示用 UTC+8，但計算時間差建議用原始 UTC Date
    const localDate = new Date(utcDate.getTime() + 8 * 3600 * 1000);

    trackPoints.push({
      lat,
      lon,
      ele,
      timeUTC: utcDate,
      timeLocal: formatDate(localDate),
      distance: 0
    });
  }

  if (trackPoints.length === 0) {
    alert("沒有讀到有效的高度資料");
    return;
  }

  calculateDistance();
  drawMap();
  drawElevationChart();
  renderRouteInfo();
}

// ================= 距離計算 =================
function haversine(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) *
    Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(x));
}

function calculateDistance() {
  let total = 0;
  trackPoints.forEach((p, i) => {
    if (i > 0) total += haversine(trackPoints[i - 1], p);
    p.distance = total;
  });
}

// ================= 計算總爬升（加入閾值過濾以接近專業 App） =================
function calculateElevationGainFiltered() {
  let gain = 0;
  let loss = 0;
  
  // 閾值設定：通常 3~5m 能有效過濾 GPS 噪點
  // 若數值仍比 OruxMaps 高，可將此值調大至 5
  const threshold = 3.5; 

  if (trackPoints.length === 0) return { gain, loss };

  let lastEle = trackPoints[0].ele;

  for (let i = 1; i < trackPoints.length; i++) {
    const currentEle = trackPoints[i].ele;
    const diff = currentEle - lastEle;

    // 只有當高度變化超過閾值，才計入統計
    if (Math.abs(diff) >= threshold) {
      if (diff > 0) {
        gain += diff;
      } else {
        loss += Math.abs(diff);
      }
      lastEle = currentEle; 
    }
  }

  return { gain, loss };
}

// ================= 時間格式轉換 (總毫秒 -> X小時Y分鐘) =================
function formatDuration(ms) {
  const totalMinutes = Math.floor(ms / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  
  if (hours > 0) {
    return `${hours} 小時 ${mins} 分鐘`;
  }
  return `${mins} 分鐘`;
}

// ================= 畫地圖 =================
function drawMap() {
  polyline = L.polyline(trackPoints.map(p => [p.lat, p.lon]), {
    color: "red",
    weight: 4
  }).addTo(map);

  map.fitBounds(polyline.getBounds());

  const first = trackPoints[0];
  const last = trackPoints.at(-1);

  L.marker([first.lat, first.lon]).addTo(map).bindPopup("起點");
  L.marker([last.lat, last.lon]).addTo(map).bindPopup("終點");

  hoverMarker = L.circleMarker([first.lat, first.lon], {
    radius: 6,
    color: "blue",
    fillOpacity: 1
  }).addTo(map);

  polyline.on("click", e => {
    const index = findClosestPointIndex(e.latlng);
    activatePoint(index);
  });
}

function findClosestPointIndex(latlng) {
  let minDist = Infinity;
  let closestIndex = -1;

  for (let i = 0; i < trackPoints.length; i++) {
    const d = map.distance(
      latlng,
      L.latLng(trackPoints[i].lat, trackPoints[i].lon)
    );
    if (d < minDist) {
      minDist = d;
      closestIndex = i;
    }
  }
  return closestIndex;
}

function activatePoint(index) {
  if (index < 0 || !trackPoints[index]) return;

  const p = trackPoints[index];
  hoverMarker.setLatLng([p.lat, p.lon]);

  hoverMarker.bindPopup(`
    <b>位置資訊</b><br>
    高度: ${p.ele.toFixed(0)} m<br>
    距離: ${p.distance.toFixed(2)} km<br>
    時間: ${p.timeLocal}<br>
    座標: ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}
  `).openPopup();

  if (chart) {
    chart.setActiveElements([{ datasetIndex: 0, index }]);
    chart.tooltip.setActiveElements([{ datasetIndex: 0, index }]);
    chart.update();
  }
}

// ================= 畫高度圖 =================
function drawElevationChart() {
  const ctx = document.getElementById("elevationChart").getContext("2d");

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
        tension: 0.2,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      onHover: (event, elements) => {
        if (!elements.length) return;
        activatePoint(elements[0].index);
      },
      scales: {
        x: { title: { display: true, text: '距離 (km)' } },
        y: { title: { display: true, text: '高度 (m)' } }
      }
    }
  });
}

// ================= 路線資訊渲染 =================
function renderRouteInfo() {
  const first = trackPoints[0];
  const last = trackPoints.at(-1);

  const totalDistance = last.distance;
  
  // 計算時間差（毫秒）
  const durationMs = last.timeUTC.getTime() - first.timeUTC.getTime();
  const durationStr = formatDuration(durationMs);

  // 使用過濾後的算法計算爬升與下降
  const { gain, loss } = calculateElevationGainFiltered();

  const maxEle = Math.max(...trackPoints.map(p => p.ele));
  const minEle = Math.min(...trackPoints.map(p => p.ele));

  document.getElementById("routeSummary").innerHTML = `
    記錄日期：${first.timeLocal.substring(0,10)}<br>
    里程：${totalDistance.toFixed(2)} km<br>
    花費時間：${durationStr}<br>
    最高海拔：${maxEle.toFixed(0)} m<br>
    最低海拔：${minEle.toFixed(0)} m<br>
    總爬升：${gain.toFixed(0)} m<br>
    總下降：${loss.toFixed(0)} m
  `;
}

// ================= 格式化時間 =================
function formatDate(d) {
  return d.toISOString().replace("T", " ").substring(0, 19);
}