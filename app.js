
const map = L.map("map", { tap: true }).setView([25.03, 121.56], 12);
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
const otm = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 18, maxNativeZoom: 17, attribution: 'OpenTopoMap' });

// 經建三版
var map3rd = L.tileLayer('https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}', {
    attribution: '© <a href="https://maps.nlsc.gov.tw/">內政部國土測繪中心</a>',
    maxZoom: 19,
    minZoom: 7
});

// Happyman（當底圖）
const happyman = L.tileLayer(
  "https://tile.happyman.idv.tw/map/happyman/{z}/{x}/{y}.png",
  {
    maxZoom: 18,
    attribution: "Happyman Map"
  }
);

// 魯地圖（疊圖）
const rudy = L.tileLayer(
  "https://tile.happyman.idv.tw/map/moi_osm/{z}/{x}/{y}.png",
  {
    maxZoom: 18,
    attribution: "Rudy Map",
    opacity: 0.5   
  }
);

// 魯地圖（疊圖）
const rudyM = L.tileLayer(
  "https://tile.happyman.idv.tw/map/moi_osm/{z}/{x}/{y}.png",
  {
    maxZoom: 18,
    attribution: "Rudy Map",
    opacity: 0.5   
  }
);

var topo3rd = L.tileLayer('https://gis.sinica.edu.tw/tileserver/file-exists.php?img=TM25K_2001-jpg-{z}-{x}-{y}', {
    attribution: '經建三版地形圖 (中研院)',
    maxZoom: 16,
    minZoom: 7
});

const mapDiv = document.getElementById('map');
const rsContainer = document.getElementById('routeSelectContainer');
mapDiv.appendChild(rsContainer); 


L.DomEvent.disableClickPropagation(rsContainer);

let showWptNameAlways = false; 
const emap = L.tileLayer("https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "內政部臺灣通用電子地圖",
    opacity: 1.0,
});


let gridLayers = {
    "WGS84": L.layerGroup(),
    "TWD97": L.layerGroup(),
    "TWD67": L.layerGroup(),
    "SubGrid": L.layerGroup()
};


const baseMaps = { 
    "標準地圖 (OSM)": osm, 
    "魯地圖 (等高線)": rudyM,    
    "等高線地形圖 (OpenTopo)": otm,
    "內政部臺灣通用電子地圖": emap,
    "經建三版": topo3rd,
    "正射影像圖":  map3rd
};

const overlayMaps = {
	  "魯地圖疊圖": rudy,
		"Happyman疊圖": happyman, 
    "WGS84 格線": gridLayers.WGS84,
    "TWD97 格線": gridLayers.TWD97,
    "TWD67 格線": gridLayers.TWD67,
    "顯示百米細格": gridLayers.SubGrid  
};

L.control.layers(baseMaps, overlayMaps).addTo(map);

rudy.addTo(map);
map.on('overlayadd', updateGrids);

let allTracks = [], trackPoints = [], polyline, hoverMarker, chart, markers = [], wptMarkers = [];
let pointA = null, pointB = null, markerA = null, markerB = null;
let currentPopup = null; 
let isMouseDown = false; 
let mapTipTimer = null;
let gpsMarker = null;
let currentFocusId = null;
let isMultiGpxMode = false;
window.customNameCache = {};
const backgroundTracksLayer = L.layerGroup().addTo(map);
const routeSelect = document.getElementById("routeSelect");

let clickTimeout = null;
	

map.on('click', (e) => {
    
    if (!e || !e.latlng) return;

    let closest = null;
    let minD = Infinity;

    if (trackPoints && trackPoints.length > 0) {
        trackPoints.forEach(p => {
            
            const d = Math.sqrt(Math.pow(p.lat - e.latlng.lat, 2) + Math.pow(p.lon - e.latlng.lng, 2));
            if (d < minD) { minD = d; closest = p; }
        });
    }
    
    if (closest && minD * 111000 < 5) {
    if (clickTimeout) clearTimeout(clickTimeout); 

    const idx = trackPoints.indexOf(closest);
    
    if (idx !== -1 && typeof showCustomPopup === 'function') {
        
        showCustomPopup(idx, "位置資訊", null, closest.lat, closest.lon);
      
        if (hoverMarker) {
            hoverMarker.setLatLng([closest.lat, closest.lon]).addTo(map).bringToFront();
        }
    }
}
    else {
        
        clickTimeout = setTimeout(() => {
            if (typeof showFreeClickPopup === 'function') {
                showFreeClickPopup(e.latlng);
            }
        }, 200);
    }
});

function processGpxXml(text) {
    const xml = new DOMParser().parseFromString(text, "application/xml");
    const tempTracks = [];
    
    const wpts = xml.getElementsByTagName("wpt");
    let allWpts = [];
    for (let w of wpts) {
        const lat = parseFloat(w.getAttribute("lat")), lon = parseFloat(w.getAttribute("lon"));
        const name = w.getElementsByTagName("name")[0]?.textContent || "未命名航點";
        const timeNode = w.getElementsByTagName("time")[0];
        const rawTime = timeNode ? timeNode.textContent.trim() : null;
        const ele = w.getElementsByTagName("ele")[0]?.textContent;
        
        allWpts.push({ 
            lat, lon, name, 
            ele: ele ? parseFloat(ele) : 0,
            time: rawTime,
            localTime: rawTime ? formatDate(new Date(new Date(rawTime).getTime() + 8*3600000)) : "無時間資訊" 
        });
    }

    const trks = xml.getElementsByTagName("trk");
    
    if (trks.length > 0) {
        for (let i = 0; i < trks.length; i++) {
            const pts = trks[i].getElementsByTagName("trkpt");
            const points = extractPoints(pts);
            
            if (points.length > 0) {
                tempTracks.push({ 
                    name: trks[i].getElementsByTagName("name")[0]?.textContent || `路線 ${i + 1}`, 
                    points, 
                    waypoints: allWpts 
                });
            }
        }
    }

    if (tempTracks.length === 0 && allWpts.length > 0) {
        tempTracks.push({
            name: "航點資料",
            points: [],
            waypoints: allWpts
        });
    }

    return tempTracks;
}

function updateGrids() {
    const zoom = map.getZoom();
    const bounds = map.getBounds();
    
    gridLayers.WGS84.clearLayers();
    gridLayers.TWD97.clearLayers();
    gridLayers.TWD67.clearLayers();
    gridLayers.SubGrid.clearLayers();

    if (zoom < 10) return; 

    let stepMeter = zoom > 13 ? 1000 : 5000;
    let subStepMeter = 100; 

    const createLabel = (lat, lon, text, color, anchor = [0, 0]) => {
        return L.marker([lat, lon], {
            icon: L.divIcon({
                className: 'grid-label',
                html: `<div style="color: ${color}; font-size: 10px; font-weight: bold; text-shadow: 1px 1px 2px #fff; white-space: nowrap; background: rgba(255,255,255,0.5); padding: 1px 3px; border-radius: 2px;">${text}</div>`,
                iconSize: [0, 0],
                iconAnchor: anchor
            }),
            interactive: false
        });
    };

    const drawTWDGrid = (layer, def, color) => {
        if (!map.hasLayer(layer)) return;
        
        const sw = proj4(WGS84_DEF, def, [bounds.getWest(), bounds.getSouth()]);
        const ne = proj4(WGS84_DEF, def, [bounds.getEast(), bounds.getNorth()]);

        for (let x = Math.floor(sw[0]/stepMeter)*stepMeter; x <= ne[0]; x += stepMeter) {
            let p_top = proj4(def, WGS84_DEF, [x, ne[1]]);
            let p_bot = proj4(def, WGS84_DEF, [x, sw[1]]);
            L.polyline([[p_top[1], p_top[0]], [p_bot[1], p_bot[0]]], {color: color, weight: 1.2, opacity: 0.6, interactive: false}).addTo(layer);
            createLabel(p_top[1], p_top[0], Math.round(x), color, [0, 0]).addTo(layer);
            createLabel(p_bot[1], p_bot[0], Math.round(x), color, [0, 20]).addTo(layer);
        }
        for (let y = Math.floor(sw[1]/stepMeter)*stepMeter; y <= ne[1]; y += stepMeter) {
            let p_left = proj4(def, WGS84_DEF, [sw[0], y]);
            let p_right = proj4(def, WGS84_DEF, [ne[0], y]);
            L.polyline([[p_left[1], p_left[0]], [p_right[1], p_right[0]]], {color: color, weight: 1.2, opacity: 0.6, interactive: false}).addTo(layer);
            createLabel(p_left[1], p_left[0], Math.round(y), color, [-5, 12]).addTo(layer);
            createLabel(p_right[1], p_right[0], Math.round(y), color, [55, 12]).addTo(layer);
        }

        if (map.hasLayer(gridLayers.SubGrid) && zoom >= 13) {
            for (let x = Math.floor(sw[0]/subStepMeter)*subStepMeter; x <= ne[0]; x += subStepMeter) {
                if (x % 1000 === 0) continue; 
                let p_top = proj4(def, WGS84_DEF, [x, ne[1]]);
                let p_bot = proj4(def, WGS84_DEF, [x, sw[1]]);
                L.polyline([[p_top[1], p_top[0]], [p_bot[1], p_bot[0]]], {color: color, weight: 0.8, opacity: 0.8, dashArray: '2, 4', interactive: false}).addTo(gridLayers.SubGrid);
            }
            for (let y = Math.floor(sw[1]/subStepMeter)*subStepMeter; y <= ne[1]; y += subStepMeter) {
                if (y % 1000 === 0) continue;
                let p_left = proj4(def, WGS84_DEF, [sw[0], y]);
                let p_right = proj4(def, WGS84_DEF, [ne[0], y]);
                L.polyline([[p_left[1], p_left[0]], [p_right[1], p_right[0]]], {color: color, weight: 0.8, opacity: 0.8, dashArray: '2, 4', interactive: false}).addTo(gridLayers.SubGrid);
            }
        }
    };

    drawTWDGrid(gridLayers.TWD97, TWD97_DEF, '#4a90e2'); 
    drawTWDGrid(gridLayers.TWD67, TWD67_DEF, '#e67e22');

if (map.hasLayer(gridLayers.WGS84)) {
        let stepDeg = zoom > 14 ? 0.005 : (zoom > 12 ? 0.01 : 0.05); 
        const wgsColor = '#666'; 

        for (let lo = Math.floor(bounds.getWest()/stepDeg)*stepDeg; lo <= bounds.getEast(); lo += stepDeg) {
            L.polyline([[bounds.getSouth(), lo], [bounds.getNorth(), lo]], {
                color: wgsColor, 
                weight: 1, 
                opacity: 0.5, 
                dashArray: '5,10', 
                interactive: false
            }).addTo(gridLayers.WGS84);
            
             createLabel(bounds.getNorth(), lo, lo.toFixed(3) + '°E', wgsColor, [0, 0]).addTo(gridLayers.WGS84);
            createLabel(bounds.getSouth(), lo, lo.toFixed(3) + '°E', wgsColor, [0, 20]).addTo(gridLayers.WGS84);
        }

          for (let la = Math.floor(bounds.getSouth()/stepDeg)*stepDeg; la <= bounds.getNorth(); la += stepDeg) {
            L.polyline([[la, bounds.getWest()], [la, bounds.getEast()]], {
                color: wgsColor, 
                weight: 1, 
                opacity: 0.5, 
                dashArray: '5,10', 
                interactive: false
            }).addTo(gridLayers.WGS84);
            
             createLabel(la, bounds.getWest(), la.toFixed(3) + '°N', wgsColor, [-5, 12]).addTo(gridLayers.WGS84);
            createLabel(la, bounds.getEast(), la.toFixed(3) + '°N', wgsColor, [55, 12]).addTo(gridLayers.WGS84);
        }
    }
}

map.on('moveend', updateGrids);

const fullScreenBtn = L.control({ position: 'topleft' });

fullScreenBtn.onAdd = function() {
    const btn = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    btn.innerHTML = '⛶'; 
    btn.style.backgroundColor = 'white';
    btn.style.width = '30px';
    btn.style.height = '30px';
    btn.style.lineHeight = '30px';
    btn.style.textAlign = 'center';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '22px';
    btn.style.fontWeight = 'bold';
    btn.title = '切換全螢幕模式';

    L.DomEvent.disableClickPropagation(btn);
    
    btn.onclick = function() {
        const mapElement = document.getElementById('map');
    const canNativeFull = mapElement.requestFullscreen || mapElement.webkitRequestFullscreen;

    if (canNativeFull) {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            if (mapElement.requestFullscreen) mapElement.requestFullscreen();
            else if (mapElement.webkitRequestFullscreen) mapElement.webkitRequestFullscreen();
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
    } else {
        if (!mapElement.classList.contains('iphone-fullscreen')) {
            mapElement.classList.add('iphone-fullscreen');
            btn.innerHTML = '✕'; 
            document.body.style.overflow = 'hidden'; 
        } else {
            mapElement.classList.remove('iphone-fullscreen');
            btn.innerHTML = '⛶';
            document.body.style.overflow = '';
        }
        
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (mapElement.requestFullscreen) {
            mapElement.requestFullscreen();
        } else if (mapElement.webkitRequestFullscreen) {
            mapElement.webkitRequestFullscreen(); 
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    }
        setTimeout(() => map.invalidateSize(), 500);
    }
    };
    return btn;
};

function showFreeClickPopup(latlng, searchTitle = null, searchAddr = null) {
    const lat = latlng.lat;
    const lon = latlng.lng;
    const title = searchTitle || "自選位置";

    if (searchTitle && !["軌跡點", "位置資訊", "自選位置"].includes(title)) {
        let potentialSources = [];
        if (window.allTracks) potentialSources = [...window.allTracks];
        if (window.multiGpxStack) potentialSources = [...potentialSources, ...window.multiGpxStack];

        for (let gpx of potentialSources) {
            if (!gpx || !gpx.waypoints) continue;

             let foundIdx = gpx.waypoints.findIndex(w => {
                const isSameName = (w.name === title || w.name === title.trim());
                const isNearby = Math.abs(w.lat - lat) < 0.0008 && Math.abs(w.lon - lon) < 0.0008;
                return isSameName && isNearby;
            });

            if (foundIdx !== -1) {
                
                let trackIdx = 999999;
                if (typeof trackPoints !== 'undefined') {
                    const tIdx = trackPoints.findIndex(tp => 
                        Math.abs(tp.lat - gpx.waypoints[foundIdx].lat) < 0.00015 && 
                        Math.abs(tp.lon - gpx.waypoints[foundIdx].lon) < 0.00015
                    );
                    if (tIdx !== -1) trackIdx = tIdx;
                }


                showCustomPopup(trackIdx, gpx.waypoints[foundIdx].name, "wpt", lat, lon);
                return; 
            }
        }
    }

    let foundEle = null;
    let minDistance = 0.0002; 

    if (typeof trackPoints !== 'undefined' && trackPoints.length > 0) {
        trackPoints.forEach((tp, i) => {
            const d = Math.sqrt(Math.pow(tp.lat - lat, 2) + Math.pow(tp.lon - lon, 2));
            if (d < minDistance) {
                minDistance = d;
                foundEle = tp.ele;    
            }
        });
    }

    const twd97 = proj4(WGS84_DEF, TWD97_DEF, [lon, lat]);
    const twd67 = proj4(WGS84_DEF, TWD67_DEF, [lon, lat]);
    
    
    const addressHtml = searchAddr ? 
        `<div style="color: #666; font-size: 12px; line-height: 1.4; margin-bottom: 5px; word-break: break-all;">${searchAddr}</div>` : "";
    
    const eleParam = foundEle !== null ? foundEle : 'null';
    const eleDisplay = foundEle !== null ? `高度: ${foundEle.toFixed(0)} m<br>` : "";
    
    
    const editIcon = `<span class="material-icons" style="font-size:16px; cursor:pointer; vertical-align:middle; margin-left:4px; color:#d35400;" 
        onclick="event.stopPropagation(); handleWptEdit(-1, ${lat}, ${lon}, ${eleParam}, '${title}', null, null)">add_location</span>`;

    const gUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    const gMapIconBtn = `<a href="${gUrl}" target="_blank" style="text-decoration:none; margin-right:8px; display:inline-flex; align-items:center; justify-content:center; width: 28px; height: 28px; background: #fff; border: 1px solid #ccc; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); vertical-align: middle;"><img src="https://ychiking.github.io/gpx-online-viewer/GoogleMaps.png" style="width:18px; height:18px; display:block;"></a>`;

    
    const content = `
        <div style="min-width:180px; font-size:13px; line-height:1.6;">
            <div style="display:flex; align-items:center; margin-bottom:5px;">
                ${gMapIconBtn}
                <b style="font-size:14px; color:#d35400;">${title}</b>${editIcon}
            </div>
            ${addressHtml}
            <hr style="margin:5px 0; border:0; border-top:1px solid #eee;">
            ${eleDisplay}
            <b>WGS84:</b> ${lat.toFixed(6)}, ${lon.toFixed(6)}<br>
            <b>TWD97:</b> ${Math.round(twd97[0])}, ${Math.round(twd97[1])}<br>
            <b>TWD67:</b> ${Math.round(twd67[0])}, ${Math.round(twd67[1])}
            <div style="display:flex; margin-top:10px; gap:8px;">
                <button onclick="setFreeAB('A', ${lat}, ${lon})" style="flex:1; background:#007bff; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold;">設定 A</button>
                <button onclick="setFreeAB('B', ${lat}, ${lon})" style="flex:1; background:#e83e8c; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold;">設定 B</button>
            </div>
        </div>`;
    
    if (currentPopup && map.hasLayer(currentPopup)) {
        currentPopup.setLatLng(latlng).setContent(content);
    } else {
        currentPopup = L.popup({ autoClose: false, closeOnClick: false,})
            .setLatLng(latlng)
            .setContent(content)
            .openOn(map);
    }
    const routeSelect = document.getElementById('routeSelectContainer');
    
    const isRouteSelectVisible = routeSelect && 
                                 window.getComputedStyle(routeSelect).display !== 'none';

    if (isRouteSelectVisible) {
        const clickPoint = map.latLngToContainerPoint([lat, lon]);
        
        
        if (clickPoint.y < 250) {
            
            const offset = 250 - clickPoint.y;
            
            requestAnimationFrame(() => {
                
                map.panBy([0, -offset], { animate: true });
            });
        }
    }
}

window.setFreeAB = function(type, lat, lon) {
    
    if (gpsMarker) {
        map.removeLayer(gpsMarker);
        gpsMarker = null;
        
        
        if (gpsInterval) { clearInterval(gpsInterval); gpsInterval = null; }
        
        if (gpsButtonElement) {
            gpsButtonElement.style.background = "white";
        }
    }

    const p = { lat, lon, ele: 0, distance: 0, timeLocal: "無時間資訊", timeUTC: 0, idx: -1 };
    
    if (type === 'A') {
        pointA = p;
        if (markerA) map.removeLayer(markerA);
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
    
    map.closePopup();
    updateABUI();
};

routeSelect.addEventListener("change", (e) => {
    const selectedIndex = parseInt(e.target.value);
    loadRoute(selectedIndex);
});


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

window.clearABSettings = function() {
  pointA = null; pointB = null;
  if (markerA) { map.removeLayer(markerA); markerA = null; }
  if (markerB) { map.removeLayer(markerB); markerB = null; }
  updateABUI();
  map.closePopup(); 
};

document.getElementById("gpxInput").addEventListener("change", e => {
    
    clearEverything(); 

    const file = e.target.files[0];
    if (!file) return;
    
    
    const gpxFileName = file.name.replace(/\.[^/.]+$/, "");
    
    document.getElementById("fileNameDisplay").textContent = file.name;
    map.closePopup(); 
    
    const toggleBtn = document.getElementById("toggleChartBtn");
    if (toggleBtn) {
        toggleBtn.style.display = "block"; 
        toggleBtn.textContent = "收合高度表"; 
    }

    
    const multiBar = document.getElementById('multiGpxBtnBar');
    if (multiBar) multiBar.style.display = 'none';

    const reader = new FileReader();
    reader.onload = () => {
        
        
        parseGPX(reader.result, gpxFileName);
    };
    reader.readAsText(file);

    
    e.target.value = ""; 
});


function clearEverything() {
    
    if (typeof window.resetGPS === 'function') window.resetGPS();
    
    
    if (typeof polyline !== 'undefined' && polyline) {
        map.removeLayer(polyline);
    }

    
    if (typeof multiGpxStack !== 'undefined') {
        multiGpxStack.forEach(item => {
            if (item.layer) map.removeLayer(item.layer);
        });
        multiGpxStack = [];
    }

    
    const multiBar = document.getElementById('multiGpxBtnBar');
    if (multiBar) {
        multiBar.innerHTML = '';
        multiBar.style.display = 'none';
    }

    
    if (window.chart) {
        window.chart.destroy();
        window.chart = null;
    }

    
    const summary = document.getElementById("routeSummary");
    if (summary) summary.innerHTML = "";
    const wptList = document.getElementById("wptList");
    if (wptList) wptList.innerHTML = "";
		}

function parseGPX(text, fileName, shouldFit = true) { 
    const xml = new DOMParser().parseFromString(text, "application/xml");
    allTracks = [];
    const routeSelect = document.getElementById("routeSelect"); 
    routeSelect.innerHTML = "";
    
    const displayName = fileName ? fileName.replace(/\.[^/.]+$/, "") : "結合路線";

    
    const wpts = xml.getElementsByTagName("wpt");
    let allWpts = [];
    for (let w of wpts) {
        const lat = parseFloat(w.getAttribute("lat")), lon = parseFloat(w.getAttribute("lon"));
        const name = w.getElementsByTagName("name")[0]?.textContent || "未命名航點";
        const time = w.getElementsByTagName("time")[0]?.textContent;
        const ele = w.getElementsByTagName("ele")[0]?.textContent;
        allWpts.push({ 
            lat, lon, name, 
            ele: ele ? parseFloat(ele) : 0,
            time: time || null,
            localTime: time ? formatDate(new Date(new Date(time).getTime() + 8*3600000)) : "無時間資訊" 
        });
    }

    
    const trks = xml.getElementsByTagName("trk");
    let combinedPoints = [];
    let combinedSegments = []; 
    let combinedWaypoints = allWpts;

    for (let i = 0; i < trks.length; i++) {
        const pts = trks[i].getElementsByTagName("trkpt");
        const points = extractPoints(pts);
        
        if (points.length > 0) {
            
            const segCoords = points.map(p => [p.lat, p.lon]);
            combinedSegments.push(segCoords);

            const trackData = { 
                name: trks[i].getElementsByTagName("name")[0]?.textContent || `路線 ${i + 1}`, 
                points, 
                segments: [segCoords], 
                waypoints: allWpts 
            };

            allTracks.push(trackData);
            combinedPoints = combinedPoints.concat(points);
        }
    }

    if (allTracks.length === 0 && allWpts.length > 0) {
        allTracks.push({ name: displayName || "僅含航點資料", points: [], waypoints: allWpts });
    }

    
    if (allTracks.length > 1) {
        let totalDist = 0;
        const reCalibratedPoints = combinedPoints.map((p, idx, arr) => {
            if (idx > 0) {
                const a = arr[idx-1], R = 6371;
                const dLat = (p.lat - a.lat) * Math.PI / 180, dLon = (p.lon - a.lon) * Math.PI / 180;
                const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180) * Math.cos(p.lat*Math.PI/180) * Math.sin(dLon/2)**2;
                totalDist += 2 * R * Math.asin(Math.sqrt(x));
            }
            return { ...p, distance: totalDist };
        });

        allTracks.unshift({
            name: displayName,
            points: reCalibratedPoints, 
            segments: combinedSegments, 
            waypoints: combinedWaypoints,
            isCombined: true
        });
    }

    const container = document.getElementById("routeSelectContainer");
    if (allTracks.length > 1) {
        routeSelect.innerHTML = "";
        allTracks.forEach((t, i) => {
            const opt = document.createElement("option"); 
            opt.value = i; 
            opt.textContent = t.name;
            routeSelect.appendChild(opt);
        });
        container.style.cssText = "display: block !important; position: absolute; top: 10px; left: 60px; z-index: 9999;";
    } else {
        container.style.display = "none";
    }
    
    if (allTracks.length > 0) {
        window.multiGpxStack = allTracks;
        loadRoute(0, shouldFit);
    }
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
      
      let utc = null;
      let localTime = "無時間資訊";
      let rawTime = null; 
      
      if (timeNode && timeNode.textContent.trim() !== "") {
        rawTime = timeNode.textContent.trim(); 
        const d = new Date(rawTime);
        if (!isNaN(d.getTime())) {
          utc = d;
          localTime = formatDate(new Date(utc.getTime() + 8*3600*1000));
        }
      }

      if (res.length > 0) {
        const a = res[res.length-1], R = 6371;
        const dLat = (lat-a.lat)*Math.PI/180, dLon = (lon-a.lon)*Math.PI/180;
        const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLon/2)**2;
        total += 2 * R * Math.asin(Math.sqrt(Math.max(0, x)));
      }
      
      res.push({ 
        lat, 
        lon, 
        ele, 
        time: rawTime,           
        timeUTC: utc ? utc.getTime() : null, 
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


let fsPopupTimer = null;

function setupProgressBar() {
    const barContainer = document.getElementById("map-control-bar");
    const progressBar = document.getElementById("gpxProgressBar");
    const mainCheckbox = document.getElementById("showChartTipCheckbox");
    const fsCheckbox = document.getElementById("fsShowTipCheckbox");

    if (!barContainer || !progressBar) return;

    L.DomEvent.disableClickPropagation(barContainer);
    L.DomEvent.disableScrollPropagation(barContainer);

    
    const getIndicator = (latlng) => {
        if (!window.activeFocusCircle) {
            window.activeFocusCircle = L.circleMarker(latlng, {
                radius: 7,
                color: '#ffffff',
                weight: 2,
                fillColor: '#1a73e8',
                fillOpacity: 1,
                interactive: false
            }).addTo(map);
        } else {
            window.activeFocusCircle.setLatLng(latlng);
            if (!map.hasLayer(window.activeFocusCircle)) {
                window.activeFocusCircle.addTo(map);
            }
        }
        return window.activeFocusCircle;
    };

    const startAutoCloseTimer = () => {
        if (window.fsPopupTimer) clearTimeout(window.fsPopupTimer);
        window.fsPopupTimer = setTimeout(() => {
            map.closePopup();
        }, 3000);
    };

    const handleCheckboxChange = (isChecked) => {
        if (mainCheckbox) mainCheckbox.checked = isChecked;
        if (fsCheckbox) fsCheckbox.checked = isChecked;

        if (!isChecked) {
            map.closePopup();
            if (window.fsPopupTimer) clearTimeout(window.fsPopupTimer); 
        } else {
            const idx = parseInt(progressBar.value);
            if (typeof showCustomPopup === 'function' && trackPoints && trackPoints[idx]) {
                showCustomPopup(idx, "位置資訊");
                startAutoCloseTimer(); 
            }
        }
    };

    if (mainCheckbox) mainCheckbox.addEventListener('change', (e) => handleCheckboxChange(e.target.checked));
    if (fsCheckbox) fsCheckbox.addEventListener('change', (e) => handleCheckboxChange(e.target.checked));

    window.updateVisibility = () => {
        const barContainer = document.getElementById("map-control-bar");
        if (!barContainer) return;

        const hasTracks = (typeof trackPoints !== 'undefined' && trackPoints && trackPoints.length > 0);
        
        if (hasTracks && window.manualShowBar) {
            barContainer.style.setProperty('display', 'flex', 'important');
            barContainer.style.visibility = 'visible'; 
            barContainer.style.opacity = '1';

            const isIphoneFS = document.body.classList.contains('iphone-fullscreen');
            const isLandscape = window.innerWidth > window.innerHeight && window.innerHeight < 500;

            if (isLandscape) {
                barContainer.style.bottom = '5px';
            } else if (isIphoneFS) {
                barContainer.style.bottom = '100px'; 
                barContainer.style.zIndex = '2000'; 
            } else {
                barContainer.style.bottom = '65px';
            }
        } else {
            barContainer.style.setProperty('display', 'none', 'important');
        }
    };

    document.addEventListener('fullscreenchange', updateVisibility);
    document.addEventListener('webkitfullscreenchange', updateVisibility);

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') updateVisibility();
        });
    });
    observer.observe(document.body, { attributes: true });

    
    let ticking = false;

    progressBar.addEventListener("input", function() {
        const idx = parseInt(this.value);
        if (!trackPoints || !trackPoints[idx]) return;
        const p = trackPoints[idx];

        
        const infoEl = document.getElementById("progressBarInfo");
        if (infoEl) infoEl.textContent = `${p.distance.toFixed(2)} km`;

        
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const latlng = [p.lat, p.lon];

                
                const indicator = getIndicator(latlng);
                indicator.bringToFront();

                
                if (!map.getBounds().contains(latlng)) {
                    map.panTo(latlng, { animate: false });
                }

                
                if (typeof chart !== 'undefined' && chart) {
                    const meta = chart.getDatasetMeta(0);
                    const point = meta.data[idx];
                    if (point) {
                        chart.setActiveElements([{ datasetIndex: 0, index: idx }]);
                        chart.tooltip.setActiveElements(
                            [{ datasetIndex: 0, index: idx }],
                            { x: point.x, y: point.y }
                        );
                        chart.update('none'); 
                    }
                }
                ticking = false;
            });
            ticking = true;
        }

        
        const isChecked = fsCheckbox ? fsCheckbox.checked : (mainCheckbox ? mainCheckbox.checked : true);
        if (typeof showCustomPopup === 'function') {
            if (isChecked) {
                showCustomPopup(idx, "位置資訊");
            } else {
                
                if (map._popup) map.closePopup();
            }
        }
    });

    progressBar.addEventListener("change", function() {
        const isChecked = fsCheckbox ? fsCheckbox.checked : (mainCheckbox ? mainCheckbox.checked : true);
        if (isChecked) startAutoCloseTimer();
    });
}

function initProgressBar() {
    const bar = document.getElementById("gpxProgressBar");
    if (typeof trackPoints !== 'undefined' && trackPoints.length > 0 && bar) {
        bar.max = trackPoints.length - 1;
        bar.value = 0;
        document.getElementById("progressBarInfo").textContent = "0.00 km";
        
    }
}


function loadRoute(index, customColor = null, focusPos = null) {
    renderSideToolbar()
    window.currentActiveIndex = index;
    setTimeout(() => historyManager.updateUI(), 10);
    
    
    map.eachLayer(layer => {
        if (layer instanceof L.CircleMarker && layer.options.radius === 7) {
            map.removeLayer(layer);
        }
    });
    if (window.activeFocusCircle) window.activeFocusCircle = null;
    
    map.closePopup();
    map.closePopup();
    if (typeof window.clearABSettings === 'function') window.clearABSettings();

    const sel = (window.multiGpxStack && window.multiGpxStack[index]) 
                ? window.multiGpxStack[index] 
                : allTracks[index];
    if (!sel) return;

    const fileName = window.currentFileNameForDisplay || "default";
    const fileKey = fileName + "_" + index;

    if (window.customNameCache && window.customNameCache[fileKey]) {
        const cachedName = window.customNameCache[fileKey];
        sel.name = cachedName; 
        if (allTracks && allTracks[index]) allTracks[index].name = cachedName;
        if (window.multiGpxStack && window.multiGpxStack[index]) {
            window.multiGpxStack[index].name = cachedName;
        }
        const routeSelect = document.getElementById("routeSelect");
        if (routeSelect && routeSelect.options[index]) {
            routeSelect.options[index].text = cachedName;
        }
    }
    
    const wptToggleContainer = document.getElementById("wptToggleContainer");
    if (wptToggleContainer) wptToggleContainer.style.display = "block";

    if (hoverMarker) {
        map.removeLayer(hoverMarker);
        hoverMarker = null;
    }

    trackPoints = sel.points || []; 
    
    const breakTracks = (pts) => {
        if (!pts || pts.length === 0) return [];
        const result = [];
        let currentSeg = [pts[0]];
        for (let j = 1; j < pts.length; j++) {
            const p1 = pts[j-1];
            const p2 = pts[j];
            const lat1 = p1.lat ?? p1[0] ?? p1.lat;
            const lng1 = p1.lng ?? p1[1] ?? p1.lng;
            const lat2 = p2.lat ?? p2[0] ?? p2.lat;
            const lng2 = p2.lng ?? p2[1] ?? p2.lng;
            const d = Math.sqrt(Math.pow(lat1 - lat2, 2) + Math.pow(lng1 - lng2, 2));
            if (d > 0.001) {
                if (currentSeg.length > 0) result.push(currentSeg);
                currentSeg = [];
            }
            currentSeg.push(p2);
        }
        if (currentSeg.length > 0) result.push(currentSeg);
        return result;
    };

    const drawSegments = (sel.segments && sel.segments.length > 0) 
                         ? sel.segments 
                         : breakTracks(trackPoints);

    let finalColor = customColor || "red"; 
    if (typeof multiGpxStack !== 'undefined' && multiGpxStack.length > 0) {
        const stackIdx = (window.currentMultiIndex !== undefined) ? window.currentMultiIndex : 0;
        multiGpxStack.forEach((item, i) => {
            const layer = item.layer;
            if (!(layer instanceof L.Polyline)) return;
            
            if (item.segments && item.segments.length > 0) {
                layer.setLatLngs(item.segments);
            } else {
                const currentRawPts = layer.getLatLngs().flat(Infinity);
                layer.setLatLngs(breakTracks(currentRawPts)); 
            }

            if (i === stackIdx) {
                const isSelectingCombined = (index === 0 || sel.name.includes("結合"));
                if (isSelectingCombined) {
                    layer.setStyle({ opacity: 0, weight: 0 });
                } else {
                    layer.setStyle({ color: item.color || "#666", opacity: 0.5, weight: 4, dashArray: "5, 8" });
                    layer.bringToBack();
                }
                if (item.color) finalColor = item.color;
            } else {
                layer.setStyle({ color: item.color || "#999", opacity: 0.5, weight: 4, dashArray: null });
                layer.bringToBack();
            }
        });
    }

    if (polyline) map.removeLayer(polyline);
    markers.forEach(m => map.removeLayer(m));
    wptMarkers.forEach(m => map.removeLayer(m));
    if (window.chart) { window.chart.destroy(); window.chart = null; }
    markers = []; wptMarkers = []; polyline = null; 

    if (trackPoints && trackPoints.length > 0) {
        polyline = L.polyline(drawSegments, { color: finalColor, weight: 6, opacity: 0.8 }).addTo(map);

        if (polyline.getBounds().isValid()) {
            if (!map.getBounds().pad(0.05).intersects(polyline.getBounds())) {
                map.fitBounds(polyline.getBounds(), { padding: [20, 20], maxZoom: 16, animate: true });
            }
        }

        polyline.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            let minD = Infinity, idx = 0;
            trackPoints.forEach((p, pIdx) => {
                const d = Math.sqrt((p.lat - e.latlng.lat)**2 + (p.lon - e.latlng.lng)**2);
                if (d < minD) { minD = d; idx = pIdx; }
            });
            if (minD * 111000 <= 15) {
                const progressBar = document.getElementById('gpxProgressBar');
                if (progressBar) {
                    progressBar.value = idx;
                    progressBar.dispatchEvent(new Event('input', { bubbles: true }));
                }
                if (chart) {
                    const meta = chart.getDatasetMeta(0);
                    const point = meta.data[idx];
                    if (point) {
                        chart.setActiveElements([{ datasetIndex: 0, index: idx }]);
                        chart.tooltip.setActiveElements([{ datasetIndex: 0, index: idx }], { x: point.x, y: point.y });
                        chart.update('none');
                    }
                }
                if (!hoverMarker) {
                    hoverMarker = L.circleMarker([trackPoints[idx].lat, trackPoints[idx].lon], { 
                        radius: 7, color: '#ffffff', weight: 2, fillColor: '#1a73e8', fillOpacity: 1, interactive: false 
                    }).addTo(map);
                } else if (!map.hasLayer(hoverMarker)) {
                    hoverMarker.addTo(map);
                }
                hoverMarker.setLatLng([trackPoints[idx].lat, trackPoints[idx].lon]).bringToFront();
                if (typeof showCustomPopup === 'function') showCustomPopup(idx, "位置資訊", null);
            }
        });

        try {
            const startMarker = L.marker([trackPoints[0].lat, trackPoints[0].lon], { 
                icon: startIcon, 
                zIndexOffset: 1000 
            }).addTo(map);

            startMarker.on('click', (e) => { 
                L.DomEvent.stopPropagation(e); 
                const progressBar = document.getElementById('gpxProgressBar');
                if (progressBar) {
                    progressBar.value = 0; 
                    progressBar.dispatchEvent(new Event('input', { bubbles: true }));
                }
                if (hoverMarker) {
                    hoverMarker.setLatLng([trackPoints[0].lat, trackPoints[0].lon]).addTo(map).bringToFront();
                }
                showCustomPopup(0, "起點", null); 
            });
            markers.push(startMarker);

            const lastIdx = trackPoints.length - 1;
            const endMarker = L.marker([trackPoints[lastIdx].lat, trackPoints[lastIdx].lon], { 
                icon: endIcon, 
                zIndexOffset: 1000 
            }).addTo(map);

            endMarker.on('click', (e) => { 
                L.DomEvent.stopPropagation(e); 
                const progressBar = document.getElementById('gpxProgressBar');
                if (progressBar) {
                    progressBar.value = lastIdx; 
                    progressBar.dispatchEvent(new Event('input', { bubbles: true }));
                }
                if (hoverMarker) {
                    hoverMarker.setLatLng([trackPoints[lastIdx].lat, trackPoints[lastIdx].lon]).addTo(map).bringToFront();
                }
                showCustomPopup(lastIdx, "終點", null); 
            });
            markers.push(endMarker);
        } catch (err) {}

        if (typeof drawElevationChart === 'function') drawElevationChart();
    }

    if (sel.waypoints && sel.waypoints.length > 0) {
        const activeIdx = window.currentActiveIndex || 0;
        let startTime = null, endTime = null;
        if (trackPoints && trackPoints.length > 0) {
            const times = trackPoints.map(p => p.time ? new Date(p.time).getTime() : null).filter(t => t);
            if (times.length > 0) {
                startTime = Math.min(...times) - (60 * 60 * 1000);
                endTime = Math.max(...times) + (60 * 60 * 1000);
            }
        }

        const displayWaypoints = sel.waypoints.filter(w => {
            if (activeIdx === 0) return true;
            if (w.belongsToRoute !== undefined) return w.belongsToRoute === activeIdx;
            const wTimeVal = w.time ? new Date(w.time).getTime() : null;
            if (wTimeVal && startTime) {
                const is2025Trek = new Date(wTimeVal).getFullYear() === 2025;
                const isInTimeRange = (wTimeVal >= startTime && wTimeVal <= endTime);
                if (is2025Trek && !isInTimeRange) return false;
            }
            return true;
        });

				displayWaypoints.forEach((w) => {
				    let initialTIdx = null; 
				    if (trackPoints && trackPoints.length > 0) {
				        let minD = Infinity;
				        let nearestIdx = -1;
				        trackPoints.forEach((tp, pi) => {
				            let d = Math.sqrt((w.lat - tp.lat) ** 2 + (w.lon - tp.lon) ** 2);
				            if (d < minD) { minD = d; nearestIdx = pi; }
				        });
				        if (nearestIdx !== -1 && minD * 111000 <= 15) {
				            initialTIdx = nearestIdx;
				        }
				    }
				
				    
				    let drawLat = w.lat;
				    let drawLon = w.lon;
				    let isFocusTarget = false;
				
				    if (focusPos) {
				        const distToFocus = Math.sqrt(Math.pow(w.lat - focusPos.lat, 2) + Math.pow(w.lon - focusPos.lng, 2));
				        if (distToFocus < 0.00001 || w.name === currentEditTask?.oldName) {
				            drawLat = focusPos.lat;
				            drawLon = focusPos.lng;
				            isFocusTarget = true;
				            
				            w.lat = focusPos.lat;
				            w.lon = focusPos.lng;
				        }
				    }
				
				    const wm = L.marker([drawLat, drawLon], { 
				        icon: wptIcon, 
				        draggable: true,
				        zIndexOffset: isFocusTarget ? 2000 : 0
				    }).addTo(map);
				    
				    
				    let previousLatLng = wm.getLatLng(); 
				    let wasOnPath = (initialTIdx !== null);
				
				    const isAlways = typeof showWptNameAlways !== 'undefined' && showWptNameAlways;
				    wm.bindTooltip(w.name, { 
						    permanent: isAlways,           
						    direction: isAlways ? 'right' : 'top', 
						    offset: isAlways ? [10, 0] : [0, -10],
						    className: isAlways ? 'wpt-label-label' : ''
						});
						
						
						if (isAlways) {
						    wm.openTooltip();
						} else {
						    wm.closeTooltip(); 
						}
				
				    wm.on('dragend', function(event) {
				        const marker = event.target;
				        const newLatLng = marker.getLatLng();
				        const newLat = newLatLng.lat;
				        const newLon = newLatLng.lng;
				
				        
				        let nearestIdx = -1;
				        let minD = Infinity;
				        if (trackPoints && trackPoints.length > 0) {
				            trackPoints.forEach((tp, pi) => {
				                const d = Math.sqrt((newLat - tp.lat) ** 2 + (newLon - tp.lon) ** 2);
				                if (d < minD) { minD = d; nearestIdx = pi; }
				            });
				        }
				        const isOnPath = (nearestIdx !== -1 && (minD * 111000 <= 15));
				
				        
				        let confirmMsg = isOnPath 
				            ? `確定將「${w.name}」移至此路徑位置？<br>(高度、距離與時間將同步更新)`
				            : (wasOnPath ? `確定將「${w.name}」移至此處？<br>(此處不在路徑上，將遺失高度、距離與時間資訊)` 
				                         : `確定將「${w.name}」移至此處？<br>(此處不在路徑上，將遺失高度與時間資訊)`);
				
				        window.showAppConfirm("移動航點確認", confirmMsg, function() {
				            const oldWptSnapshot = JSON.parse(JSON.stringify(w));
				            const startPos = { lat: previousLatLng.lat, lng: previousLatLng.lng };
				            const endPos = { lat: newLat, lng: newLon };
				            const currentFileIdx = window.currentMultiIndex; 
				
				            historyManager.execute({
				                fileIdx: currentFileIdx, 
				                do: function() {
				                    if (window.currentMultiIndex !== this.fileIdx) {
				                        if (typeof switchMultiGpx === 'function') switchMultiGpx(this.fileIdx);
				                    }
				                    window.isDraggingWpt = true; 
				
				                    
				                    const updateLogic = (targetWpt) => {
				                        targetWpt.lat = endPos.lat;
				                        targetWpt.lon = endPos.lng;
				                        if (isOnPath) {
				                            const tp = trackPoints[nearestIdx];
				                            targetWpt.ele = tp.ele;
				                            targetWpt.time = tp.time;
				                            targetWpt.localTime = tp.timeLocal; 
				                            targetWpt.distance = tp.distance;
				                        } else {
				                            targetWpt.ele = 0;
				                            targetWpt.time = new Date().toISOString();
				                            targetWpt.localTime = formatDate(new Date(new Date().getTime() + 8 * 3600000));
				                            targetWpt.distance = undefined; 
				                        }
				                    };
				
				                    syncCombinedWaypoints(w.name, L.latLng(startPos.lat, startPos.lng), w.time, updateLogic);
				                    updateLogic(w);
				                    updateRawGpxContent(w.name, L.latLng(startPos.lat, startPos.lng), endPos.lat, endPos.lng);
				
				                    previousLatLng = L.latLng(endPos.lat, endPos.lng);
				                    wasOnPath = isOnPath;
				
				                    
				                    loadRoute(window.currentActiveIndex || 0, null, endPos); 
				
				                    if (!document.fullscreenElement && typeof renderWaypointsAndPeaks === 'function') {
				                        renderWaypointsAndPeaks(sel); 
				                    }
				
				                    setTimeout(() => { window.isDraggingWpt = false; }, 100);
				                },
				                undo: function() {
				                    if (window.currentMultiIndex !== this.fileIdx) {
				                        if (typeof switchMultiGpx === 'function') switchMultiGpx(this.fileIdx);
				                    }
				                    Object.assign(w, oldWptSnapshot);
				                    updateRawGpxContent(w.name, L.latLng(endPos.lat, endPos.lng), startPos.lat, startPos.lng);
				                    
				                    previousLatLng = L.latLng(startPos.lat, startPos.lng);
				                    wasOnPath = (oldWptSnapshot.distance !== undefined);
				
				                    loadRoute(window.currentActiveIndex || 0, null, startPos);
				
				                    if (!document.fullscreenElement && typeof renderWaypointsAndPeaks === 'function') {
				                        renderWaypointsAndPeaks(sel);
				                    }
				                }
				            });
				        }, function() {
				            marker.setLatLng(previousLatLng); 
				        });
				    });
				
				    wm.on('click', (e) => { 
				        L.DomEvent.stopPropagation(e); 
				        let clickTIdx = null;
				        if (trackPoints && trackPoints.length > 0) {
				            let minD = Infinity;
				            trackPoints.forEach((tp, pi) => {
				                let d = Math.sqrt((w.lat - tp.lat) ** 2 + (w.lon - tp.lon) ** 2);
				                if (d < minD) { minD = d; clickTIdx = pi; }
				            });
				            if (minD * 111000 > 15) clickTIdx = null;
				        }
				        
				        showCustomPopup(clickTIdx !== null ? clickTIdx : 999999, w.name, clickTIdx !== null ? "wpt" : 0, w.lat, w.lon); 
				    });
				    wptMarkers.push(wm);
				});
    }

    const startLat = (trackPoints.length > 0) ? trackPoints[0].lat : (sel.waypoints?.[0]?.lat || null);
    const startLon = (trackPoints.length > 0) ? trackPoints[0].lon : (sel.waypoints?.[0]?.lon || null);
    if (startLat !== null && startLon !== null) {
        if (!hoverMarker) {
            hoverMarker = L.circleMarker([startLat, startLon], { 
                radius: 7, color: "#ffffff", fillColor: "#1a73e8", fillOpacity: 1, weight: 2 
            }).addTo(map);
        } else {
            hoverMarker.setLatLng([startLat, startLon]).bringToFront();
        }
    }
    
    if (typeof renderRouteInfo === 'function') renderRouteInfo();
    if (typeof renderWaypointsAndPeaks === 'function') renderWaypointsAndPeaks(sel); 
    if (typeof initProgressBar === 'function') initProgressBar();

    
    if (focusPos) {
        window.activeFocusCircle = L.circleMarker([focusPos.lat, focusPos.lng], {
            radius: 7, color: '#ffffff', weight: 2, fillColor: '#1a73e8', fillOpacity: 1, interactive: false 
        }).addTo(map);
    }
}
 
function toggleWptNames() {
    showWptNameAlways = !showWptNameAlways;
    
    let currentIndex = (window.currentActiveIndex !== undefined) ? window.currentActiveIndex : 0;

    loadRoute(currentIndex);
		}

		window.toggleCompass = function() {
				const compass = document.querySelector(".map-compass");
		    if (compass) { compass.classList.toggle("show"); }
		};

		const CombinedControl = L.Control.extend({
    options: { position: 'topleft' }, 
    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        
        const createBtn = (html, title, border) => {
            const btn = L.DomUtil.create('a', '', container);
            btn.innerHTML = html; btn.title = title;
            btn.style.cssText = `font-size:18px; background:white; text-align:center; line-height:30px; width:30px; height:30px; display:block; cursor:pointer; ${border ? 'border-bottom:1px solid #ccc;' : ''}`;
            return btn;
        };

        const coordBtn = createBtn('🌐', '搜尋座標位置', true);

        const btnSize = "30px";
        const arrowIconSize = "20px";
        const arrowColor = "#1a73e8";
        const locArrowAngle = "315deg"

        const locBtn = L.DomUtil.create('a', '', container);
        locBtn.title = "目前位置定位";
        locBtn.style.cssText = `width:${btnSize}; height:${btnSize}; background:white; cursor:pointer; display:flex; align-items:center; justify-content:center; border-bottom:1px solid #ccc;`;
        
        locBtn.innerHTML = `
            <svg width="${arrowIconSize}" height="${arrowIconSize}" viewBox="0 0 100 100" style="display:block; transform: rotate(${locArrowAngle})">
                <path d="M50 5 L90 90 L50 70 L10 90 Z" fill="${arrowColor}" />
            </svg>
        `;

        const compassBtn = createBtn('🧭', '顯示/隱藏指北針', false);

        L.DomEvent.disableClickPropagation(container);
        
        L.DomEvent.on(coordBtn, 'click', (e) => { 
            L.DomEvent.stop(e); 
            
            map.eachLayer((layer) => {
                if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
                    if (layer.getPopup()) {
                        const content = layer.getPopup().getContent();
                        if (typeof content === 'string' && content.includes('定位點資訊')) {
                            map.removeLayer(layer);
                        }
                    }
                }
            });

            const modal = document.getElementById('coordModal');
            const mapContainer = document.getElementById('map');
            
            if (!modal) return;

            if (modal.parentNode !== mapContainer) {
                mapContainer.appendChild(modal);
            }
            
            L.DomEvent.disableClickPropagation(modal);

            modal.style.zIndex = "2147483647"; 
            modal.style.position = "absolute";
            modal.style.display = 'flex'; 

            const closeModal = () => {
                modal.style.display = 'none';
                window.removeEventListener('keydown', handleEscKey);
            };

            const handleEscKey = (event) => {
                if (event.key === "Escape" || event.keyCode === 27) {
                    closeModal();
                }
            };


            window.addEventListener('keydown', handleEscKey);


            modal.innerHTML = `
                <div id="jump-container" style="background:white; padding:12px 15px; border-radius:12px; width:280px; box-shadow:0 10px 25px rgba(0,0,0,0.5); font-family: sans-serif; font-size:13px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <b style="color:#1a73e8; font-size: 18px;">🌐 搜尋座標位置</b>
                        <span id="closeCoordBtn" style="cursor:pointer; font-size:20px; color:#999;">×</span>
                    </div>

                    <div style="border:1px solid #eee; padding:8px; border-radius:8px; margin-bottom:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <label style="font-weight:bold;">WGS84 (GPS)</label>
                            <select id="wgs_type" onchange="toggleWgsInput()" 
														    style="font-size: 11px; padding: 3px 12px; border-radius: 20px; border: 1px solid #ccc; background: #f9f9f9; cursor: pointer; outline: none;">
														    <option value="DD">十進位度</option>
														    <option value="DMS">度分秒</option>
														</select>
                        </div>

                        <div id="wgs_dd_input" style="display:flex; gap:5px;">
                            <input type="number" id="lat_dd" placeholder="緯度" onkeydown="if(event.keyCode==13) executeJump('WGS')" style="width:50%; padding:6px; border:1px solid #ccc; border-radius:4px;">
                            <input type="number" id="lng_dd" placeholder="經度" onkeydown="if(event.keyCode==13) executeJump('WGS')" style="width:50%; padding:6px; border:1px solid #ccc; border-radius:4px;">
                        </div>

                        <div id="wgs_dms_input" style="display:none; flex-direction:column; gap:8px;">
                            <div style="display:flex; gap:3px; align-items:center;">
                                <span style="width:15px; font-weight:bold; color:#666;">緯</span>
                                <input type="number" id="lat_d" placeholder="度°" onkeydown="if(event.keyCode==13) executeJump('WGS')" style="width:30%; padding:5px; border:1px solid #ccc;">
                                <input type="number" id="lat_m" placeholder="分'" onkeydown="if(event.keyCode==13) executeJump('WGS')" style="width:30%; padding:5px; border:1px solid #ccc;">
                                <input type="number" id="lat_s" placeholder="秒&quot;" onkeydown="if(event.keyCode==13) executeJump('WGS')" style="width:35%; padding:5px; border:1px solid #ccc;">
                            </div>
                            <div style="display:flex; gap:3px; align-items:center;">
                                <span style="width:15px; font-weight:bold; color:#666;">經</span>
                                <input type="number" id="lng_d" placeholder="度°" onkeydown="if(event.keyCode==13) executeJump('WGS')" style="width:30%; padding:5px; border:1px solid #ccc;">
                                <input type="number" id="lng_m" placeholder="分'" onkeydown="if(event.keyCode==13) executeJump('WGS')" style="width:30%; padding:5px; border:1px solid #ccc;">
                                <input type="number" id="lng_s" placeholder="秒&quot;" onkeydown="if(event.keyCode==13) executeJump('WGS')" style="width:35%; padding:5px; border:1px solid #ccc;">
                            </div>
                        </div>
                        <button onclick="executeJump('WGS')" style="width:100%; margin-top:10px; background:#1a73e8; color:white; border:none; padding:7px; border-radius:4px; cursor:pointer; font-weight:bold;">確認 WGS84 定位</button>
                    </div>

                    <div style="border:1px solid #eee; padding:8px; border-radius:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <select id="twd_system" style="font-weight:bold; border:none; background:none; cursor:pointer; color:#34a853; font-size:13px;">
                                <option value="97">TWD97</option>
                                <option value="67">TWD67</option>
                            </select>
                            <span style="font-size:10px; color:#999;">X (橫) / Y (縱)</span>
                        </div>
                        <div style="display:flex; gap:5px;">
                            <input type="number" id="twd_x" placeholder="X 座標" onkeydown="if(event.keyCode==13) executeJump('TWD')" style="width:50%; padding:6px; border:1px solid #ccc; border-radius:4px;">
                            <input type="number" id="twd_y" placeholder="Y 座標" onkeydown="if(event.keyCode==13) executeJump('TWD')" style="width:50%; padding:6px; border:1px solid #ccc; border-radius:4px;">
                        </div>
                        <p style="font-size:10px; color:#ea4335; margin:2px 0 0 2px;">* 至少輸入X前四位數，Y前五位數</p>
                        <button onclick="executeJump('TWD')" style="width:100%; margin-top:10px; background:#34a853; color:white; border:none; padding:7px; border-radius:4px; cursor:pointer; font-weight:bold;">確認 TWD 定位</button>
                    </div>
                </div>
            `;

            document.getElementById('closeCoordBtn').onclick = closeModal;

            if (typeof hoverMarker !== 'undefined' && hoverMarker) {
                hoverMarker.bringToFront();
            }
            map.invalidateSize();

            setTimeout(() => {
                const focusEl = document.getElementById('lat_dd');
                if(focusEl) focusEl.focus();
            }, 100);
        });

        L.DomEvent.on(locBtn, 'click', (e) => { 
            L.DomEvent.stop(e); 
            window.toggleGPS(locBtn);
        });

        L.DomEvent.on(compassBtn, 'click', (e) => { 
            L.DomEvent.stop(e); 
            const compass = document.getElementById("mapCompass");
            if(compass) compass.classList.toggle("show"); 
        });
        
        return container;
    }
});

window.toggleWgsInput = function() {
    const type = document.getElementById('wgs_type').value;
    const dd = document.getElementById('wgs_dd_input');
    const dms = document.getElementById('wgs_dms_input');
    if (dd && dms) {
        dd.style.display = (type === 'DD') ? 'flex' : 'none';
        dms.style.display = (type === 'DMS') ? 'flex' : 'none';
    }
};


map.addControl(new CombinedControl());

let gpsInterval = null;
let gpsButtonElement = null;

window.toggleGPS = function(btn) {
    gpsButtonElement = btn; 

    
    if (gpsInterval || gpsMarker) {
        if (gpsInterval) {
            clearInterval(gpsInterval);
            gpsInterval = null;
        }
        if (gpsMarker) {
            map.removeLayer(gpsMarker);
            gpsMarker = null;
        }
        btn.style.background = "white"; 
        return;
    }

    if (!navigator.geolocation) {
        alert("您的瀏覽器不支援 GPS 定位功能");
        return;
    }

    
    const runLocation = (isFirstTime = false) => {
        navigator.geolocation.getCurrentPosition((pos) => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            
            
            const twd97 = proj4(WGS84_DEF, TWD97_DEF, [lon, lat]);
            const twd67 = proj4(WGS84_DEF, TWD67_DEF, [lon, lat]);

            
            map.setView([lat, lon], map.getZoom());
            btn.style.background = "#e8f0fe"; 

            
            const arrowIcon = L.divIcon({
                className: 'custom-gps-arrow',
                html: `<div style="transform: rotate(315deg); display: flex; justify-content: center;">
                         <svg width="40" height="40" viewBox="0 0 100 100">
                           <path d="M50 5 L95 90 L50 70 L5 90 Z" fill="#1a73e8" stroke="white" stroke-width="5"/>
                         </svg>
                       </div>`,
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            });

            if (gpsMarker) {
                gpsMarker.setLatLng([lat, lon]);
            } else {
                gpsMarker = L.marker([lat, lon], { icon: arrowIcon }).addTo(map);
            }

            
            const gUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
            const gMapIconBtn = `
                <a href="${gUrl}" target="_blank" title="於 Google Map 開啟導航" 
                   style="text-decoration:none; margin-right:8px; display:inline-flex; align-items:center; justify-content:center; width: 28px; height: 28px; background: #fff; border: 1px solid #ccc; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); vertical-align: middle;">
                    <img src="https://ychiking.github.io/gpx-online-viewer/GoogleMaps.png" style="width:18px; height:18px; display:block;" alt="GMap">
                </a>`;
            
            const tipText = `
                <div style="font-size:13px; line-height:1.6; min-width:200px;">
                    <div style="display:flex; align-items:center;">
                        ${gMapIconBtn}
                        <b style="color:#d35400; font-size:14px;">目前位置 (自動追蹤中)</b>
                    </div>
                    <hr style="margin:5px 0; border:0; border-top:1px solid #eee;">
                    <b>WGS84:</b> ${lat.toFixed(6)}, ${lon.toFixed(6)}<br>
                    <b>TWD97:</b> ${Math.round(twd97[0])}, ${Math.round(twd97[1])}<br>
                    <b>TWD67:</b> ${Math.round(twd67[0])}, ${Math.round(twd67[1])}
                    
                    <div style="display:flex; margin-top:10px; gap:8px;">
                        <button onclick="setFreeAB('A', ${lat}, ${lon})" style="flex:1; background:#007bff; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold;">設定 A</button>
                        <button onclick="setFreeAB('B', ${lat}, ${lon})" style="flex:1; background:#e83e8c; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold;">設定 B</button>
                    </div>
            
                    <hr style="margin: 8px 0; border: 0; border-top: 1px solid #eee;">
                    <div style="color: #d35400; font-size: 10px; background: #fff5eb; padding: 4px; border-radius: 4px;">
                        ⚠️ 自動追蹤中，每 30 秒更新一次中心位置。
                    </div>
                </div>
            `;
            

            if (isFirstTime || (gpsMarker.getPopup() && gpsMarker.getPopup().isOpen())) {
                gpsMarker.bindPopup(tipText).openPopup();
            } else {
                gpsMarker.bindPopup(tipText);
            }

        }, (err) => {
            if (isFirstTime) alert("無法獲取位置，請確認 GPS 已開啟");
        }, { enableHighAccuracy: true });
    };

    
    runLocation(true);

    
    gpsInterval = setInterval(() => {
        runLocation(false);
    }, 30000);
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



const TWD97_DEF = "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs";
const TWD67_DEF = "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=aust_SA +towgs84=-752,-358,-179,0,0,0,0 +units=m +no_defs";
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


window.popupDetailExpanded = (typeof window.popupDetailExpanded !== 'undefined') ? window.popupDetailExpanded : true; 

window.togglePopupDetail = function() {
    const info = document.getElementById('all-info-wrapper');
    const btn = document.getElementById('detail-toggle');
    if (info && btn) {
        if (info.style.display === 'none') {
            info.style.display = 'block';
            btn.innerText = '收合資訊';
            window.popupDetailExpanded = true;
        } else {
            info.style.display = 'none';
            btn.innerText = '顯示資訊';
            window.popupDetailExpanded = false;
        }
    }
};


window.popupDetailExpanded = (typeof window.popupDetailExpanded !== 'undefined') ? window.popupDetailExpanded : true; 

window.togglePopupDetail = function() {
    const info = document.getElementById('all-info-wrapper');
    const btn = document.getElementById('detail-toggle');
    if (info && btn) {
        if (info.style.display === 'none') {
            info.style.display = 'block';
            btn.innerText = '收合資訊';
            window.popupDetailExpanded = true;
        } else {
            info.style.display = 'none';
            btn.innerText = '顯示資訊';
            window.popupDetailExpanded = false;
        }
    }
};

function showCustomPopup(idx, title, typeOrEle = null, realLat = null, realLon = null) {
    if (window.isDraggingWpt === true) return;
    const isWptMode = (typeOrEle === "wpt");
    
    
    
    const lat = (realLat !== null) ? realLat : (trackPoints[idx] ? trackPoints[idx].lat : null);
    const lon = (realLon !== null) ? realLon : (trackPoints[idx] ? trackPoints[idx].lon : null);

    if (lat === null || lon === null) return;

    map.eachLayer(layer => {
        if (layer instanceof L.CircleMarker && layer.options.radius === 7) {
            map.removeLayer(layer);
        }
    });
    window.activeFocusCircle = null; 

    window.activeFocusCircle = L.circleMarker([lat, lon], {
        radius: 7, color: '#fff', weight: 2, fillColor: '#1a73e8', fillOpacity: 1, interactive: false
    }).addTo(map);

    
    
    let matchedPoint = (idx !== null && idx !== 999999 && typeof trackPoints !== 'undefined' && trackPoints[idx]) ? trackPoints[idx] : null;
    
    if (matchedPoint) {
        
        const d = Math.sqrt(Math.pow(matchedPoint.lat - lat, 2) + Math.pow(matchedPoint.lon - lon, 2));
        if (d * 111000 > 5) matchedPoint = null; 
    }

    if (!matchedPoint && typeof trackPoints !== 'undefined') {
        const foundIdx = trackPoints.findIndex(p => 
            Math.abs(p.lat - lat) < 0.00015 && Math.abs(p.lon - lon) < 0.00015
        );
        if (foundIdx !== -1) {
            matchedPoint = trackPoints[foundIdx];
            idx = foundIdx; 
        }
    }

    let waypointIdx = -1;
    let waypointTime = null;
    let finalTitle = title;
    let targetGpx = null;
    let foundEle = null; 

    const activeIdx = (typeof window.currentActiveIndex !== 'undefined') ? window.currentActiveIndex : 0;
    let potentialSources = [];
    if (window.allTracks) potentialSources = [...window.allTracks];
    if (window.multiGpxStack) potentialSources = [...potentialSources, ...window.multiGpxStack];

    
    for (let gpx of potentialSources) {
        if (!gpx || !gpx.waypoints) continue;
        let fIdx = gpx.waypoints.findIndex(w =>
            Math.abs(w.lat - lat) < 0.0001 && Math.abs(w.lon - lon) < 0.0001
        );
        if (fIdx !== -1) {
            waypointIdx = fIdx;
            targetGpx = gpx;
            const wptData = gpx.waypoints[waypointIdx];
            finalTitle = wptData.name;
            foundEle = wptData.ele; 
            waypointTime = wptData.localTime || (wptData.time ? new Date(wptData.time).toLocaleString() : null);
            break;
        }
    }

    const offPathEle = (typeof typeOrEle === 'number') ? typeOrEle : null;
    let eleValue = 0;
    if (matchedPoint && matchedPoint.ele) {
        eleValue = matchedPoint.ele;
    } else if (foundEle !== null) {
        eleValue = foundEle; 
    } else if (offPathEle !== null) {
        eleValue = offPathEle;
    }
    
    const eleDisplay = (eleValue !== 0) ? eleValue.toFixed(0) : "---";
    const dist = (matchedPoint && matchedPoint.distance !== undefined) ? matchedPoint.distance.toFixed(2) : null;
    const displayTime = (matchedPoint && matchedPoint.timeLocal) ? matchedPoint.timeLocal :
                        (waypointTime ? waypointTime : new Date().toLocaleString());

    const isExisting = (waypointIdx !== -1);
    const iconName = isExisting ? 'edit' : 'add_location';
    const iconColor = (matchedPoint) ? '#1a73e8' : '#d35400';
    const safeTitle = (finalTitle || "位置資訊").replace(/'/g, "\\'");

    const editIcon = `<span class="material-icons" style="font-size:16px; cursor:pointer; vertical-align:middle; margin-left:4px; color:${iconColor};" 
        onclick="event.stopPropagation(); handleWptEdit(${waypointIdx !== -1 ? waypointIdx : 'null'}, ${lat}, ${lon}, ${eleValue}, '${safeTitle}', '${displayTime}', ${idx})">${iconName}</span>`;
    
    const twd97 = proj4(WGS84_DEF, TWD97_DEF, [lon, lat]);
    const twd67 = proj4(WGS84_DEF, TWD67_DEF, [lon, lat]);
    
    const gUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    const gMapIconBtn = `<a href="${gUrl}" target="_blank" style="text-decoration:none; margin-right:8px; display:inline-flex; align-items:center; justify-content:center; width: 28px; height: 28px; background: #fff; border: 1px solid #ccc; border-radius: 50%; vertical-align: middle;"><img src="https://ychiking.github.io/gpx-online-viewer/GoogleMaps.png" style="width:18px; height:18px;"></a>`;
    
    const eleHtml = (eleDisplay !== "---") ? `高度: ${eleDisplay} m<br>` : "";
    const distHtml = (dist !== null) ? `距離: ${dist} km<br>` : "";

    const effectiveIdxForAB = (matchedPoint) ? idx : 999999;
    const abButtons = `
      <div style="display:flex; margin-top:10px; gap:5px;">
        <button onclick="setAB('A', ${effectiveIdxForAB}, ${lat}, ${lon})" style="flex:1; background:#007bff; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold;">設定 A</button>
        <button onclick="setAB('B', ${effectiveIdxForAB}, ${lat}, ${lon})" style="flex:1; background:#e83e8c; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold;">設定 B</button>
      </div>`;

    const isExpanded = (window.popupDetailExpanded !== false); 
    const detailDisplayStyle = isExpanded ? 'block' : 'none';
    const detailBtnText = isExpanded ? '收合資訊' : '顯示資訊';

    let content = `
      <div style="min-width:180px; font-size:13px; line-height:1.6;">
        <div style="display:flex; align-items:center; margin-bottom:5px;">
          ${gMapIconBtn}
          <b style="font-size:14px; color:${iconColor};">${finalTitle}</b>${editIcon}
        </div>
        
        <div style="display:flex; align-items:center; margin:8px 0;">
          <div style="flex:1; border-top:1px solid #eee;"></div>
          <span id="detail-toggle" onclick="window.togglePopupDetail()" 
                style="cursor:pointer; font-size:10px; color:#1a73e8; background:#fff; padding:0 8px; white-space:nowrap; border:1px solid #eee; border-radius:10px; line-height:18px;">${detailBtnText}</span>
          <div style="flex:1; border-top:1px solid #eee;"></div>
        </div>

        <div id="all-info-wrapper" style="display:${detailDisplayStyle};">
          <div style="margin-bottom:0px;">
            ${eleHtml}
            ${distHtml}
            時間: ${displayTime}<br>
            WGS84: ${lat.toFixed(5)}, ${lon.toFixed(5)}<br>
            TWD97: ${Math.round(twd97[0])}, ${Math.round(twd97[1])}<br>
            TWD67: ${Math.round(twd67[0])}, ${Math.round(twd67[1])}
            ${(!matchedPoint) ? '<div style="color:#d35400; font-weight:bold; margin-top:2px;">📍 非路徑位置</div>' : ''}
          </div>
        </div>

        ${abButtons}
      </div>`;

    if (currentPopup && map.hasLayer(currentPopup)) {
        currentPopup.setLatLng([lat, lon]).setContent(content);
    } else {
        currentPopup = L.popup({ autoClose: false, closeOnClick: false }).setLatLng([lat, lon]).setContent(content).openOn(map);
    }
    const routeSelect = document.getElementById('routeSelectContainer');
    
    const isRouteSelectVisible = routeSelect && 
                                 window.getComputedStyle(routeSelect).display !== 'none';

    if (isRouteSelectVisible) {
        const clickPoint = map.latLngToContainerPoint([lat, lon]);
        
        
        if (clickPoint.y < 340) {
            
            const offset = 340 - clickPoint.y;
            
            requestAnimationFrame(() => {
                
                map.panBy([0, -offset], { animate: true });
            });
        }
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



let mouseX = null; 

function drawElevationChart() {
    const canvas = document.getElementById("elevationChart");
    const ctx = canvas.getContext("2d");
    if (chart) chart.destroy();

    const _handleSync = (e) => {
    const points = chart.getElementsAtEventForMode(e, 'index', { intersect: false }, true);
    if (points.length) {
        const idx = points[0].index;
        const p = trackPoints[idx];
        const latlng = [p.lat, p.lon];

        
        const progressBar = document.getElementById("gpxProgressBar");
        if (progressBar) progressBar.value = idx;
        const info = document.getElementById("progressBarInfo");
        if (info) info.textContent = `${p.distance.toFixed(2)} km`;

        
        if (!window.activeFocusCircle) {
            window.activeFocusCircle = L.circleMarker(latlng, {
                radius: 7, color: '#ffffff', weight: 2, fillColor: '#1a73e8', fillOpacity: 1, interactive: false
            }).addTo(map);
        } else {
            window.activeFocusCircle.setLatLng(latlng);
            if (!map.hasLayer(window.activeFocusCircle)) window.activeFocusCircle.addTo(map);
        }
        window.activeFocusCircle.bringToFront();

        
        if (!map.getBounds().contains(latlng)) {
            map.panTo(latlng, { animate: true, duration: 0.3 });
        }

        
        const checkbox = document.getElementById("showChartTipCheckbox");
        if (checkbox && checkbox.checked) {
            showCustomPopup(idx, "位置資訊");
        }

        chart.setActiveElements([{ datasetIndex: 0, index: idx }]);
        chart.update('none');

        
        if (window.chartTipTimer) clearTimeout(window.chartTipTimer);
        window.chartTipTimer = setTimeout(() => {
            if (chart) { 
                chart.tooltip.setActiveElements([], { x: 0, y: 0 }); 
                chart.update('none'); 
            }
            
            
        }, 3000);
    }
  };

    const onMouseDown = (e) => { if (e.button === 0) { isMouseDown = true; if (window.mapTipTimer) clearTimeout(window.mapTipTimer); _handleSync(e); } };
    const onTouchStart = (e) => { isMouseDown = true; if (window.mapTipTimer) clearTimeout(window.mapTipTimer); _handleSync(e); if (e.cancelable) e.preventDefault(); };
    const onTouchMove = (e) => { if (isMouseDown) { _handleSync(e); if (e.cancelable) e.preventDefault(); } };
    const onMouseMove = (e) => { 
        const rect = canvas.getBoundingClientRect(); mouseX = e.clientX - rect.left;
        if (isMouseDown) { _handleSync(e); } else {
            if (chart && chart.getActiveElements().length > 0) { chart.tooltip.setActiveElements([], { x: 0, y: 0 }); chart.update('none'); }
        }
    };
    const onMouseLeave = () => { mouseX = null; if (isMouseDown) { isMouseDown = false; if (typeof startHeightOnlyTimer === "function") startHeightOnlyTimer(); } if (chart) { chart.tooltip.setActiveElements([], { x: 0, y: 0 }); chart.update('none'); } };
    const onEnd = () => { if (isMouseDown) { isMouseDown = false; if (typeof startHeightOnlyTimer === "function") startHeightOnlyTimer(); } if (chart) { chart.tooltip.setActiveElements([], { x: 0, y: 0 }); chart.update('none'); } };

    canvas.replaceWith(canvas.cloneNode(true)); 
    const newCanvas = document.getElementById("elevationChart");
    const newCtx = newCanvas.getContext("2d");

    newCanvas.addEventListener('mousedown', onMouseDown);
    newCanvas.addEventListener('touchstart', onTouchStart, { passive: false });
    newCanvas.addEventListener('touchmove', onTouchMove, { passive: false });
    newCanvas.addEventListener('mousemove', onMouseMove);
    newCanvas.addEventListener('mouseleave', onMouseLeave);
    newCanvas.addEventListener('touchend', onEnd);

    window.removeEventListener('mouseup', onEnd); 
    window.addEventListener('mouseup', onEnd);

    
    const chartContainer = document.getElementById('chartContainer');
    chartContainer.style.display = 'block';
    
    
    const tipLabel = document.getElementById("chartTipToggleLabel");
    if (tipLabel) {
        
        const hasTracks = trackPoints && trackPoints.length > 0;
        tipLabel.style.display = hasTracks ? "flex" : "none";
    }

    chart = new Chart(newCtx, {
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
            hover: { mode: 'index', intersect: false },
            plugins: {
                tooltip: {
                    enabled: true, displayColors: false, 
                    filter: () => isMouseDown || (chart && chart.getActiveElements().length > 0),
                    callbacks: {
                        title: () => "位置資訊", 
                        label: function(context) {
                            const p = trackPoints[context.dataIndex];
                            return [` ■ 距離: ${p.distance.toFixed(2)} km`, ` ■ 高度: ${p.ele.toFixed(0)} m`, ` ■ 時間: ${p.timeLocal ? p.timeLocal.split(' ')[1] : ''}`];
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

document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'showChartTipCheckbox') {
        if (e.target.checked) {
            
            if (window.lastHoverIdx !== null) {
                showCustomPopup(window.lastHoverIdx, "位置資訊");
            }
        } else {
            
            if (currentPopup) map.closePopup();
        }
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
      if (window.chartTipTimer) clearTimeout(window.chartTipTimer);
      if (isMouseDown) {
        window.chartTipTimer = setTimeout(() => {
          if (chart) { chart.tooltip.setActiveElements([], { x: 0, y: 0 }); chart.update('none'); }
        }, 3000);
      }
    }
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


window.focusWaypoint = function(lat, lon, name, distToTrack = 0, ele = null) {
    map.closePopup();
    map.setView([lat, lon], 16);
    
    let minD = Infinity, idx = 0;
    
    if (trackPoints && trackPoints.length > 0) {
        trackPoints.forEach((tp, i) => {
            let d = Math.sqrt((lat - tp.lat) ** 2 + (lon - tp.lon) ** 2);
            if (d < minD) { minD = d; idx = i; }
        });
    }

    if (hoverMarker) { 
        hoverMarker.setLatLng([lat, lon]).bringToFront(); 
    }

    
    
    showCustomPopup(idx, name, ele, lat, lon);
    
    if (chart && trackPoints.length > 0) {
        chart.setActiveElements([{ datasetIndex: 0, index: idx }]);
        chart.update('none');
    }
    
    document.getElementById("map").scrollIntoView({ behavior: 'smooth' });
};


window.setAB = function(type, idx, forcedLat = null, forcedLon = null) {
  let lat, lon, targetPoint;
  
  
  const isManualPoint = (idx === -1 || idx === 999999);

  
  if (forcedLat !== null && forcedLon !== null) {
    
    lat = forcedLat;
    lon = forcedLon;
    
    
    if (trackPoints && trackPoints[idx] && !isManualPoint) {
      targetPoint = { ...trackPoints[idx], lat, lon, idx }; 
    } else {
      
      const eleValue = (trackPoints[idx]) ? trackPoints[idx].ele : 0;
      targetPoint = { lat, lon, idx, ele: eleValue };
    }
  } else if (trackPoints && trackPoints[idx] && !isManualPoint) {
    
    targetPoint = { ...trackPoints[idx], idx };
    lat = targetPoint.lat;
    lon = targetPoint.lon;
  } else if (hoverMarker) {
    
    const pos = hoverMarker.getLatLng();
    lat = pos.lat;
    lon = pos.lng;
    targetPoint = { lat, lon, idx: -1, ele: 0 };
  } else {
    return;
  }

  
  if (type === 'A') {
    pointA = targetPoint;
    if (markerA) map.removeLayer(markerA);
    markerA = L.marker([lat, lon], { 
      icon: L.divIcon({ 
        html: `<div style="background:#007bff;color:white;border-radius:50%;width:24px;height:24px;text-align:center;line-height:24px;font-weight:bold;border:2px solid white;">A</div>`, 
        iconSize:[24,24], iconAnchor:[12,12], className:'' 
      }) 
    }).addTo(map);
  } else {
    pointB = targetPoint;
    if (markerB) map.removeLayer(markerB);
    markerB = L.marker([lat, lon], { 
      icon: L.divIcon({ 
        html: `<div style="background:#e83e8c;color:white;border-radius:50%;width:24px;height:24px;text-align:center;line-height:24px;font-weight:bold;border:2px solid white;">B</div>`, 
        iconSize:[24,24], iconAnchor:[12,12], className:'' 
      }) 
    }).addTo(map);
  }

  updateABUI(); 
  map.closePopup(); 
};

function updateABUI() {
    const infoA = document.getElementById("infoA"), 
          infoB = document.getElementById("infoB"), 
          boxRes = document.getElementById("boxRes"), 
          infoRes = document.getElementById("infoRes");
    
    
    const formatDateTime = (date) => {
        if (!date) return "";
        const d = new Date(date);
        if (isNaN(d.getTime())) return date; 
        const pad = (num) => String(num).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    const getCoordHTML = (p) => {
        const twd97 = proj4(WGS84_DEF, TWD97_DEF, [p.lon, p.lat]);
        const twd67 = proj4(WGS84_DEF, TWD67_DEF, [p.lon, p.lat]);
        return `WGS84: ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}<br>
                TWD97: ${Math.round(twd97[0])}, ${Math.round(twd97[1])}<br>
                TWD67: ${Math.round(twd67[0])}, ${Math.round(twd67[1])}`;
    };

    
    if (pointA) {
        let html = getCoordHTML(pointA);
        
        const isRealOnPathA = (pointA.idx !== -1 && pointA.idx !== 999999);
        const timeStr = pointA.timeUTC ? formatDateTime(pointA.timeUTC) : (pointA.timeLocal || "");

        if (isRealOnPathA && pointA.ele !== undefined && pointA.distance !== undefined) {
            html += `<br><span style="color:#666;">高度: ${pointA.ele.toFixed(0)}m, 里程: ${pointA.distance.toFixed(2)}km, ${timeStr}</span>`;
        } else if (pointA.ele !== undefined) {
            html += `<br><span style="color:#666;">高度: ${pointA.ele.toFixed(0)}m, ${timeStr}</span>`;
        }
        infoA.innerHTML = html;
    } else { infoA.innerHTML = "尚未設定"; }

    
    if (pointB) {
        let html = getCoordHTML(pointB);
        const isRealOnPathB = (pointB.idx !== -1 && pointB.idx !== 999999);
        const timeStr = pointB.timeUTC ? formatDateTime(pointB.timeUTC) : (pointB.timeLocal || "");

        if (isRealOnPathB && pointB.ele !== undefined && pointB.distance !== undefined) {
            html += `<br><span style="color:#666;">高度: ${pointB.ele.toFixed(0)}m, 里程: ${pointB.distance.toFixed(2)}km, ${timeStr}</span>`;
        } else if (pointB.ele !== undefined) {
            html += `<br><span style="color:#666;">高度: ${pointB.ele.toFixed(0)}m, ${timeStr}</span>`;
        }
        infoB.innerHTML = html;
    } else { infoB.innerHTML = "尚未設定"; }

    
    if (pointA && pointB) {
        boxRes.style.display = "block";
        const bearing = getBearingInfo(pointA.lat, pointA.lon, pointB.lat, pointB.lon);
        
        
        const R = 6371; 
        const dLat = (pointB.lat - pointA.lat) * Math.PI / 180;
        const dLon = (pointB.lon - pointA.lon) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(pointA.lat * Math.PI / 180) * Math.cos(pointB.lat * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const directDist = R * c;

        let analysisContent = "";
        let slopeText = "";

        
        
        const isBothRealOnPath = (pointA.idx !== -1 && pointA.idx !== 999999 && 
                                  pointB.idx !== -1 && pointB.idx !== 999999);

        if (isBothRealOnPath) {
            const hDiff = pointB.ele - pointA.ele;
            const dDiff = Math.abs(pointB.distance - pointA.distance) * 1000;
            if (dDiff > 0) {
                const slope = (hDiff / dDiff) * 100;
                const angle = Math.atan(hDiff / dDiff) * (180 / Math.PI);
                const absSlope = Math.abs(slope).toFixed(1);
                const absAngle = Math.abs(angle).toFixed(1);
                if (slope > 0) slopeText = `<br>平均坡度：<b style="color:#d35400;">${absSlope} % (${absAngle}°) (上坡)</b>`;
                else if (slope < 0) slopeText = `<br>平均坡度：<b style="color:#28a745;">${absSlope} % (${absAngle}°) (下坡)</b>`;
                else slopeText = `<br>平均坡度：<b>0.0 % (0.0°)</b>`;
            }
        }

        
        if (!isBothRealOnPath) {
            
            analysisContent = `
                <div style="color:#d35400; font-weight:bold; margin-bottom:4px;">📍 直線分析 (非全路徑點)</div>
                直線距離：<b>${directDist.toFixed(2)} km</b>${slopeText}<br>
                移動方位：<span style="color:#007bff; font-weight:bold;">往 ${bearing.name} (${bearing.deg}°)</span>`;
        } else {
            
            const start = Math.min(pointA.idx, pointB.idx), end = Math.max(pointA.idx, pointB.idx);
            const section = trackPoints.slice(start, end + 1);
            const { gain, loss } = calculateElevationGainFiltered(section);
            const timeDiff = Math.abs(pointA.timeUTC - pointB.timeUTC);
            
            analysisContent = `
                區間爬升：<b>${gain.toFixed(0)} m</b> / 下降：<b>${loss.toFixed(0)} m</b>${slopeText}<br>
                沿路距離：<b>${Math.abs(pointA.distance - pointB.distance).toFixed(2)} km</b><br>
                直線距離：<b>${directDist.toFixed(2)} km</b><br>
                時　　間：<b>${Math.floor(timeDiff/3600000)} 小時 ${Math.floor((timeDiff%3600000)/60000)} 分鐘</b><br>
                移動方位：<span style="color:#007bff; font-weight:bold;">往 ${bearing.name} (${bearing.deg}°)</span>`;
        }

        infoRes.innerHTML = analysisContent;

        
        if (typeof markerB !== 'undefined' && markerB) {
            markerB.unbindTooltip();
            let tooltipDir = 'right';
            let tooltipOffset = [15, 0];
            const diffLat = pointB.lat - pointA.lat;
            const diffLon = pointB.lon - pointA.lon;

            if (Math.abs(diffLon) > Math.abs(diffLat)) {
                if (diffLon >= 0) { tooltipDir = 'right'; tooltipOffset = [15, 0]; }
                else { tooltipDir = 'left'; tooltipOffset = [-15, 0]; }
            } else {
                if (diffLat >= 0) { tooltipDir = 'top'; tooltipOffset = [0, -15]; }
                else { tooltipDir = 'bottom'; tooltipOffset = [0, 15]; }
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
                    direction: tooltipDir, 
                    offset: tooltipOffset, 
                    className: 'ab-map-tooltip' 
                }).openTooltip();
        }
    } else {
        if (boxRes) boxRes.style.display = "none";
        if (typeof markerB !== 'undefined' && markerB) { markerB.unbindTooltip(); }
    }
    
    
    if (pointA && pointB && pointA.idx === -1 && pointB.idx === -1) {
        if (typeof analyzeBestPath === 'function') {
            analyzeBestPath(pointA.lat, pointA.lon, pointB.lat, pointB.lon);
        }
    }
}

function renderRouteInfo() {
  if (!allTracks || allTracks.length === 0) {
    return;
  }

  const currentTrackIdx = parseInt(document.getElementById("routeSelect").value || 0);
  const currentRoute = allTracks[currentTrackIdx];
  
  if (!currentRoute) {
    return;
  }

  if (!trackPoints || trackPoints.length === 0) {
    renderEmptyRouteSummary(currentRoute);
    return;
  }

  let f = trackPoints[0], l = trackPoints.at(-1);
  let displayDist = l.distance || 0;
  let displayGain, displayLoss, displayMaxEle, displayMinEle, displayDur;

  if (currentRoute.isCombined) {
    const subTracks = allTracks.filter(t => !t.isCombined);
    const allEles = subTracks.flatMap(t => t.points.map(p => p.ele)).filter(e => e !== undefined);
    
    displayMaxEle = allEles.length > 0 ? Math.max(...allEles) : 0;
    displayMinEle = allEles.length > 0 ? Math.min(...allEles) : 0;

    displayGain = 0;
    displayLoss = 0;
    subTracks.forEach(t => {
      if (t.points && t.points.length > 0) {
        const stats = calculateElevationGainFiltered(t.points);
        displayGain += stats.gain;
        displayLoss += stats.loss;
      }
    });

    displayDist = subTracks.reduce((sum, t) => {
      const lastP = t.points ? t.points.at(-1) : null;
      return sum + (lastP ? (lastP.distance || 0) : 0);
    }, 0);

    displayDur = (l.timeUTC && f.timeUTC) ? (l.timeUTC - f.timeUTC) : 0; 
  } else {
    const { gain, loss } = calculateElevationGainFiltered();
    displayGain = gain;
    displayLoss = loss;
    const trackEles = trackPoints.map(p => p.ele).filter(e => e !== undefined);
    displayMaxEle = trackEles.length > 0 ? Math.max(...trackEles) : 0;
    displayMinEle = trackEles.length > 0 ? Math.min(...trackEles) : 0;
    displayDur = (l.timeUTC && f.timeUTC) ? (l.timeUTC - f.timeUTC) : 0;
  }

  const displayName = window.currentFileNameForDisplay || (allTracks[0] ? allTracks[0].name : "");
  const recordDate = f.timeLocal ? f.timeLocal.substring(0, 10) : "無日期資料";

  
  let timeString = "";
  
  if (displayDur > 0 && displayDur < 315360000000) {
      const hours = Math.floor(displayDur / 3600000);
      const mins = Math.floor((displayDur % 3600000) / 60000);
      timeString = `${hours} 小時 ${mins} 分鐘`;
  } else {
      
      timeString = "無時間資訊";
  }

  document.getElementById("routeSummary").innerHTML = `
    檔案名稱：${displayName}<br>
    記錄日期：${recordDate}<br>
    路　　線：${currentRoute.name}
    <span class="material-icons" 
                    style="font-size:16px; cursor:pointer; color:#1a73e8; vertical-align:middle; margin-left:4px;" 
                    onclick="renameSubRoute(${currentTrackIdx})">edit</span><br>
    里　　程：${displayDist.toFixed(2)} km<br>
    花費時間：${timeString}<br>
    最高海拔：${displayMaxEle.toFixed(0)} m<br>
    最低海拔：${displayMinEle.toFixed(0)} m<br>
    總爬升數：${displayGain.toFixed(0)} m<br>
    總下降數：${displayLoss.toFixed(0)} m`;

  renderWaypointsAndPeaks(currentRoute);
}

function renderEmptyRouteSummary(currentRoute) {
  
  const chartContainer = document.getElementById("chartContainer");
  if (chartContainer) {
    chartContainer.style.setProperty("display", "none", "important");
  }

  
  if (window.chart) {
    window.chart.destroy();
    window.chart = null;
  }

  
  const displayName = window.currentFileNameForDisplay || (allTracks[0] ? allTracks[0].name : "");
  document.getElementById("routeSummary").innerHTML = `
    檔案名稱：${displayName}<br>
    路　　線：${currentRoute.name}<br>
    里程/海拔：純航點模式，無軌跡資料`;

  
  renderWaypointsAndPeaks(currentRoute);
}


window.renderWaypointsAndPeaks = function(currentRoute, forceFS = null) {
    
    
    const wptListContainer = document.getElementById("wptList");
    const navShortcuts = document.getElementById("navShortcuts");
    if (!wptListContainer) {
        return;
    }

    const activeIdx = window.currentActiveIndex || 0;
    
    
    window._cachedRoutes = window._cachedRoutes || {};
    if (currentRoute && (currentRoute.points || currentRoute.waypoints)) {
        
        window._cachedRoutes[activeIdx] = currentRoute;
    }
    
    const route = currentRoute || window._cachedRoutes[activeIdx] || (window.allTracks ? window.allTracks[activeIdx] : null);
    
    if (!route) {
          wptListContainer.innerHTML = "";
        return;
    }
    

    const currentTrackPts = route.points || [];
    const rawWaypoints = route.waypoints || [];
    

    let startTime = null; let endTime = null;
    if (currentTrackPts.length > 0) {
        const times = currentTrackPts.map(p => p.time ? new Date(p.time).getTime() : null).filter(t => t !== null);
        if (times.length > 0) {
            startTime = Math.min(...times) - (60 * 60 * 1000);
            endTime = Math.max(...times) + (60 * 60 * 1000);
        }
    }

    
    const filteredWpts = rawWaypoints.map((w, i) => ({ ...w, originalIdx: i }))
    .filter(w => {
        if (activeIdx === 0) return true;
        if (w.belongsToRoute !== undefined) return w.belongsToRoute === activeIdx;     
        
        const wTimeVal = w.time ? new Date(w.time).getTime() : null;
        const isNative = route.waypoints && route.waypoints.some(rawW => 
            Math.abs(rawW.lat - w.lat) < 0.0001 && Math.abs(rawW.lon - w.lon) < 0.0001 && String(rawW.name) === String(w.name)
        );
        
        const isTrekDayPoint = wTimeVal && startTime && Math.abs(wTimeVal - startTime) < (48 * 60 * 60 * 1000);
        let isInTimeRange = (startTime && endTime && wTimeVal) ? (wTimeVal >= startTime && wTimeVal <= endTime) : false;

        
        const onTrack = currentTrackPts.some(tp => (Math.pow(w.lat - tp.lat, 2) + Math.pow(w.lon - tp.lon, 2)) < 0.00000324);
        
        if (isNative) {     
            if (isTrekDayPoint && !isInTimeRange) {
                
                return false;
            }
            return true;
        }

        const keep = onTrack;
        if (!keep) {
            
        }
        return keep;
    });

    

    
    const uniqueWpts = filteredWpts.filter((v, i, a) => {
        const matchIdx = a.findIndex(t => 
            t.name === v.name && 
            t.time === v.time && 
            Math.abs(t.lat - v.lat) < 0.000001 && 
            Math.abs(t.lon - v.lon) < 0.000001
        );
        
        if (matchIdx !== i) {
            
        }
        return matchIdx === i;
    });

    
    

    
    let listHtml = "";
    let shortcutsHtml = "";
    const isFS = (forceFS !== null) ? forceFS : !!(document.fullscreenElement || document.webkitFullscreenElement || document.body.classList.contains('iphone-fullscreen'));

    if (navShortcuts) navShortcuts.style.display = "flex";

    const icon = (typeof showWptNameAlways !== 'undefined' && showWptNameAlways) ? "visibility_off" : "visibility";
    

    if (!isFS) {
        if (uniqueWpts.length > 0) {
            shortcutsHtml += `<button type="button" class="shortcut-btn" onmousedown="L.DomEvent.stopPropagation(event)" onclick="window.restoreAndJump('anchorWpt'); L.DomEvent.stopPropagation(event);">📍 航點列表</button>`;
        }
        shortcutsHtml += `<button type="button" class="shortcut-btn" onmousedown="L.DomEvent.stopPropagation(event)" onclick="window.restoreAndJump('anchorPeak'); L.DomEvent.stopPropagation(event);">⛰️ 沿途山岳</button>`;
    }

    const u = historyManager.getBtnState('undo');
    const r = historyManager.getBtnState('redo');


    if (uniqueWpts.length > 0) {
        listHtml += `<h4 id="anchorWpt" style="margin: 20px 0 10px 0;">📍 航航點點列表 (${uniqueWpts.length})</h4>
            <div class="wpt-table-toolbar" style="margin-bottom: 10px; display: flex; gap: 10px; align-items: center;">
                <button type="button" onclick="deleteSelectedWaypoints()" class="btn-delete-multi" style="background: #d32f2f; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; font-size: 13px;"><span class="material-icons" style="font-size: 18px; margin-right: 5px;">delete_sweep</span> 刪除勾選項目</button>
                <span id="selectedCount" style="font-size: 12px; color: #666;">已選取 0 項</span>
            </div>
            <table class="wpt-table">
                <thead><tr><th style="width:2%"></th><th style="width:2%"><input type="checkbox" id="selectAllWpts" onclick="toggleSelectAll(this)"></th><th style="width:5%">#</th><th style="width:30%">時間</th><th style="width:40%">名稱</th><th style="width:20%">操作</th></tr></thead>
                <tbody id="wptTableBody">`; 
        uniqueWpts.forEach((w, displayIdx) => {
            const displayTime = w.localTime || (w.time ? new Date(w.time).toLocaleString() : "無時間資訊");
            listHtml += `<tr data-idx="${w.originalIdx}"><td class="drag-handle" style="cursor: grab; color: #ccc;"><span class="material-icons">drag_indicator</span></td><td><input type="checkbox" class="wpt-checkbox" data-idx="${w.originalIdx}" onchange="updateSelectedCount()"></td><td><span class="wpt-link" onclick="focusWaypointWithLog(${w.originalIdx}, '${w.name}')">${displayIdx + 1}</span></td><td>${displayTime}</td><td>${w.name}</td><td><span class="material-icons wpt-action-icon" onclick="handleWptEditByIndex(${w.originalIdx})">edit</span><span class="material-icons wpt-action-icon wpt-delete-icon" onclick="deleteWaypoint(${w.originalIdx})">delete</span></td></tr>`;
        });
        listHtml += `</tbody></table>`;
    }

    listHtml += `<h4 id="anchorPeak" style="margin: 30px 0 10px 0; font-size: 16px; color: #2c3e50; border-left: 5px solid #d35400; padding-left: 10px;">⛰️ 沿途山岳(200公尺內)</h4>
    <div id="aiPeaksSection">
        <div style="padding:15px; text-align:center; background:#f8f9fa; border:1px dashed #ccc; border-radius:8px; margin:10px;">
            <p style="margin-bottom:8px; color:#666; font-size:13px;">📍 已準備好偵測此路線周圍山岳</p>
            <button onclick="detectPeaksAlongRoute(true)" style="padding: 10px 25px; background: #1a73e8; color: white; border: none; border-radius: 50px; cursor: pointer; font-weight: bold; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); display: inline-flex; align-items: center; justify-content: center;">🔍 偵測此路線山岳</button>
        </div>
    </div>`;

    if (navShortcuts) navShortcuts.innerHTML = shortcutsHtml;
    wptListContainer.innerHTML = listHtml;
    wptListContainer.style.display = isFS ? "none" : "block";

    if (!isFS) {
        setTimeout(() => {
            if (typeof initWptSortable === 'function') initWptSortable();
            if (typeof initWptDragSelect === 'function') initWptDragSelect();
        }, 150);
    }
    
};


document.addEventListener('fullscreenchange', () => {
    setTimeout(() => {
        const activeIdx = window.currentActiveIndex || 0;
        const currentRoute = window.allTracks ? window.allTracks[activeIdx] : null;
        if (typeof renderWaypointsAndPeaks === 'function') {
            renderWaypointsAndPeaks(currentRoute);
        }
    }, 200);
});

function formatDate(d) { return d.toISOString().replace("T", " ").substring(0, 19); }


let peakAbortController = null; 

/**
 * 偵測經過山岳
 * @param {boolean} isManual - 是否為手動點擊觸發
 */
async function detectPeaksAlongRoute(isManual = false) {
    
    if (typeof peakAbortController !== 'undefined' && peakAbortController) {
        peakAbortController.abort();
    }
    
    const wptListContainer = document.getElementById("wptList");
    if (!wptListContainer) return;
    wptListContainer.style.display = "block";

    let aiSection = document.getElementById("aiPeaksSection");
    if (!aiSection) {
        aiSection = document.createElement("div");
        aiSection.id = "aiPeaksSection";
        wptListContainer.appendChild(aiSection);
    }

    if (!isManual) {
        aiSection.innerHTML = `
            <div style="padding:20px; text-align:center; background:#f9f9f9; border:1px dashed #ccc; border-radius:8px; margin:10px 0;">
                <p style="margin-bottom:10px; color:#666; font-size:14px;">📍 路線已載入：準備好偵測此範圍內之山岳</p>
				<button onclick="detectPeaksAlongRoute(true)" 
        style="padding: 10px 25px; /* 橢圓形通常兩側留白更多，外觀更協調 */
               background: #1a73e8; 
               color: white; 
               border: none; 
               
               /* 關鍵修改：將 border-radius 設定為 50px，強制橢圓形 */
               border-radius: 50px; 
               
               cursor: pointer; 
               font-weight: bold; 
               font-size: 14px; 
               box-shadow: 0 2px 4px rgba(0,0,0,0.2);
               
               /* 確保按鈕內容垂直置中 */
               display: inline-flex;
               align-items: center;
               justify-content: center;
               vertical-align: middle;
               outline: none;
               -webkit-tap-highlight-color: transparent;">
   						 🔍 開始偵測沿途山岳
				</button>
            </div>`;
        return; 
    }
    
    peakAbortController = new AbortController();
    
    
    aiSection.innerHTML = `<div id="aiLoading" style="padding:20px; text-align:center; color:#666;">
        <div class="spinner" style="margin-bottom:10px;">🔄</div>
        🔍 正在掃描全線資料，偵測 200 公尺內山岳...
    </div>`;

    if (typeof trackPoints === 'undefined' || !trackPoints || trackPoints.length === 0) {
        aiSection.innerHTML = `<div style="padding:10px; color:red;">無法取得軌跡點資料。</div>`;
        return;
    }

    const maxSamples = 80; 
    const samplingRate = Math.max(1, Math.floor(trackPoints.length / maxSamples));
    const sampledPoints = trackPoints.filter((_, i) => i % samplingRate === 0);
    
    let aroundSegments = sampledPoints.map(p => `node(around:200,${p.lat},${p.lon})[natural=peak];`).join("");
    const fullQuery = `[out:json][timeout:30];(${aroundSegments});out body;`;

    const timeoutId = setTimeout(() => {
        if (peakAbortController) peakAbortController.abort();
    }, 25000); 

    try {
        const response = await fetch("https://overpass-api.de/api/interpreter", { 
            method: "POST", 
            body: "data=" + encodeURIComponent(fullQuery),
            signal: peakAbortController.signal 
        });
        clearTimeout(timeoutId);

        const data = await response.json();
        
        if (!data.elements || data.elements.length === 0) {
            aiSection.innerHTML = `<div style="padding:20px; color:#999; font-size:13px; text-align:center;">ℹ️ 沿途 200m 內未偵測到額外的山峰標記。</div>`;
            return;
        }

        const uniquePeaks = [];
        const seenNames = new Set();
        
        data.elements.forEach(el => {
            const name = el.tags.name || "未命名山峰";
            const ele = el.tags.ele || "未知";
            
            if (!seenNames.has(name)) {
                seenNames.add(name);
                
                let minMeterDist = Infinity, bestIdx = 0;
                trackPoints.forEach((tp, i) => {
                    const R = 6371000;
                    const dLat = (el.lat - tp.lat) * Math.PI / 180;
                    const dLon = (el.lon - tp.lon) * Math.PI / 180;
                    const a = Math.sin(dLat/2) ** 2 + Math.cos(tp.lat * Math.PI / 180) * Math.cos(el.lat * Math.PI / 180) * Math.sin(dLon/2) ** 2;
                    const d = 2 * R * Math.asin(Math.sqrt(a));
                    if (d < minMeterDist) { minMeterDist = d; bestIdx = i; }
                });

                uniquePeaks.push({ 
                    name, 
                    ele, 
                    lat: el.lat, 
                    lon: el.lon, 
                    time: trackPoints[bestIdx].timeLocal, 
                    idx: bestIdx, 
                    distToTrack: minMeterDist 
                });
            }
        });

        uniquePeaks.sort((a, b) => a.idx - b.idx);
        
        if (typeof renderPeakTable === 'function') {
            renderPeakTable(uniquePeaks);
        }

    } catch (error) {
        if (error.name === 'AbortError') {
          } else {
            aiSection.innerHTML = `
                <div style="padding:20px; color:#721c24; background-color:#f8d7da; border:1px solid #f5c6cb; border-radius:8px; text-align:center; margin:10px 0;">
                    <p style="margin-bottom:10px;">❌ 山岳偵測失敗 (API 忙碌中或網路逾時)</p>
									<button onclick="detectPeaksAlongRoute(true)" 
					        style="padding: 8px 20px; 
					               background: #d35400; 
					               color: white; 
					               border: none; 
					               border-radius: 50px; 
					               cursor: pointer; 
					               font-weight: bold;
					               box-shadow: 0 2px 4px rgba(0,0,0,0.15);
					               outline: none;">
					  					  🔄 重新嘗試
							  	</button>
                </div>`;
        }
    }
}

let autoRouteLayer = null;

async function analyzeBestPath(latA, lonA, latB, lonB) {
    
    const minLat = Math.min(latA, latB) - 0.01;
    const maxLat = Math.max(latA, latB) + 0.01;
    const minLon = Math.min(lonA, lonB) - 0.01;
    const maxLon = Math.max(lonA, lonB) + 0.01;

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
        
        if (autoRouteLayer) map.removeLayer(autoRouteLayer);

        autoRouteLayer = L.geoJSON(osmtogeojson(data), {
            style: {
                color: "#FF5722",
                weight: 4,
                opacity: 0.7,
                dashArray: "5, 10" 
            }
        }).addTo(map);


    } catch (error) {


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

let gUrl = "#";

window.jumpToLocation = function(lat, lon) {
    const twd97 = proj4(WGS84_DEF, TWD97_DEF, [lon, lat]);
    const twd67 = proj4(WGS84_DEF, TWD67_DEF, [lon, lat]);
    
    
    let foundEle = null;
    let minDistance = 0.0002;
    if (typeof trackPoints !== 'undefined' && trackPoints.length > 0) {
        trackPoints.forEach((tp) => {
            const d = Math.sqrt(Math.pow(tp.lat - lat, 2) + Math.pow(tp.lon - lon, 2));
            if (d < minDistance) {
                minDistance = d;
                foundEle = tp.ele;    
            }
        });
    }
    const eleParam = foundEle !== null ? foundEle : 'null';

    const gUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    const gMapIconBtn = `
        <a href="${gUrl}" target="_blank" 
           style="text-decoration:none; margin-right:8px; display:inline-flex; align-items:center; justify-content:center; width: 28px; height: 28px; background: #fff; border: 1px solid #ccc; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.15); vertical-align: middle;">
            <img src="https://ychiking.github.io/gpx-online-viewer/GoogleMaps.png" style="width:18px; height:18px;" alt="GMap">
        </a>`;

    
    const editIcon = `<span class="material-icons" style="font-size:16px; cursor:pointer; vertical-align:middle; margin-left:4px; color:#1a73e8;" 
        onclick="event.stopPropagation(); window.removeJumpMarkers(); handleWptEdit(-1, ${lat}, ${lon}, ${eleParam}, '定位點資訊', null, null)">add_location</span>`;

    const content = `
        <div style="font-size:14px; line-height:1.5; min-width:180px;">
            <div style="display:flex; align-items:center;">
                ${gMapIconBtn}
                <b style="color:#1a73e8; font-size:15px;">定位點資訊</b>${editIcon}
            </div>
            <hr style="margin:5px 0; border:0; border-top:1px solid #eee;">
            <div style="padding:5px 0;">
                WGS84: ${lat.toFixed(6)}, ${lon.toFixed(6)}<br>
                TWD97: ${Math.round(twd97[0])}, ${Math.round(twd97[1])}<br>
                TWD67: ${Math.round(twd67[0])}, ${Math.round(twd67[1])}
            </div>
            <div style="display:flex; margin-top:10px; gap:5px;">
                <button onclick="setFreeAB('A', ${lat}, ${lon})" style="flex:1; background:#007bff; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold;">設定 A</button>
                <button onclick="setFreeAB('B', ${lat}, ${lon})" style="flex:1; background:#e83e8c; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold;">設定 B</button>
            </div>
        </div>
    `;

    const modal = document.getElementById('coordModal');
    if (modal) modal.style.display = 'none';
    
    map.setView([lat, lon], 16); 
    
    
    window.removeJumpMarkers();

    const jumpMarker = L.marker([lat, lon]).addTo(map);
    jumpMarker.isJumpPoint = true; 

    
    const applyFilter = (marker) => {
        if (marker._icon) {
            marker._icon.style.filter = "hue-rotate(180deg) brightness(160%)";
        } else {
            setTimeout(() => applyFilter(marker), 10);
        }
    };
    applyFilter(jumpMarker);

    jumpMarker.bindPopup(content).openPopup();

    map.once('click', () => {
        window.removeJumpMarkers();
    });
};


window.removeJumpMarkers = function() {
    map.eachLayer((layer) => {
        if (layer.isJumpPoint) {
            map.removeLayer(layer);
        }
    });
};

window.executeJump = function(type) {
    if (typeof event !== 'undefined') event.stopPropagation();

    let lat, lng;

    if (type === 'WGS') {
        const wgsType = document.getElementById('wgs_type').value;
        if (wgsType === 'DD') {
            lat = parseFloat(document.getElementById('lat_dd').value);
            lng = parseFloat(document.getElementById('lng_dd').value);
        } else {
            const ld = parseFloat(document.getElementById('lat_d').value) || 0;
            const lm = parseFloat(document.getElementById('lat_m').value) || 0;
            const ls = parseFloat(document.getElementById('lat_s').value) || 0;
            lat = ld + (lm / 60) + (ls / 3600);

            const nd = parseFloat(document.getElementById('lng_d').value) || 0;
            const nm = parseFloat(document.getElementById('lng_m').value) || 0;
            const ns = parseFloat(document.getElementById('lng_s').value) || 0;
            lng = nd + (nm / 60) + (ns / 3600);
        }
        
        if (isNaN(lat) || isNaN(lng) || lat === 0) {
            showMapToast("請填寫緯經度");
            return;
        }
        window.jumpToLocation(lat, lng);

    } else {
        const twdSystem = document.getElementById('twd_system').value;
        const sourceDef = (twdSystem === '67') ? TWD67_DEF : TWD97_DEF;
        const xStr = document.getElementById('twd_x').value;
        const yStr = document.getElementById('twd_y').value;

        let x = parseFloat(xStr);
        let y = parseFloat(yStr);

        if (xStr.length === 4) x = x * 100;
        if (yStr.length === 5) y = y * 100;

        if (isNaN(x) || isNaN(y)) {
            showMapToast("請填寫 X 與 Y");
            return;
        }

        const coord = proj4(sourceDef, WGS84_DEF, [x, y]);
        window.jumpToLocation(coord[1], coord[0]);
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

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
    
    
    setTimeout(() => {
        toast.style.opacity = '0';
    }, 3000);
}


let multiGpxStack = []; 
// const multiColors = ['#FF0000', '#0000FF', '#FFA500', '#800080', '#FFD700', '#A52A2A', '#7FFF00', '#87CEFA', '#006400', '#FFC0CB'];
const multiColors = [
    '#0000FF', // 純藍
    '#FF3300', // 亮橘紅
    '#FF00FF', // 洋紅 (地圖上最不容易混淆的顏色)
    '#FFD600', // 鮮黃
    '#9C27B0', // 亮紫
    '#33FF00', // 螢光黃綠
    '#00FFFF', // 青色 (與陸地顏色反差大)
    '#E91E63', // 桃紅
    '#1A73E8', // Google 藍
    '#00E676', // 翡翠綠
    '#87CEFA'  // 天藍
];



async function handleGpxFiles(files) {
    if (!files || files.length === 0) return;

    clearEverything(); 
		historyManager.clear();
 
    if (typeof window.resetGPS === 'function') window.resetGPS();
    if (typeof polyline !== 'undefined' && polyline) map.removeLayer(polyline);

    allTracks = []; 
    window.customNameCache = {}; 
 
    clearAllMultiGPX(); 
    
    document.getElementById("fileNameDisplay").innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <span>已匯入 ${files.length} 個 GPX 檔案</span>
            <button type="button" class="shortcut-btn close-circle-btn" onclick="location.reload()">✕</button>
        </div>
    `;

    const hint = document.getElementById('importHint');
    if (hint) hint.style.display = 'none';
    const refreshIcon = document.getElementById('refreshIcon');
    if (refreshIcon) refreshIcon.style.display = 'none'; 
    
    let allBounds = L.latLngBounds([]);

    
    for (let i = 0; i < files.length; i++) {
        
        window.currentFileNameForDisplay = files[i].name; 

        const text = await files[i].text();
        const pureFileName = files[i].name.replace(/\.[^/.]+$/, "");
        const tracks = processGpxXml(text); 
        
        let combinedPoints = [];
        let combinedWaypoints = [];
        tracks.forEach(t => {
            combinedPoints = combinedPoints.concat(t.points || []);
            combinedWaypoints = combinedWaypoints.concat(t.waypoints || []);
        });

        if (combinedPoints.length === 0 && combinedWaypoints.length === 0) continue;

        const gpxData = {
            name: files[i].name,
            fileName: pureFileName,
            points: combinedPoints,
            waypoints: combinedWaypoints,
            distance: 0, elevationGain: 0, elevationLoss: 0,
            duration: "00:00:00", avgSpeed: 0, maxElevation: 0, minElevation: 0
        };

        allTracks.push(gpxData);

        const color = multiColors[i % multiColors.length];
        const gpxId = "gpx_" + Date.now() + "_" + i; 

        let layer;
        let currentBounds = L.latLngBounds([]);

        if (combinedPoints.length > 0) {
            layer = L.polyline(combinedPoints.map(p => [p.lat, p.lon]), {
                color: color, weight: 4, opacity: 0.8, gpxId: gpxId,
                trackIndex: allTracks.length - 1
            }).addTo(map);

            layer.on('click', (e) => {
                L.DomEvent.stopPropagation(e); 
                const targetIdx = e.target.options.trackIndex;
                if (typeof switchMultiGpx === 'function') switchMultiGpx(targetIdx);
            });
            currentBounds = layer.getBounds();
        } else {
            layer = L.featureGroup().addTo(map);
            layer.options = { gpxId: gpxId, trackIndex: allTracks.length - 1 }; 
            if (combinedWaypoints.length > 0) {
                const coords = combinedWaypoints.map(w => [w.lat, w.lon]);
                currentBounds = L.latLngBounds(coords);
            }
        }

        
        multiGpxStack.push({
            id: gpxId, 
            name: files[i].name,
            fileName: pureFileName,
            content: text,          
            points: combinedPoints,
            waypoints: combinedWaypoints,
            layer: layer,
            color: color
        });

        if (currentBounds && currentBounds.isValid()) allBounds.extend(currentBounds);
    }
    
		const routeSelect = document.getElementById("routeSelect");
		if (routeSelect) {
		    
		    routeSelect.onmousedown = function() {
				        if (typeof updateRouteSelectDropdown === 'function') {
		            updateRouteSelectDropdown();
		        }
		    };
		}
  
    if (multiGpxStack.length > 0) {
        document.getElementById('multiGpxBtnBar').style.display = 'flex';
        renderMultiGpxButtons();
        
        
        updateRouteSelectDropdown();

        switchMultiGpx(0);
        
        setTimeout(() => {
             try {
                window.currentMultiIndex = 0;
                if (typeof loadRoute === 'function') loadRoute(0);
                if (typeof setupProgressBar === 'function') setupProgressBar();
            } catch (err) {


            }
        }, 300);
    }
}

document.getElementById("multiGpxInput").addEventListener("change", async (e) => {
    
    await handleGpxFiles(e.target.files);
    
    e.target.value = ""; 
});

function switchMultiGpx(index) {
    const data = multiGpxStack[index];
    if (!data) return;
    
    window.currentMultiIndex = index;
    map.closePopup();
    window.currentFileNameForDisplay = data.name;

    
    multiGpxStack.forEach((item, i) => {
        const btn = document.getElementById(`multi-btn-${i}`);
        if (i === index) {
            item.layer.setStyle({ color: item.color, weight: 8, opacity: 1.0 }).bringToFront(); 
            if (btn) btn.classList.add('active');
            if (!isGpxInView(index)) map.fitBounds(item.layer.getBounds(), { padding: [20, 20], maxZoom: 16 });
        } else {
            item.layer.setStyle({ color: item.color, weight: 5, opacity: 0.5 });
            if (btn) btn.classList.remove('active');
        }
    });

    
    const applyCustomNames = () => {
        if (data.customRouteNames && window.allTracks) {
            Object.keys(data.customRouteNames).forEach(id => {
                const trackIdx = parseInt(id);
                if (allTracks[trackIdx]) {
                    allTracks[trackIdx].name = data.customRouteNames[trackIdx];
                }
            });

            
            const routeSelect = document.getElementById("routeSelect");
            if (routeSelect) {
                allTracks.forEach((t, i) => {
                    if (routeSelect.options[i]) routeSelect.options[i].text = t.name;
                });
            }
        }
    };

    
    if (data.content) {
        const pureFileName = data.name.replace(/\.[^/.]+$/, "");
        
        
        parseGPX(data.content, pureFileName);
        
        
        applyCustomNames();
        
        
        if (allTracks && allTracks.length > 0) {
            allTracks.forEach(track => {
                track.waypoints = data.waypoints || [];
            });
        }

        setTimeout(() => {
            if (typeof loadRoute === 'function') {
                loadRoute(0);
                
                applyCustomNames(); 
                if (typeof renderRouteInfo === 'function') renderRouteInfo();
            }
            if (window.activeRouteLayer) activeRouteLayer.setStyle({ color: data.color });
        }, 100);

    } else {
        
        allTracks = [{ name: data.name, points: data.points, waypoints: data.waypoints }];
        trackPoints = data.points; 
        if (typeof loadRoute === 'function') loadRoute(0);
    }

    
    const toggleBtn = document.getElementById("toggleChartBtn");
    if (toggleBtn) toggleBtn.style.display = "block";
    document.getElementById("chartContainer").style.display = "block";
    document.getElementById("wptList").style.display = "block";

    if (typeof detectPeaksAlongRoute === 'function') {
        if (typeof peakAbortController !== 'undefined' && peakAbortController) peakAbortController.abort();
        detectPeaksAlongRoute(false); 
    }
}

function renderMultiGpxButtons() {
    const bar = document.getElementById('multiGpxBtnBar');
    if (!bar || !gpxManagerControlContainer) return;

    
    if (multiGpxStack && multiGpxStack.length > 0) {
        document.body.classList.add('has-gpx-bar');
        gpxManagerControlContainer.style.display = 'block';
        
        
        gpxManagerControlContainer.innerHTML = `
            <a href="#" title="管理 GPX 顯示" style="
                background-color: white; 
                width: 35px; 
                height: 35px; 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                text-decoration: none; 
                color: #333;
            ">
                <span class="material-icons" style="font-size: 25px;">layers</span>
            </a>
        `;

        L.DomEvent.off(gpxManagerControlContainer, 'click');
        L.DomEvent.on(gpxManagerControlContainer, 'click', (e) => {
            L.DomEvent.stop(e);
            showGpxManagementModal(); 
        });
    } else {
        document.body.classList.remove('has-gpx-bar');
        gpxManagerControlContainer.style.display = 'none';
    }

    
    bar.innerHTML = ''; 
    
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'gpx-file-btn close-btn';
    closeBtn.innerHTML = '✕ 關閉檔案';
    closeBtn.onclick = (e) => {
        if (e) L.DomEvent.stopPropagation(e); 
        if (typeof clearAllMultiGPX === 'function') clearAllMultiGPX();
        location.reload();
    };
    bar.appendChild(closeBtn);
    
    multiGpxStack.forEach((gpx, i) => {
        
        if (gpx.visible === false) {
            if (gpx.layerGroup) map.removeLayer(gpx.layerGroup); 
            return; 
        }

        
        if (gpx.layerGroup && !map.hasLayer(gpx.layerGroup)) {
            map.addLayer(gpx.layerGroup);
        }

        const btn = document.createElement('button');
        btn.className = 'gpx-file-btn';
        btn.id = `multi-btn-${i}`;
        
        
        if (i === window.currentMultiIndex) {
            btn.classList.add('active');
        }

        btn.textContent = gpx.name.length > 40 ? gpx.name.substring(0, 40) + "..." : gpx.name;
        
        
        
        btn.style.setProperty('border-left', `5px solid ${gpx.color}`, 'important');
        btn.style.setProperty('--track-color', gpx.color, 'important');
        
        btn.onclick = (e) => {
            if (e) L.DomEvent.stopPropagation(e);
            if (typeof switchMultiGpx === 'function') switchMultiGpx(i);
        };
        bar.appendChild(btn);
    });

    L.DomEvent.disableClickPropagation(bar);
}

function clearAllMultiGPX() {

    multiGpxStack.forEach(item => map.removeLayer(item.layer));
    
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    wptMarkers.forEach(m => map.removeLayer(m));
    wptMarkers = [];
    
    
    if (chart) chart.destroy();
    
    multiGpxStack = [];
    const bar = document.getElementById('multiGpxBtnBar');
    if (bar) {
        bar.style.display = 'none';
        bar.innerHTML = '';
    }
    
    document.getElementById("routeSummary").textContent = "尚未讀取資料";
    document.getElementById("chartContainer").style.display = "none";
    document.getElementById("wptList").style.display = "none";
}

window.switchToTrack = function(id) {
    const target = allTracks.find(t => t.id === id);
    if (!target) return;
    currentFocusId = id;

    
    parseGPX(target.content);

    
    
    const chartBtn = document.getElementById('chartContainer'); 
    
    if (!window.trackPoints || window.trackPoints.length === 0) {
        
        
        if (chartBtn) {
            chartBtn.style.setProperty("display", "none", "important");
        }
        
        
        if (window.chart) {
            window.chart.destroy();
            window.chart = null;
        }

        
        

    } else {
        
        if (chartBtn) {
            chartBtn.style.display = 'block';
        }
        if (typeof drawElevationChart === 'function') {
            drawElevationChart();
        }
    }

    
    renderRouteInfo();
    renderTrackButtons();
};

function toggleElevationChart() {
    const chartContainer = document.getElementById("chartContainer");
    const btn = document.getElementById("toggleChartBtn");
    const tipLabel = document.getElementById("chartTipToggleLabel"); 

    if (chartContainer.style.display === "none" || chartContainer.style.display === "") {
        
        chartContainer.style.display = "block";
        btn.textContent = "收合高度表";
        
        
        if (tipLabel && trackPoints && trackPoints.length > 0) {
            tipLabel.style.display = "flex";
        }
        
        if (window.chart) {
            window.chart.resize();
        }
    } else {
        
        chartContainer.style.display = "none";
        btn.textContent = "展開高度表";
        
        
        if (tipLabel) {
            tipLabel.style.display = "none";
        }
        
        
        if (currentPopup) map.closePopup();
    }
}

const gMapIconBtn = `
    <a href="${gUrl}" target="_blank" title="於 Google Map 開啟" 
       style="text-decoration:none; 
              margin-right:8px; 
              display:inline-flex; 
              align-items:center; 
              justify-content:center;
              width: 28px; 
              height: 28px; 
              background: #ffffff; 
              border: 1px solid #ddd; 
              border-radius: 50%; 
              box-shadow: 0 2px 4px rgba(0,0,0,0.2); 
              transition: all 0.2s ease;
              vertical-align: middle;">
        <img src="https://ychiking.github.io/gpx-online-viewer/GoogleMaps.png" 
             style="width:18px; height:18px; display:block;" 
             alt="Google Maps">
    </a>`;
    
function isGpxInView(gpxData) {
    let pointsForBounds = [];

    
    if (gpxData.trackPoints && gpxData.trackPoints.length > 0) {
        pointsForBounds = pointsForBounds.concat(gpxData.trackPoints);
    }

    
    if (gpxData.waypoints && gpxData.waypoints.length > 0) {
        pointsForBounds = pointsForBounds.concat(gpxData.waypoints);
    }

    
    if (pointsForBounds.length === 0) return true;

    
    try {
        const bounds = L.latLngBounds(pointsForBounds.map(p => [p.lat, p.lon]));
        return map.getBounds().intersects(bounds);
    } catch (e) {
        return true; 
    }
}

window.addEventListener('DOMContentLoaded', (event) => {
    setupProgressBar(); 
});



document.addEventListener('dragover', (e) => {
    e.preventDefault(); 
    e.stopPropagation();
    document.body.style.backgroundColor = "rgba(0,0,0,0.02)"; 
});

document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.style.backgroundColor = "";
});

document.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.style.backgroundColor = "";

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
        
        const gpxFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.gpx'));
        if (gpxFiles.length > 0) {
            await handleGpxFiles(gpxFiles);
        }
    }
});


document.addEventListener('fullscreenchange', () => {
    setTimeout(() => {
        if (typeof setupProgressBar === 'function') setupProgressBar();
    }, 150);
});


window.changeMapSize = function(size) {
    const mapDiv = document.getElementById('map');
    window.currentMapSize = size; 

    if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
    document.body.classList.remove('iphone-fullscreen');
    mapDiv.classList.remove('iphone-fullscreen');
    document.body.style.overflow = '';

    const isMobile = window.innerWidth <= 768;
    let heightVal;
    if (size === 'standard') {
        heightVal = isMobile ? '45vh' : '550px'; 
    } else if (size === 'large') {
        heightVal = '75vh';
    }

    if (heightVal) mapDiv.style.height = heightVal;

    setTimeout(() => {
        map.invalidateSize({ animate: true });
        if (typeof window.updateVisibility === 'function') {
            window.updateVisibility();
        }
        
    }, 400); 
};

window.toggleFullScreen = function() {
    const mapDiv = document.getElementById('map');
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    
    const forceHideButtons = () => {
        const nav = document.getElementById('navShortcuts');
        if (nav) {
            
            Array.from(nav.querySelectorAll('.shortcut-btn')).forEach(btn => {
                if (btn.innerText.includes('航點列表') || btn.innerText.includes('沿途山岳')) {
                    btn.style.setProperty('display', 'none', 'important');
                    
                }
            });
        }
    };

    if (isIOS) {
        const isFull = mapDiv.classList.contains('iphone-fullscreen');
        if (!isFull) {
            mapDiv.classList.add('iphone-fullscreen');
            document.body.classList.add('iphone-fullscreen'); 
            document.body.style.overflow = 'hidden';
            window.currentMapSize = 'full'; 
            
            forceHideButtons();
        } else {
            mapDiv.classList.remove('iphone-fullscreen');
            document.body.classList.remove('iphone-fullscreen');
            document.body.style.overflow = '';
            window.currentMapSize = 'standard'; 
            
            if (typeof renderWaypointsAndPeaks === 'function') renderWaypointsAndPeaks();
        }
    } else {
        if (!document.fullscreenElement) {
            
            forceHideButtons(); 

            if (mapDiv.requestFullscreen) {
                mapDiv.requestFullscreen().then(() => {
                    
                    forceHideButtons();
                }).catch(() => {});
            }
            window.currentMapSize = 'full';
        } else {
            document.exitFullscreen();
            window.currentMapSize = 'standard';
        }
    }
    
    setTimeout(() => {
        map.invalidateSize();
        if (window.updateVisibility) window.updateVisibility();
    }, 300);
};

window.manualShowBar = false; 

const mapSizeCtrl = L.control({ position: 'topleft' });

mapSizeCtrl.onAdd = function(map) {
    const container = L.DomUtil.create('div', 'leaflet-control-group');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';

    const sizeWrapper = L.DomUtil.create('div', 'leaflet-bar', container);
    sizeWrapper.style.backgroundColor = 'white';
    sizeWrapper.style.display = 'flex';
    sizeWrapper.style.flexDirection = 'column';
    sizeWrapper.style.border = '1px solid rgba(0,0,0,0.2)';

    const renderButtons = () => {
        sizeWrapper.innerHTML = '';
        
        const isIphoneFS = document.body.classList.contains('iphone-fullscreen') || 
                           document.getElementById('map').classList.contains('iphone-fullscreen');
        const isNativeFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
        const isCurrentlyFull = isIphoneFS || isNativeFS;

        if (!isCurrentlyFull && window.currentMapSize === 'full') {
            window.currentMapSize = 'standard';
        }
        const currentSize = window.currentMapSize || 'standard';

        const iconStandard = '<span class="material-icons" style="font-size:20px; transform: rotate(45deg); display: block;">unfold_less</span>';
        const iconLarge = '<span class="material-icons" style="font-size:20px; transform: rotate(45deg); display: block;">unfold_more</span>';
        const iconExit = '<span class="material-icons" style="font-size:20px;">fullscreen_exit</span>';
        const iconFull = '<span class="material-icons" style="font-size:20px;">fullscreen</span>';

        let btnConfigs = [];

        if (isCurrentlyFull) {
            btnConfigs = [
                { html: iconStandard, val: 'standard', label: '標準' },
                { html: iconExit, val: 'large', label: '大圖' } 
            ];
        } else if (currentSize === 'standard') {
            btnConfigs = [
                { html: iconLarge, val: 'large', label: '大圖' },
                { html: iconFull, val: 'full', label: '全螢幕' }
            ];
        } else if (currentSize === 'large') {
            btnConfigs = [
                { html: iconStandard, val: 'standard', label: '標準' },
                { html: iconFull, val: 'full', label: '全螢幕' }
            ];
        }

        btnConfigs.forEach((cfg, index) => {
            const btn = L.DomUtil.create('a', '', sizeWrapper);
            btn.innerHTML = cfg.html;
            btn.title = cfg.label;
            btn.style.width = '30px';
            btn.style.height = '30px';
            btn.style.lineHeight = '30px';
            btn.style.textAlign = 'center';
            btn.style.display = 'flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
            btn.style.cursor = 'pointer';
            btn.style.backgroundColor = 'white';
            if (index === 0) btn.style.borderBottom = '1px solid #eee';

            L.DomEvent.on(btn, 'click', function(e) {
                L.DomEvent.stop(e);
                if (cfg.val === 'full') {
                    window.toggleFullScreen();
                } else {
                    if (isCurrentlyFull) {
                        window.toggleFullScreen();
                        setTimeout(() => { window.changeMapSize(cfg.val); }, 350);
                    } else {
                        window.changeMapSize(cfg.val);
                    }
                }
                setTimeout(renderButtons, 500);
            });
        });
    };

    renderButtons();

    const barBtnWrapper = L.DomUtil.create('div', 'leaflet-bar', container);
    barBtnWrapper.style.backgroundColor = 'white';
    barBtnWrapper.style.border = '1px solid rgba(0,0,0,0.2)';
    barBtnWrapper.style.cursor = 'pointer';
    barBtnWrapper.style.width = '30px';
    barBtnWrapper.style.height = '30px';
    barBtnWrapper.title = '顯示/隱藏軌跡進度軸';

    const barToggleBtn = L.DomUtil.create('a', '', barBtnWrapper);
    barToggleBtn.innerHTML = '<span class="material-icons" style="font-size:20px; display:flex; align-items:center; justify-content:center; height:30px;">linear_scale</span>';

    function refreshBarBtnStyle() {
        if (window.manualShowBar) {
            barToggleBtn.style.color = '#1a73e8';
            barToggleBtn.style.backgroundColor = '#e8f0fe';
        } else {
            barToggleBtn.style.color = '#666';
            barToggleBtn.style.backgroundColor = 'white';
        }
    }
    
    refreshBarBtnStyle();

    L.DomEvent.on(barToggleBtn, 'click', function(e) {
        L.DomEvent.stop(e);
        window.manualShowBar = !window.manualShowBar;
        refreshBarBtnStyle();
        if (window.updateVisibility) window.updateVisibility();
    });

    const syncHandler = () => setTimeout(renderButtons, 200);
    document.addEventListener('fullscreenchange', syncHandler);
    document.addEventListener('webkitfullscreenchange', syncHandler);

    L.DomEvent.disableClickPropagation(container);
    return container;
};



mapSizeCtrl.addTo(map);
window.addEventListener('resize', () => {
    map.invalidateSize();
    if (typeof window.updateVisibility === 'function') window.updateVisibility();
});

let gpxManagerControlContainer; 

function initGpxManagerControl() {
    const GpxManagerControl = L.Control.extend({
        options: { position: 'topright' }, 
        onAdd: function() {
            
            gpxManagerControlContainer = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            gpxManagerControlContainer.id = 'gpx-manager-control';
            gpxManagerControlContainer.style.display = 'none'; 
            return gpxManagerControlContainer;
        }
    });
    map.addControl(new GpxManagerControl());
}
initGpxManagerControl();

function showGpxManagementModal() {
    let modal = document.getElementById('gpxManageModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'gpxManageModal';
        modal.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; backdrop-filter: blur(2px); display:none;";
        document.body.appendChild(modal);
    }

    const isNowFS = !!(document.fullscreenElement || document.webkitFullscreenElement || document.body.classList.contains('iphone-fullscreen'));
    const mapContainer = document.getElementById('map');
    
    if (isNowFS && modal.parentElement !== mapContainer) {
        mapContainer.appendChild(modal);
    }

    if (modal.style.display === 'none') {
        modal.style.display = 'flex';
    }

    L.DomEvent.disableClickPropagation(modal);
    L.DomEvent.disableScrollPropagation(modal);

    const defaultColors = ['#0000FF', '#FF3300', '#FF00FF', '#FFD600', '#9C27B0', '#33FF00', '#00FFFF', '#E91E63', '#1A73E8', '#00E676', '#FF8C00', '#BF00FF', '#A5F2F3', '#FFF000', '#87CEFA', '#FF1493'];

    let listHtml = `
        <div style="background:white; padding:20px; border-radius:12px; width:320px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); max-height: 80vh; display: flex; flex-direction: column; position: relative;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">
                <h3 style="margin:0; font-size:19px;">管理軌跡</h3>
            </div>
            <div style="flex: 1; overflow-y:auto; padding-right:5px;">`;
    
    multiGpxStack.forEach((gpx, i) => {
        const isVisible = (gpx.visible !== false);
        const isChecked = isVisible ? 'checked' : '';
        const isFocused = (window.currentMultiIndex === i);
        
        
        const disabledAttr = isFocused ? 'disabled' : '';
        const cursorStyle = isFocused ? 'cursor: not-allowed; opacity: 0.6;' : 'cursor: pointer;';

        listHtml += `
        <div style="margin-bottom: 10px; border: 1px solid ${isFocused ? '#1a73e8' : '#eee'}; border-radius: 8px; padding: 10px; background: ${isFocused ? '#f0f7ff' : '#fafafa'};">
            <div style="display:flex; align-items:center; gap:12px;">
                <input type="checkbox" id="gpx-chk-${i}" ${isChecked} ${disabledAttr} onchange="toggleGpxVisibility(${i})" 
                    style="width:18px; height:18px; ${cursorStyle} flex-shrink: 0;">
                
                <div onclick="toggleColorPicker(${i})" style="
                    width: 22px; height: 22px; background: ${gpx.color || '#ff0000'}; 
                    border-radius: 50%; cursor: pointer; border: 2px solid white; box-shadow: 0 0 0 1px #ddd;
                    flex-shrink: 0;
                "></div>

                <label for="${isFocused ? '' : 'gpx-chk-' + i}" style="display:flex; align-items:center; cursor:${isFocused ? 'default' : 'pointer'}; flex:1; min-width:0;">
                    <span title="${gpx.name}" style="font-size:14px; font-weight:500; color:${isFocused ? '#1a73e8' : '#333'}; 
                                white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1;">
                        ${gpx.name}
                    </span>
                    
                    ${isFocused ? `
                        <span class="is-using-label" style="font-size:10px; margin-left:10px; background:#1a73e8; color:white; 
                                    padding:1px 6px; border-radius:10px; flex-shrink:0; white-space:nowrap;">
                            使用中
                        </span>` : ''}
                </label>
            </div>
            <div id="picker-${i}" style="display: none; margin-top: 12px; padding: 8px; background: white; border-radius: 6px; border: 1px solid #ddd; gap: 6px; flex-wrap: wrap; justify-content: center;">
                ${defaultColors.map(color => {
                    const isSelected = gpx.color && gpx.color.toUpperCase() === color.toUpperCase();
                    return `<div onclick="changeGpxColor(${i}, '${color}')" style="width: 24px; height: 24px; background: ${color}; border-radius: 4px; cursor: pointer; position: relative; border: ${isSelected ? '2px solid #333' : '1px solid rgba(0,0,0,0.1)'};"></div>`;
                }).join('')}
            </div>
        </div>`;
    });

    listHtml += `</div>
            <button onclick="document.getElementById('gpxManageModal').style.display='none'" 
                style="width:100%; margin-top:15px; padding:12px; background:#1a73e8; color:white; border:none; border-radius:8px; cursor:pointer; font-size:13px; font-weight:bold;">
                完成
            </button>
        </div>`;
    modal.innerHTML = listHtml;

    
    if (isNowFS) {
        syncFSFontSettings(modal);
    }

    
    modal.querySelectorAll('[onclick], button').forEach(el => {
        L.DomEvent.on(el, 'click', L.DomEvent.stopPropagation);
    });
    modal.querySelectorAll('input[type="checkbox"]').forEach(el => {
        L.DomEvent.on(el, 'click', (e) => e.stopPropagation());
    });
}

window.toggleGpx = function(index) {
		const e = window.event;
    
    if (e && (e.target.type === 'color' || e.target.classList.contains('color-btn'))) {
        return;
    }
    const item = multiGpxStack[index];
    const chk = document.getElementById(`gpx-chk-${index}`);
    
    if (!item) {
        return;
    }

    
    if (chk) {
        item.visible = chk.checked;
        
    } else {
        
        item.visible = !item.visible;
        
    }

    
    if (item.layer) {
        if (item.visible) {
            if (!map.hasLayer(item.layer)) map.addLayer(item.layer);
            
        } else {
            map.removeLayer(item.layer);
            
        }
    }

    
    if (!item.visible && window.currentMultiIndex === index) {
        
        if (window.activeRouteLayer) {
            map.removeLayer(window.activeRouteLayer);
            window.activeRouteLayer = null;
        }
        if (window.hoverMarker) map.removeLayer(window.hoverMarker);
        
        const chartContainer = document.getElementById("chartContainer");
        if (chartContainer) chartContainer.style.display = "none";
        const wptList = document.getElementById("wptList");
        if (wptList) wptList.style.display = "none";
    }

    
    
    renderMultiGpxButtons();
};


function toggleGpxVisibility(idx) {
    
    if (event) event.stopPropagation();
    
    
    window.toggleGpx(idx);
}

window.changeGpxColor = function(index, newColor) {
    if (window.event) window.event.stopPropagation(); 

    const item = multiGpxStack[index];
    if (!item) return;

    
    item.color = newColor;
    
    
    if (item.layer && item.visible !== false) {
        const isCurrent = (window.currentMultiIndex === index);
        item.layer.setStyle({
            color: newColor,
            opacity: isCurrent ? 1.0 : 0.5,
            weight: isCurrent ? 8 : 4
        });
    }

    
    if (window.currentMultiIndex === index && item.visible !== false) {
        if (window.activeRouteLayer) {
            map.removeLayer(window.activeRouteLayer);
        }
        window.currentTrackColor = newColor;
        
        setTimeout(() => {
            if (typeof switchMultiGpx === 'function') switchMultiGpx(index); 
        }, 10);
    }

    
    
    renderMultiGpxButtons();

    
    setTimeout(() => {
        showGpxManagementModal();
    }, 50);
};

window.toggleColorPicker = function(i) {
    if (window.event) window.event.stopPropagation(); 
    
    const targetPicker = document.getElementById(`picker-${i}`);
    const isCurrentlyHidden = (targetPicker.style.display === 'none');
    
    multiGpxStack.forEach((_, idx) => {
        const p = document.getElementById(`picker-${idx}`);
        if (p) p.style.display = 'none';
    });

    if (isCurrentlyHidden) {
        targetPicker.style.display = 'flex';
    }
};

let currentEditTask = null;

window.handleWptEdit = function(existingIdx, lat, lon, ele, oldName, timeStr, originalIdx) {
    
    if (typeof window.currentActiveIndex === 'undefined') window.currentActiveIndex = 0; 
    let stackIdx = window.currentMultiIndex || 0;
    
    if (typeof multiGpxStack === 'undefined' || !multiGpxStack) window.multiGpxStack = [];
    
    if (!multiGpxStack[stackIdx]) {
        multiGpxStack[stackIdx] = { 
            name: "純航點", 
            points: [], 
            waypoints: [], 
            stats: { totalDistance: 0, totalElevation: 0 }, 
            isCombined: false 
        };
    }
    
    if (typeof allTracks === 'undefined' || !allTracks || allTracks.length === 0) {
        window.allTracks = [multiGpxStack[stackIdx]];
    }
    
    let activeIdx = window.currentActiveIndex || 0;
    if (!allTracks[activeIdx]) activeIdx = 0;

    
    const modal = document.getElementById('wptEditModal');
    const nameInput = document.getElementById('modalWptName');
    const eleInput = document.getElementById('modalWptEle');
    const confirmBtn = document.getElementById('modalWptConfirm');
    const deleteBtn = document.getElementById('modalWptDelete');

    if (!modal || !nameInput || !eleInput || !confirmBtn) {
        return;
    }

    
    nameInput.value = oldName || "";
    eleInput.value = (ele !== null && ele !== "---") ? ele : 0;
    modal.style.display = 'flex';

    
    currentEditTask = { existingIdx, lat, lon, ele, oldName, timeStr, originalIdx, stackIdx, activeIdx };

    
    const isExistingWpt = (existingIdx !== null && existingIdx !== undefined && existingIdx !== -1);
    
    if (isExistingWpt) {
        
        if (deleteBtn) {
            deleteBtn.style.display = 'block';
            deleteBtn.onclick = function() {
              
                const currentData = {
                    name: nameInput.value,
                    ele: eleInput.value
                };
                modal.style.display = 'none';
                
                
                if (typeof window.deleteWaypoint === 'function') {
                    window.deleteWaypoint(existingIdx, {
                        task: currentEditTask,
                        data: currentData
                    });
                } else {
                    alert("找不到刪除處理函式");
                }
            };
        }
    } else {
        
        if (deleteBtn) {
            deleteBtn.style.display = 'none';
        }
    }

    
    setTimeout(() => { 
        nameInput.focus();
        nameInput.select(); 
    }, 100);

    const closeModal = () => {
        modal.style.display = 'none';
        window.removeEventListener('keydown', handleEscKey); 
        nameInput.onkeydown = null;
        eleInput.onkeydown = null;
    };

    const handleEscKey = (e) => {
        if (e.key === "Escape") closeModal();
    };
    window.addEventListener('keydown', handleEscKey);

    const handleEnterKey = (e) => {
        if (e.key === "Enter" || e.keyCode === 13) {
            e.preventDefault();
            confirmBtn.click();
        }
    };

    nameInput.onkeydown = handleEnterKey;
    eleInput.onkeydown = handleEnterKey;

    
    confirmBtn.onclick = function() {
        const finalName = nameInput.value.trim() || "未命名航點";
        const finalEle = eleInput.value;

        if (typeof processSave === 'function') {
            processSave(finalName, finalEle);
        }
        
        closeModal(); 
    };
};

function processSave(finalName, finalEle) {
    const { existingIdx, lat, lon, originalIdx, stackIdx, activeIdx } = currentEditTask;
    const isEditing = (existingIdx !== null && existingIdx !== -1);
    const oldWptSnapshot = isEditing ? JSON.parse(JSON.stringify(multiGpxStack[stackIdx].waypoints[existingIdx])) : null;
    let addedWptRef = null;

    const runBehavior = (isFromUndoRedo, focusPos = null) => {
        
        if (typeof wptMarkers !== 'undefined' && wptMarkers.length > 0) {
            wptMarkers.forEach(m => { if (m && map.hasLayer(m)) map.removeLayer(m); });
            wptMarkers = []; 
        }
        if (window.wptLayer) window.wptLayer.clearLayers();

        
        if (allTracks.length === 0) {
            allTracks.push(multiGpxStack[stackIdx]);
        } else {
            allTracks.forEach(track => { track.waypoints = multiGpxStack[stackIdx].waypoints; });
        }

        if (typeof rebuildXmlFromWaypoints === 'function') rebuildXmlFromWaypoints(multiGpxStack[stackIdx]);
        if (typeof updateWptTable === 'function') updateWptTable();
        
        
        if (typeof renderWaypointsAndPeaks === 'function') renderWaypointsAndPeaks(allTracks[activeIdx]);
        if (typeof loadRoute === 'function') loadRoute(activeIdx, null, focusPos);

        if (!isFromUndoRedo) {
            setTimeout(() => {
                if (window.isDraggingWpt) return;
                showCustomPopup(originalIdx, finalName, "wpt", lat, lon);
            }, 350);
        }
    };

    historyManager.execute({
    do: () => {
        if (isEditing) {
            multiGpxStack[stackIdx].waypoints[existingIdx].name = finalName;
            multiGpxStack[stackIdx].waypoints[existingIdx].ele = parseFloat(finalEle);
        } else {
            addedWptRef = { 
                lat, 
                lon, 
                name: finalName, 
                ele: parseFloat(finalEle) || 0,
                time: currentEditTask.timeStr || new Date().toISOString(),
                localTime: currentEditTask.timeStr || formatDate(new Date(new Date().getTime() + 8*3600000))
            };
            multiGpxStack[stackIdx].waypoints.push(addedWptRef);
        }
        runBehavior(false, { lat, lng: lon });
    },
        undo: () => {
            let restorePos = { lat, lng: lon };
            if (isEditing) {
                const targetWpt = multiGpxStack[stackIdx].waypoints[existingIdx];
                targetWpt.name = oldWptSnapshot.name;
                targetWpt.ele = oldWptSnapshot.ele;
                restorePos = { lat: targetWpt.lat, lng: targetWpt.lon };
                
                currentEditTask.lat = targetWpt.lat;
                currentEditTask.lon = targetWpt.lon;
            } else {
                const idx = multiGpxStack[stackIdx].waypoints.indexOf(addedWptRef);
                if (idx > -1) multiGpxStack[stackIdx].waypoints.splice(idx, 1);
            }
            runBehavior(true, restorePos);
        }
    });

    const modal = document.getElementById('wptEditModal');
    if (modal) modal.style.display = 'none';
}


window.deleteWaypoint = function(idx, backToEdit = null) {
    
    const confirmMsg = `此動作可透過復原按鈕還原。<br>您確定要刪除此航點？`;

    
    window.showAppConfirm(
        "刪除航點確認", 
        confirmMsg,    
        function() {   
            executeDelete(idx);
            if (typeof updateSelectedCount === 'function') updateSelectedCount();
        }, 
        function() {   
            if (backToEdit && typeof window.handleWptEdit === 'function') {
                const t = backToEdit.task; 
                const d = backToEdit.data; 
                setTimeout(() => {
                    window.handleWptEdit(
                        t.existingIdx, t.lat, t.lon, d.ele, d.name, t.timeStr, t.originalIdx
                    );
                }, 50);
            }
        }, 
        "確定刪除"     
    );
};


function executeDelete(idx) {
    const stackIdx = (typeof window.currentMultiIndex !== 'undefined') ? window.currentMultiIndex : 0;
    const currentStackItem = multiGpxStack[stackIdx];
    if (!currentStackItem || !currentStackItem.waypoints) return;

    
    const oldWpts = JSON.parse(JSON.stringify(currentStackItem.waypoints));
    const target = oldWpts[idx];
    if (!target) return;

    
    const targetPos = { lat: target.lat, lng: target.lon };

    

    historyManager.execute({
        do: () => {
            
            
            
            currentStackItem.waypoints = currentStackItem.waypoints.filter(w => {
                return !(w.name === target.name && w.lat === target.lat && w.lon === target.lon);
            });

            if (typeof allTracks !== 'undefined') {
                allTracks.forEach(track => { track.waypoints = currentStackItem.waypoints; });
            }

            
            refreshUI();
        },
        undo: () => {
			    
			    
			    
			    const restoredWpts = JSON.parse(JSON.stringify(oldWpts));
			    currentStackItem.waypoints = restoredWpts;
			    
			    
			    if (typeof allTracks !== 'undefined') {
			        allTracks.forEach(track => { 
			            track.waypoints = restoredWpts; 
			        });
			    }
			
			    
			    if (typeof wptMarkers !== 'undefined') {
			        wptMarkers.forEach(m => { if (m && map.hasLayer(m)) map.removeLayer(m); });
			        wptMarkers = [];
			    }
			
			    
			    refreshUI({ lat: target.lat, lng: target.lon });
			}
    });

					function refreshUI(focusPos = null) {
					    const activeIdx = window.currentActiveIndex || 0;
					    const stackIdx = (typeof window.currentMultiIndex !== 'undefined') ? window.currentMultiIndex : 0;
					    
					    
					    if (typeof wptMarkers !== 'undefined') {
					        wptMarkers.forEach(m => { if (m && map.hasLayer(m)) map.removeLayer(m); });
					        wptMarkers = []; 
					    }
					    if (window.wptLayer) window.wptLayer.clearLayers();
					
					    
					    if (window.multiGpxStack && window.multiGpxStack[stackIdx]) {
					        
					        if (typeof allTracks !== 'undefined') {
					            allTracks[activeIdx].waypoints = window.multiGpxStack[stackIdx].waypoints;
					        }
					    }
					
					    
					    if (typeof loadRoute === 'function') {
					        loadRoute(activeIdx, null, focusPos); 
					    }
					
					    
					    
					    if (typeof renderWaypointsAndPeaks === 'function') {
					        renderWaypointsAndPeaks(allTracks[activeIdx]);
					    }
					    
					    if (typeof updateWptTable === 'function') {
					        updateWptTable(); 
					    }
					}
}


window.downloadCounters = window.downloadCounters || {};

window.exportGpx = function(index) {
    const idx = (index !== undefined) ? index : (window.currentMultiIndex || 0);
    const item = (typeof multiGpxStack !== 'undefined') ? multiGpxStack[idx] : null;
    const routeSelect = document.getElementById("routeSelect");
    let activeIdx = parseInt(routeSelect?.value) || 0;
    
    let currentRoute = (typeof allTracks !== 'undefined' && allTracks[activeIdx]) ? allTracks[activeIdx] : item;

    if (!currentRoute && typeof allWpts !== 'undefined' && allWpts.length > 0) {
        currentRoute = {
            name: "New_Waypoints",
            points: [],
            waypoints: allWpts,
            isCustomExport: true
        };
    }

    if (!currentRoute) return alert("找不到可匯出的資料");

    const escapeXml = (unsafe) => {
        if (!unsafe) return "";
        return unsafe.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    };

    const formatIsoTime = (timeStr) => {
        if (!timeStr) return null;
        let formatted = timeStr.trim().replace(/\s+/g, 'T');
        if (!formatted.includes('Z') && !formatted.includes('+')) {
            formatted += 'Z';
        }
        return formatted;
    };

    const toTwDate = (timeStr) => {
        if (!timeStr) return null;
        const d = new Date(timeStr);
        if (isNaN(d.getTime())) return null; 
        const twTime = new Date(d.getTime() + (8 * 60 * 60 * 1000));
        return twTime.toISOString().split('T')[0];
    };

    const hasPoints = currentRoute.points && currentRoute.points.length > 0;
    const targetDate = hasPoints ? toTwDate(currentRoute.points[0].time) : null;
    const trackName = escapeXml(currentRoute.name || "Exported_Route");

    
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.0" creator="YCHiking" 
  xmlns="http://www.topografix.com/GPX/1/0"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata><name>${trackName}</name></metadata>`;

    let finalWpts = [];

    const seenWpts = new Set();

    const isMultiRoute = routeSelect && routeSelect.options.length > 1;

    if (isMultiRoute) {
        const rawWpts = (currentRoute.waypoints && currentRoute.waypoints.length > 0) 
                        ? currentRoute.waypoints 
                        : (typeof allWpts !== 'undefined' ? allWpts : []);

        rawWpts.forEach(w => {

            const wptKey = `${w.lat}_${w.lon}_${w.name || ''}_${w.time || ''}`;
            if (seenWpts.has(wptKey)) return; 

            let shouldInclude = false;
            if (!hasPoints || currentRoute.isCombined || currentRoute.isCustomExport) {
                shouldInclude = true;
            } else {
                if (w.isCustom || w.belongsToRoute !== undefined) {
                    if (w.belongsToRoute === activeIdx) shouldInclude = true;
                } else {
                    const wptTwDate = toTwDate(w.time);
                    if (targetDate && wptTwDate === targetDate) {
                        shouldInclude = true;
                    } else if (!w.time) {
                        shouldInclude = true;
                    } else if (!targetDate) {
                        shouldInclude = true;
                    }
                }
            }

            if (shouldInclude) {
                finalWpts.push(w);
                seenWpts.add(wptKey); 
            }
        });
    } else {
         const rawSource = (typeof allWpts !== 'undefined' && allWpts.length > 0) ? allWpts : (currentRoute.waypoints || []);
        
        rawSource.forEach(w => {
            const wptKey = `${w.lat}_${w.lon}_${w.name || ''}_${w.time || ''}`;
            if (!seenWpts.has(wptKey)) {
                finalWpts.push(w);
                seenWpts.add(wptKey);
            }
        });
    }

    finalWpts.forEach(w => {
        const name = escapeXml(w.name || "WayPoint");
        const safeTime = formatIsoTime(w.time); 
        const lat = isMultiRoute ? Number(w.lat).toFixed(6) : w.lat;
        const lon = isMultiRoute ? Number(w.lon).toFixed(6) : w.lon;
        
        gpx += `\n  <wpt lat="${lat}" lon="${lon}">`;
        if (w.ele !== undefined) gpx += `\n    <ele>${Number(w.ele).toFixed(2)}</ele>`;
        gpx += `\n    <name>${name}</name>`;
        if (safeTime) gpx += `\n    <time>${safeTime}</time>`;
        gpx += `\n  </wpt>`;
    });

    let tracksToExport = currentRoute.isCombined ? allTracks.filter(t => !t.isCombined) : [currentRoute];
    tracksToExport.forEach(route => {
        if (route.points?.length > 0) {
            const trkName = escapeXml(route.name || "Track");
            gpx += `\n  <trk>\n    <name>${trkName}</name>\n    <trkseg>`;
            route.points.forEach(p => {
                const safePTime = formatIsoTime(p.time); 
                const pLat = isMultiRoute ? Number(p.lat).toFixed(6) : p.lat;
                const pLon = isMultiRoute ? Number(p.lon).toFixed(6) : p.lon;
                
                gpx += `\n      <trkpt lat="${pLat}" lon="${pLon}">`;
                if (p.ele !== undefined) gpx += `<ele>${Number(p.ele).toFixed(2)}</ele>`;
                if (safePTime) gpx += `<time>${safePTime}</time>`;
                gpx += `</trkpt>`;
            });
            gpx += `\n    </trkseg>\n  </trk>`;
        }
    });

    gpx += `\n</gpx>`;

    const blob = new Blob([gpx], { type: 'application/gpx+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${trackName.replace(/ /g, '_')}.gpx`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
};

window.renameSubRoute = function(idx) {
    const targetRoute = allTracks[idx];
    if (!targetRoute) return;

    const modal = document.getElementById('renameModal');
    const input = document.getElementById('modalRouteName');
    const confirmBtn = document.getElementById('modalRouteConfirm');
    if (!modal || !input || !confirmBtn) return;

    const oldName = targetRoute.name;
    input.value = oldName;
    modal.style.display = 'flex';

    setTimeout(() => { input.focus(); input.select(); }, 100);

    const closeModal = () => {
        modal.style.display = 'none';
        window.removeEventListener('keydown', handleEscKey);
        input.removeEventListener('keydown', handleEnterKey);
    };

    const handleConfirm = () => {
        const newName = input.value.trim();
        if (newName !== "" && newName !== oldName) {
            const fileName = window.currentFileNameForDisplay || "default";
            const fileKey = fileName + "_" + idx;

            if (!window.customNameCache) window.customNameCache = {};
            window.customNameCache[fileKey] = newName; 

            targetRoute.name = newName;

            const routeSelect = document.getElementById("routeSelect");
            if (routeSelect && routeSelect.options[idx]) {
                routeSelect.options[idx].text = newName;
            }

            renderRouteInfo();
        }
        closeModal();
    };

    const handleEnterKey = (e) => {
        if (e.key === "Enter") {
            e.preventDefault(); 
            handleConfirm();
        }
    };

    const handleEscKey = (e) => { if (e.key === "Escape") closeModal(); };

    window.addEventListener('keydown', handleEscKey);
    input.addEventListener('keydown', handleEnterKey);

    confirmBtn.onclick = handleConfirm;
};

const searchControl = L.control({ position: 'topright' });

searchControl.onAdd = function() {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    container.innerHTML = `
        <a href="#" title="搜尋地點" style="background-color: white; width: 35px; height: 35px; display: flex; align-items: center; justify-content: center; text-decoration: none; color: #333;">
            <span class="material-icons" style="font-size: 22px;">search</span>
        </a>
    `;

    L.DomEvent.disableClickPropagation(container);

    container.onclick = function(e) {
        e.preventDefault();
        const modal = document.getElementById('searchModal');
        const input = document.getElementById('searchInput');
        
        modal.style.display = 'flex';
        input.value = ""; 

        
        setTimeout(() => {
            input.focus();
            input.select();
        }, 100);

        
        window.addEventListener('keydown', handleSearchEsc);
    };

    return container;
};

searchControl.addTo(map);


function closeSearchModal() {
    const modal = document.getElementById('searchModal');
    const suggestionBox = document.getElementById('searchSuggestions');
    modal.style.display = 'none';
    if (suggestionBox) suggestionBox.style.display = 'none';
    
    
    window.removeEventListener('keydown', handleSearchEsc);
}


function handleSearchEsc(e) {
    if (e.key === "Escape") {
        closeSearchModal();
    }
}



const searchConfirmBtn = document.getElementById('searchConfirmBtn');
const searchInput = document.getElementById('searchInput');
const searchStatus = document.getElementById('searchStatus');


let suggestionBox = document.getElementById('searchSuggestions');
if (!suggestionBox) {
    suggestionBox = document.createElement('div');
    suggestionBox.id = 'searchSuggestions';
    suggestionBox.style.cssText = "position:absolute; background:white; width:100%; border:1px solid #ccc; z-index:10000; display:none; max-height:200px; overflow-y:auto; box-shadow:0 2px 4px rgba(0,0,0,0.2);";
    searchInput.parentNode.style.position = 'relative';
    searchInput.parentNode.appendChild(suggestionBox);
}


let debounceTimer;
searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = searchInput.value.trim();
    if (query.length < 2) {
        suggestionBox.style.display = 'none';
        return;
    }
    debounceTimer = setTimeout(() => {
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`)
            .then(res => res.json())
            .then(data => renderSuggestions(data));
    }, 400);
});

function renderSuggestions(data) {
    suggestionBox.innerHTML = '';
    if (data.length === 0) {
        suggestionBox.style.display = 'none';
        return;
    }
    data.forEach(item => {
        const div = document.createElement('div');
        
        div.style.cssText = `
            padding: 10px 12px; 
            cursor: pointer; 
            border-bottom: 1px solid #eee; 
            font-size: 15px !important; 
            line-height: 1.4 !important;
            color: #333; 
            background: white;
        `;
        div.innerText = item.display_name;
        div.onmouseover = () => div.style.background = '#f0f0f0';
        div.onmouseout = () => div.style.background = 'white';
        div.onclick = () => {
            searchInput.value = item.display_name;
            suggestionBox.style.display = 'none';
            handleSearchResult(item); 
        };
        suggestionBox.appendChild(div);
    });
    suggestionBox.style.display = 'block';
}


function handleSearchResult(result) {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    const addressArray = result.display_name.split(', ');
    const placeTitle = addressArray[0];
    const fullAddress = addressArray.slice(1).join(', ');

    let foundWptIdx = -1;
    const activeIdx = window.currentActiveIndex || 0;
    const currentGpx = (window.allTracks && window.allTracks[activeIdx]) ? window.allTracks[activeIdx] : null;

    if (currentGpx && currentGpx.waypoints) {
        foundWptIdx = currentGpx.waypoints.findIndex(w => 
            Math.abs(w.lat - lat) < 0.0001 && Math.abs(w.lon - lon) < 0.0001
        );
    }

    map.setView([lat, lon], 14);

    if (foundWptIdx !== -1) {
        showCustomPopup(foundWptIdx, placeTitle, null, lat, lon);
    } else {
        showFreeClickPopup(L.latLng(lat, lon), placeTitle, fullAddress);
    }

    
    closeSearchModal();
    searchStatus.innerText = "輸入關鍵字後按下搜尋。";
    searchStatus.style.color = "#666";
}

function performSearch() {
    const query = searchInput.value.trim();
    if (!query) return;
    searchStatus.innerText = "搜尋中...";
    searchStatus.style.color = "#1a73e8";
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(data => {
            if (data && data.length > 0) handleSearchResult(data[0]);
            else {
                searchStatus.innerText = "找不到該地點，請嘗試其他關鍵字";
                searchStatus.style.color = "#e74c3c";
            }
        })
        .catch(err => {
            searchStatus.innerText = "連線發生錯誤，請稍後再試";
            searchStatus.style.color = "#e74c3c";
        });
}


document.addEventListener('click', (e) => {
    if (e.target !== searchInput) suggestionBox.style.display = 'none';
});

searchConfirmBtn.onclick = performSearch;
searchInput.onkeydown = function(e) {
    if (e.key === "Enter") performSearch();
};


function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}


function refreshTopMenu() {
    const routeSelect = document.getElementById("routeSelect");
    if (!routeSelect) return;
    
    routeSelect.innerHTML = ""; 
    multiGpxStack.forEach((gpx, i) => {
        const opt = document.createElement("option");
        opt.value = i;
        opt.textContent = gpx.name;
        routeSelect.appendChild(opt);
    });
    
    
    const container = document.getElementById("routeSelectContainer");
    if (container) container.style.display = "block";
}


function updateRouteSelectDropdown() {
    const routeSelect = document.getElementById("routeSelect");
    if (!routeSelect || !window.multiGpxStack) return;

    
    
    const activeIndex = routeSelect.value !== "" ? parseInt(routeSelect.value) : (window.currentMultiIndex || 0);

    const fileName = window.currentFileNameForDisplay || "default";

    routeSelect.innerHTML = "";

    window.multiGpxStack.forEach((gpx, i) => {
        const opt = document.createElement("option");
        opt.value = i;

        const fileKey = fileName + "_" + i;
        const cachedName = (window.customNameCache) ? window.customNameCache[fileKey] : null;
        
        
        opt.textContent = cachedName || gpx.name || fileName;

        
        if (i === activeIndex) {
            opt.selected = true;
        }
        
        routeSelect.appendChild(opt);
    });
}

function syncCombinedWaypoints(oldName, oldLatLng, oldTime, updateFn) {
    if (window.multiGpxStack) {
        window.multiGpxStack.forEach(item => {
            if (item.waypoints) {
                item.waypoints.forEach(wpt => {
                    if (wpt.name === oldName && 
                        Math.abs(wpt.lat - oldLatLng.lat) < 0.0001 && 
                        Math.abs(wpt.lon - oldLatLng.lng) < 0.0001) {
                        updateFn(wpt);
                    }
                });
            }
        });
    }
}


function updateRawGpxContent(name, oldLatLng, newLat, newLon) {
    const stackIdx = (window.currentMultiIndex !== undefined) ? window.currentMultiIndex : 0;
    const item = multiGpxStack[stackIdx];
    if (!item || !item.content) return;

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(item.content, "application/xml");
    const wpts = xmlDoc.getElementsByTagName("wpt");

    
    for (let i = wpts.length - 1; i >= 0; i--) {
        const wName = wpts[i].getElementsByTagName("name")[0]?.textContent;
        const wLat = parseFloat(wpts[i].getAttribute("lat"));
        const wLon = parseFloat(wpts[i].getAttribute("lon"));

        if (wName === name && 
            Math.abs(wLat - oldLatLng.lat) < 0.0001 && 
            Math.abs(wLon - oldLatLng.lng) < 0.0001) {
            
            if (newLat === null) {
                
                wpts[i].parentNode.removeChild(wpts[i]);
            } else {
                
                wpts[i].setAttribute("lat", newLat.toFixed(6));
                wpts[i].setAttribute("lon", newLon.toFixed(6));
            }
            
            break; 
        }
    }
    item.content = new XMLSerializer().serializeToString(xmlDoc);
}

window.focusWaypointWithLog = function(originalIdx, name) {
    const stackIdx = (window.currentMultiIndex !== undefined) ? window.currentMultiIndex : 0;
    const wpt = multiGpxStack[stackIdx].waypoints[originalIdx];

    if (wpt) {
        window.focusWaypoint(wpt.lat, wpt.lon, wpt.name, 0, wpt.ele);
    } else {

    }
};


window.handleWptEditByIndex = function(originalIdx) {
    const stackIdx = (window.currentMultiIndex !== undefined) ? window.currentMultiIndex : 0;
    const wpt = multiGpxStack[stackIdx].waypoints[originalIdx];
    if (wpt) {
        handleWptEdit(originalIdx, wpt.lat, wpt.lon, wpt.ele, wpt.name, wpt.localTime);
    }
};

window.deleteSelectedWaypoints = function() {
    const checked = document.querySelectorAll('.wpt-checkbox:checked');
    if (checked.length === 0) {
        alert("請先勾選要刪除的航點");
        return;
    }

    const modal = document.getElementById('deleteConfirmModal');
    if (!modal) return;

    const pTag = modal.querySelector('p');
    if (pTag) pTag.innerHTML = `您確定要刪除這 ${checked.length} 個選取的航點？`;

    const confirmBtn = document.getElementById('modalDeleteConfirm');
    const cancelBtn = document.getElementById('modalDeleteCancel');

    const closeModal = () => {
        modal.style.display = 'none';
        window.removeEventListener('keydown', handleKeydown);
    };

    const handleKeydown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            confirmBtn.click();
        } else if (e.key === "Escape") {
            cancelBtn.click();
        }
    };

    modal.style.display = 'flex';
    window.addEventListener('keydown', handleKeydown);

    confirmBtn.onclick = function() {
        const stackIdx = (typeof window.currentMultiIndex !== 'undefined') ? window.currentMultiIndex : 0;
        const currentStackItem = multiGpxStack[stackIdx];
        if (!currentStackItem || !currentStackItem.waypoints) return;

        const oldWpts = JSON.parse(JSON.stringify(currentStackItem.waypoints));
        const indices = Array.from(checked)
            .map(cb => parseInt(cb.getAttribute('data-idx')))
            .sort((a, b) => b - a);

        historyManager.execute({
            
            fileIdx: stackIdx, 
            do: () => {
                indices.forEach(idx => {
                    const target = currentStackItem.waypoints[idx];
                    if (target) {
                        updateRawGpxContent(target.name, { lat: target.lat, lng: target.lon }, null, null);
                        currentStackItem.waypoints = currentStackItem.waypoints.filter(w => {
                            return !(w.name === target.name && w.lat === target.lat && w.lon === target.lon);
                        });
                    }
                });

                if (typeof allTracks !== 'undefined' && Array.isArray(allTracks)) {
                    allTracks.forEach(track => { track.waypoints = currentStackItem.waypoints; });
                }

                if (typeof currentPopup !== 'undefined' && currentPopup) map.closePopup();
                map.eachLayer(layer => {
                    if (layer instanceof L.CircleMarker && layer.options.radius === 7) map.removeLayer(layer);
                });

                if (typeof renderWaypointsAndPeaks === 'function') {
                    renderWaypointsAndPeaks(allTracks[window.currentActiveIndex || 0]);
                }
                if (typeof loadRoute === 'function') {
                    loadRoute(window.currentActiveIndex || 0);
                }
                if (typeof updateSelectedCount === 'function') updateSelectedCount();
            },
            undo: () => {
                currentStackItem.waypoints = oldWpts;
                if (allTracks) allTracks.forEach(track => { track.waypoints = oldWpts; });

                if (typeof renderWaypointsAndPeaks === 'function') {
                    renderWaypointsAndPeaks(allTracks[window.currentActiveIndex || 0]);
                }
                if (typeof loadRoute === 'function') {
                    loadRoute(window.currentActiveIndex || 0);
                }
                if (typeof updateSelectedCount === 'function') updateSelectedCount();
            }
        });

        const selectAll = document.getElementById('selectAllWpts');
        if (selectAll) selectAll.checked = false;
        closeModal();
    };

    cancelBtn.onclick = closeModal;
};

window.updateSelectedCount = function() {
    
    const container = document.getElementById('wptTableBody');
    const checkedCount = container ? container.querySelectorAll('.wpt-checkbox:checked').length : 0;
    
    const countLabel = document.getElementById('selectedCount');
    if (countLabel) {
        countLabel.textContent = `已選取 ${checkedCount} 項`;
        countLabel.style.color = checkedCount > 0 ? "#1a73e8" : "#666";
    }
};


window.toggleSelectAll = function(source) {
    
    const container = document.getElementById('wptTableBody');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('.wpt-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = source.checked;
    });
    updateSelectedCount();
};

window.initWptSortable = function() {
    const el = document.getElementById('wptTableBody');
    if (!el) {
          return;
    }

    
    if (window.wptSortableInstance) {
        window.wptSortableInstance.destroy();
    }

    window.wptSortableInstance = Sortable.create(el, {
        handle: '.drag-handle', 
        animation: 150,
        forceFallback: true,   
        fallbackClass: "sortable-fallback",
        ghostClass: 'sortable-ghost',
        onStart: function() {
         },
        onEnd: function() {
            const stackIdx = (typeof window.currentMultiIndex !== 'undefined') ? window.currentMultiIndex : 0;
            const item = multiGpxStack[stackIdx];
            
            
            const newOrderIndices = Array.from(el.children).map(row => parseInt(row.getAttribute('data-idx')));

            
            const reorderedWpts = newOrderIndices.map(idx => item.waypoints[idx]);
            item.waypoints = reorderedWpts;

            if (typeof allTracks !== 'undefined') {
                allTracks.forEach(track => { track.waypoints = item.waypoints; });
            }

            
            rebuildXmlFromWaypoints(item);

            
            renderWaypointsAndPeaks(allTracks[window.currentActiveIndex || 0]);
        }
    });
};

function rebuildXmlFromWaypoints(item) {
    if (!item || !item.content) {
        return;
    }

    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(item.content, "application/xml");
        const root = xmlDoc.documentElement;
        
        
        const oldWpts = xmlDoc.getElementsByTagName("wpt");
        
        while (oldWpts.length > 0) {
            oldWpts[0].parentNode.removeChild(oldWpts[0]);
        }

        
        item.waypoints.forEach(wpt => {
            const newWpt = xmlDoc.createElement("wpt");
            newWpt.setAttribute("lat", wpt.lat.toFixed(6));
            newWpt.setAttribute("lon", wpt.lon.toFixed(6));
            
            
            const nameNode = xmlDoc.createElement("name");
            nameNode.textContent = wpt.name || "未命名航點";
            newWpt.appendChild(nameNode);
            
            
            if (wpt.ele !== undefined && wpt.ele !== null) {
                const eleNode = xmlDoc.createElement("ele");
                eleNode.textContent = wpt.ele;
                newWpt.appendChild(eleNode);
            }
            
            
            if (wpt.time) {
                const timeNode = xmlDoc.createElement("time");
                timeNode.textContent = wpt.time;
                newWpt.appendChild(timeNode);
            }

            
            root.appendChild(newWpt);
        });

        
        const serializer = new XMLSerializer();
        item.content = serializer.serializeToString(xmlDoc);
    } catch (error) {
 
    }
}

function updateXmlTrackName(stackIdx, oldName, newName) {
    
    if (window.multiGpxStack && window.multiGpxStack[stackIdx]) {
        window.multiGpxStack[stackIdx].name = newName;
        
        if (!window.multiGpxStack[stackIdx].customRouteNames) {
            window.multiGpxStack[stackIdx].customRouteNames = {};
        }
        window.multiGpxStack[stackIdx].customRouteNames[stackIdx] = newName;
    }

    
    if (window.allTracks) {
        window.allTracks.forEach(t => {
            if (t.name === oldName || t.isCombined) {
                t.name = newName;
            }
        });
    }

    
    const item = window.multiGpxStack[stackIdx];
    const parser = new DOMParser();
    const serializer = new XMLSerializer();

    for (let key in item) {
        if (typeof item[key] === 'string' && item[key].includes('<gpx')) {
            const xmlDoc = parser.parseFromString(item[key], "application/xml");
            
            
            const trks = xmlDoc.getElementsByTagName("trk");
            if (trks.length > 0) {
                for (let i = 0; i < trks.length; i++) {
                    const trkNames = trks[i].getElementsByTagName("name");
                    if (trkNames.length > 0) {
                        trkNames[0].textContent = newName;
                    }
                }
            } else {
                
                const metaNames = xmlDoc.getElementsByTagName("metadata");
                if (metaNames.length > 0) {
                    const n = metaNames[0].getElementsByTagName("name");
                    if (n.length > 0) n[0].textContent = newName;
                }
            }
            
            
            item[key] = serializer.serializeToString(xmlDoc);
        }
    }
}

let isWptDragging = false;
let wptDragTargetState = true;
let wptDragStartPos = -1;
let wptInitialStates = [];

window.initWptDragSelect = function() {
    const tableBody = document.getElementById("wptTableBody");
    if (!tableBody) return;

    tableBody.onmousedown = null;
    tableBody.onmouseover = null;
    tableBody.ontouchstart = null;

    const handleStart = (e) => {
        const target = e.target;
        const row = target.closest('tr');
        if (!row) return;

        const checkbox = row.querySelector('.wpt-checkbox');
        const td = target.closest('td');

        if (checkbox && td && td.contains(checkbox)) {
            isWptDragging = true;
            wptDragStartPos = row.sectionRowIndex;
            const allBoxes = tableBody.querySelectorAll('.wpt-checkbox');
            wptInitialStates = Array.from(allBoxes).map(cb => cb.checked);

            if (e.type === 'mousedown') {
                window.addEventListener('mousemove', handleMove);
                window.addEventListener('mouseup', handleEnd, { once: true });
            } else if (e.type === 'touchstart') {
                window.addEventListener('touchmove', handleMove, { passive: false });
                window.addEventListener('touchend', handleEnd, { once: true });
            }
        }
    };

    const handleMove = (e) => {
        if (!isWptDragging) return;

        let targetRow;
        if (e.type === 'touchmove') {
            const touch = e.touches[0];
            const element = document.elementFromPoint(touch.clientX, touch.clientY);
            targetRow = element ? element.closest('tr') : null;
        } else {
            targetRow = e.target.closest('tr');
        }

        if (targetRow) {
            const currentPos = targetRow.sectionRowIndex;
            const allBoxes = tableBody.querySelectorAll('.wpt-checkbox');

            if (wptDragStartPos !== -1) {
                wptDragTargetState = allBoxes[wptDragStartPos].checked;
            }

            const start = Math.min(wptDragStartPos, currentPos);
            const end = Math.max(wptDragStartPos, currentPos);

            allBoxes.forEach((cb, i) => {
                if (i >= start && i <= end) {
                    cb.checked = wptDragTargetState;
                } else {
                    cb.checked = wptInitialStates[i];
                }
            });

            if (typeof updateSelectedCount === 'function') updateSelectedCount();
            if (e.type === 'touchmove') e.preventDefault();
        }
    };

    const handleEnd = () => {
        isWptDragging = false;
        wptDragStartPos = -1;
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('touchmove', handleMove);
        
        setTimeout(() => {
            if (typeof updateSelectedCount === 'function') updateSelectedCount();
        }, 50);
    };

    tableBody.removeEventListener('mousedown', handleStart);
    tableBody.addEventListener('mousedown', handleStart);
    tableBody.removeEventListener('touchstart', handleStart);
    tableBody.addEventListener('touchstart', handleStart, { passive: true });
};

class HistoryManager {
    constructor() {
        this.undoStack = [];
        this.redoStack = [];
    }

    clear() {
        this.undoStack = [];
        this.redoStack = [];
        this.clearMapMarkers();
        this.updateUI();
    }

    getBtnState(type) {
    const hasItems = type === 'undo' ? this.undoStack.length > 0 : this.redoStack.length > 0;
    return {
        color: hasItems ? "#1a73e8" : "#ccc",     
        opacity: hasItems ? "1" : "0.5",          
        cursor: hasItems ? "pointer" : "default",
        disabled: !hasItems                        
    };
}

    execute(command) {
        command.do();
        this.undoStack.push(command);
        this.redoStack = [];
        this.updateUI();
    }

    undo() {
        if (this.undoStack.length === 0) return;
        
        this.clearMapMarkers(); 
        const command = this.undoStack.pop();
        command.undo();
        this.redoStack.push(command);
        this.updateUI();
        
    }

    redo() {
        if (this.redoStack.length === 0) return;
        this.clearMapMarkers();
        const command = this.redoStack.pop();
        command.do();
        this.undoStack.push(command);
        this.updateUI();
    }

    clearMapMarkers() {
        if (typeof map === 'undefined') return;
        let count = 0;
        if (window.activeFocusCircle && map.hasLayer(window.activeFocusCircle)) {
            map.removeLayer(window.activeFocusCircle);
            window.activeFocusCircle = null;
        }
        map.eachLayer(layer => {
            if (layer instanceof L.CircleMarker && layer.options.radius === 7) {
                map.removeLayer(layer);
                count++;
            }
        });
        if (window.wptLayer) window.wptLayer.clearLayers();
        
    }

    updateUI() {
    const u = this.getBtnState('undo');
    const r = this.getBtnState('redo');
    const ub = document.getElementById('undoBtn');
    const rb = document.getElementById('redoBtn');

    
    
    

    if (ub) {
        if (u.isDisabled) {
            ub.setAttribute('disabled', 'disabled');
        } else {
            ub.removeAttribute('disabled');
        }
        ub.style.setProperty('color', u.color, 'important');
        ub.style.setProperty('opacity', u.opacity, 'important');
        
        
        
    } else {
 
    }

    if (rb) {
        if (r.isDisabled) {
            rb.setAttribute('disabled', 'disabled');
        } else {
            rb.removeAttribute('disabled');
        }
        rb.style.setProperty('color', r.color, 'important');
        rb.style.setProperty('opacity', r.opacity, 'important');
    }

    
    const wb = document.getElementById('sideWptNameBtn');
    if (wb) {
        const isActive = (typeof showWptNameAlways !== 'undefined' && showWptNameAlways);
        wb.style.setProperty('background', isActive ? "#1a73e8" : "white", 'important');
        wb.style.setProperty('color', isActive ? "white" : "#5f6368", 'important');
        const icon = wb.querySelector('.material-icons');
        if (icon) icon.innerText = isActive ? "visibility" : "visibility_off";
    }
}
}

const historyManager = new HistoryManager();


document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        historyManager.undo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        historyManager.redo();
    }
});

window.restoreAndJump = async function(targetId) {
    
    if (document.fullscreenElement || document.body.classList.contains('iphone-fullscreen')) {
        
        
        if (document.fullscreenElement) {
            await document.exitFullscreen();
        } else {
            
            document.body.classList.remove('iphone-fullscreen');
        }

        
        setTimeout(() => {
            const target = document.getElementById(targetId);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
        
    } else {
        
        const target = document.getElementById(targetId);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
    }
};



if (typeof window.routeSelectOriginalParent === 'undefined') {
    window.routeSelectOriginalParent = document.getElementById('routeSelectContainer').parentElement;
}



window.showAppConfirm = function(title, message, onConfirm, onCancel, btnText = "確定") {
    const modal = document.getElementById('deleteConfirmModal');
    if (!modal) return;

    const h3Tag = modal.querySelector('h3');
    if (h3Tag) h3Tag.innerText = title;

    const pTag = modal.querySelector('p');
    if (pTag) pTag.innerHTML = message;

    const confirmBtn = document.getElementById('modalDeleteConfirm');
    if (confirmBtn) confirmBtn.innerText = btnText; 

    modal.style.display = 'flex';
    L.DomEvent.disableClickPropagation(modal);

    confirmBtn.onclick = function() {
        modal.style.display = 'none';
        if (onConfirm) onConfirm();
    };

    document.getElementById('modalDeleteCancel').onclick = function() {
        modal.style.display = 'none';
        if (onCancel) onCancel();
    };
};

let _lastFSState = null; 


let routeSelectOriginalParent = null;

function handleFullscreenStateChange() {
    setTimeout(() => {
        const mapContainer = document.getElementById('map');
        const navShortcuts = document.getElementById('navShortcuts');
        const routeSelectContainer = document.getElementById('routeSelectContainer');
        
        const modals = [
            document.getElementById('wptEditModal'),
            document.getElementById('deleteConfirmModal'),
            document.getElementById('renameModal'),
            document.getElementById('coordModal'), 
            document.getElementById('gpxManageModal'),
            document.getElementById('searchModal')
        ];
        const isNowFS = !!(
            document.fullscreenElement || 
            document.webkitFullscreenElement || 
            document.body.classList.contains('iphone-fullscreen')
        );

        
        if (routeSelectContainer) {
            mapContainer.appendChild(routeSelectContainer);
            L.DomEvent.disableClickPropagation(routeSelectContainer);
            const total = (window.allTracks ? window.allTracks.length : 0);
            const stackTotal = (window.multiGpxStack ? window.multiGpxStack.length : 0);
            
            if (total > 1 || stackTotal > 1) {
                routeSelectContainer.style.cssText = `
                    display: block !important;
                    position: absolute !important;
                    top: 15px !important;
                    left: 55px !important;
                    z-index: 2147483645 !important;
                    background: white !important; 
                    padding: 4px 12px !important;
                    border-radius: 20px !important;
                    color: #000000 !important;
                    max-width: 240px !important;
                    font-size: 14px !important; 
                    border: 1px solid rgba(255,255,255,0.3) !important;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.3) !important;
                `;
            }
        }
        
        if (isNowFS) {
            
            modals.forEach(modal => { 
					    if (modal) {
					        mapContainer.appendChild(modal);
					        modal.style.setProperty('z-index', '2147483647', 'important');
					        
					        
					        modal.style.fontSize = "16px";
					        
					        
					        const boldTitles = modal.querySelectorAll('b, h3');
					        boldTitles.forEach(t => t.style.setProperty('font-size', '22px', 'important'));
					        
					        
					        
					        const icons = modal.querySelectorAll('.material-icons');
					        icons.forEach(icon => {
					            
					            icon.style.setProperty('font-size', '32px', 'important'); 
					            icon.style.setProperty('line-height', '1', 'important');
					            
					            
					            const parent = icon.parentElement;
					            
					            if (parent && parent !== modal) {
					                parent.style.setProperty('width', '60px', 'important');
					                parent.style.setProperty('height', '60px', 'important');
					                parent.style.setProperty('display', 'flex', 'important');
					                parent.style.setProperty('align-items', 'center', 'important');
					                parent.style.setProperty('justify-content', 'center', 'important');
					            }
					        });
					
					        
					        const uiElements = modal.querySelectorAll('input, button, select, label, span, p');
					        uiElements.forEach(el => {
					            
					            if (el.classList.contains('material-icons')) return;
					
					            if (el.tagName === 'P' || el.style.fontSize === '10px') {
					                el.style.setProperty('font-size', '14px', 'important'); 
					            } else {
					                el.style.setProperty('font-size', '15px', 'important');
					            }
					        });
					        
					
					        L.DomEvent.disableClickPropagation(modal);
					    }
					});
        } else {
            
            modals.forEach(modal => { 
                if (modal) {
                    document.body.appendChild(modal);
                    modal.style.removeProperty('z-index');
                    
                    
                    modal.style.fontSize = "";
                    const allText = modal.querySelectorAll('b, h3, input, button, select, label, span, p');
                    allText.forEach(el => el.style.removeProperty('font-size'));
                }
            });
        }

        if (typeof renderWaypointsAndPeaks === 'function') {
            renderWaypointsAndPeaks(null, isNowFS);
        }
    }, 150); 
}


document.addEventListener('fullscreenchange', handleFullscreenStateChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenStateChange);


const fsClassObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
            handleFullscreenStateChange();
        }
    });
});
fsClassObserver.observe(document.body, { attributes: true });

function renderSideToolbar() {
    const sideToolbar = document.getElementById('side-toolbar');
    if (!sideToolbar) return;

    
    if (sideToolbar.innerHTML.trim() !== "") {
        updateWptIconStatus(); 
        if (window.historyManager) historyManager.updateUI();
        return;
    }

    
    sideToolbar.innerHTML = `
        <button type="button" id="sideWptNameBtn" class="side-tool-btn" title="顯示/隱藏航點名稱">
            <span class="material-icons" id="sideWptIcon">visibility</span>
        </button>
        <div style="height: 1px; background: rgba(0,0,0,0.1); margin: 2px 5px;"></div>
        <button type="button" id="undoBtn" class="side-tool-btn" title="復原 (Undo)">
            <span class="material-icons">undo</span>
        </button>
        <button type="button" id="redoBtn" class="side-tool-btn" title="重做 (Redo)">
            <span class="material-icons">redo</span>
        </button>
    `;

    const btns = sideToolbar.querySelectorAll('.side-tool-btn');
    btns.forEach(btn => {
        L.DomEvent.disableClickPropagation(btn);
        L.DomEvent.disableScrollPropagation(btn);
    });

    document.getElementById('sideWptNameBtn').onclick = function(e) {
        if (this.classList.contains('disabled')) return;
        toggleWptNames();
    };

    document.getElementById('undoBtn').onclick = () => historyManager.undo();
    document.getElementById('redoBtn').onclick = () => historyManager.redo();

    
    updateWptIconStatus();

    setTimeout(() => {
        if (window.historyManager) historyManager.updateUI();
    }, 50);
}

function updateWptIconStatus() {
    const sideBtn = document.getElementById('sideWptNameBtn');
    if (!sideBtn) return;

    
    
    const wptTableBody = document.getElementById('wptTableBody');
    const hasVisibleWaypoints = wptTableBody && wptTableBody.rows.length > 0;

    if (hasVisibleWaypoints) {
        sideBtn.classList.remove('disabled');
        sideBtn.title = "顯示/隱藏航點名稱";
    } else {
        sideBtn.classList.add('disabled');
        sideBtn.title = "目前無航點可顯示";
    }
}