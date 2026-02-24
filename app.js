// ================= 地圖初始化 =================
const map = L.map("map", {
  tap: true
}).setView([25.03, 121.56], 12);

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

  const first = trackPoints[0];
  const last = trackPoints.at(-1);

  L.marker([first.lat, first.lon]).addTo(map).bindPopup("起點");
  L.marker([last.lat, last.lon]).addTo(map).bindPopup("終點");

  hoverMarker = L.circleMarker([first.lat, first.lon], {
    radius: 6,
    color: "blue",
    fillOpacity: 1
  }).addTo(map);

  // 點擊同步（支援手機 tap）
  polyline.on("click", e => {
    const index = findClosestPointIndex(e.latlng);
    activatePoint(index);
  });
}

// ================= 找最近點 =================
function findClosestPointIndex(latlng) {
  let minDist = Infinity;
  let closestIndex = -1;

  for (let i = 0; i < trackPoints.length; i++) {
    const d = map.distance(latlng, L.latLng(trackPoints[i].lat, trackPoints[i].lon));
    if (d < minDist) {
      minDist = d;
      closestIndex = i;
    }
  }

  return closestIndex;
}

// ================= 啟動某個點 =================
function activatePoint(index) {
  if (index < 0) return;

  const p = trackPoints[index];

  hoverMarker.setLatLng([p.lat, p.lon]);

  hoverMarker.bindPopup(`
    <b>位置資訊</b><br>
    高度: ${p.ele} m<br>
    距離: ${p.distance.toFixed(2)} km<br>
    時間: ${p.timeLocal}<br>
    座標: ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}
  `).openPopup();

  chart.setActiveElements([{ datasetIndex: 0, index }]);
  chart.tooltip.setActiveElements([{ datasetIndex: 0, index }]);
  chart.update();
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
      responsive: true,
      interaction: {
        intersect: false,
        mode: "index"
      },
      onHover: (event, elements) => {
        if (elements.length > 0) {
          activatePoint(elements[0].index);
        }
      },
      plugins: {
        tooltip: {
          enabled: true
        }
      },
      scales: {
        x: { title: { display: true, text: "距離 (km)" } },
        y: { title: { display: true, text: "高度 (m)" } }
      }
    }
  });
}

function formatDate(d) {
  return d.toISOString().replace("T", " ").substring(0, 19);
}