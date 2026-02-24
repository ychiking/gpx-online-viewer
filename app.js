// ================= 地圖初始化 =================
const map = L.map("map").setView([25.03, 121.56], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap",
}).addTo(map);

let trackPoints = [];
let polyline;
let hoverMarker;
let chart;

// ================= 檔案上傳 =================
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
    const lat = +p.getAttribute("lat");
    const lon = +p.getAttribute("lon");
    const ele = +p.getElementsByTagName("ele")[0]?.textContent || 0;
    const timeUTC = p.getElementsByTagName("time")[0]?.textContent;
    if (!timeUTC) continue;

    const local = new Date(new Date(timeUTC).getTime() + 8 * 3600 * 1000);

    trackPoints.push({
      lat,
      lon,
      ele,
      timeUTC,
      timeLocal: formatDate(local),
      distance: 0
    });
  }

  calculateDistance();
  drawMap();
  drawElevationChart();
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

// ================= 畫地圖 =================
function drawMap() {
  polyline = L.polyline(trackPoints.map(p => [p.lat, p.lon]), {
    color: "red",
    weight: 4
  }).addTo(map);

  map.fitBounds(polyline.getBounds());

  // 起點
  L.marker([trackPoints[0].lat, trackPoints[0].lon], {
    icon: L.icon({
      iconUrl: "https://maps.gstatic.com/mapfiles/ms2/micons/green-dot.png",
      iconSize: [32, 32]
    })
  }).addTo(map).bindPopup("起點");

  // 終點
  const last = trackPoints.at(-1);
  L.marker([last.lat, last.lon], {
    icon: L.icon({
      iconUrl: "https://maps.gstatic.com/mapfiles/ms2/micons/red-dot.png",
      iconSize: [32, 32]
    })
  }).addTo(map).bindPopup("終點");

  hoverMarker = L.circleMarker([0, 0], {
    radius: 6,
    color: "blue",
    fillOpacity: 1
  }).addTo(map);

  // ⭐⭐ 新增：點擊地圖同步圖表
  polyline.on("click", e => {
    const index = findClosestPointIndex(e.latlng);
    if (index === -1) return;

    const p = trackPoints[index];

    // 同步圖表游標
    chart.setActiveElements([{ datasetIndex: 0, index }]);
    chart.tooltip.setActiveElements([{ datasetIndex: 0, index }]);
    chart.update();

    syncMap(p);
  });
}

// ================= 找最近點 =================
function findClosestPointIndex(latlng) {
  let minDist = Infinity;
  let closestIndex = -1;

  trackPoints.forEach((p, i) => {
    const d = map.distance(latlng, L.latLng(p.lat, p.lon));
    if (d < minDist) {
      minDist = d;
      closestIndex = i;
    }
  });

  return closestIndex;
}

// ================= 高度圖 =================
function drawElevationChart() {
  const ctx = document.getElementById("elevationChart");

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: trackPoints.map(p => p.distance.toFixed(2)),
      datasets: [{
        label: "高度 (m)",
        data: trackPoints.map(p => p.ele),
        fill: true,
        tension: 0.25,
        borderWidth: 2
      }]
    },
    options: {
      interaction: {
        intersect: false,
        mode: "index"
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => {
              const p = trackPoints[ctx.dataIndex];
              syncMap(p);
              return [
                `高度: ${p.ele} m`,
                `距離: ${p.distance.toFixed(2)} km`,
                `時間: ${p.timeLocal}`,
                `座標: ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`
              ];
            }
          }
        }
      },
      scales: {
        x: { title: { display: true, text: "距離 (km)" } },
        y: { title: { display: true, text: "高度 (m)" } }
      }
    }
  });
}

// ================= 地圖同步 =================
function syncMap(p) {
  hoverMarker.setLatLng([p.lat, p.lon]);
  hoverMarker.bindPopup(`
    <b>位置資訊</b><br>
    高度: ${p.ele} m<br>
    距離: ${p.distance.toFixed(2)} km<br>
    時間: ${p.timeLocal}<br>
    座標: ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}
  `).openPopup();
}

function formatDate(d) {
  return d.toISOString().replace("T", " ").substring(0, 19);
}