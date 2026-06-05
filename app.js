
const map = L.map("map", { tap: true }).setView([25.03, 121.56], 12);

map.getContainer().style.touchAction = "none";

document.body.style.overscrollBehavior = "none";


document.addEventListener(
    'touchmove',
    function(e) {

        if (isDrawingMode && isScribbling) {
            e.preventDefault();
        }

    },
    { passive: false }
);

const mapElForContextMenu =
    document.getElementById("map");

if (mapElForContextMenu) {
    mapElForContextMenu.addEventListener(
        "contextmenu",
        function(e) {
            e.preventDefault();
            return false;
        },
        false
    );
}

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

let isDrawingMode = false;
let drawMethod = 'scribble'; // 'click' 或 'scribble'
let isScribbling = false;
let lastScribbleLatLng = null;
let tempDrawPoints = [];
let isPinchingMap = false;
let isCtrlPanningInDrawMode = false;
let ignoreMapClickUntil = 0;

map.on('click', (e) => {
	
		if (
		    window.pdfSuppressMapClickUntil &&
		    Date.now() < window.pdfSuppressMapClickUntil
		) {
		    return;
		}

    if (!e || !e.latlng) return;

    if (window.splitRoutePickMode) {
        if (
            typeof window.executeSplitRoutePick === "function" &&
            window.executeSplitRoutePick(e.latlng)
        ) {
            return;
        }
    }
    
    if (isDrawingMode) {
        if (clickTimeout) {
            clearTimeout(clickTimeout);
            clickTimeout = null;
        }

        if (drawMethod === 'click') {
            addPointToTrack(e.latlng);
        }

        return;
    }

    const clickedRoute =
        typeof window.findClickedRouteByPriority === "function"
            ? window.findClickedRouteByPriority(e.latlng)
            : null;

    
    if (clickedRoute) {
        const clickedFile =
            window.multiGpxStack &&
            window.multiGpxStack[clickedRoute.fileIdx];

        const clickedSubRoute =
            clickedFile &&
            Array.isArray(clickedFile.routes)
                ? clickedFile.routes[clickedRoute.routeIdx]
                : clickedFile;

        if (
            !clickedFile ||
            clickedFile.visible === false ||
            !clickedSubRoute ||
            clickedSubRoute.visible === false
        ) {
            return;
        }

        if (clickTimeout) {
            clearTimeout(clickTimeout);
            clickTimeout = null;
        }

        
        if (
            window.activeFocusCircle &&
            typeof map !== "undefined" &&
            map &&
            typeof map.hasLayer === "function" &&
            map.hasLayer(window.activeFocusCircle)
        ) {
            map.removeLayer(window.activeFocusCircle);
        }

        window.activeFocusCircle =
            null;

        
        if (
            typeof hoverMarker !== "undefined" &&
            hoverMarker &&
            typeof map !== "undefined" &&
            map &&
            typeof map.hasLayer === "function" &&
            map.hasLayer(hoverMarker)
        ) {
            map.removeLayer(hoverMarker);
        }

        hoverMarker =
            null;

        document.querySelectorAll(".wpt-table tr").forEach(function(row) {
            row.classList.remove("wpt-selected-row");
        });

        
        if (clickedRoute.fileIdx !== window.currentMultiIndex) {
            if (typeof switchMultiGpx === "function") {
                switchMultiGpx(clickedRoute.fileIdx);
            } else {
                window.currentMultiIndex =
                    clickedRoute.fileIdx;
            }
        }

        
        window.currentMultiIndex =
            clickedRoute.fileIdx;

        window.currentActiveIndex =
            clickedRoute.routeIdx;

        window.currentToolTarget = {
            type: "route",
            fileIdx: clickedRoute.fileIdx,
            routeIdx: clickedRoute.routeIdx,
            wptIdx: null
        };

        if (typeof syncDrawingGlobals === "function") {
            syncDrawingGlobals(
                clickedFile,
                clickedRoute.routeIdx
            );
        }

        if (typeof updateRouteSelectDropdown === "function") {
            updateRouteSelectDropdown();
        }

        const routeSelect =
            document.getElementById("routeSelect");

        if (routeSelect) {
            routeSelect.value =
                String(clickedRoute.routeIdx);

            routeSelect.selectedIndex =
                clickedRoute.routeIdx;
        }

        
        if (typeof loadRoute === "function") {
            loadRoute(
                clickedRoute.routeIdx,
                null,
                {
                    skipAutoFitBounds: true,
                    preserveChartState: true
                    
                }
            );
        }

        
        if (typeof window.selectRouteWithHalo === "function") {
            window.selectRouteWithHalo(
                clickedRoute.fileIdx,
                clickedRoute.routeIdx,
                clickedSubRoute
            );
        } else {
            
            if (
                window.activeRouteHaloLayer &&
                typeof map !== "undefined" &&
                map &&
                typeof map.hasLayer === "function" &&
                map.hasLayer(window.activeRouteHaloLayer)
            ) {
                map.removeLayer(window.activeRouteHaloLayer);
            }

            window.activeRouteHaloLayer =
                null;

            let haloLatLngs = [];

            if (
                clickedSubRoute &&
                Array.isArray(clickedSubRoute.segments) &&
                clickedSubRoute.segments.length > 0
            ) {
                haloLatLngs =
                    clickedSubRoute.segments;

            } else if (
                clickedSubRoute &&
                Array.isArray(clickedSubRoute.points) &&
                clickedSubRoute.points.length > 0
            ) {
                haloLatLngs = [
                    clickedSubRoute.points
                        .map(function(p) {
                            return [
                                Number(p.lat),
                                Number(p.lon)
                            ];
                        })
                        .filter(function(pt) {
                            return (
                                Number.isFinite(pt[0]) &&
                                Number.isFinite(pt[1])
                            );
                        })
                ];
            }

            if (
                haloLatLngs &&
                haloLatLngs.length > 0
            ) {
                window.activeRouteHaloLayer =
                    L.polyline(
                        haloLatLngs,
                        {
                            color: "#ffffff",
                            weight: 10,
                            opacity: 0.9,
                            interactive: false
                        }
                    ).addTo(map);

                if (
                    window.activeRouteHaloLayer &&
                    typeof window.activeRouteHaloLayer.bringToBack === "function"
                ) {
                    window.activeRouteHaloLayer.bringToBack();
                }

                if (
                    clickedSubRoute &&
                    clickedSubRoute.layer &&
                    typeof clickedSubRoute.layer.bringToFront === "function"
                ) {
                    clickedSubRoute.layer.bringToFront();
                }
            }
        }

        if (typeof renderRouteInfo === "function") {
            renderRouteInfo();
        }

        if (typeof renderMultiGpxButtons === "function") {
            renderMultiGpxButtons();
        }

        if (typeof window.renderRouteToolControl === "function") {
            window.renderRouteToolControl();
        }

        if (typeof window.refreshGpxManagerIfOpen === "function") {
            window.refreshGpxManagerIfOpen();
        }

        return;
    }

    if (e.originalEvent.target.closest('#side-toolbar')) return;

    let closest = null;
    let minD = Infinity;

    if (trackPoints && trackPoints.length > 0) {
        trackPoints.forEach(p => {
            const d = Math.sqrt(
                Math.pow(p.lat - e.latlng.lat, 2) +
                Math.pow(p.lon - e.latlng.lng, 2)
            );

            if (d < minD) {
                minD = d;
                closest = p;
            }
        });
    }

    if (closest && minD * 111000 < 5) {
        if (clickTimeout) clearTimeout(clickTimeout);

        const idx = trackPoints.indexOf(closest);

        if (idx !== -1 && typeof showCustomPopup === 'function') {

            const fileIdxForRouteSelect =
                typeof window.currentMultiIndex === "number"
                    ? window.currentMultiIndex
                    : 0;

            const routeIdxForRouteSelect =
                typeof window.currentActiveIndex === "number"
                    ? window.currentActiveIndex
                    : 0;

            const fileForRouteSelect =
                window.multiGpxStack &&
                window.multiGpxStack[fileIdxForRouteSelect];

            const routeForRouteSelect =
                fileForRouteSelect &&
                Array.isArray(fileForRouteSelect.routes) &&
                fileForRouteSelect.routes[routeIdxForRouteSelect]
                    ? fileForRouteSelect.routes[routeIdxForRouteSelect]
                    : fileForRouteSelect;

            if (typeof window.selectRouteWithHalo === "function") {
                window.selectRouteWithHalo(
                    fileIdxForRouteSelect,
                    routeIdxForRouteSelect,
                    routeForRouteSelect
                );
            }

            window.currentToolTarget = {
                type: "route",
                fileIdx: fileIdxForRouteSelect,
                routeIdx: routeIdxForRouteSelect,
                wptIdx: null
            };

            if (
                window.activeFocusCircle &&
                typeof map !== "undefined" &&
                map &&
                typeof map.hasLayer === "function" &&
                map.hasLayer(window.activeFocusCircle)
            ) {
                map.removeLayer(window.activeFocusCircle);
            }

            window.activeFocusCircle =
                null;

            if (typeof window.renderRouteToolControl === "function") {
                window.renderRouteToolControl();
            }

            showCustomPopup(
                idx,
                "位置資訊",
                null,
                closest.lat,
                closest.lon
            );

            if (hoverMarker) {
                hoverMarker
                    .setLatLng([closest.lat, closest.lon])
                    .addTo(map)
                    .bringToFront();
            }
        }

    } else {

        const fileIdxForDrawClick =
            typeof window.currentMultiIndex === "number"
                ? window.currentMultiIndex
                : 0;

        const routeIdxForDrawClick =
            typeof window.currentActiveIndex === "number"
                ? window.currentActiveIndex
                : 0;

        const currentFileForDrawClick =
            window.multiGpxStack &&
            window.multiGpxStack[fileIdxForDrawClick];

        let routeForDrawClick = null;

        if (
            currentFileForDrawClick &&
            Array.isArray(currentFileForDrawClick.routes) &&
            currentFileForDrawClick.routes[routeIdxForDrawClick]
        ) {
            routeForDrawClick =
                currentFileForDrawClick.routes[routeIdxForDrawClick];

        } else if (
            currentFileForDrawClick &&
            (
                currentFileForDrawClick.isDrawTrack === true ||
                currentFileForDrawClick.isHandDrawRoute === true
            )
        ) {
            routeForDrawClick =
                currentFileForDrawClick;
        }

        if (
            routeForDrawClick &&
            routeForDrawClick.isCombined !== true &&
            Array.isArray(routeForDrawClick.points) &&
            routeForDrawClick.points.length > 1 &&
            typeof map !== "undefined" &&
            map &&
            typeof map.latLngToContainerPoint === "function"
        ) {
            const clickPoint =
                map.latLngToContainerPoint(e.latlng);

            let nearestSegmentDistance =
                Infinity;

            let nearestSegmentIdx =
                -1;

            let nearestProjectedLatLng =
                null;

            let nearestProjectedDistance =
                null;

            for (
                let i = 0;
                i < routeForDrawClick.points.length - 1;
                i++
            ) {
                const p1 =
                    routeForDrawClick.points[i];

                const p2 =
                    routeForDrawClick.points[i + 1];

                if (!p1 || !p2) continue;

                const p1Lat =
                    Number(p1.lat);

                const p1Lon =
                    Number(p1.lon);

                const p2Lat =
                    Number(p2.lat);

                const p2Lon =
                    Number(p2.lon);

                if (
                    !Number.isFinite(p1Lat) ||
                    !Number.isFinite(p1Lon) ||
                    !Number.isFinite(p2Lat) ||
                    !Number.isFinite(p2Lon)
                ) {
                    continue;
                }

                const a =
                    map.latLngToContainerPoint(
                        L.latLng(p1Lat, p1Lon)
                    );

                const b =
                    map.latLngToContainerPoint(
                        L.latLng(p2Lat, p2Lon)
                    );

                const abx =
                    b.x - a.x;

                const aby =
                    b.y - a.y;

                const apx =
                    clickPoint.x - a.x;

                const apy =
                    clickPoint.y - a.y;

                const abLenSq =
                    abx * abx + aby * aby;

                if (abLenSq === 0) continue;

                let t =
                    (apx * abx + apy * aby) / abLenSq;

                t =
                    Math.max(
                        0,
                        Math.min(1, t)
                    );

                const projX =
                    a.x + abx * t;

                const projY =
                    a.y + aby * t;

                const dx =
                    clickPoint.x - projX;

                const dy =
                    clickPoint.y - projY;

                const pixelDist =
                    Math.sqrt(dx * dx + dy * dy);

                if (pixelDist < nearestSegmentDistance) {
                    nearestSegmentDistance =
                        pixelDist;

                    nearestSegmentIdx =
                        i;

                    const projLat =
                        p1Lat + (p2Lat - p1Lat) * t;

                    const projLon =
                        p1Lon + (p2Lon - p1Lon) * t;

                    nearestProjectedLatLng =
                        {
                            lat: projLat,
                            lon: projLon
                        };

                    if (
                        Number.isFinite(Number(p1.distance)) &&
                        Number.isFinite(Number(p2.distance))
                    ) {
                        nearestProjectedDistance =
                            Number(p1.distance) +
                            (
                                Number(p2.distance) -
                                Number(p1.distance)
                            ) * t;
                    } else {
                        nearestProjectedDistance =
                            null;
                    }
                }
            }

            const isTouchDevice =
                "ontouchstart" in window ||
                navigator.maxTouchPoints > 0;

            const maxPixelDistance =
                isTouchDevice
                    ? 40
                    : 26;

            if (
                nearestSegmentIdx > -1 &&
                nearestProjectedLatLng &&
                nearestSegmentDistance <= maxPixelDistance
            ) {
                if (clickTimeout) {
                    clearTimeout(clickTimeout);
                    clickTimeout = null;
                }

                const basePoint =
                    routeForDrawClick.points[nearestSegmentIdx];

                const popupPoint = {
                    lat: nearestProjectedLatLng.lat,
                    lon: nearestProjectedLatLng.lon,
                    ele: basePoint && basePoint.ele !== undefined
                        ? basePoint.ele
                        : 0,
                    time: basePoint ? basePoint.time : null,
                    timeLocal: basePoint ? basePoint.timeLocal : null,
                    distance: nearestProjectedDistance
                };

                let tempIdx =
                    -1;

                if (
                    typeof trackPoints !== "undefined" &&
                    Array.isArray(trackPoints)
                ) {
                    trackPoints.push(popupPoint);
                    tempIdx =
                        trackPoints.length - 1;
                }

                if (typeof window.selectRouteWithHalo === "function") {
                    window.selectRouteWithHalo(
                        fileIdxForDrawClick,
                        routeIdxForDrawClick,
                        routeForDrawClick
                    );
                }

                window.currentToolTarget = {
                    type: "route",
                    fileIdx: fileIdxForDrawClick,
                    routeIdx: routeIdxForDrawClick,
                    wptIdx: null
                };

                if (
                    window.activeFocusCircle &&
                    typeof map !== "undefined" &&
                    map &&
                    typeof map.hasLayer === "function" &&
                    map.hasLayer(window.activeFocusCircle)
                ) {
                    map.removeLayer(window.activeFocusCircle);
                }

                window.activeFocusCircle =
                    null;

                if (typeof window.renderRouteToolControl === "function") {
                    window.renderRouteToolControl();
                }
                
                if (typeof showCustomPopup === "function") {
                    showCustomPopup(
                        tempIdx,
                        "位置資訊",
                        null,
                        nearestProjectedLatLng.lat,
                        nearestProjectedLatLng.lon
                    );
                }

                if (
                    tempIdx > -1 &&
                    Array.isArray(trackPoints)
                ) {
                    trackPoints.splice(tempIdx, 1);
                }

                if (hoverMarker) {
                    hoverMarker
                        .setLatLng([
                            nearestProjectedLatLng.lat,
                            nearestProjectedLatLng.lon
                        ])
                        .addTo(map)
                        .bringToFront();
                }

                return;
            }
        }

        clickTimeout = setTimeout(() => {
            if (typeof showFreeClickPopup === 'function') {
                showFreeClickPopup(e.latlng);
            }
        }, 200);
    }
});

if (!window.routeHoverCursorInstalled) {
    window.routeHoverCursorInstalled = true;

    
    if (!document.getElementById("routeHoverCursorStyle")) {
        const style =
            document.createElement("style");

        style.id =
            "routeHoverCursorStyle";

        style.innerHTML = `
            #map.route-hover-pointer,
            #map.route-hover-pointer *,
            #map.route-hover-pointer .leaflet-interactive {
                cursor: pointer !important;
            }
        `;

        document.head.appendChild(style);
    }

    map.on("mousemove", function(e) {
        if (!e || !e.latlng) return;

        const mapEl =
            document.getElementById("map");

        if (!mapEl) return;

        
        if (
            window.splitRoutePickMode ||
            (
                typeof isDrawingMode !== "undefined" &&
                isDrawingMode
            )
        ) {
            mapEl.classList.remove("route-hover-pointer");
            return;
        }

        const hitRoute =
            typeof window.findClickedRouteByPriority === "function"
                ? window.findClickedRouteByPriority(e.latlng)
                : null;

        
        const canSwitchSubRoute =
            hitRoute &&
            hitRoute.fileIdx === window.currentMultiIndex &&
            hitRoute.routeIdx !== window.currentActiveIndex &&
            hitRoute.route &&
            hitRoute.route.isCombined !== true;

        
        const canSwitchOtherGpx =
            hitRoute &&
            hitRoute.fileIdx !== window.currentMultiIndex;

        if (
            canSwitchSubRoute ||
            canSwitchOtherGpx
        ) {
            mapEl.classList.add("route-hover-pointer");
        } else {
            mapEl.classList.remove("route-hover-pointer");
        }
    });

    map.on("mouseout", function() {
        const mapEl =
            document.getElementById("map");

        if (mapEl) {
            mapEl.classList.remove("route-hover-pointer");
        }
    });
}


function startScribble(latlng, originalEvent = null) {

    if (!isDrawingMode) return;
    if (drawMethod !== 'scribble') return;
    if (!latlng) return;
    
    window.currentToolTarget = {
    type: "route",
    fileIdx:
        typeof window.currentMultiIndex === "number"
            ? window.currentMultiIndex
            : 0,
    routeIdx:
        typeof window.currentActiveIndex === "number"
            ? window.currentActiveIndex
            : 0,
    wptIdx: null
		};
		
		document.querySelectorAll(".wpt-table tr").forEach(function(row) {
		    row.classList.remove("wpt-selected-row");
		});
		
		if (typeof window.renderRouteToolControl === "function") {
		    window.renderRouteToolControl();
		}

		if (
		    originalEvent &&
		    (
		        originalEvent.ctrlKey ||
		        originalEvent.metaKey
		    )
		) {
        isCtrlPanningInDrawMode = true;
        isScribbling = false;
        tempDrawPoints = [];
        lastScribbleLatLng = null;

        if (map && map.dragging) {
            map.dragging.enable();
        }

        return;
    }

    if (
        originalEvent &&
        originalEvent.target &&
        originalEvent.target.closest &&
        (
            originalEvent.target.closest('#side-toolbar') ||
            originalEvent.target.closest('#multiGpxBtnBar') ||
            originalEvent.target.closest('#routeSelectContainer') ||
            originalEvent.target.closest('#map-control-bar') ||
            originalEvent.target.closest('#chartContainer') ||
            originalEvent.target.closest('#wptList')
        )
    ) {
        return;
    }

    if (
        !window.multiGpxStack ||
        window.multiGpxStack.length === 0
    ) {
        ensureCustomDrawTrack();
    }

    const {
        targetTrack,
        routeIdx
    } = getActiveDrawingTarget();

    if (!targetTrack) return;

    window.currentActiveIndex = routeIdx;

    const routeSelect = document.getElementById("routeSelect");
    if (
        routeSelect &&
        routeSelect.options &&
        routeSelect.options.length > routeIdx
    ) {
        routeSelect.value = String(routeIdx);
    }

    isScribbling = true;
    lastScribbleLatLng = latlng;
    tempDrawPoints = [];

    tempDrawPoints.push({
        lat: latlng.lat,
        lon: latlng.lng,
        ele: 0,
        time: new Date().toISOString(),
        timeLocal: formatDate(new Date()),
        distance: 0
    });
}

function moveScribble(latlng) {

    if (isCtrlPanningInDrawMode) return;

    if (!isDrawingMode) return;
    if (!isScribbling) return;
    if (!latlng) return;

    if (!lastScribbleLatLng) {
        lastScribbleLatLng = latlng;
        return;
    }

    const dist = calculateDistance(
        lastScribbleLatLng.lat,
        lastScribbleLatLng.lng,
        latlng.lat,
        latlng.lng
    );

    if (dist < 0.003) return;

    tempDrawPoints.push({
        lat: latlng.lat,
        lon: latlng.lng,
        ele: 0,
        time: new Date().toISOString(),
        timeLocal: formatDate(new Date()),
        distance: 0
    });

    lastScribbleLatLng = latlng;

    const {
        currentFile,
        targetTrack,
        routeIdx
    } = getActiveDrawingTarget();

    if (!targetTrack) return;

    window.currentActiveIndex = routeIdx;

    const previewSegments = [
        [
            ...targetTrack.points.map(p => [p.lat, p.lon]),
            ...tempDrawPoints.map(p => [p.lat, p.lon])
        ]
    ];

    if (
        currentFile &&
        currentFile.isDrawTrack &&
        targetTrack.layer instanceof L.Polyline
    ) {
        targetTrack.layer.setLatLngs(previewSegments);
        targetTrack.layer.setStyle({
            color: targetTrack.color || "#0000FF",
            weight: 6,
            opacity: 1,
            dashArray: null
        });

    } else {

        if (!polyline) {
            polyline = L.polyline([], {
                color: (currentFile && currentFile.color) || "#0000FF",
                weight: 6,
                opacity: 1,
                dashArray: null
            }).addTo(map);
        }

        polyline.setLatLngs(previewSegments);
        polyline.setStyle({
            color: (currentFile && currentFile.color) || "#0000FF",
            weight: 6,
            opacity: 1,
            dashArray: null
        });
        polyline.bringToFront();
    }
}

function finishScribble() {

    if (!isScribbling) return;

    isScribbling = false;
    
    ignoreMapClickUntil = Date.now() + 450;

    if (!tempDrawPoints || tempDrawPoints.length === 0) {
        tempDrawPoints = [];
        return;
    }

    let {
        currentFile,
        targetTrack,
        stackIdx,
        routeIdx,
        targetRouteIdx
    } = getActiveDrawingTarget();

    if (!currentFile || !targetTrack) {
        tempDrawPoints = [];
        return;
    }

    
    if (
        currentFile &&
        targetTrack === currentFile &&
        currentFile.isBlankProject === true
    ) {
        if (!Array.isArray(currentFile.routes)) {
            currentFile.routes = [];
        }

        if (currentFile.routes.length === 0) {
            const firstRouteName =
                currentFile.displayName ||
                currentFile.routeDisplayName ||
                currentFile.name ||
                "自訂路線";

            const firstRoute = {
                id: "draw_route_" + Date.now(),
                name: firstRouteName,
                displayName: firstRouteName,
                routeDisplayName: firstRouteName,
                fileName:
                    currentFile.fileName ||
                    currentFile.name ||
                    firstRouteName + ".gpx",
                color:
                    currentFile.color || "#0000FF",

                points: [],
                segments: [],

                waypoints:
                    currentFile.waypoints || [],

                visible: true,

                isDrawTrack: true,
                isHandDrawRoute: true,
                isCombined: false
            };

            currentFile.routes.push(firstRoute);

            currentFile.isDrawTrack =
                false;

            currentFile.isHandDrawRoute =
                false;

            currentFile.isCombined =
                false;

            targetTrack =
                firstRoute;

            routeIdx =
                0;

            targetRouteIdx =
                0;

            window.currentActiveIndex =
                0;

            window.allTracks =
                currentFile.routes;

            if (typeof allTracks !== "undefined") {
                allTracks =
                    window.allTracks;
            }

            window.trackPoints =
                [];

            try {
                trackPoints =
                    [];
            } catch (err) {}

        } else {
            const safeRouteIdx =
                Math.max(
                    0,
                    Math.min(
                        window.currentActiveIndex || 0,
                        currentFile.routes.length - 1
                    )
                );

            targetTrack =
                currentFile.routes[safeRouteIdx];

            routeIdx =
                safeRouteIdx;

            targetRouteIdx =
                safeRouteIdx;
        }
    }

    if (!Array.isArray(targetTrack.points)) {
        targetTrack.points = [];
    }

    if (!Array.isArray(targetTrack.segments)) {
        targetTrack.segments = [];
    }

    const pointsSnapshot =
        tempDrawPoints.map(function(p) {
            return { ...p };
        });

    const refreshHandDrawHitLayer = function(drawRouteForHit) {
        if (
            !drawRouteForHit ||
            !(
                drawRouteForHit.isDrawTrack === true ||
                drawRouteForHit.isHandDrawRoute === true
            )
        ) {
            return;
        }

        const drawPoints =
            Array.isArray(drawRouteForHit.points)
                ? drawRouteForHit.points
                : [];

        if (drawPoints.length < 2) {
            if (
                drawRouteForHit.hitLayer &&
                typeof map !== "undefined" &&
                map.hasLayer(drawRouteForHit.hitLayer)
            ) {
                map.removeLayer(drawRouteForHit.hitLayer);
            }

            drawRouteForHit.hitLayer =
                null;

            return;
        }

        const hitLatLngs =
            drawPoints.map(function(p) {
                return [
                    p.lat,
                    p.lon
                ];
            });

        if (!drawRouteForHit.hitLayer) {
            drawRouteForHit.hitLayer =
                L.polyline(
                    hitLatLngs,
                    {
                        color: "#000000",
                        weight: 26,
                        opacity: 0.01,
                        interactive: true,
                        bubblingMouseEvents: true
                    }
                ).addTo(map);

        } else {
            drawRouteForHit.hitLayer.setLatLngs(
                hitLatLngs
            );

            if (!map.hasLayer(drawRouteForHit.hitLayer)) {
                drawRouteForHit.hitLayer.addTo(map);
            }
        }

        drawRouteForHit.hitLayer.off("click");

        drawRouteForHit.hitLayer.on("click", function(e) {

            if (window.splitRoutePickMode) {
                L.DomEvent.stopPropagation(e);
                
                const fileIdx =
								    typeof window.currentMultiIndex === "number"
								        ? window.currentMultiIndex
								        : 0;
								
								const routeIdx =
								    typeof window.currentActiveIndex === "number"
								        ? window.currentActiveIndex
								        : 0;
								
								const isSameRouteAlreadySelected =
								    window.currentToolTarget &&
								    window.currentToolTarget.type === "route" &&
								    Number(window.currentToolTarget.fileIdx) === Number(fileIdx) &&
								    Number(window.currentToolTarget.routeIdx) === Number(routeIdx);
								
								window.currentToolTarget = {
								    type: "route",
								    fileIdx: fileIdx,
								    routeIdx: routeIdx,
								    wptIdx: null
								};
								
								
								if (
								    window.activeFocusCircle &&
								    typeof map !== "undefined" &&
								    map &&
								    typeof map.hasLayer === "function" &&
								    map.hasLayer(window.activeFocusCircle)
								) {
								    map.removeLayer(window.activeFocusCircle);
								}
								
								window.activeFocusCircle = null;
								
								if (
								    typeof hoverMarker !== "undefined" &&
								    hoverMarker &&
								    typeof map !== "undefined" &&
								    map &&
								    map.hasLayer(hoverMarker)
								) {
								    map.removeLayer(hoverMarker);
								}
								
								hoverMarker = null;
								
								
								if (typeof window.renderRouteToolControl === "function") {
									    window.renderRouteToolControl();
									}
								
								
								if (
								    window.activeRouteHaloLayer &&
								    typeof map !== "undefined" &&
								    map &&
								    map.hasLayer(window.activeRouteHaloLayer)
								) {
								    map.removeLayer(window.activeRouteHaloLayer);
								}
								
								window.activeRouteHaloLayer = null;
								
								const haloLatLngs =
								    Array.isArray(drawRouteForHit.segments) &&
								    drawRouteForHit.segments.length > 0
								        ? drawRouteForHit.segments
								        : [
								            (Array.isArray(drawRouteForHit.points)
								                ? drawRouteForHit.points
								                : []
								            ).map(function(p) {
								                return [
								                    Number(p.lat),
								                    Number(p.lon)
								                ];
								            }).filter(function(pt) {
								                return (
								                    Number.isFinite(pt[0]) &&
								                    Number.isFinite(pt[1])
								                );
								            })
								        ];
								
								if (
								    haloLatLngs &&
								    haloLatLngs.length > 0
								) {
								    window.activeRouteHaloLayer =
								        L.polyline(
								            haloLatLngs,
								            {
								                color: "#ffffff",
								                weight: 10,
								                opacity: 0.9,
								                interactive: false
								            }
								        ).addTo(map);
								
								    if (
								        window.activeRouteHaloLayer &&
								        typeof window.activeRouteHaloLayer.bringToBack === "function"
								    ) {
								        window.activeRouteHaloLayer.bringToBack();
								    }
								
								    if (
								        drawRouteForHit.layer &&
								        typeof drawRouteForHit.layer.bringToFront === "function"
								    ) {
								        drawRouteForHit.layer.bringToFront();
								    }
								
								    if (
								        drawRouteForHit.hitLayer &&
								        typeof drawRouteForHit.hitLayer.bringToFront === "function"
								    ) {
								        drawRouteForHit.hitLayer.bringToFront();
								    }
								}
								
								if (typeof window.renderRouteToolControl === "function") {
								    window.renderRouteToolControl();
								}
								
								
								if (!isSameRouteAlreadySelected) {
								    return;
								}

                if (
                    typeof window.executeSplitRoutePick === "function" &&
                    window.executeSplitRoutePick(e.latlng)
                ) {
                    return;
                }
            }

            const clickedRoute =
                typeof window.findClickedRouteByPriority === "function"
                    ? window.findClickedRouteByPriority(e.latlng)
                    : null;

            if (
                clickedRoute &&
                (
                    clickedRoute.fileIdx !== window.currentMultiIndex ||
                    clickedRoute.routeIdx !== window.currentActiveIndex
                )
            ) {
                L.DomEvent.stopPropagation(e);

                if (typeof clickTimeout !== "undefined" && clickTimeout) {
                    clearTimeout(clickTimeout);
                    clickTimeout = null;
                }

                if (map && typeof map.closePopup === "function") {
                    map.closePopup();
                }

                if (clickedRoute.fileIdx !== window.currentMultiIndex) {
                    if (typeof switchMultiGpx === "function") {
                        switchMultiGpx(clickedRoute.fileIdx);
                    } else {
                        window.currentMultiIndex =
                            clickedRoute.fileIdx;
                    }
                }

                window.currentActiveIndex =
                    clickedRoute.routeIdx;

                const targetFile =
                    window.multiGpxStack &&
                    window.multiGpxStack[clickedRoute.fileIdx];

                if (typeof syncDrawingGlobals === "function") {
                    syncDrawingGlobals(
                        targetFile,
                        clickedRoute.routeIdx
                    );
                }

                if (typeof updateRouteSelectDropdown === "function") {
                    updateRouteSelectDropdown();
                }

                const routeSelect =
                    document.getElementById("routeSelect");

                if (routeSelect) {
                    routeSelect.value =
                        String(clickedRoute.routeIdx);

                    routeSelect.selectedIndex =
                        clickedRoute.routeIdx;
                }

                if (typeof loadRoute === "function") {
                    loadRoute(clickedRoute.routeIdx);
                }

                if (typeof renderRouteInfo === "function") {
                    renderRouteInfo();
                }

                if (typeof renderMultiGpxButtons === "function") {
                    renderMultiGpxButtons();
                }
                
                if (typeof window.refreshGpxManagerIfOpen === "function") {
						        window.refreshGpxManagerIfOpen();
		   					}

                return;
            }

            L.DomEvent.stopPropagation(e);

            const latestPoints =
                Array.isArray(drawRouteForHit.points)
                    ? drawRouteForHit.points
                    : [];

            if (latestPoints.length === 0) return;

            let nearestSegmentDistance =
                Infinity;

            let nearestSegmentIdx =
                -1;

            let nearestProjectedLatLng =
                null;

            let nearestProjectedDistance =
                null;

            const clickPoint =
                map.latLngToContainerPoint(e.latlng);

            for (let i = 0; i < latestPoints.length - 1; i++) {
                const p1 =
                    latestPoints[i];

                const p2 =
                    latestPoints[i + 1];

                if (!p1 || !p2) continue;

                const p1Lat =
                    Number(p1.lat);

                const p1Lon =
                    Number(p1.lon);

                const p2Lat =
                    Number(p2.lat);

                const p2Lon =
                    Number(p2.lon);

                if (
                    !Number.isFinite(p1Lat) ||
                    !Number.isFinite(p1Lon) ||
                    !Number.isFinite(p2Lat) ||
                    !Number.isFinite(p2Lon)
                ) {
                    continue;
                }

                const a =
                    map.latLngToContainerPoint(
                        L.latLng(p1Lat, p1Lon)
                    );

                const b =
                    map.latLngToContainerPoint(
                        L.latLng(p2Lat, p2Lon)
                    );

                const abx =
                    b.x - a.x;

                const aby =
                    b.y - a.y;

                const apx =
                    clickPoint.x - a.x;

                const apy =
                    clickPoint.y - a.y;

                const abLenSq =
                    abx * abx + aby * aby;

                if (abLenSq === 0) continue;

                let t =
                    (apx * abx + apy * aby) / abLenSq;

                t =
                    Math.max(
                        0,
                        Math.min(1, t)
                    );

                const projX =
                    a.x + abx * t;

                const projY =
                    a.y + aby * t;

                const dx =
                    clickPoint.x - projX;

                const dy =
                    clickPoint.y - projY;

                const pixelDist =
                    Math.sqrt(dx * dx + dy * dy);

                if (pixelDist < nearestSegmentDistance) {
                    nearestSegmentDistance =
                        pixelDist;

                    nearestSegmentIdx =
                        i;

                    nearestProjectedLatLng =
                        {
                            lat: p1Lat + (p2Lat - p1Lat) * t,
                            lon: p1Lon + (p2Lon - p1Lon) * t
                        };

                    if (
                        Number.isFinite(Number(p1.distance)) &&
                        Number.isFinite(Number(p2.distance))
                    ) {
                        nearestProjectedDistance =
                            Number(p1.distance) +
                            (
                                Number(p2.distance) -
                                Number(p1.distance)
                            ) * t;

                    } else {
                        nearestProjectedDistance =
                            null;
                    }
                }
            }

            if (
                nearestSegmentIdx > -1 &&
                nearestProjectedLatLng &&
                typeof showCustomPopup === "function"
            ) {
                const basePoint =
                    latestPoints[nearestSegmentIdx];

                const popupPoint = {
                    lat: nearestProjectedLatLng.lat,
                    lon: nearestProjectedLatLng.lon,
                    ele: basePoint && basePoint.ele !== undefined
                        ? basePoint.ele
                        : 0,
                    time: basePoint ? basePoint.time : null,
                    timeLocal: basePoint ? basePoint.timeLocal : null,
                    distance: nearestProjectedDistance
                };

                let tempIdx =
                    -1;

                if (
                    typeof trackPoints !== "undefined" &&
                    Array.isArray(trackPoints)
                ) {
                    trackPoints.push(popupPoint);
                    tempIdx =
                        trackPoints.length - 1;
                }

								if (typeof window.selectRouteWithHalo === "function") {
								    window.selectRouteWithHalo(
								        typeof window.currentMultiIndex === "number"
								            ? window.currentMultiIndex
								            : 0,
								        typeof window.currentActiveIndex === "number"
								            ? window.currentActiveIndex
								            : 0,
								        drawRouteForHit
								    );
								}
								
								showCustomPopup(
								    tempIdx,
								    drawRouteForHit.routeDisplayName ||
								    drawRouteForHit.displayName ||
								    drawRouteForHit.name ||
								    "自訂路線",
								    "trk",
								    nearestProjectedLatLng.lat,
								    nearestProjectedLatLng.lon
								);

                if (
                    tempIdx > -1 &&
                    Array.isArray(trackPoints)
                ) {
                    trackPoints.splice(tempIdx, 1);
                }

                if (typeof hoverMarker !== "undefined" && hoverMarker) {
                    hoverMarker
                        .setLatLng([
                            nearestProjectedLatLng.lat,
                            nearestProjectedLatLng.lon
                        ])
                        .addTo(map)
                        .bringToFront();
                }
            }
        });

        if (
            drawRouteForHit.hitLayer &&
            typeof drawRouteForHit.hitLayer.bringToFront === "function"
        ) {
            drawRouteForHit.hitLayer.bringToFront();
        }

        if (
            drawRouteForHit.layer &&
            typeof drawRouteForHit.layer.bringToFront === "function"
        ) {
            drawRouteForHit.layer.bringToFront();
        }
    };

    const syncAfterDrawChange = function(command, activeIdx) {
    		if (typeof clearRouteDirectionMarkers === "function") {
				    clearRouteDirectionMarkers();
				}

        const nextRouteIndex =
            Number.isFinite(Number(activeIdx))
                ? Number(activeIdx)
                : 0;

        if (
            command.currentFile.isDrawTrack &&
            (
                !Array.isArray(command.currentFile.routes) ||
                command.currentFile.routes.length === 0
            )
        ) {

            command.currentFile.points =
                command.targetTrack.points;

            command.currentFile.segments =
                command.targetTrack.segments;

            if (!(command.currentFile.layer instanceof L.Polyline)) {
                command.currentFile.layer =
                    L.polyline(
                        [],
                        {
                            color: command.currentFile.color || "#0000FF",
                            weight: 6,
                            opacity: 1,
                            interactive: true
                        }
                    ).addTo(map);
            }

            command.currentFile.layer.setLatLngs(
                command.currentFile.segments
            );

            command.currentFile.layer.setStyle({
                color: command.currentFile.color || "#0000FF",
                weight: 6,
                opacity: 1,
                dashArray: null
            });

            if (!map.hasLayer(command.currentFile.layer)) {
                command.currentFile.layer.addTo(map);
            }

            command.targetTrack.layer =
                command.currentFile.layer;

            if (typeof syncDrawingGlobals === "function") {
                syncDrawingGlobals(
                    command.currentFile,
                    0
                );
            }

            window.currentActiveIndex =
                0;

        } else if (
            Array.isArray(command.currentFile.routes) &&
            command.currentFile.routes.length > 0
        ) {

            window.allTracks =
                command.currentFile.routes;

            if (typeof allTracks !== "undefined") {
                allTracks =
                    window.allTracks;
            }

            const safeRouteIdx =
                Math.max(
                    0,
                    Math.min(
                        nextRouteIndex,
                        command.currentFile.routes.length - 1
                    )
                );

            window.currentActiveIndex =
                safeRouteIdx;

            if (
                command.currentFile.routes[safeRouteIdx] &&
                command.currentFile.routes[safeRouteIdx] !== command.targetTrack
            ) {
                command.targetTrack =
                    command.currentFile.routes[safeRouteIdx];
            }

						const activeRouteForTrackPoints =
						    command.currentFile &&
						    Array.isArray(command.currentFile.routes) &&
						    command.currentFile.routes[window.currentActiveIndex]
						        ? command.currentFile.routes[window.currentActiveIndex]
						        : command.targetTrack;
						
						window.trackPoints =
						    activeRouteForTrackPoints &&
						    Array.isArray(activeRouteForTrackPoints.points)
						        ? activeRouteForTrackPoints.points
						        : [];
						
						try {
						    trackPoints =
						        window.trackPoints;
						} catch (err) {}

            if (
                command.currentFile.routes.length > 1 &&
                command.currentFile.routes[0] &&
                command.currentFile.routes[0].isCombined === true
            ) {
                if (typeof rebuildCombinedRouteForFile === "function") {
                    rebuildCombinedRouteForFile(
                        command.currentFile
                    );
                }

            } else if (
                command.currentFile.routes.length > 1 &&
                typeof rebuildCombinedRouteForFile === "function"
            ) {
                rebuildCombinedRouteForFile(
                    command.currentFile
                );

            } else {
                command.currentFile.points =
                    command.targetTrack.points;

                command.currentFile.segments =
                    command.targetTrack.segments;
            }

            if (typeof syncDrawingGlobals === "function") {
                syncDrawingGlobals(
                    command.currentFile,
                    safeRouteIdx
                );
            }

        } else {

            command.currentFile.points =
                command.targetTrack.points;

            command.currentFile.segments =
                command.targetTrack.segments;

            if (typeof syncDrawingGlobals === "function") {
                syncDrawingGlobals(
                    command.currentFile,
                    nextRouteIndex
                );
            }

            window.currentActiveIndex =
                nextRouteIndex;
        }

        window.currentMultiIndex =
            command.fileIndex;

        const routeSelect =
            document.getElementById("routeSelect");

        if (routeSelect) {
            if (!routeSelect.options || routeSelect.options.length === 0) {
                const opt =
                    document.createElement("option");

                opt.value =
                    "0";

                opt.textContent =
                    command.currentFile.routeDisplayName ||
                    command.currentFile.displayName ||
                    command.currentFile.name ||
                    "自訂路線";

                routeSelect.appendChild(opt);
            }

            if (
                routeSelect.options &&
                routeSelect.options.length > window.currentActiveIndex
            ) {
                routeSelect.value =
                    String(window.currentActiveIndex);
            }
        }

        if (typeof updateRouteSelectDropdown === "function") {
            updateRouteSelectDropdown();
        }

        const routeSelectAfterUpdate =
            document.getElementById("routeSelect");

        if (
            routeSelectAfterUpdate &&
            routeSelectAfterUpdate.options &&
            routeSelectAfterUpdate.options.length > window.currentActiveIndex
        ) {
            routeSelectAfterUpdate.value =
                String(window.currentActiveIndex);
        }

        if (typeof renderMultiGpxButtons === "function") {
            renderMultiGpxButtons();
        }

        if (typeof loadRoute === "function") {
            loadRoute(
                window.currentActiveIndex || 0,
                null
            );
        }

        refreshHandDrawHitLayer(
            command.targetTrack
        );

        if (typeof renderRouteInfo === "function") {
            renderRouteInfo();
        }
        
        if (typeof window.refreshGpxManagerIfOpen === "function") {
		        window.refreshGpxManagerIfOpen();
		    }

        window.trackPoints =
            Array.isArray(command.targetTrack.points)
                ? command.targetTrack.points
                : [];

        try {
            trackPoints =
                window.trackPoints;
        } catch (err) {}

        if (
            command.currentFile &&
            command.currentFile.layer instanceof L.Polyline &&
            Array.isArray(command.targetTrack.segments)
        ) {
            command.currentFile.layer.setLatLngs(
                command.targetTrack.segments
            );
        }

				if (typeof loadRoute === "function") {
				    setTimeout(function() {
				        loadRoute(
				            window.currentActiveIndex || 0,
				            null
				        );
				
				        refreshHandDrawHitLayer(
				            command.targetTrack
				        );
				
				        if (typeof renderRouteInfo === "function") {
				            renderRouteInfo();
				        }
				        
				        if (typeof window.refreshGpxManagerIfOpen === "function") {
						        window.refreshGpxManagerIfOpen();
						    }
				
				        if (typeof syncProgressBarWithTrack === "function") {
				            syncProgressBarWithTrack(true);
				        }
				    }, 120);
				}

        const toggleBtn =
            document.getElementById("toggleChartBtn");

        if (toggleBtn) {
            toggleBtn.style.display =
                "block";
        }

        window.manualShowBar =
            false;

        const barContainer =
            document.getElementById("map-control-bar");

        if (barContainer) {
            barContainer.style.setProperty(
                "display",
                "none",
                "important"
            );
        }

        const progressBar =
            document.getElementById("gpxProgressBar");

        if (
            progressBar &&
            Array.isArray(command.targetTrack.points)
        ) {
            progressBar.max =
                Math.max(
                    0,
                    command.targetTrack.points.length - 1
                );

            progressBar.value =
                0;
        }

        if (typeof setupProgressBar === "function") {
            setupProgressBar();
        }

        if (typeof initProgressBar === "function") {
            initProgressBar();
        }

        if (typeof drawElevationChart === "function") {
            drawElevationChart();
        }

        if (typeof window.updateVisibility === "function") {
            window.updateVisibility();
        }

        if (typeof renderWaypointsAndPeaks === "function") {
            const routeForWpt =
                command.currentFile.routes &&
                command.currentFile.routes[window.currentActiveIndex]
                    ? command.currentFile.routes[window.currentActiveIndex]
                    : command.currentFile;

            renderWaypointsAndPeaks(routeForWpt);
        }

        if (typeof syncProgressBarWithTrack === "function") {
            syncProgressBarWithTrack(true);
        }


    };
    
    const beforeDrawPointCount =
		    Array.isArray(targetTrack.points)
		        ? targetTrack.points.length
		        : 0;
		
		const beforeDrawSegments =
		    Array.isArray(targetTrack.segments)
		        ? targetTrack.segments.map(function(seg) {
		            return Array.isArray(seg)
		                ? seg.map(function(pt) {
		                    return Array.isArray(pt)
		                        ? [pt[0], pt[1]]
		                        : pt;
		                })
		                : [];
		        })
		        : [];
		
		const wasWaypointOnlyBeforeDraw =
		    targetTrack &&
		    targetTrack.isWaypointOnly === true;

		const command = {
		    pointsToAdd: pointsSnapshot,
		    beforeDrawPointCount: beforeDrawPointCount,
		    beforeDrawSegments: beforeDrawSegments,
		    wasWaypointOnlyBeforeDraw: wasWaypointOnlyBeforeDraw,
		    currentFile: currentFile,
        targetTrack: targetTrack,
        fileIndex: stackIdx,
        routeIndex: routeIdx,
        targetRouteIndex: targetRouteIdx,
        wasNewHandDrawRoute:
            targetTrack &&
            targetTrack !== currentFile &&
            targetTrack.isHandDrawRoute === true &&
            targetTrack.points.length === 0,
        skipAutoLoadRouteAfterUndo: true,

        do: function() {
            window.currentMultiIndex =
                this.fileIndex;
						
						if (
						    this.wasNewHandDrawRoute === true &&
						    this.currentFile &&
						    Array.isArray(this.currentFile.routes) &&
						    this.targetTrack &&
						    this.currentFile.routes.indexOf(this.targetTrack) === -1
						) {
						    let insertIdx =
						        Number.isFinite(Number(this.routeIndex))
						            ? Number(this.routeIndex)
						            : this.currentFile.routes.length;
						
						    insertIdx =
						        Math.max(
						            0,
						            Math.min(
						                insertIdx,
						                this.currentFile.routes.length
						            )
						        );
						
						    this.currentFile.routes.splice(
						        insertIdx,
						        0,
						        this.targetTrack
						    );
						
						    this.routeIndex =
						        insertIdx;
						
						    this.targetRouteIndex =
						        insertIdx;
						
						    window.currentActiveIndex =
						        insertIdx;
						}
						 
						if (
						    this.targetTrack &&
						    this.targetTrack.isWaypointOnly === true
						) {
						    this.targetTrack.isWaypointOnly =
						        false;
						
						    this.targetTrack.isDrawTrack =
						        true;
						
						    this.targetTrack.isHandDrawRoute =
						        true;
						
						    this.targetTrack.isCombined =
						        false;
						
						    const fixedName =
						        (
						            this.targetTrack.name &&
						            this.targetTrack.name !== "航點資料"
						        )
						            ? this.targetTrack.name
						            : "自訂路線";
						
						    this.targetTrack.name =
						        fixedName;
						
						    this.targetTrack.displayName =
						        fixedName;
						
						    this.targetTrack.routeDisplayName =
						        fixedName;
						
						    this.targetTrack.fileName =
						        (
						            this.currentFile &&
						            (
						                this.currentFile.fileName ||
						                this.currentFile.name
						            )
						        ) ||
						        "自訂路線";
						
						    if (!Array.isArray(this.targetTrack.points)) {
						        this.targetTrack.points =
						            [];
						    }
						
						    if (!Array.isArray(this.targetTrack.segments)) {
						        this.targetTrack.segments =
						            [];
						    }
						
						    this.targetTrack.waypoints =
						        (
						            this.currentFile &&
						            Array.isArray(this.currentFile.waypoints)
						        )
						            ? this.currentFile.waypoints
						            : (
						                Array.isArray(this.targetTrack.waypoints)
						                    ? this.targetTrack.waypoints
						                    : []
						            );
						
						    if (
						        this.currentFile &&
						        Array.isArray(this.currentFile.routes)
						    ) {
						        const actualIdx =
						            this.currentFile.routes.indexOf(this.targetTrack);
						
						        if (actualIdx >= 0) {
						            this.routeIndex =
						                actualIdx;
						
						            this.targetRouteIndex =
						                actualIdx;
						
						            window.currentActiveIndex =
						                actualIdx;
						        }
						    }
						}
            let lastDistance =
                0;

            if (this.targetTrack.points.length > 0) {
                lastDistance =
                    this.targetTrack.points[
                        this.targetTrack.points.length - 1
                    ].distance || 0;
            }

            this.pointsToAdd.forEach((p, idx) => {

                if (idx === 0) {

                    if (this.targetTrack.points.length > 0) {
                        const prev =
                            this.targetTrack.points[
                                this.targetTrack.points.length - 1
                            ];

                        lastDistance += calculateDistance(
                            prev.lat,
                            prev.lon,
                            p.lat,
                            p.lon
                        );
                    }

                } else {

                    const prev =
                        this.pointsToAdd[idx - 1];

                    lastDistance += calculateDistance(
                        prev.lat,
                        prev.lon,
                        p.lat,
                        p.lon
                    );
                }

                p.distance =
                    lastDistance;
            });

						
						const shouldRebuildFromThisStrokeOnly =
						    this.wasNewHandDrawRoute === true ||
						    (
						        this.targetTrack &&
						        Array.isArray(this.targetTrack.points) &&
						        this.targetTrack.points.length === 0
						    );
						
						if (shouldRebuildFromThisStrokeOnly) {
						    this.targetTrack.points =
						        this.pointsToAdd.map(function(p) {
						            return { ...p };
						        });
						
						} else {
						    this.targetTrack.points.push(
						        ...this.pointsToAdd.map(function(p) {
						            return { ...p };
						        })
						    );
						}
						
						this.targetTrack.segments =
						    this.targetTrack.points.length > 0
						        ? [
						            this.targetTrack.points.map(function(p) {
						                return [
						                    Number(p.lat),
						                    Number(p.lon)
						                ];
						            }).filter(function(pt) {
						                return (
						                    Number.isFinite(pt[0]) &&
						                    Number.isFinite(pt[1])
						                );
						            })
						        ]
						        : [];

            this.currentFile._dirtyDraw =
                true;

            if (
                this.currentFile &&
                (
                    !Array.isArray(this.currentFile.routes) ||
                    this.currentFile.routes.length === 0
                )
            ) {
                this.currentFile.isDrawTrack =
                    true;

                this.currentFile.isHandDrawRoute =
                    true;

                this.currentFile.isCombined =
                    false;

                this.currentFile.points =
                    this.targetTrack.points;

                this.currentFile.segments =
                    this.targetTrack.segments;

                window.allTracks =
                    [this.currentFile];

                if (typeof allTracks !== "undefined") {
                    allTracks =
                        window.allTracks;
                }

                window.currentActiveIndex =
                    0;

                this.routeIndex =
                    0;

                this.targetRouteIndex =
                    0;
            }

            if (
                this.currentFile &&
                this.currentFile.isDrawTrack === true &&
                (
                    !Array.isArray(window.allTracks) ||
                    window.allTracks.length === 0
                )
            ) {
                window.allTracks =
                    [this.currentFile];

                if (typeof allTracks !== "undefined") {
                    allTracks =
                        window.allTracks;
                }

                window.currentActiveIndex =
                    0;

                this.routeIndex =
                    0;
            }

            syncAfterDrawChange(
                this,
                this.routeIndex
            );
        },

        undo: function() {
					    window.currentMultiIndex =
					        this.fileIndex;
					
					    
					    if (
					        this.currentFile &&
					        Array.isArray(this.currentFile.routes) &&
					        this.currentFile.routes.length > 0
					    ) {
					        let liveRouteIdx =
					            -1;
					
					        if (
					            Number.isFinite(Number(this.routeIndex)) &&
					            this.currentFile.routes[this.routeIndex]
					        ) {
					            liveRouteIdx =
					                this.routeIndex;
					        }
					
					        if (
					            liveRouteIdx === -1 &&
					            this.targetTrack &&
					            this.targetTrack.id
					        ) {
					            liveRouteIdx =
					                this.currentFile.routes.findIndex(function(route) {
					                    return (
					                        route &&
					                        route.id &&
					                        String(route.id) === String(this.targetTrack.id)
					                    );
					                }, this);
					        }
					
					        if (liveRouteIdx === -1) {
					            liveRouteIdx =
					                Math.max(
					                    0,
					                    Math.min(
					                        window.currentActiveIndex || 0,
					                        this.currentFile.routes.length - 1
					                    )
					                );
					        }
					
					        if (
					            liveRouteIdx > -1 &&
					            this.currentFile.routes[liveRouteIdx]
					        ) {
					            this.targetTrack =
					                this.currentFile.routes[liveRouteIdx];
					
					            this.routeIndex =
					                liveRouteIdx;
					
					            this.targetRouteIndex =
					                liveRouteIdx;
					
					            window.currentActiveIndex =
					                liveRouteIdx;
					        }
					    }
					
					    if (!this.targetTrack) {
					        return;
					    }
					
					    if (!Array.isArray(this.targetTrack.points)) {
					        this.targetTrack.points =
					            [];
					    }
					
					    if (!Array.isArray(this.targetTrack.segments)) {
					        this.targetTrack.segments =
					            [];
					    }
					
							if (this.wasNewHandDrawRoute === true) {
							    this.targetTrack.points =
							        [];
							
							    this.targetTrack.segments =
							        [];
							
							} else {
							
							if (!Array.isArray(this.targetTrack.points)) {
							    this.targetTrack.points = [];
							}
							
							this.targetTrack.points =
							    this.targetTrack.points.slice(
							        0,
							        this.beforeDrawPointCount || 0
							    );
							
							if (
							    Array.isArray(this.beforeDrawSegments) &&
							    this.beforeDrawSegments.length > 0
							) {
							    this.targetTrack.segments =
							        this.beforeDrawSegments.map(function(seg) {
							            return Array.isArray(seg)
							                ? seg.map(function(pt) {
							                    return Array.isArray(pt)
							                        ? [
							                            Number(pt[0]),
							                            Number(pt[1])
							                        ]
							                        : pt;
							                }).filter(function(pt) {
							                    return (
							                        Array.isArray(pt) &&
							                        Number.isFinite(pt[0]) &&
							                        Number.isFinite(pt[1])
							                    );
							                })
							                : [];
							        }).filter(function(seg) {
							            return seg.length > 0;
							        });
							
							} else {
							    this.targetTrack.segments =
							        this.targetTrack.points.length > 0
							            ? [
							                this.targetTrack.points.map(function(p) {
							                    return [
							                        Number(p.lat),
							                        Number(p.lon)
							                    ];
							                }).filter(function(pt) {
							                    return (
							                        Number.isFinite(pt[0]) &&
							                        Number.isFinite(pt[1])
							                    );
							                })
							            ]
							            : [];
							}
							
							
							if (
							    this.wasWaypointOnlyBeforeDraw === true &&
							    this.targetTrack.points.length === 0
							) {
							    this.targetTrack.isWaypointOnly =
							        true;
							
							    this.targetTrack.isDrawTrack =
							        false;
							
							    this.targetTrack.isHandDrawRoute =
							        false;
							
							    this.targetTrack.isCombined =
							        false;
							
							    this.targetTrack.points =
							        [];
							
							    this.targetTrack.segments =
							        [];
							
							    if (
							        !this.targetTrack.name ||
							        this.targetTrack.name === "自訂路線"
							    ) {
							        this.targetTrack.name =
							            "航點資料";
							
							        this.targetTrack.displayName =
							            "航點資料";
							
							        this.targetTrack.routeDisplayName =
							            "航點資料";
							    }
							}
							}
							
							if (
									    this.targetTrack.layer &&
									    typeof this.targetTrack.layer.setLatLngs === "function"
									) {
									    this.targetTrack.layer.setLatLngs(
									        this.targetTrack.segments
									    );
									}
									
									if (
									    typeof polyline !== "undefined" &&
									    polyline &&
									    typeof polyline.setLatLngs === "function"
									) {
									    polyline.setLatLngs(
									        this.targetTrack.segments
									    );
									}

            this.targetTrack.segments =
                this.targetTrack.points.length > 0
                    ? [
                        this.targetTrack.points.map(function(p) {
                            return [
                                p.lat,
                                p.lon
                            ];
                        })
                    ]
                    : [];

            const isEmpty =
                this.targetTrack.points.length === 0;

            let nextRouteIndex =
                this.routeIndex;

						if (
						    isEmpty &&
						    this.wasNewHandDrawRoute &&
						    this.currentFile &&
						    Array.isArray(this.currentFile.routes)
						) {
						    const removedRoute =
						        this.targetTrack;
						
						    const idx =
						        this.currentFile.routes.indexOf(removedRoute);
						
						    if (idx > -1) {
						        this.currentFile.routes.splice(
						            idx,
						            1
						        );
						    }
						
						    
						    this.targetTrack =
						        removedRoute;
						
						    if (
						        this.currentFile.routes.length > 1 &&
						        this.currentFile.routes[0] &&
						        this.currentFile.routes[0].isCombined === true &&
						        typeof rebuildCombinedRouteForFile === "function"
						    ) {
						        rebuildCombinedRouteForFile(
						            this.currentFile
						        );
						    }
						
						    const firstRealRouteIdx =
						        this.currentFile.routes.findIndex(function(route) {
						            return route && route.isCombined !== true;
						        });
						
						    nextRouteIndex =
						        firstRealRouteIdx >= 0
						            ? firstRealRouteIdx
						            : 0;
						
						    window.currentMultiIndex =
						        this.fileIndex;
						
						    window.currentActiveIndex =
						        nextRouteIndex;
						
						    window.allTracks =
						        this.currentFile.routes;
						
						    if (typeof allTracks !== "undefined") {
						        allTracks =
						            window.allTracks;
						    }
						
						    if (typeof syncDrawingGlobals === "function") {
						        syncDrawingGlobals(
						            this.currentFile,
						            nextRouteIndex
						        );
						    }
						
						    if (typeof updateRouteSelectDropdown === "function") {
						        updateRouteSelectDropdown();
						    }
						
						    const routeSelect =
						        document.getElementById("routeSelect");
						
						    if (routeSelect) {
						        routeSelect.value =
						            String(nextRouteIndex);
						    }
						
						    if (typeof renderMultiGpxButtons === "function") {
						        renderMultiGpxButtons();
						    }
						
						    if (typeof loadRoute === "function") {
						        loadRoute(
						            nextRouteIndex,
						            null,
						            {
						                skipAutoFitBounds: true,
						                preserveChartState: true
						            }
						        );
						    }
						
						    if (typeof window.refreshGpxManagerIfOpen === "function") {
						        window.refreshGpxManagerIfOpen();
						    }
						
						    
						    return;
						}

            if (
                isEmpty &&
                this.currentFile &&
                Array.isArray(this.currentFile.routes) &&
                this.currentFile.routes.length === 1 &&
                this.currentFile.routes[0] === this.targetTrack
            ) {
                
                this.targetTrack.points =
                    [];

                this.targetTrack.segments =
                    [];

                window.allTracks =
                    this.currentFile.routes;

                if (typeof allTracks !== "undefined") {
                    allTracks =
                        window.allTracks;
                }

                window.currentActiveIndex =
                    0;

                nextRouteIndex =
                    0;
            }

            if (
                isEmpty &&
                this.currentFile &&
                (
                    !Array.isArray(this.currentFile.routes) ||
                    this.currentFile.routes.length === 0
                )
            ) {
                this.currentFile.isDrawTrack =
                    true;

                this.currentFile.isHandDrawRoute =
                    true;

                this.currentFile.isCombined =
                    false;

                this.currentFile.points =
                    [];

                this.currentFile.segments =
                    [];

                window.allTracks =
                    [this.currentFile];

                if (typeof allTracks !== "undefined") {
                    allTracks =
                        window.allTracks;
                }

                window.currentActiveIndex =
                    0;

                nextRouteIndex =
                    0;

                if (typeof trackPoints !== "undefined") {
                    trackPoints =
                        [];
                }

                window.trackPoints =
                    [];

                if (
                    this.currentFile.layer instanceof L.Polyline
                ) {
                    this.currentFile.layer.setLatLngs(
                        []
                    );
                }

                if (
                    typeof polyline !== "undefined" &&
                    polyline &&
                    typeof polyline.setLatLngs === "function"
                ) {
                    polyline.setLatLngs(
                        []
                    );
                }
            }

            syncAfterDrawChange(
                this,
                nextRouteIndex
            );
            
            if (
						    this.targetTrack &&
						    Array.isArray(this.targetTrack.points) &&
						    this.targetTrack.points.length === 0
						) {
						    const emptyTargetTrack =
						        this.targetTrack;

						    const clearEmptyDrawLayers = function() {
						        if (
						            window.activeRouteHaloLayer &&
						            typeof map !== "undefined" &&
						            map.hasLayer(window.activeRouteHaloLayer)
						        ) {
						            map.removeLayer(window.activeRouteHaloLayer);
						        }

        window.activeRouteHaloLayer =
            null;

        if (
            window.activeRouteLayer &&
            typeof map !== "undefined" &&
            map.hasLayer(window.activeRouteLayer)
        ) {
            map.removeLayer(window.activeRouteLayer);
        }

        window.activeRouteLayer =
            null;

        if (
            window.splitRouteHitLayer &&
            typeof map !== "undefined" &&
            map.hasLayer(window.splitRouteHitLayer)
        ) {
            map.removeLayer(window.splitRouteHitLayer);
        }

        window.splitRouteHitLayer =
            null;

        if (
            emptyTargetTrack &&
            emptyTargetTrack.hitLayer &&
            typeof map !== "undefined" &&
            map.hasLayer(emptyTargetTrack.hitLayer)
        ) {
            map.removeLayer(emptyTargetTrack.hitLayer);
        }

        if (emptyTargetTrack) {
            emptyTargetTrack.hitLayer =
                null;
        }

        if (
            emptyTargetTrack &&
            emptyTargetTrack.layer &&
            typeof map !== "undefined" &&
            map.hasLayer(emptyTargetTrack.layer)
        ) {
            map.removeLayer(emptyTargetTrack.layer);
        }

        if (emptyTargetTrack) {
            emptyTargetTrack.layer =
                null;
        }

        if (Array.isArray(window.routePreviewLayers)) {
            window.routePreviewLayers.forEach(function(layer) {
                if (
                    layer &&
                    typeof map !== "undefined" &&
                    map.hasLayer(layer)
                ) {
                    map.removeLayer(layer);
                }
            });

            window.routePreviewLayers =
                [];
        }

        if (
            typeof markers !== "undefined" &&
            Array.isArray(markers)
        ) {
            markers.forEach(function(m) {
                if (
                    m &&
                    typeof map !== "undefined" &&
                    map.hasLayer(m)
                ) {
                    map.removeLayer(m);
                }
            });

            markers =
                [];
        }

        if (
            typeof polyline !== "undefined" &&
            polyline &&
            typeof polyline.setLatLngs === "function"
        ) {
            polyline.setLatLngs([]);
        }

        
        if (
            typeof map !== "undefined" &&
            map &&
            typeof map.eachLayer === "function"
        ) {
            map.eachLayer(function(layer) {
                if (
                    layer &&
                    layer instanceof L.Polyline &&
                    layer.options
                ) {
                    const color =
                        String(layer.options.color || "").toLowerCase();

                    const weight =
                        Number(layer.options.weight || 0);

                    const opacity =
                        Number(layer.options.opacity || 0);

                    const isWhiteHalo =
                        (
                            color === "#ffffff" ||
                            color === "white" ||
                            color === "rgb(255,255,255)" ||
                            color === "rgb(255, 255, 255)"
                        ) &&
                        weight >= 8 &&
                        opacity >= 0.5;

                    if (
                        isWhiteHalo &&
                        map.hasLayer(layer)
                    ) {
                        map.removeLayer(layer);
                    }
                }
            });
        }

        window.trackPoints =
            [];

        try {
            trackPoints =
                [];
        } catch (err) {}

        if (typeof renderRouteInfo === "function") {
            renderRouteInfo();
        }

        if (typeof updateRouteSelectDropdown === "function") {
            updateRouteSelectDropdown();
        }
    };

    clearEmptyDrawLayers();

    setTimeout(function() {
        clearEmptyDrawLayers();
    }, 180);

    setTimeout(function() {
        clearEmptyDrawLayers();
    }, 350);
}
        }
    };

    if (
        typeof historyManager !== "undefined" &&
        historyManager &&
        typeof historyManager.execute === "function"
    ) {
        historyManager.execute(command);

    } else {
        command.do();
    }

    tempDrawPoints = [];
}

map.on('mousedown', (e) => {
    if (!e || !e.latlng) return;
    
    if (
        typeof ignoreMapClickUntil !== "undefined" &&
        Date.now() < ignoreMapClickUntil
    ) {
        return;
    }

    if (
        isDrawingMode &&
        drawMethod === 'scribble' &&
        e.originalEvent &&
        e.originalEvent.ctrlKey
    ) {
        isCtrlPanningInDrawMode = true;
        isScribbling = false;
        tempDrawPoints = [];
        lastScribbleLatLng = null;

        if (map && map.dragging) {
            map.dragging.enable();
        }

        return;
    }

    startScribble(e.latlng, e.originalEvent);
});

map.on('mousemove', (e) => {
    if (!e || !e.latlng) return;

    if (isCtrlPanningInDrawMode) {
        return;
    }

    moveScribble(e.latlng);
});

window.addEventListener('mouseup', () => {
    if (isCtrlPanningInDrawMode) {
        isCtrlPanningInDrawMode = false;
        isScribbling = false;
        tempDrawPoints = [];
        lastScribbleLatLng = null;

        if (
            isDrawingMode &&
            map &&
            map.dragging
        ) {
            map.dragging.disable();
        }

        return;
    }

    finishScribble();
});

window.addEventListener('keydown', function(e) {
				if (
				    (
				        e.key === "Control" ||
				        e.key === "Meta"
				    ) &&
				    isDrawingMode &&
				    drawMethod === 'scribble'
				) {
        isCtrlPanningInDrawMode = true;

        if (map && map.dragging) {
            map.dragging.enable();
        }

        const mapEl =
            document.getElementById('map');

        if (mapEl) {
            mapEl.style.cursor = 'grab';
        }
    }
});

window.addEventListener('keyup', function(e) {
				if (
				    e.key === "Control" ||
				    e.key === "Meta"
				) {
				    isCtrlPanningInDrawMode = false;

        if (
            isDrawingMode &&
            map &&
            map.dragging
        ) {
            map.dragging.disable();
        }

        const mapEl =
            document.getElementById('map');

        if (mapEl) {
            mapEl.style.cursor = '';
        }
    }
});


map.on('touchstart', (e) => {
    if (!isDrawingMode) return;
    if (drawMethod !== 'scribble') return;
    if (!e.latlng) return;

    if (e.originalEvent) {
        e.originalEvent.preventDefault();
    }

    startScribble(e.latlng, e.originalEvent);
});

map.on('touchmove', (e) => {
    if (!isDrawingMode) return;
    if (!isScribbling) return;
    if (!e.latlng) return;

    if (e.originalEvent) {
        e.originalEvent.preventDefault();
    }

    moveScribble(e.latlng);
});

map.on('touchend', (e) => {
    if (e && e.originalEvent) {
        e.originalEvent.preventDefault();
    }

    finishScribble();

    ignoreMapClickUntil =
        Date.now() + 600;
});

document.addEventListener(

    'touchstart',
    function(e) {
        if (!isDrawingMode) return;
        if (drawMethod !== 'scribble') return;
        if (!e.touches || !e.touches[0]) return;

        if (e.touches.length > 1) {
            isPinchingMap = true;
            isScribbling = false;
            lastScribbleLatLng = null;
            tempDrawPoints = [];
            return;
        }

        if (isPinchingMap) {
            return;
        }

        const touch = e.touches[0];
        const mapEl = map.getContainer();
        const mapRect = mapEl.getBoundingClientRect();

        const target =
            document.elementFromPoint(
                touch.clientX,
                touch.clientY
            );

        const insideMap =
            touch.clientX >= mapRect.left &&
            touch.clientX <= mapRect.right &&
            touch.clientY >= mapRect.top &&
            touch.clientY <= mapRect.bottom;

        if (!insideMap) {
            return;
        }

        if (
            !target ||
            !mapEl.contains(target) ||
            (
                target.closest &&
                (
                    target.closest('#side-toolbar') ||
                    target.closest('#multiGpxBtnBar') ||
                    target.closest('#routeSelectContainer') ||
                    target.closest('#map-control-bar') ||
                    target.closest('#chartContainer') ||
                    target.closest('#wptList') ||
                    target.closest('#toggleChartBtn') ||
                    target.closest('#gpxProgressBar') ||
                    target.closest('#routeSummary') ||
                    target.closest('#fileControls') ||
                    target.closest('#top-toolbar') ||
                    target.closest('#toolbar') ||
                    target.closest('.leaflet-control') ||
                    target.closest('.leaflet-popup') ||
                    target.closest('#wptEditModal') ||
                    target.closest('#gpxManageModal') ||
                    target.closest('#searchModal')
                )
            )
        ) {
            return;
        }

        e.preventDefault();

        const point =
            L.point(
                touch.clientX - mapRect.left,
                touch.clientY - mapRect.top
            );

        const latlng =
            map.containerPointToLatLng(point);

        startScribble(latlng, e);
    },
    { passive: false }
);


document.addEventListener(

    'touchmove',
    function(e) {
        if (!isDrawingMode) return;

        if (e.touches && e.touches.length > 1) {
            isPinchingMap = true;
            isScribbling = false;
            lastScribbleLatLng = null;
            tempDrawPoints = [];
            return;
        }

        if (isPinchingMap) {
            return;
        }

        if (!isScribbling) return;
        if (!e.touches || !e.touches[0]) return;

        const touch = e.touches[0];
        const mapEl = map.getContainer();
        const mapRect = mapEl.getBoundingClientRect();

        const target =
            document.elementFromPoint(
                touch.clientX,
                touch.clientY
            );

        const insideMap =
            touch.clientX >= mapRect.left &&
            touch.clientX <= mapRect.right &&
            touch.clientY >= mapRect.top &&
            touch.clientY <= mapRect.bottom;

        if (!insideMap) {
            finishScribble();
            isScribbling = false;
            lastScribbleLatLng = null;
            return;
        }

        if (
            !target ||
            !mapEl.contains(target) ||
            (
                target.closest &&
                (
                    target.closest('#side-toolbar') ||
                    target.closest('#multiGpxBtnBar') ||
                    target.closest('#routeSelectContainer') ||
                    target.closest('#map-control-bar') ||
                    target.closest('#chartContainer') ||
                    target.closest('#wptList') ||
                    target.closest('#toggleChartBtn') ||
                    target.closest('#gpxProgressBar') ||
                    target.closest('#routeSummary') ||
                    target.closest('#fileControls') ||
                    target.closest('#top-toolbar') ||
                    target.closest('#toolbar') ||
                    target.closest('.leaflet-control') ||
                    target.closest('.leaflet-popup') ||
                    target.closest('#wptEditModal') ||
                    target.closest('#gpxManageModal') ||
                    target.closest('#searchModal')
                )
            )
        ) {
            return;
        }

        e.preventDefault();

        const point =
            L.point(
                touch.clientX - mapRect.left,
                touch.clientY - mapRect.top
            );

        const latlng =
            map.containerPointToLatLng(point);

        moveScribble(latlng);
    },
    { passive: false }
);

document.addEventListener(
    'touchend',
    function(e) {

        if (isPinchingMap) {
            if (!e.touches || e.touches.length === 0) {
                isPinchingMap = false;
                isScribbling = false;
                lastScribbleLatLng = null;
                tempDrawPoints = [];
            }

            return;
        }

        if (!isScribbling) return;

        e.preventDefault();

        finishScribble();

        isScribbling = false;
        lastScribbleLatLng = null;
    },
    { passive: false }
);






function clearRoutePreviewLayers() {

    if (Array.isArray(window.routePreviewLayers)) {

        window.routePreviewLayers.forEach(layer => {

            if (layer && map.hasLayer(layer)) {
                map.removeLayer(layer);
            }
        });
    }

    window.routePreviewLayers = [];

    if (window.activeRouteLayer) {

        if (map.hasLayer(window.activeRouteLayer)) {
            map.removeLayer(window.activeRouteLayer);
        }

        window.activeRouteLayer = null;
    }
}


function syncDrawingGlobals(currentFile, activeRouteIdx = 0) {

    if (!currentFile) return;

    if (typeof multiGpxStack === "undefined" || !Array.isArray(multiGpxStack)) {
        multiGpxStack = [];
    }

    window.multiGpxStack = multiGpxStack;

    let stackIdx = window.currentMultiIndex || 0;
    if (stackIdx < 0) stackIdx = 0;

    multiGpxStack[stackIdx] = currentFile;
    window.multiGpxStack[stackIdx] = currentFile;
    window.currentMultiIndex = stackIdx;

    if (
        !currentFile.isDrawTrack &&
        Array.isArray(currentFile.routes) &&
        currentFile.routes.length > 0
    ) {
        allTracks = currentFile.routes;
        window.allTracks = currentFile.routes;

        if (activeRouteIdx < 0 || activeRouteIdx >= currentFile.routes.length) {
            activeRouteIdx = 0;
        }

        const activeRoute = currentFile.routes[activeRouteIdx];

        trackPoints =
            activeRoute && Array.isArray(activeRoute.points)
                ? activeRoute.points
                : [];

        window.trackPoints = trackPoints;

    } else {
        allTracks = [currentFile];
        window.allTracks = allTracks;

        trackPoints = Array.isArray(currentFile.points)
            ? currentFile.points
            : [];

        window.trackPoints = trackPoints;
        activeRouteIdx = 0;
    }

    window.currentActiveIndex = activeRouteIdx;
}

function routeHasTrackData(route) {
    if (!route) return false;

    if (
        Array.isArray(route.points) &&
        route.points.length > 0
    ) {
        return true;
    }

    if (
        Array.isArray(route.segments) &&
        route.segments.some(seg => Array.isArray(seg) && seg.length > 0)
    ) {
        return true;
    }

    return false;
}

function fileHasTrackData(file) {
    if (!file) return false;

    if (
        Array.isArray(file.routes) &&
        file.routes.some(route => routeHasTrackData(route))
    ) {
        return true;
    }

    if (routeHasTrackData(file)) {
        return true;
    }

    return false;
}

function getNextCustomRouteName(currentFile) {
    const routes =
        currentFile && Array.isArray(currentFile.routes)
            ? currentFile.routes
            : [];

    let maxNo = 0;

    routes.forEach(route => {
        const name =
            route &&
            (route.displayName || route.name || "");

        const match =
            String(name).match(/^自訂路線\s*(\d+)?$/);

        if (match) {
            const n =
                match[1]
                    ? parseInt(match[1], 10)
                    : 1;

            if (Number.isFinite(n)) {
                maxNo = Math.max(maxNo, n);
            }
        }
    });

    return maxNo === 0
        ? "自訂路線"
        : `自訂路線 ${maxNo + 1}`;
}


function ensureCombinedRouteForCurrentFile(currentFile) {

    if (!currentFile) return false;

    if (!Array.isArray(currentFile.routes)) {
        currentFile.routes = [];
    }

    const routes = currentFile.routes;

    if (
        routes.length > 0 &&
        routes[0] &&
        routes[0].isCombined === true
    ) {
        return true;
    }

    const childRoutes = routes.filter(route =>
        route &&
        !route.isCombined &&
        (
            (Array.isArray(route.points) && route.points.length > 0) ||
            (Array.isArray(route.segments) && route.segments.length > 0)
        )
    );

    if (childRoutes.length === 0) {
        return false;
    }

    let combinedPoints = [];
    let combinedSegments = [];

    childRoutes.forEach(route => {
        const pts = Array.isArray(route.points) ? route.points : [];

        if (pts.length > 0) {
            combinedPoints = combinedPoints.concat(pts);
        }

        if (
            Array.isArray(route.segments) &&
            route.segments.length > 0
        ) {
            route.segments.forEach(seg => {
                if (Array.isArray(seg) && seg.length > 0) {
                    combinedSegments.push(seg);
                }
            });
        } else if (pts.length > 0) {
            combinedSegments.push(
                pts.map(p => [p.lat, p.lon])
            );
        }
    });

    let totalDist = 0;

    const recalculatedPoints =
        combinedPoints.map((p, idx, arr) => {
            if (idx > 0) {
                const prev = arr[idx - 1];
                totalDist += calculateDistance(
                    prev.lat,
                    prev.lon,
                    p.lat,
                    p.lon
                );
            }

            return {
                ...p,
                distance: totalDist
            };
        });

    const combinedRoute = {
        id: "combined_" + Date.now(),
        name: currentFile.displayName || currentFile.fileName || currentFile.name || "結合路線",
        displayName: currentFile.displayName || currentFile.fileName || currentFile.name || "結合路線",
        fileName: currentFile.fileName || currentFile.name || "GPX",
        color: currentFile.color || "#0000FF",
        points: recalculatedPoints,
        segments: combinedSegments,
        waypoints: currentFile.waypoints || [],
        visible: true,
        isCombined: true
    };

    currentFile.routes.unshift(combinedRoute);
    currentFile.points = recalculatedPoints;
    currentFile.segments = combinedSegments;

    if (currentFile.layer instanceof L.Polyline) {
        currentFile.layer.setLatLngs(combinedSegments);
    }

    return true;
}

function createNewDrawingRouteForCurrentFile() {

    const stackIdx =
        window.currentMultiIndex || 0;

    let currentFile =
        window.multiGpxStack &&
        window.multiGpxStack[stackIdx];

		const currentFileNameForDraw =
		    String(
		        currentFile &&
		        (
		            currentFile.fileName ||
		            currentFile.displayName ||
		            currentFile.routeDisplayName ||
		            currentFile.name ||
		            ""
		        )
		    );
		
		const isBlankCustomDrawFile =
		    currentFile &&
		    (
		        currentFile.isDrawTrack === true ||
		        currentFileNameForDraw.startsWith("自訂路線")
		    );
		
		const currentFileHasPoints =
		    currentFile &&
		    Array.isArray(currentFile.points) &&
		    currentFile.points.length > 0;
		
		const currentFileHasSegments =
		    currentFile &&
		    Array.isArray(currentFile.segments) &&
		    currentFile.segments.length > 0;
		
		const currentFileHasRouteData =
		    currentFile &&
		    Array.isArray(currentFile.routes) &&
		    currentFile.routes.some(function(route) {
		        if (!route) return false;
		
		        return (
		            (
		                Array.isArray(route.points) &&
		                route.points.length > 0
		            ) ||
		            (
		                Array.isArray(route.segments) &&
		                route.segments.length > 0
		            )
		        );
		    });
		
		if (
		    isBlankCustomDrawFile &&
		    !currentFileHasPoints &&
		    !currentFileHasSegments &&
		    !currentFileHasRouteData
		) {
		    currentFile.isDrawTrack = true;
		    currentFile.isHandDrawRoute = true;
		    currentFile.isCombined = false;
		
		    currentFile.points = [];
		    currentFile.segments = [];
		
		    if (!Array.isArray(currentFile.waypoints)) {
		        currentFile.waypoints = [];
		    }
		
		    if (Array.isArray(currentFile.routes)) {
		        delete currentFile.routes;
		    }
		
		    window.drawTargetMode = "direct-draw";
		    window.currentMultiIndex = stackIdx;
		    window.currentActiveIndex = 0;
		
		    if (typeof syncDrawingGlobals === "function") {
		        syncDrawingGlobals(currentFile, 0);
		    }
		
		    if (typeof updateRouteSelectDropdown === "function") {
		        updateRouteSelectDropdown();
		    }
		
		    const routeSelect =
		        document.getElementById("routeSelect");
		
		    if (
		        routeSelect &&
		        routeSelect.options &&
		        routeSelect.options.length > 0
		    ) {
		        routeSelect.value = "0";
		    }
		
		    return {
		        currentFile: currentFile,
		        routeIdx: 0,
		        route: currentFile
		    };
		}

    if (!currentFile) {
        currentFile = ensureCustomDrawTrack();

        window.drawTargetMode = "direct-draw";

        return {
            currentFile,
            routeIdx: 0,
            route: currentFile
        };
    }

    function patchFirstDrawHistoryTarget(firstRoute) {
        if (
            !firstRoute ||
            typeof historyManager === "undefined" ||
            !historyManager
        ) {
            return;
        }

        const patchStack = function(stack) {
            if (!Array.isArray(stack)) return;

            stack.forEach(function(command) {
                if (!command) return;

                if (
                    command.currentFile === currentFile &&
                    command.targetTrack === currentFile &&
                    command.fileIndex === stackIdx
                ) {
                    const actualIdx =
                        Array.isArray(currentFile.routes)
                            ? currentFile.routes.indexOf(firstRoute)
                            : -1;

                    command.targetTrack =
                        firstRoute;

                    if (actualIdx >= 0) {
                        command.routeIndex =
                            actualIdx;

                        command.targetRouteIndex =
                            actualIdx;
                    }
                }
            });
        };

        patchStack(historyManager.undoStack);
        patchStack(historyManager.redoStack);
    }

    let convertedFirstRoute = null;

    if (currentFile.isDrawTrack === true) {

        const hasExistingPoints =
            Array.isArray(currentFile.points) &&
            currentFile.points.length > 0;

        const hasExistingSegments =
            Array.isArray(currentFile.segments) &&
            currentFile.segments.length > 0;

        if (!hasExistingPoints && !hasExistingSegments) {
            window.drawTargetMode = "direct-draw";

            syncDrawingGlobals(currentFile, 0);

            return {
                currentFile,
                routeIdx: 0,
                route: currentFile
            };
        }

        if (!Array.isArray(currentFile.routes)) {
            const firstRouteName =
                currentFile.routeDisplayName ||
                currentFile.displayName ||
                currentFile.name ||
                "自訂路線";

            const firstRoute = {
                id: currentFile.id || ("draw_route_" + Date.now()),
                name: firstRouteName,
                displayName: firstRouteName,
                routeDisplayName: firstRouteName,
                fileName: currentFile.fileName || currentFile.name || "自訂路線",
                color: currentFile.color || "#0000FF",

                points: Array.isArray(currentFile.points)
                    ? currentFile.points
                    : [],

                segments: Array.isArray(currentFile.segments)
                    ? currentFile.segments
                    : [],

                waypoints: Array.isArray(currentFile.waypoints)
                    ? currentFile.waypoints
                    : [],

                visible: true,
                isCombined: false,
                isDrawTrack: true,
                isHandDrawRoute: true
            };

            currentFile.routes =
                [firstRoute];

            convertedFirstRoute =
                firstRoute;
        }

        currentFile.isDrawTrack = false;
        currentFile.isHandDrawRoute = false;
        currentFile.isCombined = false;

        currentFile.name =
            currentFile.fileName ||
            currentFile.name ||
            "自訂路線";

        currentFile.displayName =
            currentFile.displayName ||
            currentFile.name ||
            "自訂路線";

        currentFile.fileName =
            currentFile.fileName ||
            currentFile.name ||
            "自訂路線";
    }

    if (!Array.isArray(currentFile.routes)) {
        currentFile.routes = [];
    }

    if (fileHasTrackData(currentFile)) {
        ensureCombinedRouteForCurrentFile(currentFile);
    }

    if (convertedFirstRoute) {
        patchFirstDrawHistoryTarget(convertedFirstRoute);
    }

    let routeName =
        getNextCustomRouteName(currentFile);

    if (
        routeName === undefined ||
        routeName === null ||
        routeName === "" ||
        routeName === "NaN" ||
        String(routeName).trim() === "" ||
        String(routeName).trim() === "NaN"
    ) {
        routeName = "自訂路線";
    }

    const newRoute = {
        id: "draw_route_" + Date.now(),
        name: routeName,
        displayName: routeName,
        routeDisplayName: routeName,
        fileName: currentFile.fileName || currentFile.name || "自訂路線",
        color: currentFile.color || "#0000FF",

        points: [],
        segments: [],
        waypoints: currentFile.waypoints || [],

        visible: true,
        isCombined: false,
        isDrawTrack: true,
        isHandDrawRoute: true
    };

    currentFile.routes.push(newRoute);

    const routeIdx =
        currentFile.routes.length - 1;

    window.currentMultiIndex =
        stackIdx;

    window.currentActiveIndex =
        routeIdx;

    window.drawTargetMode =
        "new-route";

    if (
        currentFile.routes.length > 1 &&
        currentFile.routes[0] &&
        currentFile.routes[0].isCombined === true
    ) {
        rebuildCombinedRouteForFile(currentFile);
    }

    if (convertedFirstRoute) {
        patchFirstDrawHistoryTarget(convertedFirstRoute);
    }

    syncDrawingGlobals(
        currentFile,
        routeIdx
    );

    if (typeof updateRouteSelectDropdown === "function") {
        updateRouteSelectDropdown();
    }

    const routeSelect =
        document.getElementById("routeSelect");

    if (
        routeSelect &&
        routeSelect.options &&
        routeSelect.options.length > routeIdx
    ) {
        routeSelect.value =
            String(routeIdx);
    }

    if (typeof renderMultiGpxButtons === "function") {
        renderMultiGpxButtons();
    }

    if (typeof loadRoute === "function") {
        loadRoute(routeIdx);
    }

    return {
        currentFile,
        routeIdx,
        route: newRoute
    };
}

function showDrawingRouteChoiceModal(onCreateNew, onEditCurrent, onCancel) {
    const modal = document.getElementById('deleteConfirmModal');
    if (!modal) return;

    const h3Tag = modal.querySelector('h3');
    const pTag = modal.querySelector('p');

    const primaryBtn = document.getElementById('modalDeleteConfirm'); 
    const cancelBtn = document.getElementById('modalDeleteCancel'); 

    if (!primaryBtn || !cancelBtn) return;

    if (h3Tag) {
        h3Tag.innerText = "繪製路線";
        h3Tag.style.textAlign = "center";
        h3Tag.style.fontSize = "20px";
        h3Tag.style.fontWeight = "700";
        h3Tag.style.margin = "0 0 14px 0";
        h3Tag.style.color = "#2c3e50";
    }

    if (pTag) {
        pTag.innerHTML = `
            目前 GPX 已有軌跡。<br>
            請選擇要建立新路線，或編輯目前選取的路線。
        `;
        pTag.style.textAlign = "center";
        pTag.style.fontSize = "15px";
        pTag.style.lineHeight = "1.7";
        pTag.style.color = "#444";
        pTag.style.margin = "0 0 18px 0";
    }

    let secondaryBtn = document.getElementById("modalThirdChoiceBtn");

    if (!secondaryBtn) {
        secondaryBtn = document.createElement("button");
        secondaryBtn.id = "modalThirdChoiceBtn";
        secondaryBtn.type = "button";
    }

    primaryBtn.innerText = "建立新路線";
    secondaryBtn.innerText = "編輯目前選取路線";
    cancelBtn.innerText = "取消";

    const btnParent = primaryBtn.parentNode;

    if (btnParent) {
        btnParent.innerHTML = "";

        btnParent.appendChild(primaryBtn);
        btnParent.appendChild(secondaryBtn);
        btnParent.appendChild(cancelBtn);

        btnParent.style.display = "flex";
        btnParent.style.flexDirection = "column";
        btnParent.style.justifyContent = "center";
        btnParent.style.alignItems = "stretch";
        btnParent.style.gap = "10px";
        btnParent.style.flexWrap = "nowrap";
        btnParent.style.width = "100%";
        btnParent.style.marginTop = "18px";
    }

    [primaryBtn, secondaryBtn, cancelBtn].forEach(btn => {
        if (!btn) return;

        btn.style.width = "100%";
        btn.style.minHeight = "44px";
        btn.style.fontSize = "15px";
        btn.style.fontWeight = "600";
        btn.style.padding = "10px 16px";
        btn.style.borderRadius = "8px";
        btn.style.boxSizing = "border-box";
        btn.style.margin = "0";
        btn.style.cursor = "pointer";
    });

    primaryBtn.style.background = "#d35400";
    primaryBtn.style.color = "white";
    primaryBtn.style.border = "none";

    secondaryBtn.style.background = "#1a73e8";
    secondaryBtn.style.color = "white";
    secondaryBtn.style.border = "none";

    cancelBtn.style.background = "#ffffff";
    cancelBtn.style.color = "#333";
    cancelBtn.style.border = "1px solid #ddd";

    modal.style.display = "flex";

    if (typeof L !== "undefined" && L.DomEvent) {
        L.DomEvent.disableClickPropagation(modal);
    }

    primaryBtn.onclick = function() {
        modal.style.display = "none";

        if (onCreateNew) {
            onCreateNew();
        }
    };

    secondaryBtn.onclick = function() {
        modal.style.display = "none";

        if (onEditCurrent) {
            onEditCurrent();
        }
    };

    cancelBtn.onclick = function() {
        modal.style.display = "none";

        if (onCancel) {
            onCancel();
        }
    };
}

function activateDrawingModeUi() {
    const stack =
        window.multiGpxStack ||
        multiGpxStack ||
        [];

    if (
        !Array.isArray(stack) ||
        stack.length === 0
    ) {
        if (typeof window.createBlankGpxProject === "function") {
            window.createBlankGpxProject();
        }
    }		
	
    isDrawingMode = true;
    drawMethod = 'scribble';

    const drawBtn = document.getElementById('drawModeBtn');
    if (drawBtn) {
        drawBtn.style.setProperty('background', "#d35400", 'important');
        drawBtn.style.setProperty('color', "white", 'important');
    }

		const methodBtn = document.getElementById('drawMethodBtn');
		if (methodBtn) {
		    methodBtn.style.setProperty("display", "none", "important");
		}

    const mapEl = document.getElementById('map');
    if (mapEl) {
        mapEl.style.cursor = "crosshair";
    }

    if (typeof showMapToast === 'function') {
        showMapToast("手繪模式：按住拖曳繪製\n\n電腦：按住 Ctrl 移動地圖\n手機：兩指按住移動地圖");
    }

    if (map && map.dragging) {
        map.dragging.disable();
    }
}

function prepareDrawingModeStart() {

    const stackIdx =
        window.currentMultiIndex || 0;

    const currentFile =
        window.multiGpxStack &&
        window.multiGpxStack[stackIdx];

    if (!currentFile) {
        createNewDrawingRouteForCurrentFile();
        return true;
    }

    const hasTrack =
        fileHasTrackData(currentFile);

    if (!hasTrack) {
        if (!Array.isArray(currentFile.routes)) {
            currentFile.routes = [];
        }

        if (currentFile.routes.length === 0) {
            const routeName =
                currentFile.displayName ||
                currentFile.fileName ||
                currentFile.name ||
                "航點資料";

            currentFile.routes.push({
                id: "waypoint_only_draw_" + Date.now(),
                name: routeName,
                displayName: routeName,
                fileName: currentFile.fileName || currentFile.name || "GPX",
                color: currentFile.color || "#0000FF",
                points: [],
                segments: [],
                waypoints: currentFile.waypoints || [],
                visible: true,
                isCombined: false,
                isDrawTrack: false,
                isWaypointOnly: true
            });
        }

        window.currentMultiIndex = stackIdx;
        window.currentActiveIndex = 0;
        window.drawTargetMode = "edit-selected";

        syncDrawingGlobals(currentFile, 0);

        if (typeof updateRouteSelectDropdown === "function") {
            updateRouteSelectDropdown();
        }

        const routeSelect = document.getElementById("routeSelect");
        if (routeSelect && routeSelect.options && routeSelect.options.length > 0) {
            routeSelect.value = "0";
        }

        if (typeof loadRoute === "function") {
            loadRoute(0);
        }

        return true;
    }

    showDrawingRouteChoiceModal(
        function() {
            createNewDrawingRouteForCurrentFile();
            activateDrawingModeUi();
        },
        function() {
            window.drawTargetMode = "edit-selected";

            const activeIdx =
                window.currentActiveIndex || 0;

            if (typeof loadRoute === "function") {
                loadRoute(activeIdx);
            }

            activateDrawingModeUi();
        },
        function() {
            window.drawTargetMode = null;
        }
    );

    return "pending";
}

function ensureCustomDrawTrack() {

    const color = "#0000FF";

    if (typeof multiGpxStack === "undefined" || !Array.isArray(multiGpxStack)) {
        multiGpxStack = [];
    }

    window.multiGpxStack = multiGpxStack;

    let stackIdx = window.currentMultiIndex || 0;
    if (stackIdx < 0) stackIdx = 0;

    let track = multiGpxStack[stackIdx];

    let existingWaypoints = [];

    if (track && Array.isArray(track.waypoints)) {
        existingWaypoints = track.waypoints;
    } else if (
        Array.isArray(window.allTracks) &&
        window.allTracks[0] &&
        Array.isArray(window.allTracks[0].waypoints)
    ) {
        existingWaypoints = window.allTracks[0].waypoints;
    } else if (
        typeof allTracks !== "undefined" &&
        Array.isArray(allTracks) &&
        allTracks[0] &&
        Array.isArray(allTracks[0].waypoints)
    ) {
        existingWaypoints = allTracks[0].waypoints;
    }

    if (!track) {
        track = {
            id: "draw_" + Date.now(),
            name: "自訂路線",
            displayName: "自訂路線",
            fileName: "自訂路線",
            color: color,
            points: [],
            segments: [],
            waypoints: existingWaypoints,
            stats: {
                totalDistance: 0,
                totalElevation: 0
            },
            visible: true,
            isCombined: false,
            isDrawTrack: true,
            layer: L.polyline([], {
                color: color,
                weight: 6,
                opacity: 1,
                dashArray: null
            }).addTo(map)
        };

        multiGpxStack[stackIdx] = track;
        window.multiGpxStack[stackIdx] = track;

    } else {
        track.id = track.id || "draw_" + Date.now();
        track.name = track.name || "自訂路線";
        track.displayName = track.displayName || track.name || "自訂路線";
        track.fileName = track.fileName || track.displayName || "自訂路線";
        track.color = track.color || color;

        if (!Array.isArray(track.points)) track.points = [];
        if (!Array.isArray(track.segments)) track.segments = [];
        if (!Array.isArray(track.waypoints)) track.waypoints = existingWaypoints;

        track.visible = true;
        track.isCombined = false;
        track.isDrawTrack = true;

        if (Array.isArray(track.routes)) {
            delete track.routes;
        }

        if (!(track.layer instanceof L.Polyline)) {
            track.layer = L.polyline(track.segments || [], {
                color: track.color || color,
                weight: 6,
                opacity: 1,
                dashArray: null
            }).addTo(map);
        } else {
            if (!map.hasLayer(track.layer)) {
                track.layer.addTo(map);
            }
            track.layer.setLatLngs(track.segments || []);
            track.layer.setStyle({
                color: track.color || color,
                weight: 6,
                opacity: 1,
                dashArray: null
            });
        }

        multiGpxStack[stackIdx] = track;
        window.multiGpxStack[stackIdx] = track;
    }

    if (
        existingWaypoints.length > 0 &&
        (!Array.isArray(track.waypoints) || track.waypoints.length === 0)
    ) {
        track.waypoints = existingWaypoints;
    }

    window.currentMultiIndex = stackIdx;
    window.currentActiveIndex = 0;

    syncDrawingGlobals(track, 0);

    const multiBar = document.getElementById("multiGpxBtnBar");
    if (multiBar) {
        multiBar.style.display = "flex";
    }

    if (typeof renderMultiGpxButtons === "function") {
        renderMultiGpxButtons();
    }

    if (typeof updateWptTable === "function") {
        updateWptTable();
    }

    if (typeof renderWaypointsAndPeaks === "function") {
        renderWaypointsAndPeaks(track);
    }

    if (typeof renderRouteInfo === "function") {
        renderRouteInfo();
    }

    return track;
}


function getActiveDrawingTarget() {

    const stackIdx =
        window.currentMultiIndex || 0;

    let routeIdx =
        window.currentActiveIndex || 0;

    let currentFile =
        multiGpxStack &&
        multiGpxStack[stackIdx];

    if (!currentFile) {

        const drawTrack =
            ensureCustomDrawTrack();

        return {
            currentFile: drawTrack,
            targetTrack: drawTrack,
            stackIdx: 0,
            routeIdx: 0,
            targetRouteIdx: 0
        };
    }

    if (currentFile.isDrawTrack) {

        if (!Array.isArray(currentFile.points)) {
            currentFile.points = [];
        }

        if (!Array.isArray(currentFile.segments)) {
            currentFile.segments = [];
        }

        if (!Array.isArray(currentFile.waypoints)) {
            currentFile.waypoints = [];
        }

        syncDrawingGlobals(currentFile, 0);

        return {
            currentFile: currentFile,
            targetTrack: currentFile,
            stackIdx: stackIdx,
            routeIdx: 0,
            targetRouteIdx: 0
        };
    }

    let routes =
        Array.isArray(currentFile.routes) && currentFile.routes.length > 0
            ? currentFile.routes
            : (
                Array.isArray(allTracks) && allTracks.length > 0
                    ? allTracks
                    : []
            );

    if (!Array.isArray(routes) || routes.length === 0) {

        if (!Array.isArray(currentFile.points)) {
            currentFile.points = [];
        }

        if (!Array.isArray(currentFile.segments)) {
            currentFile.segments = [];
        }

        syncDrawingGlobals(currentFile, 0);

        return {
            currentFile: currentFile,
            targetTrack: currentFile,
            stackIdx: stackIdx,
            routeIdx: 0,
            targetRouteIdx: 0
        };
    }

    currentFile.routes =
        routes;

    if (
        routeIdx === 0 &&
        routes.length > 1 &&
        routes[0] &&
        routes[0].isCombined === true
    ) {

        let drawRouteIdx =
            routes.findIndex(r =>
                r &&
                r.isDrawTrack === true &&
                r.isHandDrawRoute === true
            );

        if (drawRouteIdx === -1) {

            const drawRoute = {
                id: "draw_route_" + Date.now(),
                name: "手繪路線",
                displayName: "手繪路線",
                fileName: currentFile.fileName || currentFile.name || "GPX",
                color: currentFile.color || "#0000FF",

                points: [],
                segments: [],
                waypoints: currentFile.waypoints || [],

                visible: true,
                isCombined: false,
                isDrawTrack: true,
                isHandDrawRoute: true
            };

            routes.push(drawRoute);
            drawRouteIdx = routes.length - 1;
        }

        routeIdx =
            drawRouteIdx;

        window.currentActiveIndex =
            drawRouteIdx;

        const routeSelect =
            document.getElementById("routeSelect");

        if (
            routeSelect &&
            routeSelect.options.length !== routes.length &&
            typeof updateRouteSelectDropdown === "function"
        ) {
            updateRouteSelectDropdown();
        }

        if (
            routeSelect &&
            routeSelect.options &&
            routeSelect.options.length > drawRouteIdx
        ) {
            routeSelect.value =
                String(drawRouteIdx);
        }

        const targetTrack =
            routes[drawRouteIdx];

        if (!Array.isArray(targetTrack.points)) {
            targetTrack.points = [];
        }

        if (!Array.isArray(targetTrack.segments)) {
            targetTrack.segments = [];
        }

        targetTrack.waypoints =
            currentFile.waypoints || targetTrack.waypoints || [];

        syncDrawingGlobals(currentFile, drawRouteIdx);

        return {
            currentFile: currentFile,
            targetTrack: targetTrack,
            stackIdx: stackIdx,
            routeIdx: drawRouteIdx,
            targetRouteIdx: drawRouteIdx
        };
    }

    if (
        routeIdx < 0 ||
        routeIdx >= routes.length
    ) {
        routeIdx = 0;
    }

    const targetTrack =
        routes[routeIdx];

    if (!Array.isArray(targetTrack.points)) {
        targetTrack.points = [];
    }

    if (!Array.isArray(targetTrack.segments)) {
        targetTrack.segments = [];
    }

    targetTrack.waypoints =
        currentFile.waypoints || targetTrack.waypoints || [];

    syncDrawingGlobals(currentFile, routeIdx);

    return {
        currentFile: currentFile,
        targetTrack: targetTrack,
        stackIdx: stackIdx,
        routeIdx: routeIdx,
        targetRouteIdx: routeIdx
    };
}

function rebuildCombinedRouteForFile(currentFile) {

    if (
        !currentFile ||
        !Array.isArray(currentFile.routes) ||
        currentFile.routes.length === 0
    ) {
        return;
    }

    const routes =
        currentFile.routes;

    const hasCombined =
        routes[0] &&
        routes[0].isCombined === true;

    if (!hasCombined) {
        return;
    }

    const childRoutes =
        routes.slice(1);

    let combinedPoints = [];
    let combinedSegments = [];

    childRoutes.forEach(route => {

        if (!route) return;

        const pts =
            Array.isArray(route.points)
                ? route.points
                : [];

        if (pts.length === 0) return;

        combinedPoints =
            combinedPoints.concat(pts);

        if (
            Array.isArray(route.segments) &&
            route.segments.length > 0
        ) {
            route.segments.forEach(seg => {
                if (Array.isArray(seg) && seg.length > 0) {
                    combinedSegments.push(seg);
                }
            });
        } else {
            combinedSegments.push(
                pts.map(p => [p.lat, p.lon])
            );
        }
    });

    let totalDist = 0;

    const recalculatedPoints =
        combinedPoints.map((p, idx, arr) => {

            if (idx > 0) {

                const prev =
                    arr[idx - 1];

                totalDist += calculateDistance(
                    prev.lat,
                    prev.lon,
                    p.lat,
                    p.lon
                );
            }

            return {
                ...p,
                distance: totalDist
            };
        });

    routes[0].points =
        recalculatedPoints;

    routes[0].segments =
        combinedSegments;

    routes[0].waypoints =
        currentFile.waypoints || routes[0].waypoints || [];

    currentFile.points =
        recalculatedPoints;

    currentFile.segments =
        combinedSegments;

    currentFile.waypoints =
        currentFile.waypoints || routes[0].waypoints || [];

    if (currentFile.layer instanceof L.Polyline) {
        currentFile.layer.setLatLngs(
            combinedSegments
        );
    }

    allTracks =
        routes;

    window.allTracks =
        routes;
}

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
        const symNode = w.getElementsByTagName("sym")[0];
        const sym = symNode ? symNode.textContent.trim() : "Waypoint";
        const type = typeof window.getWaypointTypeFromSym === "function"
            ? window.getWaypointTypeFromSym(sym)
            : "waypoint";
        
        allWpts.push({ 
            lat, lon, name, 
            ele: ele ? parseFloat(ele) : 0,
            time: rawTime,
            localTime: rawTime ? formatDate(new Date(new Date(rawTime).getTime() + 8*3600000)) : "無時間資訊",
            sym: sym,
            type: type
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

		const shouldShowTaiwanGrid =
		    isLatLngInTaiwanArea(
		        lat,
		        lon
		    );
		
		let twd97 =
		    null;
		
		let twd67 =
		    null;
		
		if (
		    shouldShowTaiwanGrid &&
		    typeof proj4 !== "undefined" &&
		    typeof WGS84_DEF !== "undefined" &&
		    typeof TWD97_DEF !== "undefined" &&
		    typeof TWD67_DEF !== "undefined"
		) {
		    twd97 =
		        proj4(
		            WGS84_DEF,
		            TWD97_DEF,
		            [
		                lon,
		                lat
		            ]
		        );
		
		    twd67 =
		        proj4(
		            WGS84_DEF,
		            TWD67_DEF,
		            [
		                lon,
		                lat
		            ]
		        );
		}
    const addressHtml = searchAddr ? 
        `<div style="color: #666; font-size: 12px; line-height: 1.4; margin-bottom: 5px; word-break: break-all;">${searchAddr}</div>` : "";
    
    const eleParam = foundEle !== null ? foundEle : 'null';
    const eleDisplay = foundEle !== null ? `高度: ${foundEle.toFixed(0)} m<br>` : "";
    const editIcon = `<span class="material-icons" style="font-size:16px; cursor:pointer; vertical-align:middle; margin-left:4px; color:#d35400;" 
        onclick="event.stopPropagation(); handleWptEdit(-1, ${lat}, ${lon}, ${eleParam}, '${title}', null, null)">add_location</span>`;
    const gUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    const gMapIconBtn = `<a href="${gUrl}" target="_blank" style="text-decoration:none; margin-right:8px; display:inline-flex; align-items:center; justify-content:center; width: 28px; height: 28px; background: #fff; border: 1px solid #ccc; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); vertical-align: middle;"><img src="https://ychiking.github.io/gpx-online-viewer/GoogleMaps.png" style="width:18px; height:18px; display:block;"></a>`;
    
    let taiwanGridHtml =
		    "";
		
		if (
		    shouldShowTaiwanGrid &&
		    twd97 &&
		    twd67
		) {
		    taiwanGridHtml =
		        `<b>TWD97:</b> ${Math.round(twd97[0])}, ${Math.round(twd97[1])}<br>` +
		        `<b>TWD67:</b> ${Math.round(twd67[0])}, ${Math.round(twd67[1])}`;
		}
		
		const weatherTitle =
    		String(title || "自選位置").replace(/'/g, "\\'");

		const weatherButtonHtml =
		    `<div style="margin-top:8px;">
		        <button onclick="event.stopPropagation(); openWeatherModal(${lat}, ${lon}, '${weatherTitle}')"
		            style="width:100%; background:#0FB9FD; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold;">
		            🌤 查此位置天氣
		        </button>
		    </div>`;
//"    
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
						${taiwanGridHtml}
						${weatherButtonHtml}
						<div style="display:flex; margin-top:10px; gap:8px;">
                <button onclick="setFreeAB('A', ${lat}, ${lon})" style="flex:1; background:#007bff; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold;">設定 A</button>
                <button onclick="setFreeAB('B', ${lat}, ${lon})" style="flex:1; background:#e83e8c; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold;">設定 B</button>
            </div>
        </div>`;
    
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
    
		if (currentPopup && map.hasLayer(currentPopup)) {
		    currentPopup
		        .setLatLng(latlng)
		        .setContent(content);
		} else {
		    currentPopup = L.popup({
		            autoClose: false,
		            closeOnClick: false
		        })
		        .setLatLng(latlng)
		        .setContent(content)
		        .openOn(map);
		}
		
		if (currentPopup._freeClickRemoveHandler) {
		    currentPopup.off(
		        "remove",
		        currentPopup._freeClickRemoveHandler
		    );
		}
		
		currentPopup._freeClickRemoveHandler = function() {
		    if (
		        window.activeFocusCircle &&
		        map.hasLayer(window.activeFocusCircle)
		    ) {
		        map.removeLayer(window.activeFocusCircle);
		    }
		};
		
		currentPopup.on(
		    "remove",
		    currentPopup._freeClickRemoveHandler
		);
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

    const selectedIndex =
        parseInt(e.target.value, 10) || 0;

    if (
        typeof isDrawingMode !== "undefined" &&
        isDrawingMode === true
    ) {
        const drawModeBtn =
            document.getElementById("drawModeBtn");

        if (drawModeBtn) {
            drawModeBtn.click();
        }
    }
    
    const chartBox =
        document.getElementById("elevationChartContainer") ||
        document.getElementById("chartContainer") ||
        document.getElementById("elevationPanel") ||
        document.querySelector(".elevation-chart-container") ||
        document.querySelector(".elevation-panel");

    const wasHidden =
        chartBox &&
        (
            chartBox.style.display === "none" ||
            chartBox.classList.contains("collapsed") ||
            chartBox.dataset.collapsed === "true"
        );

    window.currentActiveIndex =
        selectedIndex;

    loadRoute(selectedIndex);

    setTimeout(() => {
        if (chartBox && wasHidden) {
            chartBox.style.display = "none";
            chartBox.classList.add("collapsed");
            chartBox.dataset.collapsed = "true";
        }

        if (typeof window.refreshGpxManagerIfOpen === "function") {
            window.refreshGpxManagerIfOpen();
        }
    }, 0);
});

const startIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [18, 30], iconAnchor: [9, 30], popupAnchor: [1, -25], shadowSize: [30, 30]
});
const endIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [18, 30], iconAnchor: [9, 30], popupAnchor: [1, -25], shadowSize: [30, 30]
});
const wptIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [20, 32], iconAnchor: [10, 32], popupAnchor: [1, -28], shadowSize: [32, 32]
});



function ensureWaypointIconStyle() {
    if (document.getElementById("waypointIconStyle")) return;

    const waypointIconStyle = document.createElement("style");
    waypointIconStyle.id = "waypointIconStyle";
    waypointIconStyle.innerHTML = `
        .wpt-map-icon {
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            filter: none !important;
        }

        .wpt-map-icon .material-icons {
            font-size: 29px;
            line-height: 29px;
            color: var(--wpt-icon-color, #1a73e8);
            -webkit-text-stroke: 1px var(--wpt-icon-border-color, #ffffff);
            text-shadow: none !important;
            filter: none !important;
        }

        #modalWptIconSelectBtn {
            width: 34px !important;
            height: 34px !important;
            min-width: 34px !important;
            max-width: 34px !important;
            min-height: 34px !important;
            max-height: 34px !important;
            border: 1px solid #bbb !important;
            border-radius: 6px !important;
            background: #fff !important;
            cursor: pointer !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 0 !important;
            margin: 0 !important;
            box-sizing: border-box !important;
        }

        #modalWptIconSelectBtn:hover {
            background: #f5f5f5 !important;
            border-color: #777 !important;
        }

        #modalWptIconSelectBtn .material-icons {
            font-size: 22px;
            line-height: 22px;
            color: var(--wpt-icon-color, #1a73e8);
            -webkit-text-stroke: 0.8px var(--wpt-icon-border-color, #ffffff);
            text-shadow: none !important;
            filter: none !important;
        }

        .wpt-icon-popup-panel {
            position: fixed;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            z-index: 2147483647 !important;
            width: min(330px, calc(100vw - 36px));
            max-height: min(520px, calc(100vh - 80px));
            overflow-y: auto;
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 12px 35px rgba(0,0,0,0.28);
            padding: 14px;
            box-sizing: border-box;
        }

        .wpt-icon-popup-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.18);
            z-index: 2147483646 !important;
        }

        .wpt-icon-popup-grid {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 7px;
            margin-top: 12px;
        }

        .wpt-icon-popup-option {
            width: 34px;
            height: 34px;
            min-width: 34px;
            min-height: 34px;
            border: 1px solid #ddd;
            border-radius: 6px;
            background: #fff;
            padding: 0;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: #555;
            box-sizing: border-box;
        }

        .wpt-icon-popup-option .material-icons {
            font-size: 22px;
            line-height: 22px;
            color: var(--wpt-icon-color, #1a73e8);
            -webkit-text-stroke: 0.8px var(--wpt-icon-border-color, #ffffff);
            text-shadow: none !important;
            filter: none !important;
        }

        .wpt-icon-popup-option.selected {
            border-color: #1a73e8;
            background: #e8f0fe;
        }

        .wpt-icon-color-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 12px;
            font-size: 13px;
            color: #333;
        }

        .wpt-icon-color-input {
            width: 36px;
            height: 30px;
            padding: 0;
            border: 1px solid #ccc;
            border-radius: 6px;
            background: #fff;
            cursor: pointer;
        }
    `;
    document.head.appendChild(waypointIconStyle);
}

ensureWaypointIconStyle();

window.defaultWaypointIconColor = window.defaultWaypointIconColor || "#1a73e8";
window.defaultWaypointIconBorderColor = window.defaultWaypointIconBorderColor || "#ffffff";

window.waypointIconTypes = {
    waypoint: {
        label: "航點",
        icon: "place",
        gpxSym: "Waypoint"
    },
    trailhead: {
        label: "登山口",
        icon: "hiking",
        gpxSym: "Trail Head"
    },
    summit: {
        label: "山頂",
        icon: "terrain",
        gpxSym: "Summit"
    },
    water: {
        label: "水源",
        icon: "water_drop",
        gpxSym: "Water Source"
    },
    hut: {
        label: "山屋",
        icon: "house",
        gpxSym: "Lodge"
    },
    camp: {
        label: "營地",
        icon: "festival",
        gpxSym: "Campground"
    },
    restroom: {
        label: "廁所",
        icon: "wc",
        gpxSym: "Restroom"
    },
    restaurant: {
        label: "餐廳",
        icon: "restaurant",
        gpxSym: "Restaurant"
    },
    favorite: {
        label: "最愛",
        icon: "favorite",
        gpxSym: "Favorite"
    },
    parking: {
        label: "停車場",
        icon: "local_parking",
        gpxSym: "Parking Area"
    },
    blocked: {
        label: "禁止",
        icon: "cancel",
        gpxSym: "Circle with X"
    },
    flagBlue: {
        label: "藍色旗子",
        icon: "flag",
        gpxSym: "Flag, Blue"
    },
    flagRed: {
        label: "紅色旗子",
        icon: "flag",
        gpxSym: "Flag, Red"
    },
    flagGreen: {
        label: "綠色旗子",
        icon: "flag",
        gpxSym: "Flag, Green"
    }
};

window.getWaypointTypeFromSym = function(sym) {
    const targetSym = String(sym || "").trim().toLowerCase();
    const map = window.waypointIconTypes || {};

    for (const key in map) {
        if (
            map[key] &&
            String(map[key].gpxSym || "").toLowerCase() === targetSym
        ) {
            return key;
        }
    }

    if (targetSym.includes("trail") || targetSym.includes("head")) return "trailhead";
    if (targetSym.includes("summit") || targetSym.includes("peak")) return "summit";
    if (targetSym.includes("camp")) return "camp";
    if (targetSym.includes("water") || targetSym.includes("drinking")) return "water";
    if (targetSym.includes("restaurant") || targetSym.includes("food") || targetSym.includes("dining")) return "restaurant";
    if (targetSym.includes("lodg") || targetSym.includes("hut") || targetSym.includes("cabin") || targetSym.includes("hotel") || targetSym.includes("sleep")) return "hut";
    if (targetSym.includes("restroom") || targetSym.includes("toilet") || targetSym.includes("wc")) return "restroom";
    if (targetSym.includes("parking")) return "parking";
    if (targetSym.includes("favorite") || targetSym.includes("star") || targetSym.includes("heart")) return "favorite";
    if (targetSym.includes("information") || targetSym.includes("info") || targetSym.includes("sign")) return "information";
    if (targetSym.includes("circle with x") || targetSym.includes("blocked") || targetSym.includes("block") || targetSym.includes("danger") || targetSym.includes("warning") || targetSym.includes("hazard")) return "blocked";
    if (targetSym.includes("flag") && targetSym.includes("red")) return "flagRed";
    if (targetSym.includes("flag") && targetSym.includes("green")) return "flagGreen";
    if (targetSym.includes("flag")) return "flagBlue";

    return "waypoint";
};

window.getWaypointIconInfo = function(typeOrWpt) {
    let typeKey = "waypoint";

    if (typeof typeOrWpt === "string") {
        typeKey = typeOrWpt;
    } else if (typeOrWpt && typeOrWpt.type) {
        typeKey = typeOrWpt.type;
    } else if (typeOrWpt && typeOrWpt.iconType) {
        typeKey = typeOrWpt.iconType;
    } else if (typeOrWpt && typeOrWpt.sym) {
        typeKey = window.getWaypointTypeFromSym(typeOrWpt.sym);
    }

    const legacyTypeMap = {
        peak: "summit",
        lodge: "hut",
        food: "restaurant",
        transport: "parking",
        photo: "information",
        danger: "blocked",
        flag: "flagBlue"
    };

    if (
        window.waypointIconTypes &&
        !window.waypointIconTypes[typeKey] &&
        legacyTypeMap[typeKey]
    ) {
        typeKey = legacyTypeMap[typeKey];
    }

    return window.waypointIconTypes[typeKey] || window.waypointIconTypes.waypoint;
};

window.getWaypointIconColor = function(wpt) {
		if (
		    wpt &&
		    wpt.iconColor &&
		    String(wpt.iconColor).trim() !== ""
		) {
		    return String(wpt.iconColor).trim();
		}

    const typeKey =
        wpt && wpt.type
            ? wpt.type
            : (
                wpt && wpt.iconType
                    ? wpt.iconType
                    : (
                        wpt &&
                        wpt.sym &&
                        typeof window.getWaypointTypeFromSym === "function"
                            ? window.getWaypointTypeFromSym(wpt.sym)
                            : "waypoint"
                    )
            );

    if (
        typeKey === "blocked" ||
        typeKey === "flagRed" ||
        typeKey === "favorite"
    ) {
        return "#d93025";
    }

    if (
        typeKey === "summit" ||
        typeKey === "flagGreen"
    ) {
        return "#188038";
    }
    
    if (
        typeKey === "restaurant"
    ) {
        return "#EA3680";
    }
    
    if (
        typeKey === "hut"
    ) {
        return "#C74600";
    }

    if (
        typeKey === "camp"
    ) {
        return "#8B5A2B";
    }

    return "#1a73e8";
};

window.createWaypointDivIcon = function(wpt) {
    if (typeof ensureWaypointIconStyle === "function") {
        ensureWaypointIconStyle();
    }

    const iconInfo =
        typeof window.getWaypointIconInfo === "function"
            ? window.getWaypointIconInfo(wpt)
            : { icon: "place" };

    const typeKey =
        wpt && wpt.type
            ? wpt.type
            : (
                wpt &&
                wpt.sym &&
                typeof window.getWaypointTypeFromSym === "function"
                    ? window.getWaypointTypeFromSym(wpt.sym)
                    : "waypoint"
            );

    const extraClass =
        typeKey === "waypoint"
            ? " wpt-icon-place-dot"
            : "";

    const iconColor =
        typeof window.getWaypointIconColor === "function"
            ? window.getWaypointIconColor(wpt)
            : "#1a73e8";

    return L.divIcon({
        className: "",
        html:
            '<div class="wpt-map-icon' + extraClass + '" style="--wpt-icon-color:' + iconColor + '; --wpt-icon-border-color:' + (window.defaultWaypointIconBorderColor || "#ffffff") + ';">' +
                '<span class="material-icons">' +
                    (iconInfo.icon || "place") +
                '</span>' +
                '<span class="wpt-anchor-dot"></span>' +
            '</div>',
        iconSize: [32, 32],
        iconAnchor: [16, 30],
        popupAnchor: [0, -30]
    });
};

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
		    const lat =
		        parseFloat(
		            w.getAttribute("lat")
		        );
		
		    const lon =
		        parseFloat(
		            w.getAttribute("lon")
		        );
		
		    const name =
		        w.getElementsByTagName("name")[0]?.textContent ||
		        "未命名航點";
		
		    const time =
		        w.getElementsByTagName("time")[0]?.textContent;
		
		    const ele =
		        w.getElementsByTagName("ele")[0]?.textContent;
		
		    const symNode =
		        w.getElementsByTagName("sym")[0];
		
		    const sym =
		        symNode
		            ? symNode.textContent.trim()
		            : "Waypoint";
		
		    const type =
		        typeof window.getWaypointTypeFromSym === "function"
		            ? window.getWaypointTypeFromSym(sym)
		            : "waypoint";
		
		    const iconColor =
		        typeof getChildTextByLocalName === "function"
		            ? getChildTextByLocalName(
		                w,
		                "iconColor"
		            )
		            : "";
		
		    allWpts.push({
		        lat: lat,
		        lon: lon,
		        name: name,
		        ele: ele ? parseFloat(ele) : 0,
		        time: time || null,
		        localTime: time
		            ? formatDate(
		                new Date(
		                    new Date(time).getTime() + 8 * 3600000
		                )
		            )
		            : "無時間資訊",
		        sym: sym,
		        type: type,
		        iconColor: iconColor
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
        const stackIdx = window.currentMultiIndex || 0;

        if (typeof multiGpxStack === "undefined" || !Array.isArray(multiGpxStack)) {
            multiGpxStack = [];
        }

        let currentFile = multiGpxStack[stackIdx];

        if (!currentFile) {
            currentFile = {
                id: "gpx_" + Date.now(),
                name: displayName,
                fileName: displayName,
                color: "#0000FF",
                visible: true,
                waypoints: combinedWaypoints || allWpts || []
            };
            multiGpxStack[stackIdx] = currentFile;
        }

        currentFile.routes = allTracks;
        currentFile.points = allTracks[0] && Array.isArray(allTracks[0].points) ? allTracks[0].points : [];
        currentFile.segments = allTracks[0] && Array.isArray(allTracks[0].segments) ? allTracks[0].segments : [];
        currentFile.waypoints = combinedWaypoints || allWpts || currentFile.waypoints || [];

        if (!currentFile.fileName) currentFile.fileName = displayName;
        if (!currentFile.name) currentFile.name = displayName;

        syncDrawingGlobals(currentFile, 0);
        updateRouteSelectDropdown();
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
	
	const shouldSkipAutoFitBounds =
    focusPos &&
    focusPos.skipAutoFitBounds === true;

	const hasValidFocusPos =
    focusPos &&
    Number.isFinite(Number(focusPos.lat)) &&
    Number.isFinite(Number(focusPos.lng));
    
  const preserveChartState =
    focusPos &&
    focusPos.preserveChartState === true;

	const chartContainerBeforeLoad =
	    document.getElementById("chartContainer");
	
	const wasChartOpenBeforeLoad =
	    focusPos &&
	    focusPos.preserveChartState === true &&
	    typeof window.userElevationChartExpanded === "boolean"
	        ? window.userElevationChartExpanded
	        : (
	            chartContainerBeforeLoad &&
	            window.getComputedStyle(chartContainerBeforeLoad).display !== "none"
	        );
	
	if (typeof window.renderRouteToolControl === "function") {
    window.renderRouteToolControl();
}

    if (typeof customColor !== 'string') customColor = null;

    renderSideToolbar();

    index = parseInt(index, 10) || 0;
    window.currentActiveIndex = index;

    setTimeout(() => {
        if (window.historyManager && typeof historyManager.updateUI === 'function') {
            historyManager.updateUI();
        } else if (typeof historyManager !== 'undefined' && historyManager && typeof historyManager.updateUI === 'function') {
            historyManager.updateUI();
        }
    }, 10);

    map.eachLayer(layer => {
        if (
            layer instanceof L.CircleMarker &&
            layer.options &&
            layer.options.radius === 7
        ) {
            map.removeLayer(layer);
        }
    });

    if (window.activeFocusCircle) {
        window.activeFocusCircle = null;
    }

    map.closePopup();

    if (typeof window.clearABSettings === 'function') {
        window.clearABSettings();
    }

    const stackIdx =
        window.currentMultiIndex || 0;

    const currentFile =
        multiGpxStack &&
        multiGpxStack[stackIdx];

    if (!currentFile) return;

    let routeList = [];

    if (
        Array.isArray(currentFile.routes) &&
        currentFile.routes.length > 0
    ) {
        routeList = currentFile.routes;
    } else if (
        Array.isArray(allTracks) &&
        allTracks.length > 0
    ) {
        routeList = allTracks;
    } else {
        routeList = [currentFile];
    }

    if (
        index < 0 ||
        index >= routeList.length
    ) {
        index = 0;
        window.currentActiveIndex = 0;
    }

    const sel =
        routeList[index] || currentFile;

    const isSelectingCombined =
        index === 0 ||
        sel.isCombined === true ||
        (
            sel.name &&
            String(sel.name).includes("結合")
        ) ||
        (
            sel.displayName &&
            String(sel.displayName).includes("結合")
        ) ||
        (
            sel.routeDisplayName &&
            String(sel.routeDisplayName).includes("結合")
        );

    trackPoints =
        Array.isArray(sel.points)
            ? sel.points
            : [];

    window.trackPoints =
        trackPoints;

    const trackColor =
        customColor ||
        currentFile.color ||
        sel.color ||
        "#0000FF";

    const fileName =
        window.currentFileNameForDisplay ||
        currentFile.fileName ||
        currentFile.name ||
        "default";

    const fileKey =
        fileName + "_" + index;

    if (
        window.customNameCache &&
        window.customNameCache[fileKey]
    ) {
        const cachedName =
            window.customNameCache[fileKey];

        sel.name =
            cachedName;

        if (routeList && routeList[index]) {
            routeList[index].name =
                cachedName;
        }

        const routeSelect =
            document.getElementById("routeSelect");

        if (
            routeSelect &&
            routeSelect.options[index]
        ) {
            routeSelect.options[index].text =
                cachedName;
        }
    }

    const wptToggleContainer =
        document.getElementById("wptToggleContainer");

    if (wptToggleContainer) {
        wptToggleContainer.style.display = "block";
    }

    if (hoverMarker) {
        if (map.hasLayer(hoverMarker)) {
            map.removeLayer(hoverMarker);
        }
        hoverMarker = null;
    }

    const breakTracks = (pts) => {

        if (!pts || pts.length === 0) return [];

        const result = [];
        let currentSeg = [pts[0]];

        for (let j = 1; j < pts.length; j++) {

            const p1 = pts[j - 1];
            const p2 = pts[j];

            const lat1 = p1.lat ?? p1[0];
            const lng1 = p1.lon ?? p1.lng ?? p1[1];

            const lat2 = p2.lat ?? p2[0];
            const lng2 = p2.lon ?? p2.lng ?? p2[1];

            const d =
                Math.sqrt(
                    Math.pow(lat1 - lat2, 2) +
                    Math.pow(lng1 - lng2, 2)
                );

            if (d > 0.001) {
                if (currentSeg.length > 0) {
                    result.push(currentSeg);
                }
                currentSeg = [];
            }

            currentSeg.push(p2);
        }

        if (currentSeg.length > 0) {
            result.push(currentSeg);
        }

        return result;
    };

    const drawSegments =
        Array.isArray(sel.segments) &&
        sel.segments.length > 0
            ? sel.segments
            : breakTracks(trackPoints);

    multiGpxStack.forEach((item, i) => {

        const layer =
            item && item.layer;

        if (!(layer instanceof L.Polyline)) return;

        const hasChildRoutes =
            item &&
            Array.isArray(item.routes) &&
            item.routes.length > 1;

        if (i === stackIdx) {

            if (hasChildRoutes) {

                layer.setStyle({
                    opacity: 0,
                    weight: 0,
                    dashArray: null,
                    interactive: false
                });

            } else {

                layer.setStyle({
                    color: item.color || "#0000FF",
                    opacity: item.visible === false ? 0 : 1.0,
                    weight: 6,
                    dashArray: null,
                    interactive: true
                });
            }

        } else {

		    if (
		        item &&
		        Array.isArray(item.routes) &&
		        item.routes.length > 1
		    ) {
		        let backgroundSegments = [];

		        if (
		            item.routes[0] &&
		            item.routes[0].isCombined === true &&
		            Array.isArray(item.routes[0].segments) &&
		            item.routes[0].segments.length > 0
		        ) {
		            backgroundSegments =
		                item.routes[0].segments;
		
		        } else {

		            item.routes.forEach(function(route) {
		                if (!route || route.isCombined === true) return;
		
		                if (
		                    Array.isArray(route.segments) &&
		                    route.segments.length > 0
		                ) {
		                    route.segments.forEach(function(seg) {
		                        if (
		                            Array.isArray(seg) &&
		                            seg.length > 0
		                        ) {
		                            backgroundSegments.push(seg);
		                        }
		                    });
		
		                } else if (
		                    Array.isArray(route.points) &&
		                    route.points.length > 0
		                ) {
		                    backgroundSegments.push(
		                        route.points.map(function(p) {
		                            return [p.lat, p.lon];
		                        })
		                    );
		                }
		            });
		        }
		
		        if (backgroundSegments.length > 0) {
		            layer.setLatLngs(backgroundSegments);
		        }
		    }
		
		    layer.setStyle({
		        color: item.color || "#0000FF",
		        opacity: item.visible === false ? 0 : 0.4,
		        weight: 4,
		        dashArray: null,
		        interactive: true
		    });
		}
    });

    if (Array.isArray(window.routePreviewLayers)) {
        window.routePreviewLayers.forEach(layer => {
            if (layer && map.hasLayer(layer)) {
                map.removeLayer(layer);
            }
        });
    }

    window.routePreviewLayers = [];

    if (
        currentFile &&
        !currentFile.isDrawTrack &&
        Array.isArray(routeList) &&
        routeList.length > 1
    ) {
        routeList.forEach((route, routeIdx) => {

            if (!route) return;

            if (
                routeIdx === 0 &&
                route.isCombined === true
            ) {
                return;
            }

            let latlngs = [];

            if (
                Array.isArray(route.segments) &&
                route.segments.length > 0
            ) {
                latlngs = route.segments;

            } else if (
                Array.isArray(route.points) &&
                route.points.length > 0
            ) {
                latlngs = [
                    route.points.map(p => [p.lat, p.lon])
                ];
            }

            if (!latlngs || latlngs.length === 0) return;

            const isSelected =
                routeIdx === index;

            const previewLayer =
                L.polyline(
                    latlngs,
                    {
                        color:
                            currentFile.color ||
                            route.color ||
                            "#0000FF",

                        weight:
                            isSelected ? 6 : 4,

                        opacity:
                            isSelected ? 1.0 : 0.5,

                        dashArray:
                            isSelected ? null : "5,8",

                        interactive:
                            isSelected 
                    }
                ).addTo(map);

            window.routePreviewLayers.push(previewLayer);

            if (
                isSelected &&
                previewLayer.bringToFront
            ) {
                previewLayer.bringToFront();
            }

            if (
                (isSelected || isSelectingCombined) &&
                typeof window.bindRouteActionMenuToLayer === "function"
            ) {
                window.bindRouteActionMenuToLayer(
                    previewLayer,
                    stackIdx,
                    routeIdx
                );
            }
        });
    }

    markers.forEach(m => {
        if (m && map.hasLayer(m)) {
            map.removeLayer(m);
        }
    });

    wptMarkers.forEach(m => {
        if (m && map.hasLayer(m)) {
            map.removeLayer(m);
        }
    });

    if (window.chart) {
        window.chart.destroy();
        window.chart = null;
    }

    markers = [];
    wptMarkers = [];

    if (polyline) {
        if (map.hasLayer(polyline)) {
            map.removeLayer(polyline);
        }
    }
    
    if (
	    window.activeRouteHaloLayer &&
	    map.hasLayer(window.activeRouteHaloLayer)
	) {
	    map.removeLayer(window.activeRouteHaloLayer);
	}
	
	window.activeRouteHaloLayer = null;

    polyline =
        L.polyline(
            [],
            {
                color: trackColor,
                weight: 6,
                opacity: 1.0,
                dashArray: null,
                interactive: true
            }
        ).addTo(map);

    if (
        trackPoints &&
        trackPoints.length > 0
    ) {

        const selectedSegments =
            Array.isArray(sel.segments) &&
            sel.segments.length > 0
                ? sel.segments
                : breakTracks(trackPoints);

		if (
		    window.activeRouteHaloLayer &&
		    map.hasLayer(window.activeRouteHaloLayer)
		) {
		    map.removeLayer(window.activeRouteHaloLayer);
		}
		
		const isWaypointSelected =
		    window.currentToolTarget &&
		    window.currentToolTarget.type === "waypoint";
		
		if (!isWaypointSelected) {
		    window.activeRouteHaloLayer =
		        L.polyline(
		            selectedSegments,
		            {
		                color: "#ffffff",
		                weight: 10,
		                opacity: 0.95,
		                dashArray: null,
		                interactive: false
		            }
		        ).addTo(map);
		
		    if (
		        window.activeRouteHaloLayer &&
		        typeof window.activeRouteHaloLayer.bringToFront === "function"
		    ) {
		        window.activeRouteHaloLayer.bringToFront();
		    }
		}
		
		polyline.setLatLngs(
		    selectedSegments
		);
		
		polyline.setStyle({
		    color: trackColor,
		    weight: 6,
		    opacity: 1.0,
		    dashArray: null,
		    interactive: true
		});
		
		if (
		    window.activeRouteHaloLayer &&
		    typeof window.activeRouteHaloLayer.bringToFront === "function"
		) {
		    window.activeRouteHaloLayer.bringToFront();
		}
		
		polyline.bringToFront();

        if (
        	!shouldSkipAutoFitBounds &&
            polyline.getBounds &&
            polyline.getBounds().isValid()
        ) {
            if (
                !map.getBounds().pad(0.05).intersects(polyline.getBounds())
            ) {
                map.fitBounds(
                    polyline.getBounds(),
                    {
                        padding: [20, 20],
                        maxZoom: 16,
                        animate: true
                    }
                );
            }
        }

		polyline.on('click', (e) => {
		
		    L.DomEvent.stopPropagation(e);
		
		    if (window.splitRoutePickMode) {
		        if (
		            typeof window.executeSplitRoutePick === "function" &&
		            window.executeSplitRoutePick(e.latlng)
		        ) {
		            return;
		        }
		    }
		
		    window.currentToolTarget = {
		        type: "route",
		        fileIdx:
		            typeof window.currentMultiIndex === "number"
		                ? window.currentMultiIndex
		                : 0,
		        routeIdx:
		            typeof window.currentActiveIndex === "number"
		                ? window.currentActiveIndex
		                : 0,
		        wptIdx: null
		    };
		
		    document.querySelectorAll(".wpt-table tr").forEach(function(row) {
		        row.classList.remove("wpt-selected-row");
		    });
		
		    if (typeof window.renderRouteToolControl === "function") {
		        window.renderRouteToolControl();
		    }
		
		    if (
		        !window.activeRouteHaloLayer &&
		        Array.isArray(polyline.getLatLngs())
		    ) {
		        const haloLatLngs =
		            polyline.getLatLngs();
		
		        const hasHaloLatLngs =
		            haloLatLngs.some(function(seg) {
		                return (
		                    Array.isArray(seg) &&
		                    seg.length >= 2
		                );
		            });
		
		        if (hasHaloLatLngs) {
		            window.activeRouteHaloLayer =
		                L.polyline(
		                    haloLatLngs,
		                    {
		                        color: "#ffffff",
		                        weight: 10,
		                        opacity: 0.95,
		                        dashArray: null,
		                        interactive: false
		                    }
		                ).addTo(map);
		
		            if (
		                window.activeRouteHaloLayer &&
		                typeof window.activeRouteHaloLayer.bringToFront === "function"
		            ) {
		                window.activeRouteHaloLayer.bringToFront();
		            }
		
		            if (
		                polyline &&
		                typeof polyline.bringToFront === "function"
		            ) {
		                polyline.bringToFront();
		            }
		        }
		    }
		
		    let minD = Infinity;
		    let idx = 0;

            trackPoints.forEach((p, pIdx) => {

                const d =
                    Math.sqrt(
                        Math.pow(p.lat - e.latlng.lat, 2) +
                        Math.pow(p.lon - e.latlng.lng, 2)
                    );

                if (d < minD) {
                    minD = d;
                    idx = pIdx;
                }
            });

            if (minD * 111000 <= 50) {

                const progressBar =
                    document.getElementById('gpxProgressBar');

                if (progressBar) {
                    progressBar.value = idx;
                    progressBar.dispatchEvent(
                        new Event('input', { bubbles: true })
                    );
                }

                if (chart) {
                    const meta =
                        chart.getDatasetMeta(0);

                    const point =
                        meta.data[idx];

                    if (point) {
                        chart.setActiveElements([
                            {
                                datasetIndex: 0,
                                index: idx
                            }
                        ]);

                        chart.tooltip.setActiveElements(
                            [
                                {
                                    datasetIndex: 0,
                                    index: idx
                                }
                            ],
                            {
                                x: point.x,
                                y: point.y
                            }
                        );

                        chart.update('none');
                    }
                }

                if (!hoverMarker) {
                    hoverMarker =
                        L.circleMarker(
                            [
                                trackPoints[idx].lat,
                                trackPoints[idx].lon
                            ],
                            {
                                radius: 7,
                                color: '#ffffff',
                                weight: 2,
                                fillColor: '#1a73e8',
                                fillOpacity: 1,
                                interactive: false
                            }
                        ).addTo(map);

                } else if (!map.hasLayer(hoverMarker)) {
                    hoverMarker.addTo(map);
                }

                hoverMarker
                    .setLatLng([
                        trackPoints[idx].lat,
                        trackPoints[idx].lon
                    ])
                    .bringToFront();

                if (typeof showCustomPopup === 'function') {
                    showCustomPopup(
                        idx,
                        "位置資訊",
                        null
                    );
                }
            }
        });

        if (
		    polyline &&
		    typeof window.bindRouteActionMenuToLayer === "function"
		) {
		    window.bindRouteActionMenuToLayer(
		        polyline,
		        stackIdx,
		        index
		    );
		}

        try {

            const startMarker =
                L.marker(
                    [
                        trackPoints[0].lat,
                        trackPoints[0].lon
                    ],
                    {
                        icon: startIcon,
                        zIndexOffset: 2000
                    }
                ).addTo(map);

            startMarker.on('click', (e) => {

                L.DomEvent.stopPropagation(e);

                const progressBar =
                    document.getElementById('gpxProgressBar');
                    
                if (progressBar) {
                    progressBar.value = 0;
                    progressBar.dispatchEvent(
                        new Event('input', { bubbles: true })
                    );
                }

                if (hoverMarker) {
                    hoverMarker
                        .setLatLng([
                            trackPoints[0].lat,
                            trackPoints[0].lon
                        ])
                        .addTo(map)
                        .bringToFront();
                }

                showCustomPopup(
                    0,
                    "起點",
                    null
                );
            });

            markers.push(startMarker);

            if (trackPoints.length > 1) {

                const lastIdx =
                    trackPoints.length - 1;

                const endMarker =
                    L.marker(
                        [
                            trackPoints[lastIdx].lat,
                            trackPoints[lastIdx].lon
                        ],
                        {
                            icon: endIcon,
                            zIndexOffset: 2000
                        }
                    ).addTo(map);

                endMarker.on('click', (e) => {

                    L.DomEvent.stopPropagation(e);

                    const progressBar =
                        document.getElementById('gpxProgressBar');

                    if (progressBar) {
                        progressBar.value = lastIdx;
                        progressBar.dispatchEvent(
                            new Event('input', { bubbles: true })
                        );
                    }

                    if (hoverMarker) {
                        hoverMarker
                            .setLatLng([
                                trackPoints[lastIdx].lat,
                                trackPoints[lastIdx].lon
                            ])
                            .addTo(map)
                            .bringToFront();
                    }

                    showCustomPopup(
                        lastIdx,
                        "終點",
                        null
                    );
                });

                markers.push(endMarker);
            }

        } catch (err) {}

				if (
				    typeof drawElevationChart === 'function' &&
				    (
				        !preserveChartState ||
				        wasChartOpenBeforeLoad
				    )
				) {
				    drawElevationChart();
				}
    }

	let visibleWaypointsForStart = [];
	
	if (
	    sel.waypoints &&
	    sel.waypoints.length > 0
	) {

        const activeIdx =
            window.currentActiveIndex || 0;

        let startTime = null;
        let endTime = null;

        if (
            trackPoints &&
            trackPoints.length > 0
        ) {
            const times =
                trackPoints
                    .map(p => p.time ? new Date(p.time).getTime() : null)
                    .filter(t => t);

            if (times.length > 0) {
                startTime =
                    Math.min(...times) - (60 * 60 * 1000);

                endTime =
                    Math.max(...times) + (60 * 60 * 1000);
            }
        }

        const displayWaypoints =
            sel.waypoints.filter(w => {

                if (typeof window.isWaypointVisibleOnCurrentRoute === "function") {
                    return window.isWaypointVisibleOnCurrentRoute(
                        w,
                        activeIdx,
                        sel
                    );
                }

                if (activeIdx === 0) return true;

                if (w.belongsToRoute !== undefined) {
                    return Number(w.belongsToRoute) === Number(activeIdx);
                }

                const wTimeVal =
                    w.time ? new Date(w.time).getTime() : null;

                if (wTimeVal && startTime) {

                    const is2025Trek =
                        new Date(wTimeVal).getFullYear() === 2025;

                    const isInTimeRange =
                        wTimeVal >= startTime &&
                        wTimeVal <= endTime;

                    if (
                        is2025Trek &&
                        !isInTimeRange
                    ) {
                        return false;
                    }
                }

                return true;
            });

		visibleWaypointsForStart =  displayWaypoints;
				
        displayWaypoints.forEach((w, displayWptIdx) => {

            let initialTIdx = null;

            if (
                trackPoints &&
                trackPoints.length > 0
            ) {
                let minD = Infinity;
                let nearestIdx = -1;

                trackPoints.forEach((tp, pi) => {

                    const d =
                        Math.sqrt(
                            Math.pow(w.lat - tp.lat, 2) +
                            Math.pow(w.lon - tp.lon, 2)
                        );

                    if (d < minD) {
                        minD = d;
                        nearestIdx = pi;
                    }
                });

                if (
                    nearestIdx !== -1 &&
                    minD * 111000 <= 30
                ) {
                    initialTIdx = nearestIdx;
                }
            }

            let drawLat = w.lat;
            let drawLon = w.lon;
            let isFocusTarget = false;

            const wm =
                L.marker(
                    [
                        drawLat,
                        drawLon
                    ],
                    {
                        icon: (
                            typeof window.createWaypointDivIcon === "function"
                                ? window.createWaypointDivIcon(w)
                                : wptIcon
                        ),
                        draggable: true,
                        zIndexOffset: isFocusTarget ? 2000 : 0
                    }
                ).addTo(map);

            let previousLatLng =
                wm.getLatLng();

            let wasOnPath =
                initialTIdx !== null;

            const isAlways =
                typeof showWptNameAlways !== 'undefined' &&
                showWptNameAlways;

            wm.bindTooltip(
                w.name,
                {
                    permanent: isAlways,
                    direction: isAlways ? 'right' : 'top',
                    offset: isAlways ? [10, 0] : [0, -10],
                    className: isAlways ? 'wpt-label-label' : ''
                }
            );

            if (isAlways) {
                wm.openTooltip();
            } else {
                wm.closeTooltip();
            }

			wm.on('dragstart', function(event) {
			    window.isDraggingWpt =
			        true;
			
			    if (
			        window.activeRouteHaloLayer &&
			        typeof map !== "undefined" &&
			        map &&
			        typeof map.hasLayer === "function" &&
			        map.hasLayer(window.activeRouteHaloLayer)
			    ) {
			        map.removeLayer(window.activeRouteHaloLayer);
			    }
			
			    window.activeRouteHaloLayer =
			        null;
			
			    window.currentToolTarget = {
			        type: "waypoint",
			        fileIdx:
			            typeof window.currentMultiIndex === "number"
			                ? window.currentMultiIndex
			                : 0,
			        routeIdx:
			            typeof window.currentActiveIndex === "number"
			                ? window.currentActiveIndex
			                : 0,
			        wptIdx:
			            typeof originalIdx === "number"
			                ? originalIdx
			                : (
			                    typeof idx === "number"
			                        ? idx
			                        : null
			                )
			    };
			
			    if (typeof window.renderRouteToolControl === "function") {
			        window.renderRouteToolControl();
			    }
			});

            wm.on('dragend', function(event) {

                const marker =
                    event.target;

				const newLatLng =
				    marker.getLatLng();
				
				const mapViewBeforeWptDrag = {
				    center: map.getCenter(),
				    zoom: map.getZoom()
				};
				
				const rawLat =
				    newLatLng.lat;
				
				const rawLon =
				    newLatLng.lng;
				
				const snappedPoint =
				    typeof window.findNearestPointOnCurrentRoute === "function"
				        ? window.findNearestPointOnCurrentRoute(
				            rawLat,
				            rawLon,
				            50
				        )
				        : null;
				
				const isOnPath =
				    !!snappedPoint;
				
				const newLat =
				    snappedPoint
				        ? snappedPoint.lat
				        : rawLat;
				
				const newLon =
				    snappedPoint
				        ? snappedPoint.lon
				        : rawLon;
				
				const confirmMsg =
				    isOnPath
				        ? `確定將「${w.name}」吸附到目前路線嗎？<br>` +
				          `距離放開位置約 ${snappedPoint.meters.toFixed(1)} 公尺。<br>` +
				          `(座標、高度、距離與時間將同步更新)`
				        : (
				            wasOnPath
				                ? `確定將「${w.name}」移至此處？<br>(此處不在路徑上，將遺失高度、距離與時間資訊)`
				                : `確定將「${w.name}」移至此處？<br>(此處不在路徑上，將遺失高度與時間資訊)`
				        );

                window.showAppConfirm(
                    "移動航點確認",
                    confirmMsg,
                    function() {

                        const oldWptSnapshot =
                            JSON.parse(
                                JSON.stringify(w)
                            );

                        const startPos = {
                            lat: previousLatLng.lat,
                            lng: previousLatLng.lng
                        };

                        const endPos = {
                            lat: newLat,
                            lng: newLon
                        };

                        const currentFileIdx =
                            window.currentMultiIndex;

                        historyManager.execute({

                            fileIdx: currentFileIdx,

                            do: function() {

							    if (
							        window.currentMultiIndex !== this.fileIdx
							    ) {
							        if (
							            typeof switchMultiGpx === 'function'
							        ) {
							            switchMultiGpx(this.fileIdx);
							        }
							    }
							
							    window.isDraggingWpt = true;
							
							    const activeRouteIdxAtMove =
							        typeof window.currentActiveIndex === "number"
							            ? window.currentActiveIndex
							            : 0;
							
							    const activeRouteAtMove =
							        window.allTracks &&
							        window.allTracks[activeRouteIdxAtMove]
							            ? window.allTracks[activeRouteIdxAtMove]
							            : null;
							
							    const wasVisibleOnCurrentRouteBeforeMove =
							        typeof window.isWaypointVisibleOnCurrentRoute === "function"
							            ? window.isWaypointVisibleOnCurrentRoute(
							                w,
							                activeRouteIdxAtMove,
							                activeRouteAtMove
							            )
							            : true;
							
							    const updateLogic =
							        (targetWpt) => {
							
							            targetWpt.lat =
							                endPos.lat;
							
							            targetWpt.lon =
							                endPos.lng;
							
										if (isOnPath && snappedPoint) {
										
										    targetWpt.ele =
										        snappedPoint.ele;
										
										    targetWpt.time =
										        snappedPoint.time || new Date().toISOString();
										
										    targetWpt.localTime =
										        snappedPoint.timeLocal ||
										        formatDate(
										            new Date(
										                new Date().getTime() + 8 * 3600000
										            )
										        );
										
										    targetWpt.distance =
										        snappedPoint.distance;
										
										    targetWpt.snappedToRoute =
										        true;
										
										    targetWpt.snapSegmentIndex =
										        snappedPoint.segmentIndex;
										
										    targetWpt.snapT =
										        snappedPoint.t;
										
										} else {
							
							                targetWpt.ele = 0;
							
							                targetWpt.time =
							                    new Date().toISOString();
							
							                targetWpt.localTime =
							                    formatDate(
							                        new Date(
							                            new Date().getTime() + 8 * 3600000
							                        )
							                    );
							
							                targetWpt.distance =
							                    undefined;
							            }
							
							            if (wasVisibleOnCurrentRouteBeforeMove) {
							                if (!Array.isArray(targetWpt.visibleRouteIndexes)) {
							                    targetWpt.visibleRouteIndexes = [];
							                }
							
							                if (!Array.isArray(targetWpt.hiddenRouteIndexes)) {
							                    targetWpt.hiddenRouteIndexes = [];
							                }
							
							                targetWpt.visibleRouteIndexes =
							                    targetWpt.visibleRouteIndexes
							                        .map(Number)
							                        .filter(function(idx) {
							                            return Number.isFinite(idx);
							                        });
							
							                targetWpt.hiddenRouteIndexes =
							                    targetWpt.hiddenRouteIndexes
							                        .map(Number)
							                        .filter(function(idx) {
							                            return Number.isFinite(idx);
							                        });
							
							                if (
							                    !targetWpt.visibleRouteIndexes.includes(
							                        Number(activeRouteIdxAtMove)
							                    )
							                ) {
							                    targetWpt.visibleRouteIndexes.push(
							                        Number(activeRouteIdxAtMove)
							                    );
							                }
							
							                targetWpt.hiddenRouteIndexes =
							                    targetWpt.hiddenRouteIndexes.filter(function(idx) {
							                        return idx !== Number(activeRouteIdxAtMove);
							                    });
							            }
							        };
							
							    syncCombinedWaypoints(
							        w.name,
							        L.latLng(
							            startPos.lat,
							            startPos.lng
							        ),
							        w.time,
							        updateLogic
							    );
							
							    updateLogic(w);
							
							    updateRawGpxContent(
							        w.name,
							        L.latLng(
							            startPos.lat,
							            startPos.lng
							        ),
							        endPos.lat,
							        endPos.lng
							    );
							
								previousLatLng =
								    L.latLng(
								        endPos.lat,
								        endPos.lng
								    );
								
								marker.setLatLng([
								    endPos.lat,
								    endPos.lng
								]);
								
								wasOnPath =
								    isOnPath;
							
								loadRoute(
								    window.currentActiveIndex || 0,
								    null,
								    {
								        lat: endPos.lat,
								        lng: endPos.lng,
								        skipAutoFitBounds: true,
								        preserveChartState: true
								    }
								);
							
							    if (
							        !document.fullscreenElement &&
							        typeof renderWaypointsAndPeaks === 'function'
							    ) {
							        renderWaypointsAndPeaks(sel);
							    }
							
							    setTimeout(() => {
							        window.isDraggingWpt = false;
							    }, 100);
							},

                            undo: function() {

                                if (
                                    window.currentMultiIndex !== this.fileIdx
                                ) {
                                    if (
                                        typeof switchMultiGpx === 'function'
                                    ) {
                                        switchMultiGpx(this.fileIdx);
                                    }
                                }

                                Object.assign(
                                    w,
                                    oldWptSnapshot
                                );

                                updateRawGpxContent(
                                    w.name,
                                    L.latLng(
                                        endPos.lat,
                                        endPos.lng
                                    ),
                                    startPos.lat,
                                    startPos.lng
                                );

                                previousLatLng =
                                    L.latLng(
                                        startPos.lat,
                                        startPos.lng
                                    );

                                wasOnPath =
                                    oldWptSnapshot.distance !== undefined;

								loadRoute(
								    window.currentActiveIndex || 0,
								    null,
								    {
								        lat: startPos.lat,
								        lng: startPos.lng,
								        skipAutoFitBounds: true,
								        preserveChartState: true
								    }
								);

                                if (
                                    !document.fullscreenElement &&
                                    typeof renderWaypointsAndPeaks === 'function'
                                ) {
                                    renderWaypointsAndPeaks(sel);
                                }
                            }
                        });
                    },
                    function() {
                        marker.setLatLng(previousLatLng);
                    }
                );
            });

            wm.on('click', (e) => {

                L.DomEvent.stopPropagation(e);
						                
						        const sourceWptList =
										    sel && Array.isArray(sel.waypoints)
										            ? sel.waypoints
										            : [];
										
										let originalWptIdx =
										    sourceWptList.indexOf(w);
										
										if (originalWptIdx === -1) {
										    originalWptIdx =
										        sourceWptList.findIndex(function(item) {
				            if (!item) return false;
				
				            const sameName =
				                String(item.name || "") === String(w.name || "");
				
				            const sameLat =
				                Math.abs(Number(item.lat) - Number(w.lat)) < 0.0000001;
				
				            const sameLon =
				                Math.abs(Number(item.lon) - Number(w.lon)) < 0.0000001;
				
				            const sameTime =
				                !item.time ||
				                !w.time ||
				                String(item.time) === String(w.time);
				
				            return sameName && sameLat && sameLon && sameTime;
				        });
				}
				
				if (originalWptIdx === -1) {
				    originalWptIdx =
				        displayWptIdx;
				}
				
				window.currentToolTarget = {
				    type: "waypoint",
				    fileIdx:
				        typeof window.currentMultiIndex === "number"
				            ? window.currentMultiIndex
				            : 0,
				    routeIdx:
				        typeof window.currentActiveIndex === "number"
				            ? window.currentActiveIndex
				            : 0,
				    wptIdx: originalWptIdx
				};
				
				if (
				    window.activeRouteHaloLayer &&
				    typeof map !== "undefined" &&
				    map.hasLayer(window.activeRouteHaloLayer)
				) {
				    map.removeLayer(window.activeRouteHaloLayer);
				}
				
				window.activeRouteHaloLayer =
				    null;
				
				document.querySelectorAll(".wpt-table tr").forEach(function(row) {
				    row.classList.remove("wpt-selected-row");
				});
				
				const selectedRow =
				    document.querySelector(
				        '.wpt-table tr[data-idx="' + originalWptIdx + '"]'
				    );
				
				if (selectedRow) {
				    selectedRow.classList.add("wpt-selected-row");
				}
				
				if (typeof window.renderRouteToolControl === "function") {
				    window.renderRouteToolControl();
				}
				
				if (
				    window.activeFocusCircle &&
				    typeof map !== "undefined" &&
				    map &&
				    typeof map.hasLayer === "function" &&
				    map.hasLayer(window.activeFocusCircle)
				) {
				    map.removeLayer(window.activeFocusCircle);
				}
				
				window.activeFocusCircle =
				    L.circleMarker(
				        [
				            Number(w.lat),
				            Number(w.lon)
				        ],
				        {
				            radius: 7,
				            color: "#ffffff",
				            weight: 2,
				            fillColor: "#1a73e8",
				            fillOpacity: 1,
				            interactive: false
				        }
				    ).addTo(map);
				
				window.activeFocusCircle.bringToFront();

                let clickTIdx = null;

                if (
                    trackPoints &&
                    trackPoints.length > 0
                ) {

                    let minD = Infinity;

                    trackPoints.forEach((tp, pi) => {

                        const d =
                            Math.sqrt(
                                Math.pow(w.lat - tp.lat, 2) +
                                Math.pow(w.lon - tp.lon, 2)
                            );

                        if (d < minD) {
                            minD = d;
                            clickTIdx = pi;
                        }
                    });

                    if (minD * 111000 > 50) {
                        clickTIdx = null;
                    }
                }

                showCustomPopup(
                    clickTIdx !== null ? clickTIdx : 999999,
                    w.name,
                    clickTIdx !== null ? "wpt" : 0,
                    w.lat,
                    w.lon
                );
            });

            wptMarkers.push(wm);
        });
    }

	const startLat =
	    trackPoints.length > 0
	        ? trackPoints[0].lat
	        : (
	            visibleWaypointsForStart &&
	            visibleWaypointsForStart[0]
	                ? visibleWaypointsForStart[0].lat
	                : null
	        );
	
	const startLon =
	    trackPoints.length > 0
	        ? trackPoints[0].lon
	        : (
	            visibleWaypointsForStart &&
	            visibleWaypointsForStart[0]
	                ? visibleWaypointsForStart[0].lon
	                : null
	        );
	
	if (
	    startLat !== null &&
	    startLon !== null
	) {
	    if (
	        focusPos &&
	        typeof focusPos.lat === "number" &&
	        typeof focusPos.lng === "number"
	    ) {
	        if (!hoverMarker) {
	            hoverMarker =
	                L.circleMarker(
	                    [
	                        focusPos.lat,
	                        focusPos.lng
	                    ],
	                    {
	                        radius: 7,
	                        color: "#ffffff",
	                        fillColor: "#1a73e8",
	                        fillOpacity: 1,
	                        weight: 2
	                    }
	                ).addTo(map);
	        } else {
	            hoverMarker
	                .setLatLng([
	                    focusPos.lat,
	                    focusPos.lng
	                ]);
	
	            if (!map.hasLayer(hoverMarker)) {
	                hoverMarker.addTo(map);
	            }
	
	            hoverMarker.bringToFront();
	        }
	
	    } else {
	        if (
	            hoverMarker &&
	            map.hasLayer(hoverMarker)
	        ) {
	            map.removeLayer(hoverMarker);
	        }
	
	        hoverMarker = null;
	    }
	
	} else {
	    
	    if (
	        hoverMarker &&
	        map.hasLayer(hoverMarker)
	    ) {
	        map.removeLayer(hoverMarker);
	    }
	
	    hoverMarker = null;
	}

    if (typeof renderRouteInfo === 'function') {
        renderRouteInfo();
    }

    if (typeof renderWaypointsAndPeaks === 'function') {
        renderWaypointsAndPeaks(sel);
    }
    
    
    if (
        !shouldSkipAutoFitBounds &&
        (
            !Array.isArray(trackPoints) ||
            trackPoints.length === 0
        )
    ) {
        const waypointBoundsSource =
            Array.isArray(visibleWaypointsForStart) &&
            visibleWaypointsForStart.length > 0
                ? visibleWaypointsForStart
                : (
                    sel &&
                    Array.isArray(sel.waypoints)
                        ? sel.waypoints
                        : (
                            currentFile &&
                            Array.isArray(currentFile.waypoints)
                                ? currentFile.waypoints
                                : []
                        )
                );

        const validWaypointLatLngs =
            waypointBoundsSource
                .map(function(w) {
                    if (!w) return null;

                    const lat =
                        Number(w.lat);

                    const lng =
                        Number(
                            w.lon !== undefined
                                ? w.lon
                                : w.lng
                        );

                    if (
                        !Number.isFinite(lat) ||
                        !Number.isFinite(lng)
                    ) {
                        return null;
                    }

                    return [
                        lat,
                        lng
                    ];
                })
                .filter(function(pt) {
                    return !!pt;
                });

        if (
            validWaypointLatLngs.length > 1 &&
            typeof L !== "undefined" &&
            typeof map !== "undefined" &&
            map
        ) {
            const wptBounds =
                L.latLngBounds(
                    validWaypointLatLngs
                );

            if (
                wptBounds &&
                wptBounds.isValid()
            ) {
                map.fitBounds(
                    wptBounds,
                    {
                        padding: [50, 50],
                        maxZoom: 16,
                        animate: true
                    }
                );
            }

        } else if (
            validWaypointLatLngs.length === 1 &&
            typeof map !== "undefined" &&
            map
        ) {
            map.setView(
                validWaypointLatLngs[0],
                Math.max(
                    map.getZoom ? map.getZoom() : 15,
                    15
                ),
                {
                    animate: true
                }
            );
        }
    }

    
    if (
        Array.isArray(trackPoints) &&
        trackPoints.length > 1 &&
        typeof renderRouteDirectionMarkers === "function"
    ) {
        renderRouteDirectionMarkers();

    } else if (
        typeof clearRouteDirectionMarkers === "function"
    ) {
        clearRouteDirectionMarkers();
    }
	
	if (!window.routeDirectionZoomHandlerInstalled) {
	    window.routeDirectionZoomHandlerInstalled = true;
	
	    map.on("zoomend moveend", function() {
	        if (
	            Array.isArray(window.trackPoints) &&
	            window.trackPoints.length > 1 &&
	            typeof renderRouteDirectionMarkers === "function"
	        ) {
	            renderRouteDirectionMarkers(
	                window.allTracks &&
	                window.allTracks[window.currentActiveIndex]
	                    ? window.allTracks[window.currentActiveIndex]
	                    : null
	            );

	        } else if (
	            typeof clearRouteDirectionMarkers === "function"
	        ) {
	            clearRouteDirectionMarkers();
	        }
	    });
	}

    if (typeof initProgressBar === 'function') {
        initProgressBar();
    }

	if (hasValidFocusPos) {
	    window.activeFocusCircle =
	        L.circleMarker(
	            [
	                Number(focusPos.lat),
	                Number(focusPos.lng)
	            ],
	            {
	                radius: 7,
	                color: '#ffffff',
	                weight: 2,
	                fillColor: '#1a73e8',
	                fillOpacity: 1,
	                interactive: false
	            }
	        ).addTo(map);
	}

    if (typeof updateWptIconStatus === 'function') {
        updateWptIconStatus();
    }
    
		if (typeof applyElevationChartAutoState === "function") {
		    applyElevationChartAutoState({
		        preserveUserChartState: preserveChartState,
		        wasChartOpenBeforeLoad: wasChartOpenBeforeLoad
		    });
		}
}
 
function toggleWptNames() {

    showWptNameAlways = !showWptNameAlways;
    
    let currentIndex = (window.currentActiveIndex !== undefined) ? window.currentActiveIndex : 0;

    loadRoute(currentIndex);
		}

		window.toggleCompass = function(btn) {
		
		    
		    if (window.compassEnabled) {
		        window.compassEnabled = false;
		
		        if (window.compassHandler) {
		            window.removeEventListener(
		                "deviceorientation",
		                window.compassHandler,
		                true
		            );
		
		            window.removeEventListener(
		                "deviceorientationabsolute",
		                window.compassHandler,
		                true
		            );
		        }
		
		        window.compassHandler = null;
		        window.compassHeading = null;
		        window.compassHeadingBuffer = [];
		        window.lastCompassUpdateTime = null;
		        window.compassHasAbsoluteOrientation = false;
		        window.compassDisplayRotation = null;
		
		        const compass =
		            document.getElementById("mapCompass") ||
		            document.querySelector(".map-compass");
		
		        if (compass) {
		            compass.classList.remove("show");
		        }
		
		        if (btn) {
		            btn.style.background = "white";
		            btn.style.color = "";
		        }
		
		        return;
		    }
		
		    
		    window.compassEnabled = true;
		    window.compassHeading = null;
		    window.compassHeadingBuffer = [];
		    window.lastCompassUpdateTime = null;
		    window.compassHasAbsoluteOrientation = false;
		
		    const compass =
		        document.getElementById("mapCompass") ||
		        document.querySelector(".map-compass");
		
		    if (!compass) {
		        alert("找不到指北針元素 mapCompass");
		        window.compassEnabled = false;
		        return;
		    }
		
		    compass.classList.add("show");
		
		    if (btn) {
		        btn.style.background = "#e8f0fe";
		        btn.style.color = "#1a73e8";
		    }
		
		    
		    const compassNeedle =
		        document.getElementById("mapCompassNeedle") ||
		        compass.querySelector("img") ||
		        compass;
		
		    compassNeedle.style.transformOrigin =
		        "center center";
		
		    compassNeedle.style.transition =
		        "transform 0.12s linear";
		
		    window.compassHandler = function(e) {
		
		        
		        if (e.type === "deviceorientationabsolute") {
		            window.compassHasAbsoluteOrientation = true;
		
		        } else if (
		            window.compassHasAbsoluteOrientation === true &&
		            e.type === "deviceorientation"
		        ) {
		            return;
		        }
		
		        let heading = null;
		
		        const isIOS =
		            typeof e.webkitCompassHeading === "number";
		
		        const isAndroid =
		            !isIOS &&
		            typeof e.alpha === "number";
		
		        if (isIOS) {
		            heading =
		                e.webkitCompassHeading;
		
		        } else if (isAndroid) {
		            
		            heading =
		                360 - e.alpha;
		        }
		
		        if (
		            heading === null ||
		            !Number.isFinite(heading)
		        ) {
		            return;
		        }
		
		        const screenAngle =
		            (
		                screen.orientation &&
		                typeof screen.orientation.angle === "number"
		            )
		                ? screen.orientation.angle
		                : (
		                    typeof window.orientation === "number"
		                        ? window.orientation
		                        : 0
		                );
		
		        heading =
		            (heading + screenAngle + 360) % 360;
		
		        
		        const now =
		            Date.now();
		
		        const minUpdateMs =
		            isAndroid
		                ? 120
		                : 60;
		
		        if (
		            window.lastCompassUpdateTime &&
		            now - window.lastCompassUpdateTime < minUpdateMs
		        ) {
		            return;
		        }
		
		        window.lastCompassUpdateTime =
		            now;
		
		        if (!Array.isArray(window.compassHeadingBuffer)) {
		            window.compassHeadingBuffer = [];
		        }
		
		        window.compassHeadingBuffer.push(heading);
		
		        const bufferMax =
		            isAndroid
		                ? 3
		                : 3;
		
		        while (window.compassHeadingBuffer.length > bufferMax) {
		            window.compassHeadingBuffer.shift();
		        }
		
		        let sumX = 0;
		        let sumY = 0;
		
		        window.compassHeadingBuffer.forEach(function(h) {
		            const rad =
		                h * Math.PI / 180;
		
		            sumX +=
		                Math.cos(rad);
		
		            sumY +=
		                Math.sin(rad);
		        });
		
		        let avgHeading =
		            Math.atan2(sumY, sumX) * 180 / Math.PI;
		
		        avgHeading =
		            (avgHeading + 360) % 360;
		
		        if (
		            !Number.isFinite(Number(window.compassHeading))
		        ) {
		            window.compassHeading =
		                avgHeading;
		        } else {
		            let diff =
		                avgHeading - window.compassHeading;
		
		            diff =
		                ((diff + 540) % 360) - 180;
		
		            const minDiff =
		                isAndroid
		                    ? 4
		                    : 3;
		
		            if (Math.abs(diff) < minDiff) {
		                return;
		            }
		
		            const smoothFactor =
		                isAndroid
		                    ? 0.35
		                    : 0.35;
		
		            window.compassHeading =
		                (window.compassHeading + diff * smoothFactor + 360) % 360;
		        }
		
		        
				const compassTargetRotation =
				    -window.compassHeading;
				
				if (
				    !Number.isFinite(Number(window.compassDisplayRotation))
				) {
				    window.compassDisplayRotation =
				        compassTargetRotation;
				} else {
				    let rotateDiff =
				        compassTargetRotation - window.compassDisplayRotation;
				
				    
				    rotateDiff =
				        ((rotateDiff + 540) % 360) - 180;
				
				    window.compassDisplayRotation =
				        window.compassDisplayRotation + rotateDiff;
				}
				
				compassNeedle.style.transform =
				    "rotate(" + window.compassDisplayRotation + "deg)";
		    };
		
		    if (
						    typeof DeviceOrientationEvent !== "undefined" &&
						    typeof DeviceOrientationEvent.requestPermission === "function"
						) {
						    DeviceOrientationEvent.requestPermission()
						        .then(function(permissionState) {
						            if (permissionState === "granted") {
						
						                window.addEventListener(
						                    "deviceorientation",
						                    window.compassHandler,
						                    true
						                );
						
						                if (btn) {
						                    btn.style.background = "#e8f0fe";
						                    btn.style.color = "#1a73e8";
						                }
						
						                const compass =
						                    document.getElementById("mapCompass") ||
						                    document.querySelector(".map-compass");
						
						                if (compass) {
						                    compass.classList.add("show");
						                }
						
						            } else {
						                alert("未允許方向感測器，無法啟用指北針");
						
						                window.compassEnabled = false;
						
						                if (btn) {
						                    btn.style.background = "white";
						                    btn.style.color = "";
						                }
						            }
						        })
						        .catch(function(err) {
						
						            alert("無法啟用方向感測器");
						
						            window.compassEnabled = false;
						
						            if (btn) {
						                btn.style.background = "white";
						                btn.style.color = "";
						            }
						        });
		
		    } else if (typeof DeviceOrientationEvent !== "undefined") {
		        window.addEventListener(
		            "deviceorientationabsolute",
		            window.compassHandler,
		            true
		        );
		
		        window.addEventListener(
		            "deviceorientation",
		            window.compassHandler,
		            true
		        );
		
		    } else {
		        alert("此裝置不支援方向感測器");
		        window.compassEnabled = false;
		
		        if (btn) {
		            btn.style.background = "white";
		            btn.style.color = "";
		        }
		    }
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
				
				    if (typeof window.toggleCompass === "function") {
				        window.toggleCompass(compassBtn);
				    }
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
        if (typeof window.resetGPS === "function") {
            window.resetGPS();
        }

        return;
    }

    if (!navigator.geolocation) {
        alert("您的瀏覽器不支援 GPS 定位功能");
        return;
    }

    
    btn.style.background = "#e8f0fe";
    btn.style.color = "#1a73e8";

    window.gpsStartedAt = Date.now();

    
    if (!document.getElementById("gpsPulseSmallStyle")) {
        const style =
            document.createElement("style");

        style.id =
            "gpsPulseSmallStyle";

        style.innerHTML = `
            @keyframes gpsBlueDotPulse {
                0% {
                    transform: scale(0.90);
                    box-shadow:
                        0 0 0 1px rgba(255,255,255,0.9) inset,
                        0 0 0 0 rgba(26,115,232,0.35);
                }

                50% {
                    transform: scale(1.10);
                    box-shadow:
                        0 0 0 1px rgba(255,255,255,0.9) inset,
                        0 0 0 5px rgba(26,115,232,0.12);
                }

                100% {
                    transform: scale(0.90);
                    box-shadow:
                        0 0 0 1px rgba(255,255,255,0.9) inset,
                        0 0 0 0 rgba(26,115,232,0.35);
                }
            }
        `;

        document.head.appendChild(style);
    }

    
    if (!window.gpsOrientationStarted) {
        window.gpsOrientationStarted = true;

        window.gpsHeading = null;
        window.gpsHeadingBuffer = [];
        window.lastGpsHeadingUpdateTime = null;
        window.gpsHasAbsoluteOrientation = false;

        window.gpsOrientationHandler = function(e) {

            
            if (e.type === "deviceorientationabsolute") {
                window.gpsHasAbsoluteOrientation = true;

            } else if (
                window.gpsHasAbsoluteOrientation === true &&
                e.type === "deviceorientation"
            ) {
                return;
            }

            let heading = null;

            const isIOS =
                typeof e.webkitCompassHeading === "number";

            const isAndroid =
                !isIOS &&
                typeof e.alpha === "number";

            
            if (isIOS) {
                heading =
                    e.webkitCompassHeading;

            
            } else if (isAndroid) {
                heading =
                    360 - e.alpha;
            }

            if (
                heading === null ||
                !Number.isFinite(heading)
            ) {
                return;
            }

            
            if (
                isAndroid &&
                window.gpsStartedAt &&
                Date.now() - window.gpsStartedAt < 1200
            ) {
                return;
            }

            
            const screenAngle =
                (
                    screen.orientation &&
                    typeof screen.orientation.angle === "number"
                )
                    ? screen.orientation.angle
                    : (
                        typeof window.orientation === "number"
                            ? window.orientation
                            : 0
                    );

            heading =
                (heading + screenAngle + 360) % 360;

            
            const now =
                Date.now();

            const minUpdateMs =
                isAndroid
                    ? 120
                    : 80;

            if (
                window.lastGpsHeadingUpdateTime &&
                now - window.lastGpsHeadingUpdateTime < minUpdateMs
            ) {
                return;
            }

            window.lastGpsHeadingUpdateTime =
                now;

            
            if (!Array.isArray(window.gpsHeadingBuffer)) {
                window.gpsHeadingBuffer = [];
            }

            window.gpsHeadingBuffer.push(heading);

            const bufferMax =
                isAndroid
                    ? 3
                    : 3;

            while (window.gpsHeadingBuffer.length > bufferMax) {
                window.gpsHeadingBuffer.shift();
            }

            let sumX = 0;
            let sumY = 0;

            window.gpsHeadingBuffer.forEach(function(h) {
                const rad =
                    h * Math.PI / 180;

                sumX +=
                    Math.cos(rad);

                sumY +=
                    Math.sin(rad);
            });

            let avgHeading =
                Math.atan2(sumY, sumX) * 180 / Math.PI;

            avgHeading =
                (avgHeading + 360) % 360;

            
            if (
                !Number.isFinite(Number(window.gpsHeading))
            ) {
                window.gpsHeading =
                    avgHeading;
            } else {
                
                let diff =
                    avgHeading - window.gpsHeading;

                diff =
                    ((diff + 540) % 360) - 180;

                
                const minDiff =
                    isAndroid
                        ? 4
                        : 4;

                if (Math.abs(diff) < minDiff) {
                    return;
                }

                
                const smoothFactor =
                    isAndroid
                        ? 0.35
                        : 0.26;

                window.gpsHeading =
                    (window.gpsHeading + diff * smoothFactor + 360) % 360;
            }

            
            const fanMain =
                document.querySelector(".gps-guide-fan-main");

            const rotateText =
                "translate(-50%, -50%) rotate(" +
                window.gpsHeading +
                "deg)";

            if (fanMain) {
                fanMain.style.display =
                    "block";

                fanMain.style.transform =
                    rotateText;
            }
        };

        if (
            typeof DeviceOrientationEvent !== "undefined" &&
            typeof DeviceOrientationEvent.requestPermission === "function"
        ) {
            DeviceOrientationEvent.requestPermission()
                .then(function(permissionState) {
                    if (permissionState === "granted") {
                        window.addEventListener(
                            "deviceorientation",
                            window.gpsOrientationHandler,
                            true
                        );
                    }
                })
                .catch(function() {
                    
                });

        } else if (typeof DeviceOrientationEvent !== "undefined") {
            
            window.addEventListener(
                "deviceorientationabsolute",
                window.gpsOrientationHandler,
                true
            );

            window.addEventListener(
                "deviceorientation",
                window.gpsOrientationHandler,
                true
            );
        }
    }

    const runLocation = (isFirstTime = false) => {
        navigator.geolocation.getCurrentPosition((pos) => {
            const lat =
                pos.coords.latitude;

            const lon =
                pos.coords.longitude;

            const twd97 =
                proj4(WGS84_DEF, TWD97_DEF, [lon, lat]);

            const twd67 =
                proj4(WGS84_DEF, TWD67_DEF, [lon, lat]);

            if (isFirstTime) {
                const isMobile =
                    "ontouchstart" in window ||
                    navigator.maxTouchPoints > 0;

                const targetZoom =
                    Math.max(
                        map.getZoom(),
                        isMobile ? 17 : 16
                    );

                map.setView([lat, lon], targetZoom);

            } else {
                map.panTo([lat, lon]);
            }

            btn.style.background =
                "#e8f0fe";

            btn.style.color =
                "#1a73e8";

            
            let headingForIcon =
                Number.isFinite(Number(window.gpsHeading))
                    ? Number(window.gpsHeading)
                    : null;

            if (
                headingForIcon === null &&
                window.lastGpsLat !== undefined &&
                window.lastGpsLon !== undefined
            ) {
                const movedDistance =
                    Math.sqrt(
                        Math.pow(lat - window.lastGpsLat, 2) +
                        Math.pow(lon - window.lastGpsLon, 2)
                    ) * 111000;

                
                if (movedDistance >= 6) {
                    const toRad = function(deg) {
                        return deg * Math.PI / 180;
                    };

                    const toDeg = function(rad) {
                        return rad * 180 / Math.PI;
                    };

                    const phi1 =
                        toRad(window.lastGpsLat);

                    const phi2 =
                        toRad(lat);

                    const dLon =
                        toRad(lon - window.lastGpsLon);

                    const y =
                        Math.sin(dLon) * Math.cos(phi2);

                    const x =
                        Math.cos(phi1) * Math.sin(phi2) -
                        Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);

                    headingForIcon =
                        (toDeg(Math.atan2(y, x)) + 360) % 360;

                    window.gpsHeading =
                        headingForIcon;
                }
            }

            window.lastGpsLat =
                lat;

            window.lastGpsLon =
                lon;

            const hasHeading =
                Number.isFinite(Number(window.gpsHeading));

            const finalHeading =
                hasHeading
                    ? Number(window.gpsHeading)
                    : 0;

            const isTouchDevice =
                "ontouchstart" in window ||
                navigator.maxTouchPoints > 0;

            
            const iconBoxSize =
                isTouchDevice
                    ? 58
                    : 48;

            const iconAnchor =
                iconBoxSize / 2;

            const fanSize =
                isTouchDevice
                    ? 58
                    : 46;

            const fanCenter =
                fanSize / 2;

            const fanLeftX =
                isTouchDevice
                    ? 15
                    : 15;

            const fanRightX =
                isTouchDevice
                    ? 45
                    : 33;

            const fanTopY =
                isTouchDevice
                    ? 1
                    : 2;

            const fanArc =
                fanCenter;

            
            const whiteDotSize =
                isTouchDevice
                    ? 16
                    : 15;

            const blueDotSize =
                isTouchDevice
                    ? 14
                    : 13;

            const fanGradientId =
                "gpsFanGradientMain_" +
                Math.round(finalHeading) +
                "_" +
                Date.now();

            const guideIcon =
                L.divIcon({
                    className: "",
                    html: `
                        <div style="
                            width:${iconBoxSize}px;
                            height:${iconBoxSize}px;
                            position:relative;
                            display:flex;
                            align-items:center;
                            justify-content:center;
                            pointer-events:none;
                        ">
                            <!-- 扇形方向：本體 -->
                            <div class="gps-guide-fan-main" style="
                                display:${hasHeading ? "block" : "none"};
                                position:absolute;
                                left:50%;
                                top:50%;
                                width:${fanSize}px;
                                height:${fanSize}px;
                                transform:translate(-50%, -50%) rotate(${finalHeading}deg);
                                transform-origin:center center;
                                pointer-events:none;
                                z-index:1;
                            ">
                                <svg width="${fanSize}" height="${fanSize}" viewBox="0 0 ${fanSize} ${fanSize}" style="overflow:visible;">
                                    <defs>
                                        <linearGradient id="${fanGradientId}"
                                                        x1="${fanCenter}" y1="${fanCenter}"
                                                        x2="${fanCenter}" y2="0"
                                                        gradientUnits="userSpaceOnUse">
                                            <stop offset="0%" stop-color="rgba(66, 133, 244, 0.55)" />
                                            <stop offset="45%" stop-color="rgba(66, 133, 244, 0.34)" />
                                            <stop offset="100%" stop-color="rgba(66, 133, 244, 0.06)" />
                                        </linearGradient>
                                    </defs>

                                    <path d="M${fanCenter} ${fanCenter} L${fanLeftX} ${fanTopY} A${fanArc} ${fanArc} 0 0 1 ${fanRightX} ${fanTopY} Z"
                                          fill="url(#${fanGradientId})"
                                          stroke="rgba(66, 133, 244, 0.28)"
                                          stroke-width="1"/>
                                </svg>
                            </div>

                            <!-- 白色外圈 -->
                            <div style="
                                width:${whiteDotSize}px;
                                height:${whiteDotSize}px;
                                border-radius:50%;
                                background:white;
                                box-shadow:0 1px 6px rgba(0,0,0,0.38);
                                display:flex;
                                align-items:center;
                                justify-content:center;
                                z-index:3;
                            ">
                                <!-- 小藍點 -->
                                <div style="
                                    width:${blueDotSize}px;
                                    height:${blueDotSize}px;
                                    border-radius:50%;
                                    background:#1a73e8;
                                    transform-origin:center center;
                                    animation:gpsBlueDotPulse 3s ease-in-out infinite;
                                    will-change:transform, box-shadow;
                                    backface-visibility:hidden;
                                    -webkit-backface-visibility:hidden;
                                "></div>
                            </div>
                        </div>
                    `,
                    iconSize: [iconBoxSize, iconBoxSize],
                    iconAnchor: [iconAnchor, iconAnchor]
                });

            if (gpsMarker) {
                gpsMarker.setLatLng([lat, lon]);
                gpsMarker.setIcon(guideIcon);
            } else {
                gpsMarker =
                    L.marker([lat, lon], {
                        icon: guideIcon,
                        interactive: true,
                        zIndexOffset: 9999
                    }).addTo(map);
            }

            const gUrl =
                `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;

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
                        ⚠️ 自動追蹤中，每 10 秒更新一次中心位置。
                    </div>
                </div>
            `;

            if (
                isFirstTime ||
                (
                    gpsMarker.getPopup() &&
                    gpsMarker.getPopup().isOpen()
                )
            ) {
                gpsMarker
                    .bindPopup(tipText)
                    .openPopup();
            } else {
                gpsMarker
                    .bindPopup(tipText);
            }

        }, (err) => {
            if (isFirstTime) {
                btn.style.background =
                    "white";

                btn.style.color =
                    "";

                alert("無法獲取位置，請確認 GPS 已開啟");
            }
        }, {
            enableHighAccuracy: true
        });
    };

    runLocation(true);

    gpsInterval =
        setInterval(() => {
            runLocation(false);
        }, 10000);
};

window.resetGPS = function() {
    
    if (gpsInterval) {
        clearInterval(gpsInterval);
        gpsInterval = null;
    }

    
    if (gpsMarker) {
        map.removeLayer(gpsMarker);
        gpsMarker = null;
    }

    
    if (window.gpsOrientationHandler) {
        window.removeEventListener(
            "deviceorientation",
            window.gpsOrientationHandler,
            true
        );

        window.removeEventListener(
            "deviceorientationabsolute",
            window.gpsOrientationHandler,
            true
        );
    }

    
    window.lastGpsLat = undefined;
    window.lastGpsLon = undefined;
    window.gpsHeading = null;
    window.gpsHeadingBuffer = [];
    window.lastGpsHeadingUpdateTime = null;
    window.gpsStartedAt = null;
    window.gpsHasAbsoluteOrientation = false;
    window.gpsOrientationStarted = false;
    window.gpsOrientationHandler = null;

    
    const locBtn =
        document.querySelector('a[title="目前位置定位"]');

    if (locBtn) {
        locBtn.style.background =
            "white";

        locBtn.style.color =
            "";
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
    
		const shouldShowTaiwanGrid =
		    isLatLngInTaiwanArea(
		        lat,
		        lon
		    );
		
		let twd97 =
		    null;
		
		let twd67 =
		    null;
		
		if (
		    shouldShowTaiwanGrid &&
		    typeof proj4 !== "undefined" &&
		    typeof WGS84_DEF !== "undefined" &&
		    typeof TWD97_DEF !== "undefined" &&
		    typeof TWD67_DEF !== "undefined"
		) {
		    twd97 =
		        proj4(
		            WGS84_DEF,
		            TWD97_DEF,
		            [
		                lon,
		                lat
		            ]
		        );
		
		    twd67 =
		        proj4(
		            WGS84_DEF,
		            TWD67_DEF,
		            [
		                lon,
		                lat
		            ]
		        );
		}
    
    const gUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    const gMapIconBtn = `<a href="${gUrl}" target="_blank" style="text-decoration:none; margin-right:8px; display:inline-flex; align-items:center; justify-content:center; width: 28px; height: 28px; background: #fff; border: 1px solid #ccc; border-radius: 50%; vertical-align: middle;"><img src="https://ychiking.github.io/gpx-online-viewer/GoogleMaps.png" style="width:18px; height:18px;"></a>`;
    
    const eleHtml = (eleDisplay !== "---") ? `高度: ${eleDisplay} m<br>` : "";
    const distHtml = (dist !== null) ? `距離: ${dist} km<br>` : "";

		const weatherTitle =
    String(finalTitle || "位置資訊").replace(/'/g, "\\'");

		const weatherButtonHtml =
		    `<div style="margin-top:8px;">
		        <button onclick="event.stopPropagation(); openWeatherModal(${lat}, ${lon}, '${weatherTitle}')"
		            style="width:100%; background:#0FB9FD; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold;">
		            🌤 查此位置天氣
		        </button>
		    </div>`;
//"
    const effectiveIdxForAB = (matchedPoint) ? idx : 999999;
    const abButtons = `
      <div style="display:flex; margin-top:10px; gap:5px;">
        <button onclick="setAB('A', ${effectiveIdxForAB}, ${lat}, ${lon})" style="flex:1; background:#007bff; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold;">設定 A</button>
        <button onclick="setAB('B', ${effectiveIdxForAB}, ${lat}, ${lon})" style="flex:1; background:#e83e8c; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold;">設定 B</button>
      </div>`;

    const isExpanded = (window.popupDetailExpanded !== false); 
    const detailDisplayStyle = isExpanded ? 'block' : 'none';
    const detailBtnText = isExpanded ? '收合資訊' : '顯示資訊';
    
    let taiwanGridHtml =
		    "";
		
		if (
		    shouldShowTaiwanGrid &&
		    twd97 &&
		    twd67
		) {
		    taiwanGridHtml =
		        `TWD97: ${Math.round(twd97[0])}, ${Math.round(twd97[1])}<br>` +
		        `TWD67: ${Math.round(twd67[0])}, ${Math.round(twd67[1])}`;
		}

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
						${taiwanGridHtml}
            ${(!matchedPoint) ? '<div style="color:#d35400; font-weight:bold; margin-top:2px;">📍 非路徑位置</div>' : ''}
          </div>
        </div>
				${weatherButtonHtml}
        ${abButtons}
      </div>`;

		if (currentPopup && map.hasLayer(currentPopup)) {
		    currentPopup.options.offset = L.point(0, -5);
		    currentPopup.setLatLng([lat, lon]).setContent(content);
		} else {
		    currentPopup = L.popup({
		        autoClose: false,
		        closeOnClick: false,
		        offset: L.point(0, -5)
		    })
		    .setLatLng([lat, lon])
		    .setContent(content)
		    .openOn(map);
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

  const routeSelect = document.getElementById("routeSelect");

  const currentTrackIdx =
    routeSelect
      ? parseInt(routeSelect.value || 0, 10)
      : (typeof window.currentActiveIndex === "number" ? window.currentActiveIndex : 0);

  const currentFileIdx =
    typeof window.currentMultiIndex === "number"
      ? window.currentMultiIndex
      : 0;

  const currentRoute = allTracks[currentTrackIdx];

  if (!currentRoute) {
    return;
  }

  if (!trackPoints || trackPoints.length === 0) {
    renderEmptyRouteSummary(currentRoute);
    return;
  }

  let f = trackPoints[0];
  let l = trackPoints.at(-1);

  let displayDist = l.distance || 0;
  let displayGain;
  let displayLoss;
  let displayMaxEle;
  let displayMinEle;
  let displayDur;

  if (currentRoute.isCombined) {
    const subTracks = allTracks.filter(t => !t.isCombined);

    const allEles = subTracks
      .flatMap(t => {
        return Array.isArray(t.points)
          ? t.points.map(p => p.ele)
          : [];
      })
      .filter(e => e !== undefined);

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

    displayDur =
      (l.timeUTC && f.timeUTC)
        ? (l.timeUTC - f.timeUTC)
        : 0;

  } else {
    const { gain, loss } = calculateElevationGainFiltered();

    displayGain = gain;
    displayLoss = loss;

    const trackEles = trackPoints
      .map(p => p.ele)
      .filter(e => e !== undefined);

    displayMaxEle = trackEles.length > 0 ? Math.max(...trackEles) : 0;
    displayMinEle = trackEles.length > 0 ? Math.min(...trackEles) : 0;

    displayDur =
      (l.timeUTC && f.timeUTC)
        ? (l.timeUTC - f.timeUTC)
        : 0;
  }

  
  const displayName =
    window.currentFileNameForDisplay ||
    (
      multiGpxStack &&
      multiGpxStack[currentFileIdx] &&
      (
        multiGpxStack[currentFileIdx].fileName ||
        multiGpxStack[currentFileIdx].displayName ||
        multiGpxStack[currentFileIdx].name
      )
    ) ||
    (
      allTracks[0]
        ? (
          allTracks[0].fileName ||
          allTracks[0].displayName ||
          allTracks[0].name
        )
        : ""
    );

  
  const routeDisplayName =
    currentRoute.routeDisplayName ||
    currentRoute.displayName ||
    currentRoute.name ||
    "自訂路線";

  const recordDate =
    f.timeLocal
      ? f.timeLocal.substring(0, 10)
      : "無日期資料";

  let timeString = "";

  if (displayDur > 0 && displayDur < 315360000000) {
    const hours = Math.floor(displayDur / 3600000);
    const mins = Math.floor((displayDur % 3600000) / 60000);
    timeString = `${hours} 小時 ${mins} 分鐘`;
  } else {
    timeString = "無時間資訊";
  }

const routeSummaryEl =
    document.getElementById("routeSummary");

const isRouteInfoCollapsed =
    window.routeInfoCollapsed === true ||
    (
        routeSummaryEl &&
        routeSummaryEl.dataset &&
        routeSummaryEl.dataset.collapsed === "true"
    );

routeSummaryEl.innerHTML = `
    <div
        style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            cursor:pointer;
            padding:6px 0;
            font-weight:bold;
            color:#2c3e50;
            border-bottom:1px solid #eee;
            margin-bottom:6px;
        "
        onclick="
            window.routeInfoCollapsed = !window.routeInfoCollapsed;
            this.parentElement.dataset.collapsed = window.routeInfoCollapsed ? 'true' : 'false';

            const body = this.parentElement.querySelector('.route-info-body');
            const icon = this.querySelector('.route-info-toggle-icon');

            if (body) {
                body.style.display = window.routeInfoCollapsed ? 'none' : 'block';
            }

            if (icon) {
                icon.innerText = window.routeInfoCollapsed ? 'expand_more' : 'expand_less';
            }
        "
    >
        <span>路線資訊</span>
        <span
            class="material-icons route-info-toggle-icon"
            style="font-size:20px; color:#1a73e8;"
        >${isRouteInfoCollapsed ? "expand_more" : "expand_less"}</span>
    </div>

    <div
        class="route-info-body"
        style="display:${isRouteInfoCollapsed ? "none" : "block"};"
    >
        檔案名稱：${displayName}<br>
        記錄日期：${recordDate}<br>
        路　　線：${routeDisplayName}
        <span class="material-icons"
              style="font-size:16px; cursor:pointer; color:#1a73e8; vertical-align:middle; margin-left:4px;"
              onclick="event.stopPropagation(); renameSubRoute(${currentFileIdx}, ${currentTrackIdx}, { skipOpenGpxManager: true })">edit</span><br>
        里　　程：${displayDist.toFixed(2)} km<br>
        花費時間：${timeString}<br>
        最高海拔：${displayMaxEle.toFixed(0)} m<br>
        最低海拔：${displayMinEle.toFixed(0)} m<br>
        總爬升數：${displayGain.toFixed(0)} m<br>
        總下降數：${displayLoss.toFixed(0)} m
    </div>
`;

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
    里程/海拔：無軌跡資料`;
  
  renderWaypointsAndPeaks(currentRoute);
}

window.isWaypointVisibleOnCurrentRoute = function(wpt, routeIdx, route) {
    if (!wpt) return false;

    const activeIdx =
        typeof routeIdx === "number"
            ? routeIdx
            : (
                typeof window.currentActiveIndex === "number"
                    ? window.currentActiveIndex
                    : 0
            );

    const nActiveIdx =
        Number(activeIdx);

    const currentRoute =
        route ||
        (
            window.allTracks &&
            window.allTracks[activeIdx]
                ? window.allTracks[activeIdx]
                : null
        );

    const currentFile =
        window.multiGpxStack &&
        typeof window.currentMultiIndex === "number"
            ? window.multiGpxStack[window.currentMultiIndex]
            : null;

    const routes =
        currentFile && Array.isArray(currentFile.routes)
            ? currentFile.routes
            : (
                Array.isArray(window.allTracks)
                    ? window.allTracks
                    : []
            );

    const visibleList =
        Array.isArray(wpt.visibleRouteIndexes)
            ? wpt.visibleRouteIndexes
                .map(Number)
                .filter(function(idx) {
                    return Number.isFinite(idx);
                })
            : [];

    const hiddenList =
        Array.isArray(wpt.hiddenRouteIndexes)
            ? wpt.hiddenRouteIndexes
                .map(Number)
                .filter(function(idx) {
                    return Number.isFinite(idx);
                })
            : [];

    const firstRealRouteIdx =
        routes.findIndex(function(r) {
            return r && r.isCombined !== true;
        });

    const fallbackRouteIdx =
        firstRealRouteIdx >= 0
            ? firstRealRouteIdx
            : 0;

    const normalizeBelongsRouteIdx = function(belongsIdx) {
        const nBelongsIdx =
            Number(belongsIdx);

        if (!Number.isFinite(nBelongsIdx)) {
            return null;
        }

        
        if (
            routes[nBelongsIdx] &&
            routes[nBelongsIdx].isCombined === true &&
            fallbackRouteIdx !== nBelongsIdx
        ) {
            return fallbackRouteIdx;
        }

        return nBelongsIdx;
    };

    
    if (
        hiddenList.includes(nActiveIdx)
    ) {
        return false;
    }

    const realRoutes =
        routes.filter(function(r) {
            return r && r.isCombined !== true;
        });

    const isSingleRouteFile =
        (
            routes.length <= 1 ||
            realRoutes.length <= 1
        ) &&
        !(
            currentRoute &&
            currentRoute.isMergedRoute === true
        );

    if (isSingleRouteFile) {
        return true;
    }

    
    if (
        currentRoute &&
        currentRoute.isCombined === true
    ) {
        return true;
    }

    
    if (
        currentRoute &&
        currentRoute.isMergedRoute === true &&
        currentRoute.useOwnWaypointsOnly === true
    ) {
        return true;
    }

    
    if (
        visibleList.includes(nActiveIdx)
    ) {
        return true;
    }

    
    if (wpt.belongsToRoute !== undefined) {
        const normalizedBelongsIdx =
            normalizeBelongsRouteIdx(
                wpt.belongsToRoute
            );

        if (
            normalizedBelongsIdx !== null &&
            normalizedBelongsIdx === nActiveIdx
        ) {
            return true;
        }
    }

    
    if (
        wpt.belongsToRoute === undefined &&
        visibleList.length === 0 &&
        hiddenList.length === 0 &&
        nActiveIdx === fallbackRouteIdx
    ) {
        return true;
    }

    
    if (
        currentRoute &&
        currentRoute.isMergedRoute === true &&
        Array.isArray(currentRoute.sourceRouteIndexes)
    ) {
        const sourceIdxList =
            currentRoute.sourceRouteIndexes
                .map(Number)
                .filter(function(idx) {
                    return Number.isFinite(idx);
                });

        if (wpt.belongsToRoute !== undefined) {
            const normalizedBelongsIdx =
                normalizeBelongsRouteIdx(
                    wpt.belongsToRoute
                );

            return (
                normalizedBelongsIdx !== null &&
                sourceIdxList.includes(normalizedBelongsIdx)
            );
        }

        const wTimeVal =
            wpt.time
                ? new Date(wpt.time).getTime()
                : null;

        if (Number.isFinite(wTimeVal)) {
            for (let i = 0; i < sourceIdxList.length; i++) {
                const sourceIdx =
                    sourceIdxList[i];

                const sourceRoute =
                    routes[sourceIdx];

                if (
                    !sourceRoute ||
                    !Array.isArray(sourceRoute.points) ||
                    sourceRoute.points.length === 0
                ) {
                    continue;
                }

                const times =
                    sourceRoute.points
                        .map(function(p) {
                            return p.time
                                ? new Date(p.time).getTime()
                                : null;
                        })
                        .filter(function(t) {
                            return Number.isFinite(t);
                        });

                if (times.length === 0) {
                    continue;
                }

                const startTime =
                    Math.min(...times) - (60 * 60 * 1000);

                const endTime =
                    Math.max(...times) + (60 * 60 * 1000);

                if (
                    wTimeVal >= startTime &&
                    wTimeVal <= endTime
                ) {
                    return true;
                }
            }
        }

        return false;
    }

    
    if (wpt.belongsToRoute !== undefined) {
        return false;
    }

    
    const currentTrackPts =
        currentRoute &&
        Array.isArray(currentRoute.points)
            ? currentRoute.points
            : (
                typeof trackPoints !== "undefined" &&
                Array.isArray(trackPoints)
                    ? trackPoints
                    : []
            );

    let startTime =
        null;

    let endTime =
        null;

    if (
        currentTrackPts &&
        currentTrackPts.length > 0
    ) {
        const times =
            currentTrackPts
                .map(function(p) {
                    return p.time
                        ? new Date(p.time).getTime()
                        : null;
                })
                .filter(function(t) {
                    return Number.isFinite(t);
                });

        if (times.length > 0) {
            startTime =
                Math.min(...times) - (60 * 60 * 1000);

            endTime =
                Math.max(...times) + (60 * 60 * 1000);
        }
    }

    const wTimeVal =
        wpt.time
            ? new Date(wpt.time).getTime()
            : null;

    if (
        Number.isFinite(wTimeVal) &&
        Number.isFinite(startTime) &&
        Number.isFinite(endTime)
    ) {
        return (
            wTimeVal >= startTime &&
            wTimeVal <= endTime
        );
    }

    
    return true;
};


window.toggleWaypointDisplayForCurrentRoute = function(originalIdx, checked) {
	
    const fileIdx =
        typeof window.currentMultiIndex === "number"
            ? window.currentMultiIndex
            : 0;

    const routeIdx =
        typeof window.currentActiveIndex === "number"
            ? window.currentActiveIndex
            : 0;

    const currentFile =
        window.multiGpxStack &&
        window.multiGpxStack[fileIdx];

    if (
        !currentFile ||
        !Array.isArray(currentFile.waypoints) ||
        !currentFile.waypoints[originalIdx]
    ) {
        return;
    }

    const currentRoute =
        window.allTracks &&
        window.allTracks[routeIdx]
            ? window.allTracks[routeIdx]
            : (
                currentFile.routes &&
                currentFile.routes[routeIdx]
                    ? currentFile.routes[routeIdx]
                    : currentFile
            );

    
    if (currentRoute && currentRoute.isCombined === true) {
        if (typeof renderWaypointsAndPeaks === "function") {
            renderWaypointsAndPeaks(currentRoute);
        }
        return;
    }

    const wpt =
        currentFile.waypoints[originalIdx];

    if (!Array.isArray(wpt.visibleRouteIndexes)) {
        wpt.visibleRouteIndexes = [];
    }

    if (!Array.isArray(wpt.hiddenRouteIndexes)) {
        wpt.hiddenRouteIndexes = [];
    }

    wpt.visibleRouteIndexes =
        wpt.visibleRouteIndexes
            .map(Number)
            .filter(function(idx) {
                return Number.isFinite(idx);
            });

    wpt.hiddenRouteIndexes =
        wpt.hiddenRouteIndexes
            .map(Number)
            .filter(function(idx) {
                return Number.isFinite(idx);
            });

    const nRouteIdx =
        Number(routeIdx);

    if (checked) {
        
        if (!wpt.visibleRouteIndexes.includes(nRouteIdx)) {
            wpt.visibleRouteIndexes.push(nRouteIdx);
        }

        wpt.hiddenRouteIndexes =
            wpt.hiddenRouteIndexes.filter(function(idx) {
                return idx !== nRouteIdx;
            });

    } else {
        
        if (!wpt.hiddenRouteIndexes.includes(nRouteIdx)) {
            wpt.hiddenRouteIndexes.push(nRouteIdx);
        }

        wpt.visibleRouteIndexes =
            wpt.visibleRouteIndexes.filter(function(idx) {
                return idx !== nRouteIdx;
            });
    }

    if (Array.isArray(currentFile.routes)) {
        currentFile.routes.forEach(function(route) {
            if (route) {
                route.waypoints = currentFile.waypoints;
            }
        });
    }

    if (Array.isArray(window.allTracks)) {
        window.allTracks.forEach(function(route) {
            if (route) {
                route.waypoints = currentFile.waypoints;
            }
        });
    }

    if (typeof syncWaypointsToFile === "function") {
        syncWaypointsToFile(currentFile);
    }

    if (typeof rebuildXmlFromWaypoints === "function") {
        rebuildXmlFromWaypoints(currentFile);
    }

		if (typeof loadRoute === "function") {
		    loadRoute(
		        routeIdx,
		        null,
		        {
		            skipAutoFitBounds: true,
		            preserveChartState: true
		        }
		    );
		
		}
		
		if (typeof updateWptIconStatus === "function") {
		    updateWptIconStatus();
		}
};



window.toggleAllWaypointsDisplayForCurrentRoute = function(checkbox) {
    const fileIdx =
        typeof window.currentMultiIndex === "number"
            ? window.currentMultiIndex
            : 0;

    const routeIdx =
        typeof window.currentActiveIndex === "number"
            ? window.currentActiveIndex
            : 0;

    const currentFile =
        window.multiGpxStack &&
        window.multiGpxStack[fileIdx];

    if (
        !currentFile ||
        !Array.isArray(currentFile.waypoints)
    ) {
        return;
    }

    const currentRoute =
        window.allTracks &&
        window.allTracks[routeIdx]
            ? window.allTracks[routeIdx]
            : (
                currentFile.routes &&
                currentFile.routes[routeIdx]
                    ? currentFile.routes[routeIdx]
                    : currentFile
            );

    
    if (currentRoute && currentRoute.isCombined === true) {
        if (checkbox) {
            checkbox.checked = true;
        }

        if (typeof renderWaypointsAndPeaks === "function") {
            renderWaypointsAndPeaks(currentRoute);
        }

        return;
    }

    const checked =
        !!(checkbox && checkbox.checked);

    currentFile.waypoints.forEach(function(wpt) {
        if (!wpt) return;

        if (!Array.isArray(wpt.visibleRouteIndexes)) {
            wpt.visibleRouteIndexes = [];
        }

        if (!Array.isArray(wpt.hiddenRouteIndexes)) {
            wpt.hiddenRouteIndexes = [];
        }

        wpt.visibleRouteIndexes =
            wpt.visibleRouteIndexes
                .map(Number)
                .filter(function(idx) {
                    return Number.isFinite(idx);
                });

        wpt.hiddenRouteIndexes =
            wpt.hiddenRouteIndexes
                .map(Number)
                .filter(function(idx) {
                    return Number.isFinite(idx);
                });

        const nRouteIdx =
            Number(routeIdx);

        if (checked) {
            
            if (!wpt.visibleRouteIndexes.includes(nRouteIdx)) {
                wpt.visibleRouteIndexes.push(nRouteIdx);
            }

            wpt.hiddenRouteIndexes =
                wpt.hiddenRouteIndexes.filter(function(idx) {
                    return idx !== nRouteIdx;
                });

        } else {
            
            if (!wpt.hiddenRouteIndexes.includes(nRouteIdx)) {
                wpt.hiddenRouteIndexes.push(nRouteIdx);
            }

            wpt.visibleRouteIndexes =
                wpt.visibleRouteIndexes.filter(function(idx) {
                    return idx !== nRouteIdx;
                });
        }
    });

    if (Array.isArray(currentFile.routes)) {
        currentFile.routes.forEach(function(route) {
            if (route) {
                route.waypoints = currentFile.waypoints;
            }
        });
    }

    if (Array.isArray(window.allTracks)) {
        window.allTracks.forEach(function(route) {
            if (route) {
                route.waypoints = currentFile.waypoints;
            }
        });
    }

    if (typeof syncWaypointsToFile === "function") {
        syncWaypointsToFile(currentFile);
    }

    if (typeof rebuildXmlFromWaypoints === "function") {
        rebuildXmlFromWaypoints(currentFile);
    }

		if (typeof loadRoute === "function") {
		    loadRoute(
		        routeIdx,
		        null,
		        {
		            skipAutoFitBounds: true,
		            preserveChartState: true
		        }
		    );
		
		} else if (typeof window.refreshWaypointMarkersOnly === "function") {
		    window.refreshWaypointMarkersOnly(routeIdx, null);
		}
		
		if (typeof updateWptIconStatus === "function") {
		    updateWptIconStatus();
		}
};

window.renderWaypointsAndPeaks = function(currentRoute, forceFS = null) {
    
    const wptListContainer = document.getElementById("wptList");
    const navShortcuts = document.getElementById("navShortcuts");

    if (!wptListContainer) {
        return;
    }

    const activeIdx =
        window.currentActiveIndex || 0;
    
    window._cachedRoutes =
        window._cachedRoutes || {};

    if (currentRoute && (currentRoute.points || currentRoute.waypoints)) {
        window._cachedRoutes[activeIdx] =
            currentRoute;
    }
    
    const route =
        currentRoute ||
        window._cachedRoutes[activeIdx] ||
        (window.allTracks ? window.allTracks[activeIdx] : null);
    
    if (!route) {
        wptListContainer.innerHTML = "";
        return;
    }

    const currentTrackPts =
        route.points || [];

    const rawWaypoints =
        route.waypoints || [];

    let startTime = null;
    let endTime = null;

    if (currentTrackPts.length > 0) {
        const times =
            currentTrackPts
                .map(p => p.time ? new Date(p.time).getTime() : null)
                .filter(t => t !== null);

        if (times.length > 0) {
            startTime =
                Math.min(...times) - (60 * 60 * 1000);

            endTime =
                Math.max(...times) + (60 * 60 * 1000);
        }
    }

    
    const filteredWpts =
        rawWaypoints.map((w, i) => ({
            ...w,
            originalIdx: i
        }));

    const uniqueWpts =
        filteredWpts.filter((v, i, a) => {
            const matchIdx =
                a.findIndex(t => 
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

    const isFS =
        (forceFS !== null)
            ? forceFS
            : !!(
                document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.body.classList.contains('iphone-fullscreen')
            );

    if (navShortcuts) {
        navShortcuts.style.display = "flex";
    }

    const icon =
        (typeof showWptNameAlways !== 'undefined' && showWptNameAlways)
            ? "visibility_off"
            : "visibility";

    if (!isFS) {
        if (uniqueWpts.length > 0) {
            shortcutsHtml += `<button type="button" class="shortcut-btn" onmousedown="L.DomEvent.stopPropagation(event)" onclick="window.restoreAndJump('anchorWpt'); L.DomEvent.stopPropagation(event);">📍 航點列表</button>`;
        }

        shortcutsHtml += `<button type="button" class="shortcut-btn" onmousedown="L.DomEvent.stopPropagation(event)" onclick="window.restoreAndJump('anchorPeak'); L.DomEvent.stopPropagation(event);">⛰️ 沿途山岳</button>`;
    }

    const u =
        historyManager.getBtnState('undo');

    const r =
        historyManager.getBtnState('redo');

    if (uniqueWpts.length > 0) {
        listHtml += `<h4 id="anchorWpt" style="margin: 20px 0 10px 0;">📍 航點列表 (${uniqueWpts.length})</h4>
            <div class="wpt-table-toolbar" style="margin-bottom: 10px; display: flex; gap: 10px; align-items: center;">
                <button type="button" onclick="deleteSelectedWaypoints()" class="btn-delete-multi" style="background: #d32f2f; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; font-size: 13px;">
                    <span class="material-icons" style="font-size: 18px; margin-right: 5px;">delete_sweep</span>
                    刪除勾選項目
                </button>
                <span id="selectedCount" style="font-size: 12px; color: #666;">已選取 0 項</span>
            </div>
            <table class="wpt-table">
                <thead>
                    <tr>
                        <th style="width:2%"></th>
                        <th style="width:2%">
                            <input type="checkbox" id="selectAllWpts" onclick="toggleSelectAll(this)"><br><br>
                        </th>
                        <th style="width:3%">#<br><br></th>
                        <th style="width:10%">時間<br><br></th>
                        <th style="width:25%">名稱<br><br></th>
                        <th style="width:2%; text-align:center;">
                            顯示<br>
                            <input type="checkbox" id="toggleAllWptDisplay" onclick="toggleAllWaypointsDisplayForCurrentRoute(this)">
                        </th>
                        <th style="width:5%;">編輯/刪除<br><br></th>
                    </tr>
                </thead>
                <tbody id="wptTableBody">`; 

			uniqueWpts.forEach((w, displayIdx) => {
			
			    const currentFileIdx =
			        typeof window.currentMultiIndex === "number"
			            ? window.currentMultiIndex
			            : 0;
			
			    const selectedToolTarget =
			        window.currentToolTarget;
			
			    const isSelectedWpt =
			        selectedToolTarget &&
			        selectedToolTarget.type === "waypoint" &&
			        Number(selectedToolTarget.fileIdx) === Number(currentFileIdx) &&
			        Number(selectedToolTarget.wptIdx) === Number(w.originalIdx);
			
			    const selectedRowClass =
			        isSelectedWpt
			            ? "wpt-selected-row"
			            : "";
			
			    const safeWptName =
			        String(w.name || "").replace(/'/g, "\\'");
			
			    const safeEle =
			        (
			            w.ele !== undefined &&
			            w.ele !== null &&
			            Number.isFinite(Number(w.ele))
			        )
			            ? Number(w.ele)
			            : 0;
			
			    const displayTime =
			        w.localTime ||
			        (w.time ? new Date(w.time).toLocaleString() : "無時間資訊");
			
			    const isVisibleForRoute =
			        typeof window.isWaypointVisibleOnCurrentRoute === "function"
			            ? window.isWaypointVisibleOnCurrentRoute(w, activeIdx, route)
			            : true;
			
			    const displayDisabled =
			        route && route.isCombined === true
			            ? "disabled"
			            : "";
			
			    const displayChecked =
			        isVisibleForRoute
			            ? "checked"
			            : "";
			
			    listHtml += `<tr 
			        class="${selectedRowClass}"
			        data-idx="${w.originalIdx}"
			        onclick="
										    window.currentToolTarget = {
										        type: 'waypoint',
										        fileIdx: ${currentFileIdx},
										        routeIdx: ${activeIdx},
										        wptIdx: ${w.originalIdx}
										    };
										    
										    if (
												    window.activeFocusCircle &&
												    typeof map !== 'undefined' &&
												    map &&
												    typeof map.hasLayer === 'function' &&
												    map.hasLayer(window.activeFocusCircle)
												) {
												    map.removeLayer(window.activeFocusCircle);
												}
												
												window.activeFocusCircle = null;
										
										    if (
										        window.activeRouteHaloLayer &&
										        typeof map !== 'undefined' &&
										        map.hasLayer(window.activeRouteHaloLayer)
										    ) {
										        map.removeLayer(window.activeRouteHaloLayer);
										    }
										
										    window.activeRouteHaloLayer = null;
										
										    document.querySelectorAll('.wpt-table tr').forEach(function(row) {
										        row.classList.remove('wpt-selected-row');
										    });
										
										    this.classList.add('wpt-selected-row');
										
										    if (hoverMarker) {
										        hoverMarker
										            .setLatLng([${w.lat}, ${w.lon}])
										            .addTo(map)
										            .bringToFront();
										
										    } else {
										        hoverMarker =
										            L.circleMarker(
										                [${w.lat}, ${w.lon}],
										                {
										                    radius: 7,
										                    color: '#ffffff',
										                    fillColor: '#1a73e8',
										                    fillOpacity: 1,
										                    weight: 2
										                }
										            ).addTo(map);
										    }
										
										    if (typeof window.renderRouteToolControl === 'function') {
										        window.renderRouteToolControl();
										    }
										"
			    >
			        <td class="drag-handle" style="cursor: grab; color: #ccc;">
			            <span class="material-icons">drag_indicator</span>
			        </td>
			
			        <td>
			            <input 
			                type="checkbox" 
			                class="wpt-checkbox" 
			                data-idx="${w.originalIdx}" 
			                onclick="event.stopPropagation()"
			                onchange="updateSelectedCount()"
			            >
			        </td>
			
			        <td>
			            <span 
			                class="wpt-link" 
			                onclick="event.stopPropagation(); focusWaypointWithLog(${w.originalIdx}, '${safeWptName}')"
			            >
			                ${displayIdx + 1}
			            </span>
			        </td>
			
			        <td>${displayTime}</td>
			
			        <td>${w.name}</td>
			
			        <td style="text-align:center;">
									<input
									    type="checkbox"
									    class="wpt-display-checkbox"
									    data-idx="${w.originalIdx}"
									    ${displayChecked}
									    ${displayDisabled}
									    onmousedown="event.stopPropagation()"
									    ontouchstart="event.stopPropagation()"
									    onclick="event.stopPropagation(); window.toggleWaypointDisplayForCurrentRoute(${w.originalIdx}, this.checked);"
									>
			        </td>
			
			        <td>
			            <span 
			                class="material-icons wpt-action-icon" 
			                onclick="event.stopPropagation(); handleWptEditByIndex(${w.originalIdx})"
			            >edit</span>
			
			            <span 
			                class="material-icons wpt-action-icon wpt-delete-icon" 
			                onclick="event.stopPropagation(); deleteWaypoint(${w.originalIdx})"
			            >delete</span>
			        </td>
			    </tr>`;
			});
//"
        listHtml += `</tbody></table>`;
    }

    listHtml += `<h4 id="anchorPeak" style="margin: 30px 0 10px 0; font-size: 16px; color: #2c3e50; border-left: 5px solid #d35400; padding-left: 10px;">⛰️ 沿途山岳(200公尺內)</h4>
    <div id="aiPeaksSection">
        <div style="padding:15px; text-align:center; background:#f8f9fa; border:1px dashed #ccc; border-radius:8px; margin:10px;">
            <p style="margin-bottom:8px; color:#666; font-size:13px;">📍 已準備好偵測此路線周圍山岳</p>
            <button onclick="detectPeaksAlongRoute(true)" style="padding: 10px 25px; background: #1a73e8; color: white; border: none; border-radius: 50px; cursor: pointer; font-weight: bold; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); display: inline-flex; align-items: center; justify-content: center;">🔍 偵測此路線山岳</button>
        </div>
    </div>`;

    if (navShortcuts) {
        navShortcuts.innerHTML =
            shortcutsHtml;
    }

    wptListContainer.innerHTML =
        listHtml;

    wptListContainer.style.display =
        isFS ? "none" : "block";

		const toggleAllWptDisplay =
		    document.getElementById("toggleAllWptDisplay");

    if (toggleAllWptDisplay) {
        if (route && route.isCombined === true) {
            toggleAllWptDisplay.checked = true;
            toggleAllWptDisplay.disabled = true;
        } else {
            const displayBoxes =
                Array.from(
                    document.querySelectorAll(".wpt-display-checkbox")
                );

            toggleAllWptDisplay.disabled = false;
            toggleAllWptDisplay.checked =
                displayBoxes.length > 0 &&
                displayBoxes.every(function(box) {
                    return box.checked;
                });
        }
    }

    if (!isFS) {
        setTimeout(() => {
            if (typeof initWptSortable === 'function') initWptSortable();
            if (typeof initWptDragSelect === 'function') initWptDragSelect();
        }, 150);
    }
    
    if (
        uniqueWpts &&
        uniqueWpts.length > 0 &&
        typeof updateWptIconStatus === 'function'
    ) {
        updateWptIconStatus();
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
        style="padding: 10px 25px; 
               background: #1a73e8; 
               color: white; 
               border: none; 
               
               
               border-radius: 50px; 
               
               cursor: pointer; 
               font-weight: bold; 
               font-size: 14px; 
               box-shadow: 0 2px 4px rgba(0,0,0,0.2);
               
               
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

		const weatherTitle =
		    "定位點資訊";
		
		const weatherButtonHtml =
		    `<div style="margin-top:8px;">
		        <button onclick="event.stopPropagation(); openWeatherModal(${lat}, ${lon}, '${weatherTitle}')"
		            style="width:100%; background:#0FB9FD; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold;">
		            🌤 查此位置天氣
		        </button>
		    </div>`;

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
            ${weatherButtonHtml}
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
    let toast =
        document.getElementById('map-toast');

    if (window.mapToastTimer) {
        clearTimeout(window.mapToastTimer);
        window.mapToastTimer = null;
    }

    if (!toast) {
        toast =
            document.createElement('div');

        toast.id =
            'map-toast';

        toast.style.cssText = `
            position: absolute;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 20px;
            z-index: 2147483646;
            font-size: 14px;
            pointer-events: none;
            transition: opacity 0.5s;
            opacity: 0;
            display: none;
        `;
    }

    const fsParent =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        (
            document.body.classList.contains("iphone-fullscreen")
                ? document.getElementById("map")
                : null
        ) ||
        document.body;

    if (toast.parentElement !== fsParent) {
        fsParent.appendChild(toast);
    }

    toast.innerText =
        message;

    
    toast.style.display =
        "block";

    
    requestAnimationFrame(function() {
        toast.style.opacity =
            "1";
    });

    window.currentMapToast =
        toast;

    window.mapToastTimer =
        setTimeout(function() {
            toast.style.opacity =
                "0";

            window.mapToastTimer =
                null;

            
            setTimeout(function() {
                if (
                    toast &&
                    toast.style.opacity === "0"
                ) {
                    toast.style.display =
                        "none";
                }
            }, 550);

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

    
    if (!Array.isArray(window.multiGpxStack)) {
        window.multiGpxStack = [];
    }

    try {
        multiGpxStack =
            window.multiGpxStack;
    } catch (err) {}

    if (!Array.isArray(multiGpxStack)) {
        multiGpxStack = [];
        window.multiGpxStack = multiGpxStack;
    }

    if (!Array.isArray(allTracks)) {
        allTracks = [];
    }

    const baseColorIndex =
        multiGpxStack.length;

    if (typeof isDrawingMode !== "undefined" && isDrawingMode) {
        isDrawingMode =
            false;

        const drawBtn =
            document.getElementById("drawModeBtn");

        const methodBtn =
            document.getElementById("drawMethodBtn");

        if (drawBtn) {
            drawBtn.style.setProperty(
                "background",
                "white",
                "important"
            );

            drawBtn.style.setProperty(
                "color",
                "#5f6368",
                "important"
            );
        }

        if (methodBtn) {
            methodBtn.style.display =
                "none";
        }

        const mapDom =
            document.getElementById("map");

        if (mapDom) {
            mapDom.style.cursor =
                "";
        }

        if (typeof map !== "undefined") {
            map.dragging.enable();
            map.boxZoom.enable();
        }
    }

    

    if (!window.gpxMergeSelections) {
        window.gpxMergeSelections = {};
    }

    if (!window.gpxMergeOrder) {
        window.gpxMergeOrder = {};
    }

    if (!window.gpxManagerExpanded) {
        window.gpxManagerExpanded = {};
    }

    const hint =
        document.getElementById("importHint");

    if (hint) {
        hint.style.display =
            "none";
    }

    const refreshIcon =
        document.getElementById("refreshIcon");

    if (refreshIcon) {
        refreshIcon.style.display =
            "none";
    }

    let allBounds =
        L.latLngBounds([]);

    for (let i = 0; i < files.length; i++) {
        window.currentFileNameForDisplay =
            files[i].name;

        const text =
            await files[i].text();

        const pureFileName =
            files[i].name.replace(/\.[^/.]+$/, "");

        const tracks =
            processGpxXml(text);

        let combinedPoints =
            [];

        let combinedWaypoints =
            [];

        tracks.forEach(function(t) {
            combinedPoints =
                combinedPoints.concat(t.points || []);

            combinedWaypoints =
                combinedWaypoints.concat(t.waypoints || []);
        });

        if (
            combinedPoints.length === 0 &&
            combinedWaypoints.length === 0
        ) {
            continue;
        }

        const newStackIndex =
            multiGpxStack.length;

        const color =
            typeof window.getNextGpxColor === "function"
                ? window.getNextGpxColor(newStackIndex)
                : multiColors[newStackIndex % multiColors.length];

        const gpxId =
            "gpx_" + Date.now() + "_" + newStackIndex;

				const gpxData = {
				    name: files[i].name,
				    fileName: pureFileName,
				    points: combinedPoints.length > 0
				        ? combinedPoints
				        : [],
				    waypoints: combinedWaypoints || [],
				    distance: 0,
				    elevationGain: 0,
				    elevationLoss: 0,
				    duration: "00:00:00",
				    avgSpeed: 0,
				    maxElevation: 0,
				    minElevation: 0
				};

        let layer;
        let currentBounds =
            L.latLngBounds([]);

        if (combinedPoints.length > 0) {
            layer =
                L.polyline(
                    combinedPoints.map(function(p) {
                        return [
                            p.lat,
                            p.lon
                        ];
                    }),
                    {
                        color: color,
                        weight: 4,
                        opacity: 0.8,
                        gpxId: gpxId,
                        trackIndex: newStackIndex
                    }
                ).addTo(map);

            layer.on("click", function(e) {
                L.DomEvent.stopPropagation(e);

                const targetIdx =
                    e.target.options.trackIndex;

                if (typeof switchMultiGpx === "function") {
                    switchMultiGpx(targetIdx);
                }
            });

            currentBounds =
                layer.getBounds();

        } else {
            layer =
                L.polyline(
                    [],
                    {
                        color: color,
                        weight: 4,
                        opacity: 0.8,
                        gpxId: gpxId,
                        trackIndex: newStackIndex
                    }
                ).addTo(map);

            if (combinedWaypoints.length > 0) {
                const coords =
                    combinedWaypoints.map(function(w) {
                        return [
                            w.lat,
                            w.lon
                        ];
                    });

                currentBounds =
                    L.latLngBounds(coords);
            }
        }

        multiGpxStack.push({
            id: gpxId,
            name: files[i].name,
            fileName: pureFileName,
            content: text,
            points: gpxData.points,
            waypoints: combinedWaypoints || [],
            layer: layer,
            color: color,
            visible: true
        });

        if (
            currentBounds &&
            currentBounds.isValid()
        ) {
            allBounds.extend(currentBounds);
        }
    }

		window.multiGpxStack =
		    multiGpxStack;


    const routeSelect =
        document.getElementById("routeSelect");

    if (routeSelect) {
        routeSelect.onmousedown = function() {
            if (typeof updateRouteSelectDropdown === "function") {
                updateRouteSelectDropdown();
            }
        };
    }

    
    const appendedStartIndex =
        baseColorIndex;

    const appendedItems =
        multiGpxStack.slice(appendedStartIndex);

		const appendedTracks =
		    appendedItems.map(function(item) {
		        return item;
		    });

    const updateLayerTrackIndexes = function() {
        multiGpxStack.forEach(function(gpx, idx) {
            if (
                gpx &&
                gpx.layer &&
                gpx.layer.options
            ) {
                gpx.layer.options.trackIndex =
                    idx;
            }

            if (Array.isArray(gpx.routes)) {
                gpx.routes.forEach(function(route) {
                    if (
                        route &&
                        route.layer &&
                        route.layer.options
                    ) {
                        route.layer.options.trackIndex =
                            idx;
                    }
                });
            }
        });
    };

    const removeGpxLayersForHistory = function(items) {
        items.forEach(function(gpx) {
            if (!gpx) return;

            if (
                gpx.layer &&
                map &&
                map.hasLayer(gpx.layer)
            ) {
                map.removeLayer(gpx.layer);
            }

            if (
                gpx.layerGroup &&
                map &&
                map.hasLayer(gpx.layerGroup)
            ) {
                map.removeLayer(gpx.layerGroup);
            }

            if (Array.isArray(gpx.routes)) {
                gpx.routes.forEach(function(route) {
                    if (
                        route &&
                        route.layer &&
                        map &&
                        map.hasLayer(route.layer)
                    ) {
                        map.removeLayer(route.layer);
                    }
                });
            }
        });
    };

		const clearDisplayedRouteAfterStackUndo = function() {
							
		    if (
		        typeof polyline !== "undefined" &&
		        polyline &&
		        typeof polyline.setLatLngs === "function"
		    ) {
		        polyline.setLatLngs([]);
		    }
		
		    if (
		        window.activeRouteHaloLayer &&
		        map &&
		        map.hasLayer(window.activeRouteHaloLayer)
		    ) {
		        map.removeLayer(window.activeRouteHaloLayer);
		    }
		
		    window.activeRouteHaloLayer =
		        null;
		
		    if (
		        window.activeRouteLayer &&
		        map &&
		        map.hasLayer(window.activeRouteLayer)
		    ) {
		        map.removeLayer(window.activeRouteLayer);
		    }
		
		    window.activeRouteLayer =
		        null;
		
		    if (
		        window.splitRouteHitLayer &&
		        map &&
		        map.hasLayer(window.splitRouteHitLayer)
		    ) {
		        map.removeLayer(window.splitRouteHitLayer);
		    }
		
		    window.splitRouteHitLayer =
		        null;
		
		    if (Array.isArray(window.routePreviewLayers)) {
		        window.routePreviewLayers.forEach(function(layer) {
		            if (
		                layer &&
		                map &&
		                map.hasLayer(layer)
		            ) {
		                map.removeLayer(layer);
		            }
		        });
		
		        window.routePreviewLayers =
		            [];
		    }
		
		    if (
		        typeof markers !== "undefined" &&
		        Array.isArray(markers)
		    ) {
		        markers.forEach(function(m) {
		            if (
		                m &&
		                map &&
		                map.hasLayer(m)
		            ) {
		                map.removeLayer(m);
		            }
		        });
		
		        markers =
		            [];
		    }
		
		    if (
		        typeof wptMarkers !== "undefined" &&
		        Array.isArray(wptMarkers)
		    ) {
		        wptMarkers.forEach(function(m) {
		            if (
		                m &&
		                map &&
		                map.hasLayer(m)
		            ) {
		                map.removeLayer(m);
		            }
		        });
		
		        wptMarkers =
		            [];
		    }
		
		    if (window.wptLayer) {
		        window.wptLayer.clearLayers();
		    }
		
		    if (
		        typeof hoverMarker !== "undefined" &&
		        hoverMarker &&
		        map &&
		        map.hasLayer(hoverMarker)
		    ) {
		        map.removeLayer(hoverMarker);
		    }
		
		    if (typeof hoverMarker !== "undefined") {
		        hoverMarker =
		            null;
		    }
		
		    window.trackPoints =
		        [];
		
		    try {
		        trackPoints =
		            [];
		    } catch (err) {}
		    
		    const routeSummary2 =
				    document.getElementById("routeSummary");
				
				if (routeSummary2) {
				    routeSummary2.innerHTML = "";
				}
				
				const chartContainer =
				    document.getElementById("chartContainer");
				
				if (chartContainer) {
				    chartContainer.style.setProperty(
				        "display",
				        "none",
				        "important"
				    );
				}
				
				const toggleChartBtn =
				    document.getElementById("toggleChartBtn");
				
				if (toggleChartBtn) {
				    toggleChartBtn.style.setProperty(
				        "display",
				        "none",
				        "important"
				    );
				
				    toggleChartBtn.textContent =
				        "展開高度表";
				}
				
				const tipLabel =
				    document.getElementById("chartTipToggleLabel");
				
				if (tipLabel) {
				    tipLabel.style.setProperty(
				        "display",
				        "none",
				        "important"
				    );
				}
				
				if (window.chart) {
				    window.chart.destroy();
				    window.chart =
				        null;
				}
				
				if (typeof clearRouteDirectionMarkers === "function") {
				    clearRouteDirectionMarkers();
				}
				
				const wptList =
				    document.getElementById("wptList");
				
				if (wptList) {
				    wptList.innerHTML = "";
				}
				
				const navShortcuts =
				    document.getElementById("navShortcuts");
				
				if (navShortcuts) {
				    navShortcuts.innerHTML = "";
				}
				
				if (typeof allTracks !== "undefined") {
				    allTracks =
				        [];
				}
				
				window.allTracks =
				    [];
				
				window.currentActiveIndex =
				    0;
		};
		
		

    const restoreGpxLayersForHistory = function(items) {
        items.forEach(function(gpx) {
            if (!gpx) return;

            const shouldShow =
                gpx.visible !== false;

            if (!shouldShow) {
                if (
                    gpx.layer &&
                    map &&
                    map.hasLayer(gpx.layer)
                ) {
                    map.removeLayer(gpx.layer);
                }

                if (
                    gpx.layerGroup &&
                    map &&
                    map.hasLayer(gpx.layerGroup)
                ) {
                    map.removeLayer(gpx.layerGroup);
                }

                return;
            }

            if (
                gpx.layer &&
                map &&
                !map.hasLayer(gpx.layer)
            ) {
                map.addLayer(gpx.layer);
            }

            if (
                gpx.layerGroup &&
                map &&
                !map.hasLayer(gpx.layerGroup)
            ) {
                map.addLayer(gpx.layerGroup);
            }

            if (Array.isArray(gpx.routes)) {
                gpx.routes.forEach(function(route) {
                    if (!route) return;

                    if (route.visible === false) {
                        if (
                            route.layer &&
                            map &&
                            map.hasLayer(route.layer)
                        ) {
                            map.removeLayer(route.layer);
                        }

                        return;
                    }

                    if (
                        route.layer &&
                        map &&
                        !map.hasLayer(route.layer)
                    ) {
                        map.addLayer(route.layer);
                    }
                });
            }
        });
    };

    const getSafeFocusIndex = function(preferredIdx) {
        if (
            !Array.isArray(multiGpxStack) ||
            multiGpxStack.length === 0
        ) {
            return -1;
        }

        const maxIdx =
            multiGpxStack.length - 1;

        const start =
            Math.max(
                0,
                Math.min(
                    preferredIdx,
                    maxIdx
                )
            );

        if (
            multiGpxStack[start] &&
            multiGpxStack[start].visible !== false
        ) {
            return start;
        }

        for (let i = start - 1; i >= 0; i--) {
            if (
                multiGpxStack[i] &&
                multiGpxStack[i].visible !== false
            ) {
                return i;
            }
        }

        for (let i = start + 1; i <= maxIdx; i++) {
            if (
                multiGpxStack[i] &&
                multiGpxStack[i].visible !== false
            ) {
                return i;
            }
        }

        return 0;
    };

		 const refreshWorkspaceAfterHistoryChange = function(focusIdx) {
		    updateLayerTrackIndexes();
		
		    if (typeof window.updateLoadedGpxCountDisplay === "function") {
		        window.updateLoadedGpxCountDisplay();
		    }
		
		    if (
		        !Array.isArray(multiGpxStack) ||
		        multiGpxStack.length === 0
		    ) {
		        window.currentMultiIndex =
		            0;
		
		        window.currentActiveIndex =
		            0;
		
		        window.allTracks =
		            [];
		
		        try {
		            allTracks =
		                [];
		        } catch (err) {}
		
		        window.trackPoints =
		            [];
		
		        try {
		            trackPoints =
		                [];
		        } catch (err) {}
		
		        if (typeof renderMultiGpxButtons === "function") {
		            renderMultiGpxButtons();
		        }
		
		        if (typeof updateRouteSelectDropdown === "function") {
		            updateRouteSelectDropdown();
		        }
		
		        if (typeof renderRouteInfo === "function") {
		            renderRouteInfo();
		        }
		
		        return;
		    }
		
		    const safeIdx =
		        getSafeFocusIndex(focusIdx);
		
		    if (safeIdx < 0) {
		        return;
		    }
		
		    window.currentMultiIndex =
		        safeIdx;
		
		    window.currentActiveIndex =
		        0;
		
		   const focusGpx =
    multiGpxStack[safeIdx];

if (
    focusGpx &&
    Array.isArray(focusGpx.routes) &&
    focusGpx.routes.length > 0
) {
    window.allTracks =
        focusGpx.routes;

} else if (focusGpx) {
    window.allTracks =
        [
            focusGpx
        ];

} else {
    window.allTracks =
        [];
}

try {
    allTracks =
        window.allTracks;
} catch (err) {}

if (typeof updateRouteSelectDropdown === "function") {
    updateRouteSelectDropdown();
}

if (
    focusGpx &&
    focusGpx.visible !== false &&
    typeof switchMultiGpx === "function"
) {
    switchMultiGpx(safeIdx);
} else if (
		        focusGpx &&
		        focusGpx.visible !== false &&
		        typeof loadRoute === "function"
		    ) {
		        loadRoute(0);
		    }
		
		    if (typeof setupProgressBar === "function") {
		        setupProgressBar();
		    }
		
		    if (typeof renderRouteInfo === "function") {
		        renderRouteInfo();
		    }
		};

    
    if (
        appendedItems.length > 0 &&
        typeof historyManager !== "undefined" &&
        historyManager
    ) {
    	
		const appendCommand = {
		    fileIndex: appendedStartIndex,
		    managedFileIndex: appendedStartIndex,
		    skipAutoLoadRouteAfterUndo: true,
		
		    do: function() {
		        this.redo();
		    },
		
		    undo: function() {
		        removeGpxLayersForHistory(
		            appendedItems
		        );
		
		        multiGpxStack.splice(
		            appendedStartIndex,
		            appendedItems.length
		        );
		
		        window.multiGpxStack =
		            multiGpxStack;
		
		        clearDisplayedRouteAfterStackUndo();
		
		        
		        if (
		            !Array.isArray(multiGpxStack) ||
		            multiGpxStack.length === 0
		        ) {
		            window.currentMultiIndex =
		                0;
		
		            window.currentActiveIndex =
		                0;
		
		            if (typeof allTracks !== "undefined") {
		                allTracks =
		                    [];
		            }
		
		            window.allTracks =
		                [];
		
		            
		            window._cachedRoutes =
		                {};
		
		            if (typeof trackPoints !== "undefined") {
		                trackPoints =
		                    [];
		            }
		
		            window.trackPoints =
		                [];
		
		            if (typeof clearRouteDirectionMarkers === "function") {
		                clearRouteDirectionMarkers();
		            }
		
		            const routeSummary =
		                document.getElementById("routeSummary");
		
		            if (routeSummary) {
		                routeSummary.innerHTML =
		                    "";
		            }
		
		            const wptList =
		                document.getElementById("wptList");
		
		            if (wptList) {
		                wptList.innerHTML =
		                    "";
		
		                wptList.style.display =
		                    "none";
		            }
		
		            const navShortcuts =
		                document.getElementById("navShortcuts");
		
		            if (navShortcuts) {
		                navShortcuts.innerHTML =
		                    "";
		
		                navShortcuts.style.display =
		                    "none";
		            }
		
		            const chartContainer =
		                document.getElementById("chartContainer");
		
		            if (chartContainer) {
		                chartContainer.style.setProperty(
		                    "display",
		                    "none",
		                    "important"
		                );
		
		                chartContainer.innerHTML =
		                    '<canvas id="elevationChart"></canvas>';
		            }
		
		            const tipLabel =
		                document.getElementById("chartTipToggleLabel");
		
		            if (tipLabel) {
		                tipLabel.style.setProperty(
		                    "display",
		                    "none",
		                    "important"
		                );
		            }
		
		            const toggleChartBtn =
		                document.getElementById("toggleChartBtn");
		
		            if (toggleChartBtn) {
		                toggleChartBtn.style.setProperty(
		                    "display",
		                    "none",
		                    "important"
		                );
		
		                toggleChartBtn.textContent =
		                    "展開高度表";
		            }
		
		            if (window.chart) {
		                window.chart.destroy();
		                window.chart =
		                    null;
		            }
		
		            const progressBar =
		                document.getElementById("gpxProgressBar");
		
		            if (progressBar) {
		                progressBar.value =
		                    0;
		
		                progressBar.max =
		                    0;
		            }
		
		            const progressBarInfo =
		                document.getElementById("progressBarInfo");
		
		            if (progressBarInfo) {
		                progressBarInfo.textContent =
		                    "";
		            }
		
		            const bar =
		                document.getElementById("multiGpxBtnBar");
		
		            if (bar) {
		                bar.innerHTML =
		                    "";
		
		                bar.style.display =
		                    "none";
		            }
		
		            const routeSelect =
		                document.getElementById("routeSelect");
		
		            if (routeSelect) {
		                routeSelect.innerHTML =
		                    "";
		
		                routeSelect.value =
		                    "";
		            }
		
		            const routeSelectContainer =
		                document.getElementById("routeSelectContainer");
		
		            if (routeSelectContainer) {
		                routeSelectContainer.style.display =
		                    "none";
		            }
		
		            if (typeof renderMultiGpxButtons === "function") {
		                renderMultiGpxButtons();
		            }
		
		            if (typeof window.updateLoadedGpxCountDisplay === "function") {
		                window.updateLoadedGpxCountDisplay();
		            }
		
		            if (typeof updateRouteSelectDropdown === "function") {
		                updateRouteSelectDropdown();
		            }
		
		            if (typeof updateWptIconStatus === "function") {
		                updateWptIconStatus();
		            }
		
		            if (typeof window.refreshGpxManagerIfOpen === "function") {
		                window.refreshGpxManagerIfOpen();
		            }
		
		            
		            window._cachedRoutes =
		                {};
		
		            const wptListFinal =
		                document.getElementById("wptList");
		
		            if (wptListFinal) {
		                wptListFinal.innerHTML =
		                    "";
		
		                wptListFinal.style.display =
		                    "none";
		            }
		
		            const navShortcutsFinal =
		                document.getElementById("navShortcuts");
		
		            if (navShortcutsFinal) {
		                navShortcutsFinal.innerHTML =
		                    "";
		
		                navShortcutsFinal.style.display =
		                    "none";
		            }
		
		            const routeSummaryFinal =
		                document.getElementById("routeSummary");
		
		            if (routeSummaryFinal) {
		                routeSummaryFinal.innerHTML =
		                    "";
		            }
		
		            return;
		        }
		
		        
		        const nextFocusIdx =
		            Math.min(
		                appendedStartIndex,
		                multiGpxStack.length - 1
		            );
		
		        refreshWorkspaceAfterHistoryChange(
		            Math.max(
		                0,
		                nextFocusIdx
		            )
		        );
		
		        if (typeof renderMultiGpxButtons === "function") {
		            renderMultiGpxButtons();
		        }
		
		        if (typeof window.updateLoadedGpxCountDisplay === "function") {
		            window.updateLoadedGpxCountDisplay();
		        }
		
		        if (typeof updateRouteSelectDropdown === "function") {
		            updateRouteSelectDropdown();
		        }
		
		        if (typeof window.refreshGpxManagerIfOpen === "function") {
		            window.refreshGpxManagerIfOpen();
		        }
		    },
		
		    redo: function() {
		        const alreadyExists =
		            appendedItems.some(function(item) {
		                return multiGpxStack.includes(item);
		            });
		
		        if (!alreadyExists) {
		            multiGpxStack.splice(
		                appendedStartIndex,
		                0,
		                ...appendedItems
		            );
		        }
		
		        window.multiGpxStack =
		            multiGpxStack;
		
		        restoreGpxLayersForHistory(
		            appendedItems
		        );
		
		        refreshWorkspaceAfterHistoryChange(
		            appendedStartIndex
		        );
		
		        if (typeof renderMultiGpxButtons === "function") {
		            renderMultiGpxButtons();
		        }
		
		        if (typeof window.updateLoadedGpxCountDisplay === "function") {
		            window.updateLoadedGpxCountDisplay();
		        }
		
		        if (typeof updateRouteSelectDropdown === "function") {
		            updateRouteSelectDropdown();
		        }
		
		        if (typeof window.refreshGpxManagerIfOpen === "function") {
		            window.refreshGpxManagerIfOpen();
		        }
		    }
		};

        historyManager.undoStack.push(
            appendCommand
        );

        historyManager.redoStack =
            [];

        if (typeof historyManager.updateUI === "function") {
            historyManager.updateUI();
        }
    }

    
    if (multiGpxStack.length > 0) {
        const bar =
            document.getElementById("multiGpxBtnBar");

        if (bar) {
            bar.style.display =
                "flex";
        }

				if (typeof renderMultiGpxButtons === "function") {
				    renderMultiGpxButtons();
				}
				
				const targetIndex =
				    multiGpxStack[baseColorIndex]
				        ? baseColorIndex
				        : 0;
				
				if (typeof switchMultiGpx === "function") {
				    switchMultiGpx(targetIndex);
				}
				
				
				if (typeof updateRouteSelectDropdown === "function") {
				    updateRouteSelectDropdown();
				}

        setTimeout(function() {
            try {
                if (multiGpxStack[targetIndex]) {
                    window.currentMultiIndex =
                        targetIndex;

                    window.currentActiveIndex =
                        0;

                    if (typeof switchMultiGpx === "function") {
                        switchMultiGpx(targetIndex);

                    } else if (typeof loadRoute === "function") {
                        loadRoute(0);
                    }

                    if (typeof setupProgressBar === "function") {
                        setupProgressBar();
                    }
                }

            } catch (err) {
                console.warn(
                    "[append GPX focus 失敗]",
                    err
                );
            }
        }, 300);
    }
}

document.getElementById("multiGpxInput").addEventListener("change", async (e) => {
    const selectedFiles =
        e.target.files;

    if (
        !selectedFiles ||
        selectedFiles.length === 0
    ) {
        window.isAppendingGpxFromPlus =
            false;

        return;
    }

    const fileArray =
        Array.from(selectedFiles);

    const appendMode =
        window.isAppendingGpxFromPlus === true;

    
    const oldStack =
        appendMode && Array.isArray(window.multiGpxStack)
            ? window.multiGpxStack.slice()
            : [];

    const oldCurrentIndex =
        typeof window.currentMultiIndex === "number"
            ? window.currentMultiIndex
            : 0;

    const runImport = async function() {
        await handleGpxFiles(fileArray);

        if (appendMode) {
            const newStack =
                window.multiGpxStack ||
                multiGpxStack ||
                [];

            
            let oldStillExists =
                false;

            if (
                oldStack.length > 0 &&
                newStack.length > 0
            ) {
                const oldFirst =
                    oldStack[0];

                oldStillExists =
                    newStack.some(function(item) {
                        return (
                            item === oldFirst ||
                            (
                                item &&
                                oldFirst &&
                                item.id &&
                                oldFirst.id &&
                                item.id === oldFirst.id
                            )
                        );
                    });
            }

            if (
                oldStack.length > 0 &&
                !oldStillExists
            ) {
                const importedStack =
                    newStack.slice();

                window.multiGpxStack =
                    oldStack.concat(importedStack);

                try {
                    multiGpxStack =
                        window.multiGpxStack;
                } catch (err) {}

                window.currentMultiIndex =
                    window.multiGpxStack.length - importedStack.length;

            } else {
                
                if (
                    Array.isArray(window.multiGpxStack) &&
                    window.multiGpxStack.length > oldStack.length
                ) {
                    window.currentMultiIndex =
                        oldStack.length;
                } else {
                    window.currentMultiIndex =
                        oldCurrentIndex;
                }
            }

            window.currentActiveIndex =
                0;

            const currentFile =
                window.multiGpxStack &&
                window.multiGpxStack[window.currentMultiIndex];

            if (
                currentFile &&
                Array.isArray(currentFile.routes) &&
                currentFile.routes.length > 0
            ) {
                window.allTracks =
                    currentFile.routes;

                try {
                    allTracks =
                        currentFile.routes;
                } catch (err) {}

            } else if (currentFile) {
                window.allTracks =
                    [currentFile];

                try {
                    allTracks =
                        [currentFile];
                } catch (err) {}
            }

            if (typeof renderMultiGpxButtons === "function") {
                renderMultiGpxButtons();
            }

            if (typeof updateRouteSelectDropdown === "function") {
                updateRouteSelectDropdown();
            }

            if (typeof loadRoute === "function") {
                loadRoute(0);
            }

            if (typeof renderRouteInfo === "function") {
                renderRouteInfo();
            }


        }
    };

    try {
        if (appendMode) {
            
            await runImport();

        } else {
						await handleGpxFiles(fileArray);
        }

    } finally {
        window.isAppendingGpxFromPlus =
            false;

        if (typeof window.fixPageAndMapOffset === "function") {
            window.fixPageAndMapOffset();
        }
        
        const oldToast =
            document.getElementById("map-toast");

        if (oldToast) {
            oldToast.style.opacity =
                "0";
        }

        if (window.mapToastTimer) {
            clearTimeout(window.mapToastTimer);
            window.mapToastTimer =
                null;
        }

        window.currentMapToast =
            null;

        e.target.value =
            ""; 
    }
});

function switchMultiGpx(index) {

		if (typeof isDrawingMode !== "undefined" && isDrawingMode) {

    isDrawingMode = false;
    isScribbling = false;
    
    const oldToast =
        document.getElementById("map-toast");

    if (oldToast) {
        oldToast.style.opacity = "0";
    }

    if (window.mapToastTimer) {
        clearTimeout(window.mapToastTimer);
        window.mapToastTimer = null;
    }

    window.currentMapToast = null;

    if (typeof tempDrawPoints !== "undefined") {
        tempDrawPoints = [];
    }

    if (typeof lastScribbleLatLng !== "undefined") {
        lastScribbleLatLng = null;
    }

    if (map && map.dragging) {
        map.dragging.enable();
    }

    if (map && map.boxZoom) {
        map.boxZoom.enable();
    }

    const drawModeBtn =
        document.getElementById("drawModeBtn");

    if (drawModeBtn) {
        drawModeBtn.style.setProperty("background", "white", "important");
        drawModeBtn.style.setProperty("color", "#5f6368", "important");
        drawModeBtn.title = "開啟繪製模式";
    }

    const drawMethodBtn =
        document.getElementById("drawMethodBtn");

    if (drawMethodBtn) {
        drawMethodBtn.style.display = "none";
    }

    const mapEl =
        document.getElementById("map");

    if (mapEl) {
        mapEl.style.cursor = "";
    }
}
    const data =
        multiGpxStack[index];

    if (!data) return;

    window.currentMultiIndex =
        index;

    window.currentActiveIndex =
        0;

    map.closePopup();

    window.currentFileNameForDisplay =
        data.name;

    
    multiGpxStack.forEach((item, i) => {

        const btn =
            document.getElementById(`multi-btn-${i}`);

        if (!item || !(item.layer instanceof L.Polyline)) {
            if (btn) btn.classList.toggle('active', i === index);
            return;
        }

        if (i === index) {

            item.layer.setStyle({
                color: item.color || "#0000FF",
                weight: 8,
                opacity: 1.0
            }).bringToFront();

            if (btn) btn.classList.add('active');

            if (
                typeof isGpxInView === 'function' &&
                !isGpxInView(index) &&
                item.layer.getBounds &&
                item.layer.getBounds().isValid()
            ) {
                map.fitBounds(
                    item.layer.getBounds(),
                    {
                        padding: [20, 20],
                        maxZoom: 16
                    }
                );
            }

        } else {

            item.layer.setStyle({
                color: item.color || "#0000FF",
                weight: 5,
                opacity: 0.5
            });

            if (btn) btn.classList.remove('active');
        }
    });

    const applyCustomNames = () => {

        if (data.customRouteNames && window.allTracks) {

            Object.keys(data.customRouteNames).forEach(id => {

                const trackIdx =
                    parseInt(id, 10);

                if (allTracks[trackIdx]) {
                    allTracks[trackIdx].name =
                        data.customRouteNames[trackIdx];
                }
            });

            const routeSelect =
                document.getElementById("routeSelect");

            if (routeSelect) {

                allTracks.forEach((t, i) => {

                    if (routeSelect.options[i]) {
                        const baseName =
												    t.routeDisplayName ||
												    t.displayName ||
												    t.name ||
												    `路線 ${i + 1}`;
												
												const isCombinedRoute =
												    t.isCombined === true ||
												    t.type === "combined" ||
												    t.routeType === "combined" ||
												    (
												        i === 0 &&
												        typeof baseName === "string" &&
												        baseName.indexOf("結合") !== -1
												    );
												
												t.isCombined =
												    isCombinedRoute === true;
												
												routeSelect.options[i].value =
												    String(i);
												
												routeSelect.options[i].text =
												    isCombinedRoute
												        ? `【 ${baseName} 】`
												        : baseName;
                    }
                });
            }
        }
    };

    
    if (
        Array.isArray(data.routes) &&
        data.routes.length > 0
    ) {

        allTracks =
            data.routes;

        window.allTracks =
            data.routes;

        trackPoints =
            data.routes[0] && Array.isArray(data.routes[0].points)
                ? data.routes[0].points
                : (Array.isArray(data.points) ? data.points : []);

        window.trackPoints =
            trackPoints;

        syncDrawingGlobals(
            data,
            0
        );

        if (typeof updateRouteSelectDropdown === 'function') {
            updateRouteSelectDropdown();
        }

        applyCustomNames();

        if (typeof loadRoute === 'function') {
            loadRoute(0);
        }

    } else if (data.content) {

        const pureFileName =
            data.name.replace(/\.[^/.]+$/, "");

        parseGPX(
            data.content,
            pureFileName
        );

        applyCustomNames();

        
        if (allTracks && allTracks.length > 0) {
            allTracks.forEach(track => {
                track.waypoints =
                    data.waypoints || track.waypoints || [];
            });
        }

        setTimeout(() => {

            if (typeof loadRoute === 'function') {
                loadRoute(0);
                applyCustomNames();

                if (typeof renderRouteInfo === 'function') {
                    renderRouteInfo();
                }
            }

            if (window.activeRouteLayer && data.color) {
                activeRouteLayer.setStyle({
                    color: data.color
                });
            }

        }, 100);

    } else {

        allTracks =
            [data];

        window.allTracks =
            allTracks;

        trackPoints =
            Array.isArray(data.points)
                ? data.points
                : [];

        window.trackPoints =
            trackPoints;

        syncDrawingGlobals(
            data,
            0
        );

        if (typeof updateRouteSelectDropdown === 'function') {
            updateRouteSelectDropdown();
        }

        if (typeof loadRoute === 'function') {
            loadRoute(0);
        }
    }

		if (typeof applyElevationChartAutoState === "function") {
		    applyElevationChartAutoState();
		}
		
		const wptList =
		    document.getElementById("wptList");
		
		if (wptList) {
		    wptList.style.display =
		        "block";
		}

		if (typeof detectPeaksAlongRoute === 'function') {
		
		    if (
		        typeof peakAbortController !== 'undefined' &&
		        peakAbortController
		    ) {
		        peakAbortController.abort();
		    }
		
		    detectPeaksAlongRoute(false);
		}
		
		if (typeof window.refreshGpxManagerIfOpen === "function") {
		    window.refreshGpxManagerIfOpen();
		}
}

window.isAppendingGpxFromPlus = false;


window.createBlankGpxProject = function() {
    if (!window.multiGpxStack) {
        window.multiGpxStack = [];
    }

    try {
        multiGpxStack =
            window.multiGpxStack;
    } catch (err) {}

    const insertIndex =
        window.multiGpxStack.length;

    const name =
        typeof window.getUniqueBlankRouteName === "function"
            ? window.getUniqueBlankRouteName()
            : "自訂路線";

    const color =
        typeof window.getNextGpxColor === "function"
            ? window.getNextGpxColor(insertIndex)
            : (
                typeof multiColors !== "undefined" && multiColors.length > 0
                    ? multiColors[insertIndex % multiColors.length]
                    : "#0000FF"
            );

    const newTrack = {
        id: "blank_gpx_" + Date.now(),
        name: name,
        displayName: name,
        routeDisplayName: name,
        fileName: name + ".gpx",
        color: color,

        points: [],
        segments: [],
        waypoints: [],

        routes: [],
        visible: true,

        isDrawTrack: true,
        isHandDrawRoute: true,
        isBlankProject: true,
        isCombined: false,

        stats: {
            totalDistance: 0,
            totalElevation: 0
        }
    };

    const refreshAfterBlankChange = function(focusIdx) {
        window.multiGpxStack =
            multiGpxStack;

        try {
            multiGpxStack =
                window.multiGpxStack;
        } catch (err) {}
        	
		      const bar =
					    document.getElementById("multiGpxBtnBar");
					
					if (bar) {
					    bar.innerHTML =
					        "";
					
					    bar.style.display =
					        "none";
					}
					
					document.body.classList.remove(
					    "has-gpx-bar"
					);
					
					if (
					    typeof gpxManagerControlContainer !== "undefined" &&
					    gpxManagerControlContainer
					) {
					    gpxManagerControlContainer.style.display =
					        "none";
					}
					
					const fileNameDisplay =
					    document.getElementById("fileNameDisplay");
					
					if (fileNameDisplay) {
					    fileNameDisplay.innerHTML =
					        "";
					}
					
					const importHint =
					    document.getElementById("importHint");
					
					if (importHint) {
					    importHint.style.display =
					        "";
					}
					
					const refreshIcon =
					    document.getElementById("refreshIcon");
					
					if (refreshIcon) {
					    refreshIcon.style.display =
					        "";
					}

        if (
            !Array.isArray(window.multiGpxStack) ||
            window.multiGpxStack.length === 0
        ) {
            window.currentMultiIndex =
                0;

            window.currentActiveIndex =
                0;

            window.allTracks =
                [];

            try {
                allTracks =
                    [];
            } catch (err) {}

            window.trackPoints =
                [];

            try {
                trackPoints =
                    [];
            } catch (err) {}

            if (typeof renderMultiGpxButtons === "function") {
                renderMultiGpxButtons();
            }

            if (typeof updateRouteSelectDropdown === "function") {
                updateRouteSelectDropdown();
            }

            if (typeof renderRouteInfo === "function") {
                renderRouteInfo();
            }

            if (typeof window.updateLoadedGpxCountDisplay === "function") {
                window.updateLoadedGpxCountDisplay();
            }

            return;
        }

        const safeIdx =
            Math.max(
                0,
                Math.min(
                    focusIdx,
                    window.multiGpxStack.length - 1
                )
            );

        window.currentMultiIndex =
            safeIdx;

        window.currentActiveIndex =
            0;

        const currentFile =
            window.multiGpxStack[safeIdx];

        if (
            currentFile &&
            Array.isArray(currentFile.routes) &&
            currentFile.routes.length > 0
        ) {
            window.allTracks =
                currentFile.routes;

            try {
                allTracks =
                    currentFile.routes;
            } catch (err) {}

        } else if (currentFile) {
            window.allTracks =
                [currentFile];

            try {
                allTracks =
                    [currentFile];
            } catch (err) {}
        }

        window.trackPoints =
            currentFile && Array.isArray(currentFile.points)
                ? currentFile.points
                : [];

        try {
            trackPoints =
                window.trackPoints;
        } catch (err) {}

        if (typeof renderMultiGpxButtons === "function") {
            renderMultiGpxButtons();
        }

        if (typeof updateRouteSelectDropdown === "function") {
            updateRouteSelectDropdown();
        }

        if (typeof switchMultiGpx === "function") {
            switchMultiGpx(safeIdx);

        } else if (typeof loadRoute === "function") {
            loadRoute(
                0,
                null,
                {
                    skipAutoFitBounds: true,
                    preserveChartState: true
                }
            );
        }

        if (typeof renderRouteInfo === "function") {
            renderRouteInfo();
        }

        if (typeof window.renderRouteToolControl === "function") {
            window.renderRouteToolControl();
        }

        if (typeof window.updateLoadedGpxCountDisplay === "function") {
            window.updateLoadedGpxCountDisplay();
        }


    };

    const addBlank = function() {
        if (!newTrack.layer) {
            newTrack.layer =
                L.polyline(
                    [],
                    {
                        color: newTrack.color,
                        weight: 6,
                        opacity: 1,
                        interactive: true
                    }
                );
        }

        if (
            map &&
            newTrack.layer &&
            !map.hasLayer(newTrack.layer)
        ) {
            newTrack.layer.addTo(map);
        }

        const alreadyExists =
            window.multiGpxStack.some(function(item) {
                return item === newTrack || item.id === newTrack.id;
            });

        if (!alreadyExists) {
            window.multiGpxStack.splice(
                insertIndex,
                0,
                newTrack
            );
        }

        try {
            multiGpxStack =
                window.multiGpxStack;
        } catch (err) {}

        refreshAfterBlankChange(
            insertIndex
        );
    };

    const removeBlank = function() {
        const stack =
            window.multiGpxStack ||
            multiGpxStack ||
            [];

        let removeIdx =
            stack.findIndex(function(item) {
                return item === newTrack || item.id === newTrack.id;
            });

        if (removeIdx === -1) {
            return;
        }

        if (
            newTrack.layer &&
            map &&
            map.hasLayer(newTrack.layer)
        ) {
            map.removeLayer(newTrack.layer);
        }

        if (
            newTrack.layerGroup &&
            map &&
            map.hasLayer(newTrack.layerGroup)
        ) {
            map.removeLayer(newTrack.layerGroup);
        }
        
        if (
				    typeof polyline !== "undefined" &&
				    polyline &&
				    typeof polyline.setLatLngs === "function"
				) {
				    polyline.setLatLngs([]);
				}
				
				if (Array.isArray(window.routePreviewLayers)) {
				    window.routePreviewLayers.forEach(function(layer) {
				        if (
				            layer &&
				            map &&
				            map.hasLayer(layer)
				        ) {
				            map.removeLayer(layer);
				        }
				    });
				
				    window.routePreviewLayers = [];
				}
				
				window.trackPoints = [];
				
				try {
				    trackPoints = [];
				} catch (err) {}

				const wasRemovingCurrentDrawingBlank =
				    (
				        window.currentMultiIndex === removeIdx ||
				        stack.length === 1
				    ) &&
				    newTrack &&
				    newTrack.isBlankProject === true;
				
				stack.splice(
				    removeIdx,
				    1
				);
				
				window.multiGpxStack =
				    stack;
				
				
				if (wasRemovingCurrentDrawingBlank) {
				    isDrawingMode =
				        false;
				
				    isScribbling =
				        false;
				
				    tempDrawPoints =
				        [];
				
				    lastScribbleLatLng =
				        null;
				
				    const drawBtn =
				        document.getElementById("drawModeBtn");
				
				    if (drawBtn) {
				        drawBtn.style.setProperty(
				            "background",
				            "white",
				            "important"
				        );
				
				        drawBtn.style.setProperty(
				            "color",
				            "#5f6368",
				            "important"
				        );
				    }
				
				    const methodBtn =
				        document.getElementById("drawMethodBtn");
				
				    if (methodBtn) {
				        methodBtn.style.display =
				            "none";
				    }
				
				    const mapEl =
				        document.getElementById("map");
				
				    if (mapEl) {
				        mapEl.style.cursor =
				            "";
				    }
				
				    if (map && map.dragging) {
				        map.dragging.enable();
				    }
				
				    if (map && map.boxZoom) {
				        map.boxZoom.enable();
				    }
				
				    window.drawTargetMode =
				        null;
				
				    const toast =
				        document.getElementById("map-toast");
				
				    if (toast) {
				        toast.style.opacity =
				            "0";
				    }
				
				    if (window.mapToastTimer) {
				        clearTimeout(window.mapToastTimer);
				        window.mapToastTimer =
				            null;
				    }
				
				    window.currentMapToast =
				        null;
				}

        try {
            multiGpxStack =
                stack;
        } catch (err) {}

				const nextFocus =
				    Math.min(
				        removeIdx,
				        stack.length - 1
				    );
				
				refreshAfterBlankChange(
				    Math.max(0, nextFocus)
				);
				
				
				if (
				    !Array.isArray(stack) ||
				    stack.length === 0
				) {
				    const bar =
				        document.getElementById("multiGpxBtnBar");
				
				    if (bar) {
				        bar.innerHTML =
				            "";
				
				        bar.style.display =
				            "none";
				    }
				
				    document.body.classList.remove(
				        "has-gpx-bar"
				    );
				
				    if (
				        typeof gpxManagerControlContainer !== "undefined" &&
				        gpxManagerControlContainer
				    ) {
				        gpxManagerControlContainer.style.display =
				            "none";
				    }
				
				    const routeSelectContainer =
				        document.getElementById("routeSelectContainer");
				
				    if (routeSelectContainer) {
				        routeSelectContainer.style.display =
				            "none";
				    }
				
				    const fileNameDisplay =
				        document.getElementById("fileNameDisplay");
				
				    if (fileNameDisplay) {
				        fileNameDisplay.innerHTML =
				            "";
				    }
				
				    const importHint =
				        document.getElementById("importHint");
				
				    if (importHint) {
				        importHint.style.display =
				            "";
				    }
				
				    const refreshIcon =
				        document.getElementById("refreshIcon");
				
				    if (refreshIcon) {
				        refreshIcon.style.display =
				            "";
				    }
				}
        
    };

    const command = {
        fileIndex: insertIndex,
        managedFileIndex: insertIndex,
        skipAutoLoadRouteAfterUndo: true,

        do: function() {
            addBlank();
        },

        undo: function() {
            removeBlank();
        },

        redo: function() {
            addBlank();
        }
    };

    if (
        typeof historyManager !== "undefined" &&
        historyManager &&
        typeof historyManager.execute === "function"
    ) {
        historyManager.execute(command);

    } else {
        command.do();
    }

    if (typeof showMapToast === "function") {
        showMapToast("已新增自訂路線");
    }
};


window.showGpxAddMenu = function(anchorEl) {
    let menu =
        document.getElementById("gpxAddMenu");

    if (!menu) {
        menu =
            document.createElement("div");

        menu.id =
            "gpxAddMenu";

        menu.innerHTML = `
            <div class="gpx-add-menu-item" data-action="blank">
                <span class="material-icons">add_location_alt</span>
                <span>新增自訂路線</span>
            </div>

            <div class="gpx-add-menu-item" data-action="open">
                <span class="material-icons">upload_file</span>
                <span>匯入新的 GPX</span>
            </div>
        `;
    }

    
    const mapEl =
        document.getElementById("map");

    const fullscreenParent =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement ||
        null;

    const isIphoneFullscreen =
        document.body.classList.contains("iphone-fullscreen");

    const menuParent =
        fullscreenParent ||
        (
            isIphoneFullscreen
                ? mapEl
                : null
        ) ||
        document.body;

    if (menu.parentElement !== menuParent) {
        menuParent.appendChild(menu);
    } else {
        
        menuParent.appendChild(menu);
    }

    
    menu.style.setProperty("display", "block", "important");
    menu.style.setProperty("visibility", "hidden", "important");
    menu.style.setProperty("z-index", "2147483647", "important");
    menu.style.setProperty("position", "fixed", "important");
    menu.style.maxHeight = "";
    menu.style.overflowY = "";

    const rect =
        anchorEl.getBoundingClientRect();

    const viewportW =
        window.innerWidth || document.documentElement.clientWidth;

    const viewportH =
        window.innerHeight || document.documentElement.clientHeight;

    const margin =
        8;

    const menuW =
        menu.offsetWidth || 190;

    const menuH =
        menu.offsetHeight || 90;

    
    let left =
        rect.left;

    
    if (left + menuW > viewportW - margin) {
        left =
            viewportW - menuW - margin;
    }

    if (left < margin) {
        left =
            margin;
    }

    
    let top =
        rect.top - menuH - margin;

    
    if (top < margin) {
        top =
            rect.bottom + margin;
    }

    
    if (top + menuH > viewportH - margin) {
        const availableHeight =
            viewportH - top - margin;

        if (availableHeight >= 80) {
            menu.style.maxHeight =
                availableHeight + "px";

            menu.style.overflowY =
                "auto";
        } else {
            top =
                Math.max(
                    margin,
                    viewportH - menuH - margin
                );
        }
    }

    menu.style.left =
        left + "px";

    menu.style.top =
        top + "px";

    menu.style.setProperty("visibility", "visible", "important");

    menu.onclick = function(e) {
        const item =
            e.target.closest(".gpx-add-menu-item");

        if (!item) return;

        const action =
            item.dataset.action;

        menu.style.setProperty("display", "none", "important");

        if (action === "blank") {
            if (typeof window.createBlankGpxProject === "function") {
                window.createBlankGpxProject();
            }

            return;
        }

        if (action === "open") {
            window.isAppendingGpxFromPlus =
                true;

            const input =
                document.getElementById("multiGpxInput");

            if (input) {
                input.value =
                    "";

                input.click();

            } else {
                alert("找不到 multiGpxInput");

                window.isAppendingGpxFromPlus =
                    false;
            }
        }
    };

    if (!window.gpxAddMenuOutsideCloseInstalled) {
        window.gpxAddMenuOutsideCloseInstalled =
            true;

        document.addEventListener(
            "mousedown",
            function(e) {
                const m =
                    document.getElementById("gpxAddMenu");

                if (!m) return;

                if (
                    m.contains(e.target) ||
                    e.target.closest("#gpxAddBtn")
                ) {
                    return;
                }

                m.style.setProperty("display", "none", "important");
            },
            true
        );

        document.addEventListener(
            "touchstart",
            function(e) {
                const m =
                    document.getElementById("gpxAddMenu");

                if (!m) return;

                if (
                    m.contains(e.target) ||
                    e.target.closest("#gpxAddBtn")
                ) {
                    return;
                }

                m.style.setProperty("display", "none", "important");
            },
            true
        );
    }
};

function renderMultiGpxButtons() {

    const bar =
        document.getElementById('multiGpxBtnBar');

    if (!bar) return;

    const stack =
        window.multiGpxStack ||
        multiGpxStack ||
        [];

    
    if (
        !Array.isArray(stack) ||
        stack.length === 0
    ) {
        bar.innerHTML =
            "";

        bar.style.setProperty(
            "display",
            "none",
            "important"
        );

        document.body.classList.remove(
            "has-gpx-bar"
        );

        if (
            typeof gpxManagerControlContainer !== "undefined" &&
            gpxManagerControlContainer
        ) {
            gpxManagerControlContainer.style.display =
                "none";

            gpxManagerControlContainer.innerHTML =
                "";
        }

        const fileNameDisplay =
            document.getElementById("fileNameDisplay");

        if (fileNameDisplay) {
            fileNameDisplay.innerHTML =
                "";
        }

        const importHint =
            document.getElementById("importHint");

        if (importHint) {
            importHint.style.display =
                "";
        }

        const refreshIcon =
            document.getElementById("refreshIcon");

        if (refreshIcon) {
            refreshIcon.style.display =
                "";
        }

        if (typeof window.updateLoadedGpxCountDisplay === "function") {
            window.updateLoadedGpxCountDisplay();
        }

        return;
    }

    const mapEl =
        document.getElementById("map");

    const fullscreenParent =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement ||
        null;

    const isIphoneFullscreen =
        document.body.classList.contains("iphone-fullscreen");

    if (
        mapEl &&
        (
            fullscreenParent ||
            isIphoneFullscreen
        )
    ) {
        const targetParent =
            fullscreenParent || mapEl;

        if (bar.parentElement !== targetParent) {
            targetParent.appendChild(bar);
        }

        bar.classList.add("gpx-bar-fullscreen");

    } else {
        bar.classList.remove("gpx-bar-fullscreen");
    }

    document.body.classList.add('has-gpx-bar');

    bar.style.display =
        'flex';

    if (
        gpxManagerControlContainer &&
        stack &&
        stack.length > 0
    ) {
        gpxManagerControlContainer.style.display =
            'block';

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

    } else if (gpxManagerControlContainer) {
        gpxManagerControlContainer.style.display =
            'none';
    }

    bar.innerHTML =
        '';

    const closeBtn =
        document.createElement('button');

    closeBtn.className =
        'gpx-file-btn close-btn';

    closeBtn.innerHTML =
        '✕ 關閉檔案';

    closeBtn.onclick = (e) => {
        if (e) {
            L.DomEvent.stopPropagation(e);
        }

        const liveStack =
            window.multiGpxStack ||
            multiGpxStack ||
            [];

        const totalCount =
            Array.isArray(liveStack)
                ? liveStack.length
                : 0;

        if (totalCount <= 0) {
            return;
        }

        if (totalCount === 1) {
            window.confirmIfChanged(
                () => {
                    if (typeof window.closeAllGpxFilesDirect === "function") {
                        window.closeAllGpxFilesDirect();
                    } else {
                        console.warn("找不到 closeAllGpxFilesDirect");
                        location.reload();
                    }
                },
                "確定關閉檔案？"
            );

            return;
        }

        if (typeof window.showCloseFileChoiceModal === "function") {
            window.showCloseFileChoiceModal();
        } else {
            console.warn("找不到 showCloseFileChoiceModal");

            alert(
                "找不到 showCloseFileChoiceModal，請確認三按鈕關閉視窗 function 已經貼上。"
            );
        }
    };

    bar.appendChild(
        closeBtn
    );

    stack.forEach((gpx, i) => {

        if (gpx.visible === false) {
            if (gpx.layerGroup) {
                map.removeLayer(gpx.layerGroup);
            }

            return;
        }

        if (
            gpx.layerGroup &&
            !map.hasLayer(gpx.layerGroup)
        ) {
            map.addLayer(gpx.layerGroup);
        }

        const btn =
            document.createElement('button');

        btn.className =
            'gpx-file-btn';

        btn.id =
            `multi-btn-${i}`;

        if (i === window.currentMultiIndex) {
            btn.classList.add('active');
        }

        const displayName =
            gpx.name ||
            gpx.fileName ||
            "GPX";

        btn.textContent =
            displayName.length > 40
                ? displayName.substring(0, 40) + "..."
                : displayName;

        btn.style.setProperty(
            'border-left',
            `5px solid ${gpx.color || "#0000FF"}`,
            'important'
        );

        btn.style.setProperty(
            '--track-color',
            gpx.color || "#0000FF",
            'important'
        );

        btn.onclick = (e) => {
            if (e) {
                L.DomEvent.stopPropagation(e);
            }

            if (typeof switchMultiGpx === 'function') {
                switchMultiGpx(i);
            }
        };

        bar.appendChild(
            btn
        );
    });

    const addBtn =
        document.createElement("button");

    addBtn.id =
        "gpxAddBtn";

    addBtn.type =
        "button";

    addBtn.className =
        "gpx-bar-add-btn";

    addBtn.title =
        "新增 / 開啟 GPX";

    addBtn.innerHTML =
        `<span class="material-icons">add</span>`;

    addBtn.onclick = function(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        if (typeof window.showGpxAddMenu === "function") {
            window.showGpxAddMenu(addBtn);
        }
    };

    bar.appendChild(
        addBtn
    );

    L.DomEvent.disableClickPropagation(
        bar
    );

    if (typeof window.updateLoadedGpxCountDisplay === "function") {
        window.updateLoadedGpxCountDisplay();
    }
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
    const chartContainer =
        document.getElementById("chartContainer");

    const btn =
        document.getElementById("toggleChartBtn");

    const tipLabel =
        document.getElementById("chartTipToggleLabel");

    const hasTrackData =
        Array.isArray(trackPoints) &&
        trackPoints.length > 1;

    
    if (!hasTrackData) {
        if (chartContainer) {
            chartContainer.style.setProperty(
                "display",
                "none",
                "important"
            );
        }

        if (btn) {
            btn.textContent =
                "展開高度表";

            btn.style.display =
                "none";
        }

        if (tipLabel) {
            tipLabel.style.display =
                "none";
        }

        if (window.chart) {
            window.chart.destroy();
            window.chart =
                null;
        }

        return;
    }
    
    if (window.__preserveChartStateForWptAction === true) {
		    const chartContainer =
		        document.getElementById("chartContainer");
		
		    const btn =
		        document.getElementById("toggleChartBtn");
		
		    const tipLabel =
		        document.getElementById("chartTipToggleLabel");
		
		    const isChartOpen =
		        chartContainer &&
		        window.getComputedStyle(chartContainer).display !== "none";
		
		    if (btn) {
		        btn.style.setProperty(
		            "display",
		            "block",
		            "important"
		        );
		
		        btn.textContent =
		            isChartOpen
		                ? "收合高度表"
		                : "展開高度表";
		    }
		
		    if (tipLabel) {
		        tipLabel.style.setProperty(
		            "display",
		            isChartOpen ? "flex" : "none",
		            "important"
		        );
		    }
		
		    return;
		}

    if (
        chartContainer.style.display === "none" ||
        chartContainer.style.display === ""
    ) {
        chartContainer.style.display =
            "block";
            
        window.userElevationChartExpanded = true;

        if (btn) {
            btn.textContent =
                "收合高度表";
        }

        if (tipLabel) {
            tipLabel.style.display =
                "flex";
        }

        if (typeof drawElevationChart === "function") {
            drawElevationChart();
        }

        if (window.chart) {
            window.chart.resize();
        }

    } else {
        chartContainer.style.display =
            "none";
            
        window.userElevationChartExpanded = false;

        if (btn) {
            btn.textContent =
                "展開高度表";
        }

        if (tipLabel) {
            tipLabel.style.display =
                "none";
        }

        if (currentPopup) {
            map.closePopup();
        }
    }
}

function applyElevationChartAutoState(options = {}) {

    const preserveUserChartState =
        options.preserveUserChartState === true;

    const wasChartOpenBeforeLoad =
        options.wasChartOpenBeforeLoad === true;

    const chartContainer =
        document.getElementById("chartContainer");

    const btn =
        document.getElementById("toggleChartBtn");

    const tipLabel =
        document.getElementById("chartTipToggleLabel");

    const fileIdx =
        typeof window.currentMultiIndex === "number"
            ? window.currentMultiIndex
            : 0;

    const routeIdx =
        typeof window.currentActiveIndex === "number"
            ? window.currentActiveIndex
            : 0;

    const currentFile =
        window.multiGpxStack &&
        window.multiGpxStack[fileIdx];

    const currentRoute =
        currentFile &&
        Array.isArray(currentFile.routes) &&
        currentFile.routes[routeIdx]
            ? currentFile.routes[routeIdx]
            : (
                window.allTracks &&
                window.allTracks[routeIdx]
                    ? window.allTracks[routeIdx]
                    : currentFile
            );

    const currentPoints =
        currentRoute &&
        Array.isArray(currentRoute.points)
            ? currentRoute.points
            : (
                Array.isArray(window.trackPoints)
                    ? window.trackPoints
                    : (
                        Array.isArray(trackPoints)
                            ? trackPoints
                            : []
                    )
            );

    const hasTrackData =
        Array.isArray(currentPoints) &&
        currentPoints.length > 1;

    window.trackPoints =
        currentPoints;

    try {
        trackPoints =
            currentPoints;
    } catch (err) {}

    
    if (!hasTrackData) {
        if (chartContainer) {
            chartContainer.style.setProperty(
                "display",
                "none",
                "important"
            );
        }

        if (btn) {
            btn.style.setProperty(
                "display",
                "none",
                "important"
            );

            btn.textContent =
                "展開高度表";
        }

        if (tipLabel) {
            tipLabel.style.setProperty(
                "display",
                "none",
                "important"
            );
        }

        if (window.chart) {
            window.chart.destroy();
            window.chart =
                null;
        }

        const progressBar =
            document.getElementById("gpxProgressBar");

        if (progressBar) {
            progressBar.value =
                0;

            progressBar.max =
                0;
        }

        const info =
            document.getElementById("progressBarInfo");

        if (info) {
            info.textContent =
                "";
        }

        return;
    }

    
    if (preserveUserChartState) {
        const isChartOpen =
            wasChartOpenBeforeLoad === true;

        if (btn) {
            btn.style.setProperty(
                "display",
                "block",
                "important"
            );

            btn.textContent =
                isChartOpen
                    ? "收合高度表"
                    : "展開高度表";
        }

        if (chartContainer) {
            chartContainer.style.setProperty(
                "display",
                isChartOpen ? "block" : "none",
                "important"
            );

            if (
                isChartOpen &&
                !document.getElementById("elevationChart")
            ) {
                chartContainer.innerHTML =
                    '<canvas id="elevationChart"></canvas>';
            }
        }

        if (tipLabel) {
            tipLabel.style.setProperty(
                "display",
                isChartOpen ? "flex" : "none",
                "important"
            );
        }

        const progressBar =
            document.getElementById("gpxProgressBar");

        if (progressBar) {
            progressBar.max =
                Math.max(
                    0,
                    currentPoints.length - 1
                );

            progressBar.value =
                0;
        }

        if (
            isChartOpen &&
            typeof drawElevationChart === "function"
        ) {
            drawElevationChart();
        }

        if (
            !isChartOpen &&
            window.chart
        ) {
            window.chart.destroy();
            window.chart =
                null;
        }

        return;
    }

    
    if (btn) {
        btn.style.setProperty(
            "display",
            "block",
            "important"
        );

        btn.textContent =
            "收合高度表";
    }

    if (chartContainer) {
        chartContainer.style.setProperty(
            "display",
            "block",
            "important"
        );

        if (!document.getElementById("elevationChart")) {
            chartContainer.innerHTML =
                '<canvas id="elevationChart"></canvas>';
        }
    }

    if (tipLabel) {
        tipLabel.style.setProperty(
            "display",
            "flex",
            "important"
        );
    }

    const progressBar =
        document.getElementById("gpxProgressBar");

    if (progressBar) {
        progressBar.max =
            Math.max(
                0,
                currentPoints.length - 1
            );

        progressBar.value =
            0;
    }

    if (typeof drawElevationChart === "function") {
        drawElevationChart();
    }

    if (
        window.chart &&
        typeof window.chart.resize === "function"
    ) {
        window.chart.resize();
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

    const files =
        e.dataTransfer && e.dataTransfer.files
            ? e.dataTransfer.files
            : null;

    if (!files || files.length === 0) {
        return;
    }

    const gpxFiles =
        Array.from(files).filter(function(f) {
            return String(f.name || "")
                .toLowerCase()
                .endsWith(".gpx");
        });

    if (gpxFiles.length === 0) {
        if (typeof showMapToast === "function") {
            showMapToast("請拖拉 GPX 檔案");
        }

        return;
    }

    if (typeof handleGpxFiles === "function") {
        await handleGpxFiles(gpxFiles);
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
        heightVal = isMobile ? '58vh' : '550px'; 
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
	  ;
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
		
		    const hasTracks =
		        typeof trackPoints !== "undefined" &&
		        Array.isArray(trackPoints) &&
		        trackPoints.length > 0;
		
		    
		    if (!hasTracks) {
		        window.manualShowBar = false;
		
		        const barContainer =
		            document.getElementById("map-control-bar");
		
		        if (barContainer) {
		            barContainer.style.setProperty(
		                "display",
		                "none",
		                "important"
		            );
		        }
		
		        const progressBar =
		            document.getElementById("gpxProgressBar");
		
		        if (progressBar) {
		            progressBar.value = 0;
		            progressBar.max = 0;
		        }
		
		        const infoEl =
		            document.getElementById("progressBarInfo");
		
		        if (infoEl) {
		            infoEl.textContent = "0.00 km";
		        }
		
		        refreshBarBtnStyle();
		
		        if (window.updateVisibility) {
		            window.updateVisibility();
		        }
		
		        if (typeof showMapToast === "function") {
		            showMapToast("目前沒有路線，請先匯入 GPX 或繪製路線");
		        } else {
		            alert("目前沒有路線，請先匯入 GPX 或繪製路線");
		        }
		
		        return;
		    }
		
		    window.manualShowBar =
		        !window.manualShowBar;
		
		    if (window.manualShowBar) {
		        if (typeof setupProgressBar === "function") {
		            setupProgressBar();
		        }
		
		        if (typeof initProgressBar === "function") {
		            initProgressBar();
		        }
		    }
		
		    refreshBarBtnStyle();
		
		    if (window.updateVisibility) {
		        window.updateVisibility();
		    }
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
            
            
            L.DomEvent.disableClickPropagation(gpxManagerControlContainer);
            L.DomEvent.disableScrollPropagation(gpxManagerControlContainer);
            
            return gpxManagerControlContainer;
        }
    });
    map.addControl(new GpxManagerControl());
}

initGpxManagerControl();

function showGpxManagementModal() {
		

    if (typeof isDrawingMode !== 'undefined' && isDrawingMode) {
        isDrawingMode = false;

        const drawBtn = document.getElementById('drawModeBtn');
        const methodBtn = document.getElementById('drawMethodBtn');

        if (drawBtn) {
            drawBtn.style.setProperty('background', "white", 'important');
            drawBtn.style.setProperty('color', "#5f6368", 'important');
        }

        if (methodBtn) {
            methodBtn.style.display = "none";
        }

        document.getElementById('map').style.cursor = '';

        if (typeof map !== 'undefined') {
            map.dragging.enable();
            map.boxZoom.enable();
        }
    }
    
    const oldToast =
        document.getElementById("map-toast");

    if (oldToast) {
        oldToast.style.opacity = "0";
    }

    if (window.mapToastTimer) {
        clearTimeout(window.mapToastTimer);
        window.mapToastTimer = null;
    }

    window.currentMapToast = null;

    let modal = document.getElementById('gpxManageModal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'gpxManageModal';
		modal.style.cssText =
		    "position:fixed; top:0; left:0; width:100%; height:100%; " +
		    "background:transparent; display:none; " +
		    "pointer-events:none; " +
		    "z-index:2147483646;";
        document.body.appendChild(modal);
    }

		window.gpxManagerExpanded = window.gpxManagerExpanded || {};
		window.gpxMergeSelections = window.gpxMergeSelections || {};
		window.gpxMergeOrder = window.gpxMergeOrder || {};

    const isNowFS = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.body.classList.contains('iphone-fullscreen')
    );

    const mapContainer = document.getElementById('map');

    if (isNowFS && mapContainer && modal.parentElement !== mapContainer) {
        mapContainer.appendChild(modal);
    } else if (!isNowFS && modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }

		modal.style.display = 'block';
		modal.style.zIndex = '2147483646';
		modal.style.pointerEvents = 'none';

    if (typeof L !== "undefined" && L.DomEvent) {
        L.DomEvent.disableClickPropagation(modal);
        L.DomEvent.disableScrollPropagation(modal);
    }

    const defaultColors = [
        '#0000FF', '#FF3300', '#FF00FF', '#FFD600',
        '#9C27B0', '#33FF00', '#00FFFF', '#E91E63',
        '#1A73E8', '#00E676', '#FF8C00', '#BF00FF',
        '#A5F2F3', '#FFF000', '#87CEFA', '#FF1493'
    ];

    const esc = function(v) {
        return String(v ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    };
//"
    const getRouteNameForManager = function(route, routeIdx) {
        let baseName =
            route &&
            (
                route.routeDisplayName ||
                route.displayName ||
                route.name
            );

        if (
            baseName === undefined ||
            baseName === null ||
            baseName === "" ||
            baseName === "NaN" ||
            String(baseName).trim() === "" ||
            String(baseName).trim() === "NaN"
        ) {
            if (route && route.isCombined === true) {
                baseName = "結合路線";
            } else if (
                route &&
                (
                    route.isHandDrawRoute === true ||
                    route.isDrawTrack === true
                )
            ) {
                baseName = "自訂路線";
            } else if (route && route.isWaypointOnly === true) {
                baseName = "航點資料";
            } else {
                baseName = "子路線 " + routeIdx;
            }
        }

        baseName = String(baseName);

        if (route && route.isCombined === true) {
            return "【 " + baseName + " 】";
        }

        if (route && route.isHandDrawRoute === true) {
            return baseName;
        }

        if (route && route.isWaypointOnly === true) {
            return baseName;
        }

        return baseName;
    };

    let listHtml = "";

		listHtml += '<div id="gpxManagePanel" style="';
		listHtml += 'position:absolute; ';
		listHtml += 'top:50%; ';
		listHtml += 'left:50%; ';
		listHtml += 'transform:translate(-50%, -50%); ';
		listHtml += 'background:white; ';
		listHtml += 'padding:20px; ';
		listHtml += 'border-radius:12px; ';
		listHtml += 'width:360px; ';
		listHtml += 'pointer-events:auto; ';
    listHtml += 'max-width:92vw; ';
    listHtml += 'box-shadow:0 10px 30px rgba(0,0,0,0.3); ';
    listHtml += 'max-height:80vh; ';
    listHtml += 'display:flex; ';
    listHtml += 'flex-direction:column; ';
    listHtml += 'position:relative; ';
    listHtml += 'box-sizing:border-box; ';
    listHtml += 'user-select:none; ';
    listHtml += '-webkit-user-select:none; ';
    listHtml += '-webkit-touch-callout:none;';
    listHtml += '">';

		listHtml += '<div id="gpxManageDragHandle" style="';
    listHtml += 'display:flex; ';
    listHtml += 'justify-content:space-between; ';
    listHtml += 'align-items:center; ';
    listHtml += 'cursor:move; ';
    listHtml += 'height:36px; ';
    listHtml += 'min-height:36px; ';
    listHtml += 'max-height:36px; ';
    listHtml += 'margin-bottom:15px; ';
    listHtml += 'border-bottom:1px solid #eee; ';
    listHtml += 'padding-bottom:10px; ';
    listHtml += 'box-sizing:border-box;';
    listHtml += '">';

    listHtml += '<div style="';
    listHtml += 'margin:0; ';
    listHtml += 'font-size:22px; ';
    listHtml += 'line-height:23px; ';
    listHtml += 'font-weight:700; ';
    listHtml += 'text-align:center; ';
    listHtml += 'height:24px; ';
    listHtml += 'min-height:24px; ';
    listHtml += 'max-height:24px; ';
    listHtml += 'flex:1;';
    listHtml += '">管理軌跡</div>';

    listHtml += '</div>';

		listHtml += '<div id="gpxManageScrollBody" style="';
		listHtml += 'flex:1; ';
		listHtml += 'overflow-y:auto; ';
		listHtml += 'padding-right:5px; ';
		listHtml += 'box-sizing:border-box;';
		listHtml += '">';

    if (!Array.isArray(multiGpxStack) || multiGpxStack.length === 0) {

        listHtml += '<div style="padding:20px; text-align:center; color:#777; font-size:14px; line-height:20px;">';
        listHtml += '目前沒有匯入 GPX。';
        listHtml += '</div>';

    } else {

        multiGpxStack.forEach(function(gpx, i) {
            if (!gpx) return;

            if (!Array.isArray(gpx.routes)) {
                gpx.routes = [];
            }

            if (
                gpx.routes.length === 0 &&
                gpx.isWaypointOnly !== true &&
                gpx._routesDeletedByUser !== true &&
                gpx.content &&
                typeof processGpxXml === "function"
            ) {
                const parsedRoutes = processGpxXml(gpx.content) || [];

                gpx.routes = parsedRoutes.map(function(route, idx) {
                    const routeName =
                        route.displayName ||
                        route.name ||
                        "路線 " + (idx + 1);

                    const points =
                        Array.isArray(route.points)
                            ? route.points
                            : [];

                    const segments =
                        Array.isArray(route.segments) &&
                        route.segments.length > 0
                            ? route.segments
                            : (
                                points.length > 0
                                    ? [points.map(function(p) {
                                        return [p.lat, p.lon];
                                    })]
                                    : []
                            );

                    return {
                        ...route,
                        name: routeName,
                        displayName: routeName,
                        fileName: gpx.fileName || gpx.name || "GPX",
                        color: route.color || gpx.color || "#0000FF",
                        points: points,
                        segments: segments,
                        waypoints: gpx.waypoints || route.waypoints || [],
                        visible: route.visible !== false,
                        isCombined: route.isCombined === true,
                        isDrawTrack: route.isDrawTrack === true,
                        isHandDrawRoute: route.isHandDrawRoute === true
                    };
                });
            }

            if (
                gpx.routes.length === 0 &&
                gpx.isWaypointOnly !== true &&
                gpx._routesDeletedByUser !== true &&
                (
                    (Array.isArray(gpx.points) && gpx.points.length > 0) ||
                    (Array.isArray(gpx.segments) && gpx.segments.length > 0)
                )
            ) {
                const routeName =
                    gpx.displayName ||
                    gpx.fileName ||
                    gpx.name ||
                    "路線 1";

                gpx.routes.push({
                    id: "route_" + Date.now(),
                    name: routeName,
                    displayName: routeName,
                    fileName: gpx.fileName || gpx.name || "GPX",
                    color: gpx.color || "#0000FF",
                    points: Array.isArray(gpx.points) ? gpx.points : [],
                    segments: Array.isArray(gpx.segments) ? gpx.segments : [],
                    waypoints: gpx.waypoints || [],
                    visible: true,
                    isCombined: false
                });
            }

            const trackRoutes = gpx.routes.filter(function(route) {
                if (!route || route.isCombined) return false;

                return (
                    (Array.isArray(route.points) && route.points.length > 0) ||
                    (Array.isArray(route.segments) && route.segments.length > 0)
                );
            });

            if (
                trackRoutes.length > 1 &&
                !(
                    gpx.routes[0] &&
                    gpx.routes[0].isCombined === true
                )
            ) {
                let combinedPoints = [];
                let combinedSegments = [];

                trackRoutes.forEach(function(route) {
                    const pts =
                        Array.isArray(route.points)
                            ? route.points
                            : [];

                    if (pts.length > 0) {
                        combinedPoints = combinedPoints.concat(pts);
                    }

                    if (
                        Array.isArray(route.segments) &&
                        route.segments.length > 0
                    ) {
                        route.segments.forEach(function(seg) {
                            if (Array.isArray(seg) && seg.length > 0) {
                                combinedSegments.push(seg);
                            }
                        });
                    } else if (pts.length > 0) {
                        combinedSegments.push(
                            pts.map(function(p) {
                                return [p.lat, p.lon];
                            })
                        );
                    }
                });

                let totalDist = 0;

                const recalculatedPoints =
                    combinedPoints.map(function(p, idx, arr) {
                        if (idx > 0) {
                            const prev = arr[idx - 1];

                            if (typeof calculateDistance === "function") {
                                totalDist += calculateDistance(
                                    prev.lat,
                                    prev.lon,
                                    p.lat,
                                    p.lon
                                );
                            }
                        }

                        return {
                            ...p,
                            distance: totalDist
                        };
                    });

                const combinedName =
                    gpx.displayName ||
                    gpx.fileName ||
                    gpx.name ||
                    "結合路線";

                gpx.routes.unshift({
                    id: "combined_" + Date.now(),
                    name: combinedName,
                    displayName: combinedName,
                    fileName: gpx.fileName || gpx.name || "GPX",
                    color: gpx.color || "#0000FF",
                    points: recalculatedPoints,
                    segments: combinedSegments,
                    waypoints: gpx.waypoints || [],
                    visible: true,
                    isCombined: true
                });

                gpx.points = recalculatedPoints;
                gpx.segments = combinedSegments;
            }

            if (gpx.customRouteNames) {
                Object.keys(gpx.customRouteNames).forEach(function(key) {
                    const routeIdx = parseInt(key, 10);
                    const customName = gpx.customRouteNames[key];

                    if (
                        Number.isFinite(routeIdx) &&
                        gpx.routes[routeIdx] &&
                        customName
                    ) {
                        gpx.routes[routeIdx].name = customName;
                        gpx.routes[routeIdx].displayName = customName;
                    }
                });
            }

            gpx.routes.forEach(function(route, routeIdx) {
                if (!route) return;

                let routeName =
                    route.routeDisplayName ||
                    route.displayName ||
                    route.name;

                if (
                    routeName === undefined ||
                    routeName === null ||
                    routeName === "" ||
                    routeName === "NaN" ||
                    String(routeName).trim() === "" ||
                    String(routeName).trim() === "NaN"
                ) {
                    if (route.isCombined === true) {
                        routeName = "結合路線";
                    } else if (
                        route.isHandDrawRoute === true ||
                        route.isDrawTrack === true
                    ) {
                        routeName = "自訂路線";
                    } else if (route.isWaypointOnly === true) {
                        routeName = "航點資料";
                    } else {
                        routeName = "子路線 " + routeIdx;
                    }
                }

                routeName = String(routeName);

                route.name = routeName;
                route.displayName = routeName;

                if (route.routeDisplayName !== undefined) {
                    route.routeDisplayName = routeName;
                }

                route.color = route.color || gpx.color || "#0000FF";
                route.waypoints = gpx.waypoints || route.waypoints || [];
            });

            const isVisible = gpx.visible !== false;
						const isChecked = isVisible ? "checked" : "";
						const isFocused = window.currentMultiIndex === i;
						const routes = Array.isArray(gpx.routes) ? gpx.routes : [];
						const hasChildren = routes.length > 0;
						
						
						if (
						    isFocused &&
						    hasChildren
						) {
						    window.gpxManagerExpanded[i] = true;
						}
						
						const isExpanded = !!window.gpxManagerExpanded?.[i];
						
						const activeRouteIdx = isFocused ? (window.currentActiveIndex || 0) : -1;
						const disabledAttr = isFocused ? "disabled" : "";
						const cursorStyle =
						    isFocused
						        ? "cursor:not-allowed; opacity:0.6;"
						        : "cursor:pointer;";

            listHtml += '<div style="';
            listHtml += 'margin-bottom:10px; ';
            listHtml += 'border:1px solid ' + (isFocused ? '#1a73e8' : '#eee') + '; ';
            listHtml += 'border-radius:8px; ';
            listHtml += 'padding:10px; ';
            listHtml += 'background:' + (isFocused ? '#f0f7ff' : '#fafafa') + '; ';
            listHtml += 'box-sizing:border-box; ';
            listHtml += 'user-select:none; ';
            listHtml += '-webkit-user-select:none;';
            listHtml += '">';

            listHtml += '<div style="';
            listHtml += 'display:flex; ';
            listHtml += 'align-items:center; ';
            listHtml += 'gap:10px; ';
            listHtml += 'height:28px; ';
            listHtml += 'min-height:28px; ';
            listHtml += 'max-height:28px;';
            listHtml += '">';

            listHtml += '<div ';
            listHtml += 'role="button" ';
            listHtml += 'aria-label="' + (hasChildren ? '展開/收合子路線' : '沒有子路線') + '" ';
            listHtml += 'onclick="event.stopPropagation(); ' + (hasChildren ? 'toggleGpxRouteChildren(' + i + ');' : '') + '" ';
            listHtml += 'title="' + (hasChildren ? '展開/收合子路線' : '沒有子路線') + '" ';
            listHtml += 'style="';
            listHtml += 'width:26px; ';
            listHtml += 'height:26px; ';
            listHtml += 'min-width:26px; ';
            listHtml += 'max-width:26px; ';
            listHtml += 'min-height:26px; ';
            listHtml += 'max-height:26px; ';
            listHtml += 'display:flex; ';
            listHtml += 'align-items:center; ';
            listHtml += 'justify-content:center; ';
            listHtml += 'box-sizing:border-box; ';
            listHtml += 'background:' + (hasChildren ? '#eef3fe' : '#f1f1f1') + '; ';
            listHtml += 'color:' + (hasChildren ? '#1a73e8' : '#aaa') + '; ';
            listHtml += 'border-radius:6px; ';
            listHtml += 'cursor:' + (hasChildren ? 'pointer' : 'default') + '; ';
            listHtml += 'font-size:26px; ';
            listHtml += 'font-weight:600; ';
            listHtml += 'line-height:26px; ';
            listHtml += 'padding:0; ';
            listHtml += 'flex-shrink:0; ';
            listHtml += 'user-select:none; ';
            listHtml += '-webkit-user-select:none;';
            listHtml += '">';
            listHtml += hasChildren ? (isExpanded ? '▾' : '▸') : '•';
            listHtml += '</div>';

            listHtml += '<input type="checkbox" ';
            listHtml += 'id="gpx-chk-' + i + '" ';
            listHtml += isChecked + ' ';
            listHtml += disabledAttr + ' ';
            listHtml += 'onchange="toggleGpxVisibility(' + i + ')" ';
            listHtml += 'style="width:18px; height:18px; min-width:18px; max-width:18px; ' + cursorStyle + ' flex-shrink:0; margin:0;">';

            listHtml += '<div onclick="toggleColorPicker(' + i + ')" style="';
            listHtml += 'width:22px; height:22px; min-width:22px; max-width:22px; ';
            listHtml += 'background:' + (gpx.color || '#ff0000') + '; ';
            listHtml += 'border-radius:50%; ';
            listHtml += 'cursor:pointer; ';
            listHtml += 'border:2px solid white; ';
            listHtml += 'box-shadow:0 0 0 1px #ddd; ';
            listHtml += 'box-sizing:border-box; ';
            listHtml += 'flex-shrink:0;';
            listHtml += '"></div>';

						listHtml += '<div ';
						
						listHtml += 'onclick="event.stopPropagation(); switchMultiGpx(' + i + ');" ';
						
						listHtml += 'title="切換到此 GPX" ';
						
						listHtml += 'style="';
						listHtml += 'display:flex; ';
						listHtml += 'align-items:center; ';
						listHtml += 'cursor:pointer; ';
						listHtml += 'flex:1; ';
            listHtml += 'min-width:0; ';
            listHtml += 'gap:6px; ';
            listHtml += 'height:28px; ';
            listHtml += 'min-height:28px; ';
            listHtml += 'max-height:28px;';
            listHtml += '">';

            listHtml += '<div title="' + esc(gpx.name || gpx.fileName || '') + '" style="';
            listHtml += 'font-size:16px; ';
            listHtml += 'font-weight:600; ';
            listHtml += 'line-height:20px; ';
            listHtml += 'height:20px; ';
            listHtml += 'min-height:20px; ';
            listHtml += 'max-height:20px; ';
            listHtml += 'color:' + (isFocused ? '#1a73e8' : '#333') + '; ';
            listHtml += 'white-space:nowrap; ';
            listHtml += 'overflow:hidden; ';
            listHtml += 'text-overflow:ellipsis; ';
            listHtml += 'flex:1; ';
            listHtml += 'min-width:0;';
            listHtml += '">';
            listHtml += esc(gpx.name || gpx.fileName || ('GPX ' + (i + 1)));
            listHtml += '</div>';

            listHtml += '<div class="is-using-label" style="';
            listHtml += 'width:42px; ';
            listHtml += 'height:18px; ';
            listHtml += 'min-width:42px; ';
            listHtml += 'max-width:42px; ';
            listHtml += 'font-size:10px; ';
            listHtml += 'line-height:18px; ';
            listHtml += 'text-align:center; ';
            listHtml += 'background:#1a73e8; ';
            listHtml += 'color:white; ';
            listHtml += 'border-radius:10px; ';
            listHtml += 'flex-shrink:0; ';
            listHtml += 'visibility:' + (isFocused ? 'visible' : 'hidden') + ';';
            listHtml += '">使用中</div>';

            listHtml += '</div>';
            listHtml += '</div>';

            listHtml += '<div id="picker-' + i + '" style="';
            listHtml += 'display:none; ';
            listHtml += 'margin-top:14px; ';
            listHtml += 'padding:8px; ';
            listHtml += 'background:white; ';
            listHtml += 'border-radius:6px; ';
            listHtml += 'border:1px solid #ddd; ';
            listHtml += 'gap:6px; ';
            listHtml += 'flex-wrap:wrap; ';
            listHtml += 'justify-content:center;';
            listHtml += '">';

            defaultColors.forEach(function(color) {
                const isSelected =
                    gpx.color &&
                    gpx.color.toUpperCase() === color.toUpperCase();

                listHtml += '<div ';
                listHtml += 'onclick="changeGpxColor(' + i + ', \'' + color + '\')" ';
                listHtml += 'style="';
                listHtml += 'width:24px; height:24px; ';
                listHtml += 'background:' + color + '; ';
                listHtml += 'border-radius:4px; ';
                listHtml += 'cursor:pointer; ';
                listHtml += 'position:relative; ';
                listHtml += 'border:' + (isSelected ? '2px solid #333' : '1px solid rgba(0,0,0,0.1)') + ';';
                listHtml += '"></div>';
            });

            listHtml += '</div>';

            if (hasChildren && isExpanded) {
                listHtml += '<div style="';
                listHtml += 'margin-top:10px; ';
                listHtml += 'padding-left:10px; ';
                listHtml += 'display:flex; ';
                listHtml += 'flex-direction:column; ';
                listHtml += 'gap:6px;';
                listHtml += '">';

						const mergeOrderForFile =
						    Array.isArray(window.gpxMergeOrder && window.gpxMergeOrder[i])
						        ? window.gpxMergeOrder[i]
						        : [];
						
						const selectedMergeCount =
						    mergeOrderForFile.filter(function(idx) {
						        const route = routes[idx];
						
						        if (!Number.isFinite(Number(idx))) return false;
						        if (!route) return false;
						        if (route.isCombined === true) return false;
						
						        return (
						            (Array.isArray(route.points) && route.points.length > 0) ||
						            (Array.isArray(route.segments) && route.segments.length > 0)
						        );
						    }).length;

                listHtml += '<div style="';
                listHtml += 'display:flex; ';
                listHtml += 'align-items:center; ';
                listHtml += 'gap:6px;';
                listHtml += '">';

                listHtml += '<div ';
                listHtml += 'role="button" ';

                if (selectedMergeCount >= 2) {
                    listHtml += 'onclick="event.stopPropagation(); mergeSelectedSubRoutes(' + i + ');" ';
                    listHtml += 'title="將已勾選的子路線合併成一條新路線" ';
                } else {
                    listHtml += 'title="請至少勾選兩條有軌跡的子路線" ';
                }

                listHtml += 'style="';
                listHtml += 'height:30px; ';
                listHtml += 'min-height:30px; ';
                listHtml += 'max-height:30px; ';
                listHtml += 'display:flex; ';
                listHtml += 'align-items:center; ';
                listHtml += 'justify-content:center; ';
                listHtml += 'border-radius:8px; ';
                listHtml += 'font-size:13px; ';
                listHtml += 'font-weight:600; ';
                listHtml += 'box-sizing:border-box; ';
                listHtml += 'user-select:none; ';
                listHtml += '-webkit-user-select:none; ';
                listHtml += 'flex:1; ';
                listHtml += 'background:' + (selectedMergeCount >= 2 ? '#eef3fe' : '#f1f1f1') + '; ';
                listHtml += 'color:' + (selectedMergeCount >= 2 ? '#1a73e8' : '#aaa') + '; ';
                listHtml += 'border:1px solid ' + (selectedMergeCount >= 2 ? '#c9dafc' : '#e0e0e0') + '; ';
                listHtml += 'cursor:' + (selectedMergeCount >= 2 ? 'pointer' : 'not-allowed') + ';';
                listHtml += '">';
                listHtml += '合併已選子路線';
                listHtml += selectedMergeCount > 0 ? '（' + selectedMergeCount + '）' : '';
                listHtml += '</div>';

                listHtml += '<div ';
                listHtml += 'role="button" ';
                listHtml += 'onclick="event.stopPropagation(); clearMergeRouteSelection(' + i + ');" ';
                listHtml += 'title="清除勾選" ';
                listHtml += 'style="';
                listHtml += 'height:30px; ';
                listHtml += 'width:54px; ';
                listHtml += 'min-width:54px; ';
                listHtml += 'max-width:54px; ';
                listHtml += 'display:flex; ';
                listHtml += 'align-items:center; ';
                listHtml += 'justify-content:center; ';
                listHtml += 'border-radius:8px; ';
                listHtml += 'font-size:12px; ';
                listHtml += 'font-weight:600; ';
                listHtml += 'background:#fff; ';
                listHtml += 'color:#666; ';
                listHtml += 'border:1px solid #ddd; ';
                listHtml += 'cursor:pointer; ';
                listHtml += 'box-sizing:border-box;';
                listHtml += '">';
                listHtml += '清除';
                listHtml += '</div>';

                listHtml += '</div>';

                routes.forEach(function(route, routeIdx) {
                    if (!route) return;

                    const isActiveRoute =
                        isFocused &&
                        activeRouteIdx === routeIdx;

                    const routeColor =
                        route.color ||
                        gpx.color ||
                        '#0000FF';

                    const routeName =
                        getRouteNameForManager(route, routeIdx);

                    const canMergeThisRoute =
                        route &&
                        route.isCombined !== true &&
                        (
                            (Array.isArray(route.points) && route.points.length > 0) ||
                            (Array.isArray(route.segments) && route.segments.length > 0)
                        );

                    const isMergeSelected =
                        !!(
                            window.gpxMergeSelections &&
                            window.gpxMergeSelections[i] &&
                            window.gpxMergeSelections[i][routeIdx] === true
                        );
                   	const mergeOrderForThisFile =
												    Array.isArray(window.gpxMergeOrder && window.gpxMergeOrder[i])
												        ? window.gpxMergeOrder[i].map(Number)
												        : [];
												
										const mergeOrderNumber =
												mergeOrderForThisFile.indexOf(Number(routeIdx)) + 1;

                    const canDeleteThisRoute =
                        route &&
                        route.isCombined !== true;

                    const canReverseThisRoute =
                        route &&
                        route.isCombined !== true &&
                        (
                            (Array.isArray(route.points) && route.points.length > 1) ||
                            (Array.isArray(route.segments) && route.segments.length > 0)
                        );

										listHtml += '<div style="';
										listHtml += 'display:flex; ';
										listHtml += 'align-items:center; ';
										listHtml += 'gap:2px; ';
										listHtml += 'width:100%; ';
										listHtml += 'height:34px; ';
										listHtml += 'min-height:34px; ';
										listHtml += 'max-height:34px; ';
										listHtml += 'text-align:left; ';
										listHtml += 'border:1px solid ' + (isActiveRoute ? '#c9dafc' : '#e0e0e0') + '; ';
										listHtml += 'background:' + (isActiveRoute ? '#e8f0fe' : '#fff') + '; ';
										listHtml += 'border-radius:8px; ';
										listHtml += 'padding:6px 8px; ';
										listHtml += 'cursor:pointer; ';
										listHtml += 'box-sizing:border-box;';
										listHtml += '">';

                    listHtml += '<input type="checkbox" ';
                    listHtml += 'onclick="event.stopPropagation();" ';
                    listHtml += 'onchange="event.stopPropagation(); toggleMergeRouteSelection(' + i + ', ' + routeIdx + ');" ';
                    listHtml += isMergeSelected ? 'checked ' : '';
                    listHtml += canMergeThisRoute ? '' : 'disabled ';
                    listHtml += 'title="' + (canMergeThisRoute ? '勾選以合併此子路線' : '此子路線不能合併') + '" ';
                    listHtml += 'style="';
                    listHtml += 'width:16px; ';
                    listHtml += 'height:16px; ';
                    listHtml += 'min-width:16px; ';
                    listHtml += 'max-width:16px; ';
                    listHtml += 'margin:0 4px 0 0; ';
                    listHtml += 'cursor:' + (canMergeThisRoute ? 'pointer' : 'not-allowed') + '; ';
                    listHtml += 'opacity:' + (canMergeThisRoute ? '1' : '0.35') + '; ';
                    listHtml += 'flex-shrink:0;';
                    listHtml += '">';
                    listHtml += '<div style="';
										listHtml += 'width:16px; ';
										listHtml += 'height:16px; ';
										listHtml += 'min-width:16px; ';
										listHtml += 'max-width:16px; ';
										listHtml += 'border-radius:50%; ';
										listHtml += 'font-size:10px; ';
										listHtml += 'line-height:16px; ';
										listHtml += 'text-align:center; ';
										listHtml += 'background:' + (mergeOrderNumber > 0 ? '#1a73e8' : 'transparent') + '; ';
										listHtml += 'color:' + (mergeOrderNumber > 0 ? 'white' : 'transparent') + '; ';
										listHtml += 'flex-shrink:0; ';
										listHtml += 'margin-right:2px;';
										listHtml += '">';
										listHtml += mergeOrderNumber > 0 ? String(mergeOrderNumber) : '';
										listHtml += '</div>';

                    listHtml += '<div onclick="event.stopPropagation(); selectManagedRoute(' + i + ', ' + routeIdx + ');" ';
                    listHtml += 'style="';
                    listHtml += 'display:flex; ';
                    listHtml += 'align-items:center; ';
                    listHtml += 'gap:8px; ';
                    listHtml += 'flex:1; ';
                    listHtml += 'min-width:0; ';
                    listHtml += 'height:22px; ';
                    listHtml += 'min-height:22px; ';
                    listHtml += 'max-height:22px;';
                    listHtml += '">';

                    listHtml += '<div style="';
                    listHtml += 'width:10px; ';
                    listHtml += 'height:10px; ';
                    listHtml += 'min-width:10px; ';
                    listHtml += 'max-width:10px; ';
                    listHtml += 'border-radius:50%; ';
                    listHtml += 'background:' + routeColor + '; ';
                    listHtml += 'flex-shrink:0;';
                    listHtml += '"></div>';

										listHtml += '<div ';
										listHtml += 'title="' + esc(routeName) + '" ';
										listHtml += 'style="';
										listHtml += 'margin:0; ';
										listHtml += 'font-size:15px; ';
										listHtml += 'color:' + (isActiveRoute ? '#1a73e8' : '#333') + '; ';
										listHtml += 'white-space:nowrap; ';
										listHtml += 'overflow:hidden; ';
										listHtml += 'text-overflow:ellipsis; ';
										listHtml += 'flex:1; ';
										listHtml += 'min-width:0; ';
										listHtml += 'height:18px; ';
										listHtml += 'min-height:18px; ';
										listHtml += 'max-height:18px; ';
										listHtml += 'line-height:18px;';
										listHtml += '">';
										listHtml += esc(routeName);
										listHtml += '</div>';



                    listHtml += '</div>';

                    if (!route.isCombined) {
                        
                        listHtml += '<div ';
                        listHtml += 'role="button" ';
                        listHtml += 'onclick="event.stopPropagation(); renameSubRoute(' + i + ', ' + routeIdx + ');" ';
                        listHtml += 'title="修改" ';
                        listHtml += 'style="';
                        listHtml += 'display:flex; ';
                        listHtml += 'align-items:center; ';
                        listHtml += 'justify-content:center; ';
                        listHtml += 'width:22px; ';
                        listHtml += 'height:22px; ';
                        listHtml += 'min-width:22px; ';
                        listHtml += 'max-width:22px; ';
                        listHtml += 'min-height:22px; ';
                        listHtml += 'max-height:22px; ';
                        listHtml += 'border-radius:50%; ';
                        listHtml += 'color:#1a73e8; ';
                        listHtml += 'cursor:pointer; ';
                        listHtml += 'font-size:13px; ';
                        listHtml += 'line-height:22px; ';
                        listHtml += 'box-sizing:border-box; ';
                        listHtml += 'flex-shrink:0; ';
                        listHtml += 'user-select:none; ';
                        listHtml += '-webkit-user-select:none;';
                        listHtml += '">';
                        listHtml += '✎';
                        listHtml += '</div>';

                        
                        listHtml += '<div ';
                        listHtml += 'role="button" ';

                        if (canReverseThisRoute) {
                            listHtml += 'onclick="event.stopPropagation(); reverseSubRoute(' + i + ', ' + routeIdx + ');" ';
                            listHtml += 'title="反轉路線方向" ';
                        } else {
                            listHtml += 'title="此路線沒有足夠軌跡點可反轉" ';
                        }

                        listHtml += 'style="';
                        listHtml += 'display:flex; ';
                        listHtml += 'align-items:center; ';
                        listHtml += 'justify-content:center; ';
                        listHtml += 'width:22px; ';
                        listHtml += 'height:22px; ';
                        listHtml += 'min-width:22px; ';
                        listHtml += 'max-width:22px; ';
                        listHtml += 'min-height:22px; ';
                        listHtml += 'max-height:22px; ';
                        listHtml += 'border-radius:50%; ';
                        listHtml += 'color:' + (canReverseThisRoute ? '#1a73e8' : '#bbb') + '; ';
                        listHtml += 'cursor:' + (canReverseThisRoute ? 'pointer' : 'not-allowed') + '; ';
                        listHtml += 'font-size:14px; ';
                        listHtml += 'line-height:22px; ';
                        listHtml += 'box-sizing:border-box; ';
                        listHtml += 'flex-shrink:0; ';
                        listHtml += 'user-select:none; ';
                        listHtml += '-webkit-user-select:none;';
                        listHtml += '">';
                        listHtml += '↔';
                        listHtml += '</div>';

                        
                        listHtml += '<div ';
                        listHtml += 'role="button" ';

                        if (canDeleteThisRoute) {
                            listHtml += 'onclick="event.stopPropagation(); deleteSubRoute(' + i + ', ' + routeIdx + ');" ';
                            listHtml += 'title="刪除子路線" ';
                        } else {
                            listHtml += 'title="結合路線不能刪除" ';
                        }

                        listHtml += 'style="';
                        listHtml += 'display:flex; ';
                        listHtml += 'align-items:center; ';
                        listHtml += 'justify-content:center; ';
                        listHtml += 'width:22px; ';
                        listHtml += 'height:22px; ';
                        listHtml += 'min-width:22px; ';
                        listHtml += 'max-width:22px; ';
                        listHtml += 'min-height:22px; ';
                        listHtml += 'max-height:22px; ';
                        listHtml += 'border-radius:50%; ';
                        listHtml += 'color:' + (canDeleteThisRoute ? '#d93025' : '#bbb') + '; ';
                        listHtml += 'cursor:' + (canDeleteThisRoute ? 'pointer' : 'not-allowed') + '; ';
                        listHtml += 'font-size:13px; ';
                        listHtml += 'line-height:22px; ';
                        listHtml += 'box-sizing:border-box; ';
                        listHtml += 'flex-shrink:0; ';
                        listHtml += 'user-select:none; ';
                        listHtml += '-webkit-user-select:none;';
                        listHtml += '">';
                        listHtml += '×';
                        listHtml += '</div>';

                    } else {
                        
                        listHtml += '<div style="';
                        listHtml += 'display:flex; ';
                        listHtml += 'width:22px; height:22px; ';
                        listHtml += 'min-width:22px; max-width:22px; ';
                        listHtml += 'min-height:22px; max-height:22px; ';
                        listHtml += 'visibility:hidden; ';
                        listHtml += 'flex-shrink:0;';
                        listHtml += '">✎</div>';

                        listHtml += '<div style="';
                        listHtml += 'display:flex; ';
                        listHtml += 'width:22px; height:22px; ';
                        listHtml += 'min-width:22px; max-width:22px; ';
                        listHtml += 'min-height:22px; max-height:22px; ';
                        listHtml += 'visibility:hidden; ';
                        listHtml += 'flex-shrink:0;';
                        listHtml += '">↔</div>';

                        listHtml += '<div style="';
                        listHtml += 'display:flex; ';
                        listHtml += 'width:22px; height:22px; ';
                        listHtml += 'min-width:22px; max-width:22px; ';
                        listHtml += 'min-height:22px; max-height:22px; ';
                        listHtml += 'visibility:hidden; ';
                        listHtml += 'flex-shrink:0;';
                        listHtml += '">×</div>';
                    }

                    listHtml += '</div>';
                });

                listHtml += '</div>';
            }

            listHtml += '</div>';
        });
    }

    listHtml += '</div>';

    listHtml += '<div ';
    listHtml += 'role="button" ';
    listHtml += 'onclick="document.getElementById(\'gpxManageModal\').style.display=\'none\'" ';
    listHtml += 'style="';
    listHtml += 'width:100%; ';
    listHtml += 'height:42px; ';
    listHtml += 'min-height:42px; ';
    listHtml += 'max-height:42px; ';
    listHtml += 'margin-top:15px; ';
    listHtml += 'padding:0 12px; ';
    listHtml += 'background:#1a73e8; ';
    listHtml += 'color:white; ';
    listHtml += 'border:none; ';
    listHtml += 'border-radius:8px; ';
    listHtml += 'cursor:pointer; ';
    listHtml += 'font-size:16px; ';
    listHtml += 'line-height:42px; ';
    listHtml += 'font-weight:bold; ';
    listHtml += 'text-align:center; ';
    listHtml += 'box-sizing:border-box; ';
    listHtml += 'user-select:none; ';
    listHtml += '-webkit-user-select:none;';
    listHtml += '">';
    listHtml += '完成';
    listHtml += '</div>';

    listHtml += '</div>';

    const oldScrollBody =
    document.getElementById("gpxManageScrollBody");

		const oldScrollTop =
		    oldScrollBody
		        ? oldScrollBody.scrollTop
		        : 0;
		
		const shouldKeepScroll =
		    oldScrollBody &&
		    oldScrollBody.offsetParent !== null;
		
		modal.innerHTML = listHtml;
		
		
		if (shouldKeepScroll) {
		    const restoreScroll = function() {
		        const newScrollBody =
		            document.getElementById("gpxManageScrollBody");
		
		        if (newScrollBody) {
		            newScrollBody.scrollTop =
		                oldScrollTop;
		        }
		    };
		
		    restoreScroll();
		    requestAnimationFrame(restoreScroll);
		    setTimeout(restoreScroll, 0);
		    setTimeout(restoreScroll, 50);
		    setTimeout(restoreScroll, 150);
		    setTimeout(restoreScroll, 300);
		}
      
    const gpxManagePanel =
    document.getElementById("gpxManagePanel");

		const gpxManageDragHandle =
		    document.getElementById("gpxManageDragHandle");
		
		if (
				    gpxManagePanel &&
				    window.gpxManagePanelPosition
				) {
				    const savedPos =
				        window.gpxManagePanelPosition;
				
				    const margin =
				        8;
				
				    const panelRect =
				        gpxManagePanel.getBoundingClientRect();
				
				    const maxLeft =
				        window.innerWidth - panelRect.width - margin;
				
				    const maxTop =
				        window.innerHeight - panelRect.height - margin;
				
				    const safeLeft =
				        Math.max(
				            margin,
				            Math.min(savedPos.left, maxLeft)
				        );
				
				    const safeTop =
				        Math.max(
				            margin,
				            Math.min(savedPos.top, maxTop)
				        );
				
				    gpxManagePanel.style.transform =
				        "none";
				
				    gpxManagePanel.style.left =
				        safeLeft + "px";
				
				    gpxManagePanel.style.top =
				        safeTop + "px";
				
				    gpxManagePanel.style.right =
				        "auto";
				
				    gpxManagePanel.style.bottom =
				        "auto";
				}
		
		
		if (
		    gpxManagePanel &&
		    gpxManageDragHandle
		) {
		    let isDraggingGpxPanel = false;
		    let dragStartX = 0;
		    let dragStartY = 0;
		    let panelStartLeft = 0;
		    let panelStartTop = 0;
		
		    const startDrag = function(e) {
		        
		        const target =
		            e.target;
		
		        if (
		            target &&
		            (
		                target.closest("button") ||
		                target.closest("input") ||
		                target.closest("select") ||
		                target.closest("[role='button']")
		            )
		        ) {
		            return;
		        }
		
		        const point =
		            e.touches && e.touches.length > 0
		                ? e.touches[0]
		                : e;
		
		        isDraggingGpxPanel = true;
		
		        const rect =
		            gpxManagePanel.getBoundingClientRect();
		
		        dragStartX =
		            point.clientX;
		
		        dragStartY =
		            point.clientY;
		
		        panelStartLeft =
		            rect.left;
		
		        panelStartTop =
		            rect.top;
		
		        
		        gpxManagePanel.style.transform =
		            "none";
		
		        gpxManagePanel.style.left =
		            panelStartLeft + "px";
		
		        gpxManagePanel.style.top =
		            panelStartTop + "px";
		
		        gpxManagePanel.style.right =
		            "auto";
		
		        gpxManagePanel.style.bottom =
		            "auto";
		
		        document.body.style.userSelect =
		            "none";
		
		        document.body.style.webkitUserSelect =
		            "none";
		
		        e.preventDefault();
		        e.stopPropagation();
		    };
		
		    const moveDrag = function(e) {
		        if (!isDraggingGpxPanel) return;
		
		        const point =
		            e.touches && e.touches.length > 0
		                ? e.touches[0]
		                : e;
		
		        let nextLeft =
		            panelStartLeft + (point.clientX - dragStartX);
		
		        let nextTop =
		            panelStartTop + (point.clientY - dragStartY);
		
		        const panelRect =
		            gpxManagePanel.getBoundingClientRect();
		
		        const margin =
		            8;
		
		        const maxLeft =
		            window.innerWidth - panelRect.width - margin;
		
		        const maxTop =
		            window.innerHeight - panelRect.height - margin;
		
		        nextLeft =
		            Math.max(
		                margin,
		                Math.min(nextLeft, maxLeft)
		            );
		
		        nextTop =
		            Math.max(
		                margin,
		                Math.min(nextTop, maxTop)
		            );
		
		        gpxManagePanel.style.left =
		            nextLeft + "px";
		
		        gpxManagePanel.style.top =
		            nextTop + "px";
		
		        e.preventDefault();
		        e.stopPropagation();
		    };
		
				const endDrag = function() {
				    if (!isDraggingGpxPanel) return;
				
				    isDraggingGpxPanel = false;
				
				    const rect =
				        gpxManagePanel.getBoundingClientRect();
				
				    window.gpxManagePanelPosition = {
				        left: rect.left,
				        top: rect.top
				    };
				
				    document.body.style.userSelect =
				        "";
				
				    document.body.style.webkitUserSelect =
				        "";
				};
		
		    gpxManageDragHandle.addEventListener(
		        "mousedown",
		        startDrag
		    );
		
		    document.addEventListener(
		        "mousemove",
		        moveDrag
		    );
		
		    document.addEventListener(
		        "mouseup",
		        endDrag
		    );
		
		    gpxManageDragHandle.addEventListener(
		        "touchstart",
		        startDrag,
		        {
		            passive: false
		        }
		    );
		
		    document.addEventListener(
		        "touchmove",
		        moveDrag,
		        {
		            passive: false
		        }
		    );
		
		    document.addEventListener(
		        "touchend",
		        endDrag
		    );
		}

    if (isNowFS && typeof syncFSFontSettings === 'function') {
        syncFSFontSettings(modal);
    }

    if (window.gpxManageEscHandler) {
        window.removeEventListener('keydown', window.gpxManageEscHandler);
    }

    window.gpxManageEscHandler = function(e) {
        if (e.key === "Escape") {
            const gpxModal = document.getElementById('gpxManageModal');

            if (
                gpxModal &&
                gpxModal.style.display !== 'none'
            ) {
                e.preventDefault();
                gpxModal.style.display = 'none';
            }
        }
    };

    window.addEventListener('keydown', window.gpxManageEscHandler);

    modal.querySelectorAll('[onclick], [role="button"]').forEach(function(el) {
        L.DomEvent.on(el, 'click', L.DomEvent.stopPropagation);
    });

    modal.querySelectorAll('input[type="checkbox"]').forEach(function(el) {
        L.DomEvent.on(el, 'click', function(e) {
            e.stopPropagation();
        });
    });
}

window.toggleGpxRouteChildren = function(index) {
    if (window.event) window.event.stopPropagation();

    const item =
        window.multiGpxStack &&
        window.multiGpxStack[index];

    if (!item || !Array.isArray(item.routes) || item.routes.length === 0) {
        return;
    }

    window.gpxManagerExpanded = window.gpxManagerExpanded || {};
    window.gpxManagerExpanded[index] = !window.gpxManagerExpanded[index];

    showGpxManagementModal();
};

window.toggleGpxRouteChildren = function(index) {
    if (window.event) window.event.stopPropagation();

    const item =
        window.multiGpxStack &&
        window.multiGpxStack[index];

    if (!item || !Array.isArray(item.routes) || item.routes.length === 0) {
        return;
    }

    window.gpxManagerExpanded = window.gpxManagerExpanded || {};
    window.gpxManagerExpanded[index] = !window.gpxManagerExpanded[index];

    showGpxManagementModal();
};

window.selectManagedRoute = function(fileIdx, routeIdx) {
    if (window.event) {
        window.event.stopPropagation();
        window.event.preventDefault();
    }

    const stack =
        window.multiGpxStack ||
        multiGpxStack ||
        [];

    const currentFile =
        stack[fileIdx];

    if (
        !currentFile ||
        !Array.isArray(currentFile.routes) ||
        !currentFile.routes[routeIdx]
    ) {
        console.warn("selectManagedRoute: 找不到指定子路線", fileIdx, routeIdx);
        return;
    }

    
    window.currentMultiIndex =
        fileIdx;

    window.currentActiveIndex =
        routeIdx;

    if (typeof syncDrawingGlobals === "function") {
        syncDrawingGlobals(
            currentFile,
            routeIdx
        );
    } else {
        allTracks =
            currentFile.routes;

        window.allTracks =
            currentFile.routes;

        trackPoints =
            currentFile.routes[routeIdx].points || [];

        window.trackPoints =
            trackPoints;
    }

    if (typeof updateRouteSelectDropdown === "function") {
        updateRouteSelectDropdown();
    }

    const routeSelect =
        document.getElementById("routeSelect");

    if (
        routeSelect &&
        routeSelect.options &&
        routeSelect.options.length > routeIdx
    ) {
        routeSelect.value =
            String(routeIdx);
    }

    if (typeof loadRoute === "function") {
        loadRoute(routeIdx);
    }

    
    window.currentMultiIndex =
        fileIdx;

    window.currentActiveIndex =
        routeIdx;

    const routeSelectAfter =
        document.getElementById("routeSelect");

    if (
        routeSelectAfter &&
        routeSelectAfter.options &&
        routeSelectAfter.options.length > routeIdx
    ) {
        routeSelectAfter.value =
            String(routeIdx);
    }

    if (typeof renderRouteInfo === "function") {
        renderRouteInfo();
    }

    if (typeof renderMultiGpxButtons === "function") {
        renderMultiGpxButtons();
    }

    
    if (typeof window.refreshGpxManagerIfOpen === "function") {
        window.refreshGpxManagerIfOpen();
    }

};

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
    const item = multiGpxStack[index];
    if (!item) return;

    item.color = newColor;

    if (Array.isArray(item.routes)) {
        item.routes.forEach(route => {
            if (route) route.color = newColor;
        });
    }

    const isCurrentFile =
        window.currentMultiIndex === index;

    const activeIdx =
        isCurrentFile
            ? (window.currentActiveIndex || 0)
            : 0;

    if (item.layer) {
        item.layer.setStyle({
            color: newColor,
            opacity: isCurrentFile ? 1.0 : 0.4,
            weight: isCurrentFile ? 6 : 4,
            dashArray: null
        });
    }

    if (isCurrentFile) {
        if (typeof syncDrawingGlobals === 'function') {
            syncDrawingGlobals(item, activeIdx);
        }

        if (typeof updateRouteSelectDropdown === 'function') {
            updateRouteSelectDropdown();
        }

        const routeSelect = document.getElementById("routeSelect");
        if (
            routeSelect &&
            routeSelect.options &&
            routeSelect.options.length > activeIdx
        ) {
            routeSelect.value = String(activeIdx);
        }

        if (typeof loadRoute === 'function') {
            loadRoute(activeIdx, newColor);
        }

        if (polyline) {
            polyline.setStyle({
                color: newColor,
                opacity: 1.0,
                dashArray: null
            });
        }
    }

    if (typeof renderMultiGpxButtons === 'function') {
        renderMultiGpxButtons();
    }

    showGpxManagementModal();
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
    
    if (typeof window.currentActiveIndex === 'undefined') {
        window.currentActiveIndex = 0;
    }

    let stackIdx =
        window.currentMultiIndex || 0;
    
    if (
        typeof multiGpxStack === 'undefined' ||
        !multiGpxStack
    ) {
        window.multiGpxStack = [];
    }
    
    if (!multiGpxStack[stackIdx]) {
    
        if (typeof window.createBlankGpxProject === "function") {
            window.createBlankGpxProject();
    
        } else {
            
            multiGpxStack[stackIdx] = {
                id: "draw_" + Date.now(),
                name: "自訂路線",
                displayName: "自訂路線",
                fileName: "自訂路線",
                color: "#0000FF",
                points: [],
                segments: [],
                waypoints: [],
                stats: {
                    totalDistance: 0,
                    totalElevation: 0
                },
                isCombined: false,
                isDrawTrack: true,
                isHandDrawRoute: true,
                isBlankProject: true,
                visible: true,
                layer: L.featureGroup().addTo(map)
            };
        }
    
        stackIdx =
            typeof window.currentMultiIndex === "number"
                ? window.currentMultiIndex
                : 0;
    
        window.multiGpxStack =
            window.multiGpxStack ||
            multiGpxStack ||
            [];
    
        multiGpxStack =
            window.multiGpxStack;
    
        if (typeof renderMultiGpxButtons === "function") {
            renderMultiGpxButtons();
        }
    }
    
    if (
        typeof allTracks === 'undefined' ||
        !allTracks ||
        allTracks.length === 0
    ) {
        const currentFile =
            multiGpxStack[stackIdx];
    
        if (
            currentFile &&
            Array.isArray(currentFile.routes) &&
            currentFile.routes.length > 0
        ) {
            window.allTracks =
                currentFile.routes;
    
            try {
                allTracks =
                    window.allTracks;
            } catch (err) {}
    
        } else if (currentFile) {
            window.allTracks =
                [
                    currentFile
                ];
    
            try {
                allTracks =
                    window.allTracks;
            } catch (err) {}
        }
    }
    
    let activeIdx =
        window.currentActiveIndex || 0;

    if (!allTracks[activeIdx]) {
        activeIdx = 0;
    }

    const modal =
        document.getElementById('wptEditModal');

    const nameInput =
        document.getElementById('modalWptName');

    const eleInput =
        document.getElementById('modalWptEle');

    const confirmBtn =
        document.getElementById('modalWptConfirm');

    const deleteBtn =
        document.getElementById('modalWptDelete');

    if (
        !modal ||
        !nameInput ||
        !eleInput ||
        !confirmBtn
    ) {
        return;
    }
    
    nameInput.value =
        oldName || "";

    eleInput.value =
        (
            ele !== null &&
            ele !== undefined &&
            ele !== "---"
        )
            ? ele
            : 0;

    
    let nameWrap =
        document.getElementById("modalWptNameWrap");

    let selectedWptType =
        "waypoint";

    if (!nameWrap) {
        nameWrap =
            document.createElement("div");

        nameWrap.id =
            "modalWptNameWrap";

        nameWrap.style.display =
            "flex";

        nameWrap.style.alignItems =
            "center";

        nameWrap.style.gap =
            "8px";

        nameWrap.style.width =
            "100%";

        nameWrap.style.boxSizing =
            "border-box";

        nameWrap.style.marginBottom =
            "8px";

        nameInput.parentNode.insertBefore(
            nameWrap,
            nameInput
        );

        nameWrap.appendChild(
            nameInput
        );
    }

    nameInput.style.flex =
        "1 1 auto";

    nameInput.style.minWidth =
        "0";

    let iconSelectBtn =
        document.getElementById("modalWptIconSelectBtn");

    if (!iconSelectBtn) {
        iconSelectBtn =
            document.createElement("button");

        iconSelectBtn.id =
            "modalWptIconSelectBtn";

        iconSelectBtn.type =
            "button";

        iconSelectBtn.style.flex =
            "0 0 auto";

        iconSelectBtn.style.height =
            "34px";

        iconSelectBtn.style.width =
            "34px";

        iconSelectBtn.style.minWidth =
            "34px";

        iconSelectBtn.style.maxWidth =
            "34px";

        iconSelectBtn.style.border =
            "1px solid #ddd";

        iconSelectBtn.style.borderRadius =
            "8px";

        iconSelectBtn.style.background =
            "#fff";

        iconSelectBtn.style.cursor =
            "pointer";

        iconSelectBtn.style.display =
            "inline-flex";

        iconSelectBtn.style.alignItems =
            "center";

        iconSelectBtn.style.justifyContent =
            "center";

        iconSelectBtn.style.gap =
            "0";

        iconSelectBtn.style.padding =
            "0";

        iconSelectBtn.title =
            "選擇航點圖示";

        nameWrap.appendChild(
            iconSelectBtn
        );
    }

    const typeMap =
        window.waypointIconTypes || {
            waypoint: {
                label: "航點",
                icon: "place",
                gpxSym: "Waypoint"
            }
        };

    const isExistingWptForType =
        (
            existingIdx !== null &&
            existingIdx !== undefined &&
            existingIdx !== -1
        );

    let currentWptForType =
        null;

    if (
        isExistingWptForType &&
        multiGpxStack &&
        multiGpxStack[stackIdx] &&
        Array.isArray(multiGpxStack[stackIdx].waypoints) &&
        multiGpxStack[stackIdx].waypoints[existingIdx]
    ) {
        currentWptForType =
            multiGpxStack[stackIdx].waypoints[existingIdx];

    } else if (
        originalIdx !== null &&
        originalIdx !== undefined &&
        multiGpxStack &&
        multiGpxStack[stackIdx] &&
        Array.isArray(multiGpxStack[stackIdx].waypoints) &&
        multiGpxStack[stackIdx].waypoints[originalIdx]
    ) {
        currentWptForType =
            multiGpxStack[stackIdx].waypoints[originalIdx];

    } else if (
        isExistingWptForType &&
        allTracks &&
        allTracks[activeIdx] &&
        Array.isArray(allTracks[activeIdx].waypoints) &&
        allTracks[activeIdx].waypoints[existingIdx]
    ) {
        currentWptForType =
            allTracks[activeIdx].waypoints[existingIdx];
    }

    selectedWptType =
        currentWptForType && currentWptForType.type
            ? currentWptForType.type
            : (
                currentWptForType &&
                currentWptForType.sym &&
                typeof window.getWaypointTypeFromSym === "function"
                    ? window.getWaypointTypeFromSym(currentWptForType.sym)
                    : "waypoint"
            );

    let selectedWptColor =
        currentWptForType && currentWptForType.iconColor
            ? currentWptForType.iconColor
            : (
                typeof window.getWaypointIconColor === "function"
                    ? window.getWaypointIconColor({ type: selectedWptType })
                    : (window.defaultWaypointIconColor || "#1a73e8")
            );

    const updateIconSelectBtn = function() {
        const iconInfo =
            typeMap[selectedWptType] ||
            typeMap.waypoint ||
            { label: "航點", icon: "place" };

        iconSelectBtn.title =
            iconInfo.label || "航點";

        iconSelectBtn.setAttribute(
            "aria-label",
            iconInfo.label || "航點"
        );

        iconSelectBtn.style.setProperty(
            "--wpt-icon-color",
            selectedWptColor || "#1a73e8"
        );

        iconSelectBtn.style.setProperty(
            "--wpt-icon-border-color",
            window.defaultWaypointIconBorderColor || "#ffffff"
        );

        iconSelectBtn.innerHTML =
            '<span class="material-icons">' +
            (iconInfo.icon || "place") +
            '</span>';
    };

    updateIconSelectBtn();

    iconSelectBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();

        const oldBackdrop =
            document.getElementById("wptIconPopupBackdrop");

        const oldPanel =
            document.getElementById("wptIconPopupPanel");

        if (oldBackdrop) oldBackdrop.remove();
        if (oldPanel) oldPanel.remove();

        const editModalForIconPopup =
            document.getElementById("wptEditModal");

        const shouldRestoreEditModalAfterIconPopup =
            editModalForIconPopup &&
            editModalForIconPopup.style.display !== "none" &&
            window.getComputedStyle(editModalForIconPopup).display !== "none";

        let previousEditModalVisibility = "";
        let previousEditModalOpacity = "";
        let previousEditModalPointerEvents = "";

        if (editModalForIconPopup) {
            previousEditModalVisibility =
                editModalForIconPopup.style.visibility || "";

            previousEditModalOpacity =
                editModalForIconPopup.style.opacity || "";

            previousEditModalPointerEvents =
                editModalForIconPopup.style.pointerEvents || "";

            
            editModalForIconPopup.style.visibility = "hidden";
            editModalForIconPopup.style.opacity = "0";
            editModalForIconPopup.style.pointerEvents = "none";
        }

        const backdrop =
            document.createElement("div");

        backdrop.id =
            "wptIconPopupBackdrop";

        backdrop.className =
            "wpt-icon-popup-backdrop";

        backdrop.style.setProperty(
            "z-index",
            "2147483646",
            "important"
        );

        const panel =
            document.createElement("div");

        panel.id =
            "wptIconPopupPanel";

        panel.className =
            "wpt-icon-popup-panel";

        panel.style.setProperty(
            "z-index",
            "2147483647",
            "important"
        );

        
        let pendingWptType =
            selectedWptType || "waypoint";

        let pendingWptColor =
            selectedWptColor ||
            (
                typeof window.getWaypointIconColor === "function"
                    ? window.getWaypointIconColor({ type: pendingWptType })
                    : (window.defaultWaypointIconColor || "#1a73e8")
            );

        panel.innerHTML =
            '<div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">' +
                '<b style="font-size:15px; color:#333;">選擇航點圖示</b>' +
                '<button type="button" id="wptIconPopupClose" style="border:none; background:#f1f3f4; border-radius:50%; width:30px; height:30px; cursor:pointer; display:flex; align-items:center; justify-content:center;">' +
                    '<span class="material-icons" style="font-size:18px;">close</span>' +
                '</button>' +
            '</div>' +
            '<div class="wpt-icon-popup-grid"></div>' +
            '<div class="wpt-icon-color-row">' +
                '<span>顏色</span>' +
                '<input type="color" id="wptIconPopupColor" class="wpt-icon-color-input" value="' +
                    (pendingWptColor || "#1a73e8") +
                '">' +
            '</div>' +
            '<div style="display:flex; gap:8px; margin-top:14px; justify-content:flex-end;">' +
                '<button type="button" id="wptIconPopupCancel" style="border:1px solid #ccc; background:#fff; color:#333; border-radius:6px; padding:6px 12px; cursor:pointer;">取消</button>' +
                '<button type="button" id="wptIconPopupConfirm" style="border:none; background:#1a73e8; color:#fff; border-radius:6px; padding:6px 14px; cursor:pointer; font-weight:bold;">確認</button>' +
            '</div>';

        document.body.appendChild(backdrop);
        document.body.appendChild(panel);

        const closeIconPopup = function() {
            if (backdrop && backdrop.parentNode) {
                backdrop.remove();
            }

            if (panel && panel.parentNode) {
                panel.remove();
            }

            if (
                editModalForIconPopup &&
                shouldRestoreEditModalAfterIconPopup
            ) {
                editModalForIconPopup.style.visibility =
                    previousEditModalVisibility;

                editModalForIconPopup.style.opacity =
                    previousEditModalOpacity;

                editModalForIconPopup.style.pointerEvents =
                    previousEditModalPointerEvents;
            }
        };

        const refreshPopupIconOptions = function() {
            panel.querySelectorAll(".wpt-icon-popup-option").forEach(function(btn) {
                const optionType =
                    btn.getAttribute("data-wpt-type") || "waypoint";

                const optionDefaultColor =
                    typeof window.getWaypointIconColor === "function"
                        ? window.getWaypointIconColor({ type: optionType })
                        : "#1a73e8";

                const optionColor =
                    optionType === pendingWptType && pendingWptColor
                        ? pendingWptColor
                        : optionDefaultColor;

                btn.classList.toggle(
                    "selected",
                    optionType === pendingWptType
                );

                btn.style.setProperty(
                    "--wpt-icon-color",
                    optionColor
                );
            });
        };

        backdrop.onclick = closeIconPopup;

        const closeBtn =
            document.getElementById("wptIconPopupClose");

        if (closeBtn) {
            closeBtn.onclick = closeIconPopup;
        }

        const cancelBtn =
            document.getElementById("wptIconPopupCancel");

        if (cancelBtn) {
            cancelBtn.onclick = closeIconPopup;
        }

        const confirmBtn =
            document.getElementById("wptIconPopupConfirm");

        if (confirmBtn) {
            confirmBtn.onclick = function(ev) {
                ev.preventDefault();
                ev.stopPropagation();

                selectedWptType =
                    pendingWptType || "waypoint";

                selectedWptColor =
                    pendingWptColor ||
                    (
                        typeof window.getWaypointIconColor === "function"
                            ? window.getWaypointIconColor({ type: selectedWptType })
                            : (window.defaultWaypointIconColor || "#1a73e8")
                    );

                updateIconSelectBtn();
                closeIconPopup();
            };
        }

        const grid =
            panel.querySelector(".wpt-icon-popup-grid");

        const colorInput =
            panel.querySelector("#wptIconPopupColor");

        Object.keys(typeMap).forEach(function(key) {
            const info =
                typeMap[key] || {};

            const optionBtn =
                document.createElement("button");

            optionBtn.type =
                "button";

            optionBtn.className =
                "wpt-icon-popup-option" +
                (key === pendingWptType ? " selected" : "");

            optionBtn.title =
                info.label || key;

            optionBtn.setAttribute(
                "aria-label",
                info.label || key
            );

            optionBtn.setAttribute(
                "data-wpt-type",
                key
            );

            const optionDefaultColor =
                typeof window.getWaypointIconColor === "function"
                    ? window.getWaypointIconColor({ type: key })
                    : "#1a73e8";

            const optionDisplayColor =
                key === pendingWptType && pendingWptColor
                    ? pendingWptColor
                    : optionDefaultColor;

            optionBtn.style.setProperty(
                "--wpt-icon-color",
                optionDisplayColor
            );

            optionBtn.style.setProperty(
                "--wpt-icon-border-color",
                window.defaultWaypointIconBorderColor || "#ffffff"
            );

            optionBtn.innerHTML =
                '<span class="material-icons">' +
                (info.icon || "place") +
                '</span>';

            optionBtn.onclick = function(ev) {
                ev.preventDefault();
                ev.stopPropagation();

                pendingWptType =
                    key;

                
                pendingWptColor =
                    typeof window.getWaypointIconColor === "function"
                        ? window.getWaypointIconColor({ type: key })
                        : (window.defaultWaypointIconColor || "#1a73e8");

                if (colorInput) {
                    colorInput.value =
                        pendingWptColor || "#1a73e8";
                }

                refreshPopupIconOptions();
            };

            grid.appendChild(optionBtn);
        });

        if (colorInput) {
            colorInput.oninput = function() {
                pendingWptColor =
                    this.value || pendingWptColor;

                refreshPopupIconOptions();
            };
        }
    };

    let eleWrap =
        document.getElementById("modalWptEleWrap");

    let getEleBtn =
        document.getElementById("modalWptGetEleBtn");

    if (!eleWrap) {
        eleWrap =
            document.createElement("div");

        eleWrap.id =
            "modalWptEleWrap";

        eleWrap.style.display =
            "flex";

        eleWrap.style.alignItems =
            "center";

        eleWrap.style.gap =
            "8px";

        eleWrap.style.width =
            "100%";

        eleWrap.style.boxSizing =
            "border-box";

        eleInput.parentNode.insertBefore(
            eleWrap,
            eleInput
        );

        eleWrap.appendChild(
            eleInput
        );
    }

    if (!getEleBtn) {
        getEleBtn =
            document.createElement("button");

        getEleBtn.id =
            "modalWptGetEleBtn";

        getEleBtn.type =
            "button";

        getEleBtn.textContent =
            "取得高度";

        getEleBtn.style.flex =
            "0 0 auto";

        getEleBtn.style.padding =
            "7px 10px";

        getEleBtn.style.border =
            "none";

        getEleBtn.style.borderRadius =
            "6px";

        getEleBtn.style.background =
            "#11A4F5";

        getEleBtn.style.color =
            "white";

        getEleBtn.style.cursor =
            "pointer";

        getEleBtn.style.fontSize =
            "13px";

        getEleBtn.style.whiteSpace =
            "nowrap";

        eleWrap.appendChild(
            getEleBtn
        );
    }

    eleInput.style.flex =
        "1 1 auto";

    eleInput.style.minWidth =
        "0";

    getEleBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
    
        const targetLat =
            Number(lat);
    
        const targetLon =
            Number(lon);
    
        if (
            !Number.isFinite(targetLat) ||
            !Number.isFinite(targetLon)
        ) {
            alert("座標錯誤，無法取得高度");
            return;
        }
    
        if (typeof window.fetchElevationForSinglePoint !== "function") {
            alert("尚未建立取得高度功能");
            return;
        }
    
        const wptName =
            nameInput.value.trim() ||
            oldName ||
            "未命名航點";
    
        const runGetWptElevation = async function() {
            const oldText =
                getEleBtn.textContent;
    
            getEleBtn.disabled =
                true;
    
            getEleBtn.textContent =
                "取得中...";
    
            try {
                const fetchedEle =
                    await window.fetchElevationForSinglePoint(
                        targetLat,
                        targetLon
                    );
    
                if (
                    fetchedEle !== null &&
                    fetchedEle !== undefined &&
                    Number.isFinite(Number(fetchedEle))
                ) {
                    eleInput.value =
                        Math.round(Number(fetchedEle));
    
                    if (typeof showMapToast === "function") {
                        showMapToast("高度已取得");
                    }
    
                } else {
                    throw new Error("高度資料無效");
                }
    
            } catch (err) {
                console.error("[航點取得高度失敗]", err);
    
                if (typeof showMapToast === "function") {
                    showMapToast("高度取得失敗");
                } else {
                    alert("高度取得失敗");
                }
    
            } finally {
                getEleBtn.disabled =
                    false;
    
                getEleBtn.textContent =
                    oldText;
            }
        };
    
        if (typeof window.showAppConfirm === "function") {
            window.showAppConfirm(
                "取得高度",
                "確定要為「" + wptName + "」航點取得高度嗎？<br>" +
                "這會覆蓋此航點目前的高度資料。<br>" +
                "(高度資料由MapTiler提供)",
                runGetWptElevation,
                null,
                "取得高度"
            );
    
        } else {
            if (
                confirm(
                    "確定要為「" +
                    wptName +
                    "」航點取得高度嗎？\n" +
                    "這會覆蓋此航點目前的高度資料。\n" +
                    "(高度資料由MapTiler提供)"
                )
            ) {
                runGetWptElevation();
            }
        }
    };

    modal.style.display =
        'flex';
    
    currentEditTask = {
        existingIdx,
        lat,
        lon,
        ele,
        oldName,
        timeStr,
        originalIdx,
        stackIdx,
        activeIdx
    };
    
    const isExistingWpt =
        (
            existingIdx !== null &&
            existingIdx !== undefined &&
            existingIdx !== -1
        );
    
    if (isExistingWpt) {
        if (deleteBtn) {
            deleteBtn.style.display =
                'block';

            deleteBtn.onclick = function() {
                const currentData = {
                    name: nameInput.value,
                    ele: eleInput.value
                };
            
                closeModal();
            
                if (typeof window.deleteWaypoint === 'function') {
                    window.deleteWaypoint(
                        existingIdx,
                        {
                            task: currentEditTask,
                            data: currentData
                        }
                    );
                } else {
                    alert("找不到刪除處理函式");
                }
            };
        }

    } else {
        if (deleteBtn) {
            deleteBtn.style.display =
                'none';
        }
    }

    setTimeout(() => {
        nameInput.focus();
        nameInput.select();
    }, 300);

    const closeModal = () => {
        modal.style.display =
            'none';

        window.removeEventListener(
            'keydown',
            handleEscKey
        ); 

        nameInput.onkeydown =
            null;

        eleInput.onkeydown =
            null;
        
        if (typeof window.closeMapToast === "function") {
            window.closeMapToast();
        }
    };

    const handleEscKey = (e) => {
        if (e.key === "Escape") {
            closeModal();
        }
    };

    window.addEventListener(
        'keydown',
        handleEscKey
    );

    const handleEnterKey = (e) => {
        if (
            e.key === "Enter" ||
            e.keyCode === 13
        ) {
            e.preventDefault();
            confirmBtn.click();
        }
    };

    nameInput.onkeydown =
        handleEnterKey;

    eleInput.onkeydown =
        handleEnterKey;

    confirmBtn.onclick = function() {
        const finalName =
            nameInput.value.trim() ||
            "未命名航點";

        const finalEle =
            eleInput.value;

        const finalType =
            selectedWptType || "waypoint";

        const iconInfo =
            typeof window.getWaypointIconInfo === "function"
                ? window.getWaypointIconInfo(finalType)
                : null;

        const finalSym =
            iconInfo && iconInfo.gpxSym
                ? iconInfo.gpxSym
                : "Waypoint";

        if (typeof processSave === 'function') {
            processSave(
                finalName,
                finalEle,
                {
                    type: finalType,
                    sym: finalSym,
                    iconColor: selectedWptColor || ""
                }
            );
        }

        closeModal(); 
    };
};

function processSave(finalName, finalEle, extra = {}) {
    const {
        existingIdx,
        lat,
        lon,
        originalIdx,
        stackIdx
    } = currentEditTask;

    const fileIdxAtSave =
        typeof stackIdx === "number"
            ? stackIdx
            : (window.currentMultiIndex || 0);

    const routeIdxAtSave =
        typeof currentEditTask.routeIdx === "number"
            ? currentEditTask.routeIdx
            : (window.currentActiveIndex || 0);

    const targetFile =
        multiGpxStack &&
        multiGpxStack[fileIdxAtSave];

    if (!targetFile) {
        return;
    }

    if (!Array.isArray(targetFile.waypoints)) {
        targetFile.waypoints = [];
    }

    const isEditing =
        existingIdx !== null &&
        existingIdx !== undefined &&
        existingIdx !== -1;

    const oldWptSnapshot =
        isEditing && targetFile.waypoints[existingIdx]
            ? JSON.parse(JSON.stringify(targetFile.waypoints[existingIdx]))
            : null;

    let addedWptRef = null;

    const syncRouteSelectToSavedRoute = () => {
        window.currentMultiIndex = fileIdxAtSave;
        window.currentActiveIndex = routeIdxAtSave;

        const routeSelect =
            document.getElementById("routeSelect");

        if (
            routeSelect &&
            routeSelect.options &&
            routeSelect.options.length > routeIdxAtSave
        ) {
            routeSelect.value = String(routeIdxAtSave);
        }
    };

    const syncWaypointsToAllRoutes = () => {
        if (
            targetFile &&
            Array.isArray(targetFile.routes)
        ) {
            targetFile.routes.forEach(route => {
                if (route) {
                    route.waypoints = targetFile.waypoints;
                }
            });
        }

        if (
            typeof allTracks !== "undefined" &&
            Array.isArray(allTracks)
        ) {
            allTracks.forEach(track => {
                if (track) {
                    track.waypoints = targetFile.waypoints;
                }
            });
        }

        if (
            typeof window.allTracks !== "undefined" &&
            Array.isArray(window.allTracks)
        ) {
            window.allTracks.forEach(track => {
                if (track) {
                    track.waypoints = targetFile.waypoints;
                }
            });
        }
    };

    const runBehavior = (isFromUndoRedo, focusPos = null) => {
        syncRouteSelectToSavedRoute();

        if (
            typeof wptMarkers !== 'undefined' &&
            Array.isArray(wptMarkers) &&
            wptMarkers.length > 0
        ) {
            wptMarkers.forEach(m => {
                if (m && map.hasLayer(m)) {
                    map.removeLayer(m);
                }
            });
            wptMarkers = [];
        }

        if (window.wptLayer) {
            window.wptLayer.clearLayers();
        }

        if (
            typeof allTracks !== "undefined" &&
            Array.isArray(allTracks) &&
            allTracks.length === 0
        ) {
            allTracks.push(targetFile);
            window.allTracks = allTracks;
        }

        syncWaypointsToAllRoutes();

        if (typeof rebuildXmlFromWaypoints === 'function') {
            rebuildXmlFromWaypoints(targetFile);
        }

        if (typeof syncWaypointsToFile === 'function') {
            syncWaypointsToFile(targetFile);
        }

        if (typeof updateWptTable === 'function') {
            updateWptTable();
        }

        if (typeof loadRoute === 'function') {
            loadRoute(
                routeIdxAtSave,
                null,
                focusPos
                    ? {
                        ...focusPos,
                        skipAutoFitBounds: true,
                        preserveChartState: true
                    }
                    : {
                        skipAutoFitBounds: true,
                        preserveChartState: true
                    }
            );
        }

        const routeForWpt =
            allTracks && allTracks[routeIdxAtSave]
                ? allTracks[routeIdxAtSave]
                : targetFile;

        if (typeof renderWaypointsAndPeaks === 'function') {
            renderWaypointsAndPeaks(routeForWpt);
        }

        if (typeof updateWptIconStatus === 'function') {
            updateWptIconStatus();
        }

        if (!isFromUndoRedo) {
            setTimeout(() => {
                if (window.isDraggingWpt) return;

                if (typeof showCustomPopup === 'function') {
                    showCustomPopup(
                        originalIdx,
                        finalName,
                        "wpt",
                        lat,
                        lon
                    );
                }
            }, 350);
        }
    };

    historyManager.execute({
        fileIdx: fileIdxAtSave,
        routeIdx: routeIdxAtSave,
        skipAutoLoadRouteAfterUndo: true,

        do: () => {
            syncRouteSelectToSavedRoute();

            if (isEditing) {
                if (!targetFile.waypoints[existingIdx]) {
                    return;
                }

                targetFile.waypoints[existingIdx].name =
                    finalName;

                targetFile.waypoints[existingIdx].ele =
                    parseFloat(finalEle) || 0;

                targetFile.waypoints[existingIdx].type =
                    extra.type ||
                    targetFile.waypoints[existingIdx].type ||
                    "waypoint";

                targetFile.waypoints[existingIdx].sym =
                    extra.sym ||
                    targetFile.waypoints[existingIdx].sym ||
                    "Waypoint";

                if (
                    extra.iconColor !== undefined &&
                    extra.iconColor !== null
                ) {
                    if (String(extra.iconColor).trim() !== "") {
                        targetFile.waypoints[existingIdx].iconColor =
                            String(extra.iconColor).trim();
                    } else {
                        delete targetFile.waypoints[existingIdx].iconColor;
                    }
                }

                if (
                    targetFile.waypoints[existingIdx].isCustom === true &&
                    targetFile.waypoints[existingIdx].belongsToRoute === undefined
                ) {
                    targetFile.waypoints[existingIdx].belongsToRoute =
                        routeIdxAtSave;
                }

                if (
                    targetFile.waypoints[existingIdx].isCustom === true &&
                    targetFile.waypoints[existingIdx].belongsToFile === undefined
                ) {
                    targetFile.waypoints[existingIdx].belongsToFile =
                        fileIdxAtSave;
                }

            } else {
                if (!addedWptRef) {
                    addedWptRef = {
                        lat: lat,
                        lon: lon,
                        name: finalName,
                        ele: parseFloat(finalEle) || 0,
                        time: currentEditTask.timeStr || new Date().toISOString(),
                        localTime:
                            currentEditTask.timeStr ||
                            formatDate(
                                new Date(
                                    new Date().getTime() + 8 * 3600000
                                )
                            ),

                        type:
                            extra.type || "waypoint",

                        sym:
                            extra.sym || "Waypoint",

                        iconColor:
                            extra.iconColor && String(extra.iconColor).trim() !== ""
                                ? String(extra.iconColor).trim()
                                : "",

                        isCustom: true,
                        belongsToFile: fileIdxAtSave,
                        belongsToRoute: routeIdxAtSave
                    };
                }

                if (!targetFile.waypoints.includes(addedWptRef)) {
                    targetFile.waypoints.push(addedWptRef);
                }
                
                const newWptIdx =
                    targetFile.waypoints.indexOf(addedWptRef);
                
                if (newWptIdx > -1) {
                    window.currentToolTarget = {
                        type: "waypoint",
                        fileIdx: fileIdxAtSave,
                        routeIdx: routeIdxAtSave,
                        wptIdx: newWptIdx
                    };
                }
            }

            syncWaypointsToAllRoutes();

            if (typeof renderMultiGpxButtons === 'function') {
                renderMultiGpxButtons();
            }

            runBehavior(false, {
                lat: lat,
                lng: lon
            });
        },

        undo: () => {
            syncRouteSelectToSavedRoute();

            let restorePos = {
                lat: lat,
                lng: lon
            };

            if (isEditing) {
                const targetWpt =
                    targetFile.waypoints[existingIdx];

                if (
                    targetWpt &&
                    oldWptSnapshot
                ) {
                    targetWpt.name =
                        oldWptSnapshot.name;

                    targetWpt.ele =
                        oldWptSnapshot.ele;

                    if (oldWptSnapshot.type !== undefined) {
                        targetWpt.type =
                            oldWptSnapshot.type;
                    } else {
                        delete targetWpt.type;
                    }

                    if (oldWptSnapshot.sym !== undefined) {
                        targetWpt.sym =
                            oldWptSnapshot.sym;
                    } else {
                        delete targetWpt.sym;
                    }

                    if (oldWptSnapshot.iconColor !== undefined) {
                        targetWpt.iconColor =
                            oldWptSnapshot.iconColor;
                    } else {
                        delete targetWpt.iconColor;
                    }

                    if (oldWptSnapshot.belongsToRoute !== undefined) {
                        targetWpt.belongsToRoute =
                            oldWptSnapshot.belongsToRoute;
                    } else {
                        delete targetWpt.belongsToRoute;
                    }

                    if (oldWptSnapshot.belongsToFile !== undefined) {
                        targetWpt.belongsToFile =
                            oldWptSnapshot.belongsToFile;
                    } else {
                        delete targetWpt.belongsToFile;
                    }

                    if (oldWptSnapshot.isCustom !== undefined) {
                        targetWpt.isCustom =
                            oldWptSnapshot.isCustom;
                    } else {
                        delete targetWpt.isCustom;
                    }

                    restorePos = {
                        lat: targetWpt.lat,
                        lng: targetWpt.lon
                    };
                }

            } else {
                
                let idx =
                    targetFile.waypoints.indexOf(addedWptRef);

                if (idx === -1 && addedWptRef) {
                    idx =
                        targetFile.waypoints.findIndex(w => {
                            if (!w) return false;

                            const sameName =
                                String(w.name || "") === String(addedWptRef.name || "");

                            const sameLat =
                                Math.abs(Number(w.lat) - Number(addedWptRef.lat)) < 0.0000001;

                            const sameLon =
                                Math.abs(Number(w.lon) - Number(addedWptRef.lon)) < 0.0000001;

                            const sameTime =
                                !addedWptRef.time ||
                                !w.time ||
                                String(w.time) === String(addedWptRef.time);

                            return sameName && sameLat && sameLon && sameTime;
                        });
                }

                if (idx > -1) {
                    targetFile.waypoints.splice(idx, 1);
                }
                
                window.currentToolTarget = {
                    type: "route",
                    fileIdx: fileIdxAtSave,
                    routeIdx: routeIdxAtSave,
                    wptIdx: null
                };
            }

            syncWaypointsToAllRoutes();

            if (typeof renderMultiGpxButtons === 'function') {
                renderMultiGpxButtons();
            }

            runBehavior(true, restorePos);
        },

        redo: () => {
            
            syncRouteSelectToSavedRoute();

            if (isEditing) {
                if (targetFile.waypoints[existingIdx]) {
                    targetFile.waypoints[existingIdx].name =
                        finalName;

                    targetFile.waypoints[existingIdx].ele =
                        parseFloat(finalEle) || 0;

                    targetFile.waypoints[existingIdx].type =
                        extra.type ||
                        targetFile.waypoints[existingIdx].type ||
                        "waypoint";

                    targetFile.waypoints[existingIdx].sym =
                        extra.sym ||
                        targetFile.waypoints[existingIdx].sym ||
                        "Waypoint";

                    if (
                        extra.iconColor !== undefined &&
                        extra.iconColor !== null
                    ) {
                        if (String(extra.iconColor).trim() !== "") {
                            targetFile.waypoints[existingIdx].iconColor =
                                String(extra.iconColor).trim();
                        } else {
                            delete targetFile.waypoints[existingIdx].iconColor;
                        }
                    }

                    if (
                        targetFile.waypoints[existingIdx].isCustom === true &&
                        targetFile.waypoints[existingIdx].belongsToRoute === undefined
                    ) {
                        targetFile.waypoints[existingIdx].belongsToRoute =
                            routeIdxAtSave;
                    }

                    if (
                        targetFile.waypoints[existingIdx].isCustom === true &&
                        targetFile.waypoints[existingIdx].belongsToFile === undefined
                    ) {
                        targetFile.waypoints[existingIdx].belongsToFile =
                            fileIdxAtSave;
                    }
                }
            } else {
                if (addedWptRef && !targetFile.waypoints.includes(addedWptRef)) {
                    targetFile.waypoints.push(addedWptRef);
                }
                
                const redoWptIdx =
                    targetFile.waypoints.indexOf(addedWptRef);
                
                if (redoWptIdx > -1) {
                    window.currentToolTarget = {
                        type: "waypoint",
                        fileIdx: fileIdxAtSave,
                        routeIdx: routeIdxAtSave,
                        wptIdx: redoWptIdx
                    };
                }
            }

            syncWaypointsToAllRoutes();

            if (typeof renderMultiGpxButtons === 'function') {
                renderMultiGpxButtons();
            }

            runBehavior(true, {
                lat: lat,
                lng: lon
            });
        }
    });

    const modal =
        document.getElementById('wptEditModal');

    if (modal) {
        modal.style.display = 'none';
    }
}

window.deleteWaypointByIndex = function(idx) {

    const stackIdx =
        typeof window.currentMultiIndex !== 'undefined'
            ? window.currentMultiIndex
            : 0;

    const activeIdx =
        typeof window.currentActiveIndex !== 'undefined'
            ? window.currentActiveIndex
            : 0;

    
    const fileIdxAtDelete =
        stackIdx;

    const routeIdxAtDelete =
        activeIdx;

    const currentStackItem =
        window.multiGpxStack && window.multiGpxStack[fileIdxAtDelete]
            ? window.multiGpxStack[fileIdxAtDelete]
            : (
                typeof multiGpxStack !== 'undefined' &&
                multiGpxStack &&
                multiGpxStack[fileIdxAtDelete]
                    ? multiGpxStack[fileIdxAtDelete]
                    : null
            );

    const activeRoute =
        window.allTracks && window.allTracks[routeIdxAtDelete]
            ? window.allTracks[routeIdxAtDelete]
            : (
                typeof allTracks !== 'undefined' &&
                allTracks &&
                allTracks[routeIdxAtDelete]
                    ? allTracks[routeIdxAtDelete]
                    : null
            );

    if (!currentStackItem && !activeRoute) {
        return;
    }

    const getSourceWaypoints = () => {

        if (
            currentStackItem &&
            Array.isArray(currentStackItem.waypoints) &&
            currentStackItem.waypoints.length > 0
        ) {
            return currentStackItem.waypoints;
        }

        if (
            activeRoute &&
            Array.isArray(activeRoute.waypoints)
        ) {
            return activeRoute.waypoints;
        }

        if (
            currentStackItem &&
            Array.isArray(currentStackItem.waypoints)
        ) {
            return currentStackItem.waypoints;
        }

        return [];
    };

    const sourceWpts =
        getSourceWaypoints();

    const deleteIdx =
        parseInt(idx, 10);

    if (
        !Number.isFinite(deleteIdx) ||
        deleteIdx < 0 ||
        deleteIdx >= sourceWpts.length
    ) {
        
        return;
    }

    const targetWpt =
        sourceWpts[deleteIdx];

    if (!targetWpt) {
        return;
    }

    
    const oldWpts =
        sourceWpts.slice();

    const syncRouteSelectToDeleteRoute = () => {
        window.currentMultiIndex =
            fileIdxAtDelete;

        window.currentActiveIndex =
            routeIdxAtDelete;

        const routeSelect =
            document.getElementById("routeSelect");

        if (
            routeSelect &&
            routeSelect.options &&
            routeSelect.options.length > routeIdxAtDelete
        ) {
            routeSelect.value =
                String(routeIdxAtDelete);
        }
    };

    const syncWaypointRefs = (newWpts) => {

        if (currentStackItem) {
            currentStackItem.waypoints = newWpts;
        }

        if (
            currentStackItem &&
            Array.isArray(currentStackItem.routes)
        ) {
            currentStackItem.routes.forEach(route => {
                if (route) {
                    route.waypoints = newWpts;
                }
            });
        }

        if (
            typeof allTracks !== 'undefined' &&
            Array.isArray(allTracks)
        ) {
            allTracks.forEach(track => {
                if (track) {
                    track.waypoints = newWpts;
                }
            });
        }

        if (
            typeof window.allTracks !== 'undefined' &&
            Array.isArray(window.allTracks)
        ) {
            window.allTracks.forEach(track => {
                if (track) {
                    track.waypoints = newWpts;
                }
            });
        }

        if (
            currentStackItem &&
            typeof rebuildXmlFromWaypoints === 'function'
        ) {
            rebuildXmlFromWaypoints(currentStackItem);
        }

        if (
            currentStackItem &&
            typeof syncWaypointsToFile === 'function'
        ) {
            syncWaypointsToFile(currentStackItem);
        }
    };

    const refreshAfterDelete = () => {

        syncRouteSelectToDeleteRoute();

        if (
            typeof currentPopup !== 'undefined' &&
            currentPopup
        ) {
            map.closePopup();
        }

        if (
            typeof wptMarkers !== 'undefined' &&
            Array.isArray(wptMarkers)
        ) {
            wptMarkers.forEach(m => {
                if (m && map.hasLayer(m)) {
                    map.removeLayer(m);
                }
            });
            wptMarkers = [];
        }

        map.eachLayer(layer => {
            if (
                layer instanceof L.CircleMarker &&
                layer.options &&
                layer.options.radius === 7
            ) {
                map.removeLayer(layer);
            }
        });

				if (typeof loadRoute === 'function') {
				    loadRoute(
				        routeIdxAtDelete,
				        null,
				        {
				            skipAutoFitBounds: true,
				            preserveChartState: true
				        }
				    );
				}

        const routeForWpt =
            allTracks && allTracks[routeIdxAtDelete]
                ? allTracks[routeIdxAtDelete]
                : currentStackItem;

        if (typeof renderWaypointsAndPeaks === 'function') {
            renderWaypointsAndPeaks(routeForWpt);
        }

        if (typeof updateWptTable === 'function') {
            updateWptTable();
        }

        if (typeof updateSelectedCount === 'function') {
            updateSelectedCount();
        }

        const selectAll =
            document.getElementById('selectAllWpts');

        if (selectAll) {
            selectAll.checked = false;
        }
    };

    const doDelete = () => {

        historyManager.execute({

            fileIdx: fileIdxAtDelete,
            routeIdx: routeIdxAtDelete,
            skipAutoLoadRouteAfterUndo: true,

            do: () => {

                syncRouteSelectToDeleteRoute();

                const liveWpts =
                    getSourceWaypoints();

                const newWpts =
                    liveWpts.filter((w, i) => {
                        return i !== deleteIdx;
                    });

                syncWaypointRefs(newWpts);
                refreshAfterDelete();
            },

            undo: () => {

                syncRouteSelectToDeleteRoute();

                const restored =
                    oldWpts.slice();

                syncWaypointRefs(restored);
                refreshAfterDelete();
            },

            redo: () => {

                syncRouteSelectToDeleteRoute();

                const liveWpts =
                    getSourceWaypoints();

                const newWpts =
                    liveWpts.filter((w, i) => {
                        return i !== deleteIdx;
                    });

                syncWaypointRefs(newWpts);
                refreshAfterDelete();
            }
        });
    };

    const msg =
        `確定要刪除「${targetWpt.name || "航點"}」嗎？`;

    if (typeof window.showAppConfirm === 'function') {

        window.showAppConfirm(
            "刪除航點確認",
            msg,
            doDelete,
            null,
            "確定刪除"
        );

    } else {

        if (confirm(msg.replace(/<br>/g, "\n"))) {
            doDelete();
        }
    }

};



window.deleteWaypoint = window.deleteWaypointByIndex;
window.deleteWpt = window.deleteWaypointByIndex;
window.handleDeleteWaypoint = window.deleteWaypointByIndex;

function executeDelete(idx) {
    const stackIdx = (typeof window.currentMultiIndex !== 'undefined') ? window.currentMultiIndex : 0;
    const currentStackItem = multiGpxStack[stackIdx];
    if (!currentStackItem || !currentStackItem.waypoints) return;

    const oldWpts = [...currentStackItem.waypoints]; 
    const target = currentStackItem.waypoints[idx];
    if (!target) return;

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
            currentStackItem.waypoints = [...oldWpts];
            
            if (typeof allTracks !== 'undefined') {
                allTracks.forEach(track => { 
                    track.waypoints = currentStackItem.waypoints; 
                });
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
            if (typeof allTracks !== 'undefined' && allTracks[activeIdx]) {
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
	  const oldToast =
        document.getElementById("map-toast");

    if (oldToast) {
        oldToast.style.opacity = "0";
    }

    if (window.mapToastTimer) {
        clearTimeout(window.mapToastTimer);
        window.mapToastTimer = null;
    }

    window.currentMapToast = null;
    const idx =
        (index !== undefined)
            ? index
            : (window.currentMultiIndex || 0);

    const item =
        (typeof multiGpxStack !== 'undefined')
            ? multiGpxStack[idx]
            : null;

    const routeSelect =
        document.getElementById("routeSelect");

    let activeIdx =
        parseInt(routeSelect?.value, 10) || 0;
    
    let currentRoute =
        (typeof allTracks !== 'undefined' && allTracks[activeIdx])
            ? allTracks[activeIdx]
            : item;

    if (!currentRoute && typeof allWpts !== 'undefined' && allWpts.length > 0) {
        currentRoute = {
            name: "New_Waypoints",
            points: [],
            waypoints: allWpts,
            isCustomExport: true
        };
    }

    if (!currentRoute) {
        return alert("找不到可匯出的資料");
    }

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

        let formatted =
            String(timeStr).trim().replace(/\s+/g, 'T');

        if (!formatted.includes('Z') && !formatted.includes('+')) {
            formatted += 'Z';
        }

        return formatted;
    };

    const toTwDate = (timeStr) => {
        if (!timeStr) return null;

        const d =
            new Date(timeStr);

        if (isNaN(d.getTime())) return null; 

        const twTime =
            new Date(d.getTime() + (8 * 60 * 60 * 1000));

        return twTime.toISOString().split('T')[0];
    };

    const hasPoints =
        currentRoute.points &&
        currentRoute.points.length > 0;

    const targetDate =
        hasPoints
            ? toTwDate(currentRoute.points[0].time)
            : null;

    const trackName =
        escapeXml(
            currentRoute.routeDisplayName ||
            currentRoute.displayName ||
            currentRoute.name ||
            "Exported_Route"
        );

		let gpx = `<?xml version="1.0" encoding="UTF-8"?>
		<gpx version="1.0" creator="YCHiking" 
		  xmlns="http://www.topografix.com/GPX/1/0"
		  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
		  xmlns:myapp="https://ychiking.github.io/gpx-online-viewer"
		  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
		  <metadata><name>${trackName}</name></metadata>`;

    let finalWpts = [];
    const seenWpts = new Set();

    const isMultiRoute =
        routeSelect &&
        routeSelect.options &&
        routeSelect.options.length > 1;

    const getRawWaypoints = () => {
        if (
            currentRoute &&
            Array.isArray(currentRoute.waypoints) &&
            currentRoute.waypoints.length > 0
        ) {
            return currentRoute.waypoints;
        }

        if (
            item &&
            Array.isArray(item.waypoints) &&
            item.waypoints.length > 0
        ) {
            return item.waypoints;
        }

        if (
            typeof allWpts !== 'undefined' &&
            Array.isArray(allWpts)
        ) {
            return allWpts;
        }

        return [];
    };

    const shouldExportWaypointForMergedRoute = (w) => {
        if (
            !currentRoute ||
            currentRoute.isMergedRoute !== true ||
            !Array.isArray(currentRoute.sourceRouteIndexes)
        ) {
            return false;
        }

        
        return currentRoute.sourceRouteIndexes.some(function(sourceIdx) {
            if (typeof window.isWaypointVisibleOnCurrentRoute === "function") {
                const sourceRoute =
                    typeof allTracks !== "undefined" && allTracks[sourceIdx]
                        ? allTracks[sourceIdx]
                        : (
                            item &&
                            item.routes &&
                            item.routes[sourceIdx]
                                ? item.routes[sourceIdx]
                                : null
                        );

                return window.isWaypointVisibleOnCurrentRoute(
                    w,
                    Number(sourceIdx),
                    sourceRoute
                );
            }

            
            return (
                w.belongsToRoute !== undefined &&
                Number(w.belongsToRoute) === Number(sourceIdx)
            );
        });
    };

    if (isMultiRoute) {
        const rawWpts =
            getRawWaypoints();

        rawWpts.forEach(w => {
            if (!w) return;

            const wptKey =
                `${w.lat}_${w.lon}_${w.name || ''}_${w.time || ''}`;

            if (seenWpts.has(wptKey)) return; 

            let shouldInclude = false;

            if (
                !hasPoints ||
                currentRoute.isCombined ||
                currentRoute.isCustomExport
            ) {
                
                shouldInclude = true;

            } else if (
                currentRoute.isMergedRoute === true
            ) {
                
                shouldInclude =
                    shouldExportWaypointForMergedRoute(w);

            } else if (
                typeof window.isWaypointVisibleOnCurrentRoute === "function"
            ) {
                
                shouldInclude =
                    window.isWaypointVisibleOnCurrentRoute(
                        w,
                        activeIdx,
                        currentRoute
                    );

            } else {
                
                if (w.isCustom || w.belongsToRoute !== undefined) {
                    if (Number(w.belongsToRoute) === Number(activeIdx)) {
                        shouldInclude = true;
                    }

                } else {
                    const wptTwDate =
                        toTwDate(w.time);

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
        const rawSource =
            getRawWaypoints();
        
        rawSource.forEach(w => {
            if (!w) return;

            const wptKey =
                `${w.lat}_${w.lon}_${w.name || ''}_${w.time || ''}`;

            if (!seenWpts.has(wptKey)) {
                finalWpts.push(w);
                seenWpts.add(wptKey);
            }
        });
    }

		finalWpts.forEach(w => {
		    const name =
		        escapeXml(w.name || "WayPoint");
		
		    const safeTime =
		        formatIsoTime(w.time);
		
		    const lat =
		        isMultiRoute
		            ? Number(w.lat).toFixed(6)
		            : w.lat;
		
		    const lon =
		        isMultiRoute
		            ? Number(w.lon).toFixed(6)
		            : w.lon;
		
		    gpx += `\n  <wpt lat="${lat}" lon="${lon}">`;
		
		    if (w.ele !== undefined) {
		        gpx += `\n    <ele>${Number(w.ele).toFixed(2)}</ele>`;
		    }
		
		    gpx += `\n    <name>${name}</name>`;

            const symInfo =
                typeof window.getWaypointIconInfo === "function"
                    ? window.getWaypointIconInfo(w)
                    : null;
            const symText = escapeXml(
                w.sym ||
                (symInfo && symInfo.gpxSym ? symInfo.gpxSym : "Waypoint")
            );
            gpx += `\n    <sym>${symText}</sym>`;
		
		    if (safeTime) {
		        gpx += `\n    <time>${safeTime}</time>`;
		    }
		
		    
				const visibleRouteIndexes =
				    Array.isArray(w.visibleRouteIndexes)
				        ? w.visibleRouteIndexes
				            .map(Number)
				            .filter(function(idx) {
				                return Number.isFinite(idx);
				            })
				        : [];
				
				const hiddenRouteIndexes =
				    Array.isArray(w.hiddenRouteIndexes)
				        ? w.hiddenRouteIndexes
				            .map(Number)
				            .filter(function(idx) {
				                return Number.isFinite(idx);
				            })
				        : [];
				
				const hasDisplayState =
				    visibleRouteIndexes.length > 0 ||
				    hiddenRouteIndexes.length > 0 ||
				    w.belongsToRoute !== undefined;
				
				const iconColor =
				    w.iconColor !== undefined &&
				    w.iconColor !== null
				        ? String(w.iconColor).trim()
				        : "";
				
				const hasIconColor =
				    iconColor !== "";
				
				if (
				    hasDisplayState ||
				    hasIconColor
				) {
				    gpx += `\n    <extensions>`;
				
				    if (hasDisplayState) {
				        gpx += `\n      <myapp:waypointDisplay`;
				
				        if (w.belongsToRoute !== undefined) {
				            gpx += ` belongsToRoute="${Number(w.belongsToRoute)}"`;
				        }
				
				        if (visibleRouteIndexes.length > 0) {
				            gpx += ` visibleRouteIndexes="${visibleRouteIndexes.join(",")}"`;
				        }
				
				        if (hiddenRouteIndexes.length > 0) {
				            gpx += ` hiddenRouteIndexes="${hiddenRouteIndexes.join(",")}"`;
				        }
				
				        gpx += ` />`;
				    }
				
				    if (hasIconColor) {
				        gpx += `\n      <iconColor>${escapeXml(iconColor)}</iconColor>`;
				    }
				
				    gpx += `\n    </extensions>`;
				}
		
		    gpx += `\n  </wpt>`;
		});

    let tracksToExport =
        currentRoute.isCombined
            ? allTracks.filter(t => !t.isCombined)
            : [currentRoute];

    tracksToExport.forEach(route => {
        if (route.points?.length > 0) {
            const trkName =
                escapeXml(
                    route.routeDisplayName ||
                    route.displayName ||
                    route.name ||
                    "Track"
                );

            gpx += `\n  <trk>\n    <name>${trkName}</name>`;

            
            if (
                Array.isArray(route.segments) &&
                route.segments.length > 0
            ) {
                route.segments.forEach(seg => {
                    if (!Array.isArray(seg) || seg.length === 0) return;

                    gpx += `\n    <trkseg>`;

                    seg.forEach(latlng => {
                        let lat;
                        let lon;
                        let matchedPoint = null;

                        if (Array.isArray(latlng)) {
                            lat = latlng[0];
                            lon = latlng[1];
                        } else if (latlng && typeof latlng === "object") {
                            lat = latlng.lat;
                            lon = latlng.lon !== undefined ? latlng.lon : latlng.lng;
                        }

                        if (
                            typeof lat !== "number" ||
                            typeof lon !== "number" ||
                            !Number.isFinite(lat) ||
                            !Number.isFinite(lon)
                        ) {
                            return;
                        }

                        if (Array.isArray(route.points)) {
                            matchedPoint =
                                route.points.find(p =>
                                    p &&
                                    Math.abs(Number(p.lat) - Number(lat)) < 0.0000001 &&
                                    Math.abs(Number(p.lon) - Number(lon)) < 0.0000001
                                );
                        }

                        const p =
                            matchedPoint ||
                            {
                                lat: lat,
                                lon: lon
                            };

                        const safePTime =
                            formatIsoTime(p.time); 

                        const pLat =
                            isMultiRoute
                                ? Number(lat).toFixed(6)
                                : lat;

                        const pLon =
                            isMultiRoute
                                ? Number(lon).toFixed(6)
                                : lon;
                        
                        gpx += `\n      <trkpt lat="${pLat}" lon="${pLon}">`;

                        if (p.ele !== undefined) {
                            gpx += `<ele>${Number(p.ele).toFixed(2)}</ele>`;
                        }

                        if (safePTime) {
                            gpx += `<time>${safePTime}</time>`;
                        }

                        gpx += `</trkpt>`;
                    });

                    gpx += `\n    </trkseg>`;
                });

            } else {
                gpx += `\n    <trkseg>`;

                route.points.forEach(p => {
                    const safePTime =
                        formatIsoTime(p.time); 

                    const pLat =
                        isMultiRoute
                            ? Number(p.lat).toFixed(6)
                            : p.lat;

                    const pLon =
                        isMultiRoute
                            ? Number(p.lon).toFixed(6)
                            : p.lon;
                    
                    gpx += `\n      <trkpt lat="${pLat}" lon="${pLon}">`;

                    if (p.ele !== undefined) {
                        gpx += `<ele>${Number(p.ele).toFixed(2)}</ele>`;
                    }

                    if (safePTime) {
                        gpx += `<time>${safePTime}</time>`;
                    }

                    gpx += `</trkpt>`;
                });

                gpx += `\n    </trkseg>`;
            }

            gpx += `\n  </trk>`;
        }
    });

    gpx += `\n</gpx>`;

    const blob =
        new Blob(
            [gpx],
            { type: 'application/gpx+xml;charset=utf-8' }
        );

    const url =
        URL.createObjectURL(blob);

    const a =
        document.createElement('a');

    a.href =
        url;

    a.download =
        `${trackName.replace(/ /g, '_')}.gpx`;

    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 200);
};

window.renameSubRoute = function(fileIdxOrRouteIdx, maybeRouteIdx, options = {}) {
    let fileIdx;
    let routeIdx;
    
    const renameOptions =
    options && typeof options === "object"
        ? options
        : {};

		const skipOpenGpxManager =
    renameOptions.skipOpenGpxManager === true;

    
    if (typeof maybeRouteIdx === "number") {
        fileIdx = parseInt(fileIdxOrRouteIdx, 10);
        routeIdx = parseInt(maybeRouteIdx, 10);
    } else {
        fileIdx =
            typeof window.currentMultiIndex === "number"
                ? window.currentMultiIndex
                : 0;

        routeIdx =
            typeof fileIdxOrRouteIdx === "number"
                ? parseInt(fileIdxOrRouteIdx, 10)
                : (
                    typeof window.currentActiveIndex === "number"
                        ? window.currentActiveIndex
                        : 0
                );
    }

    if (!Number.isFinite(fileIdx)) fileIdx = 0;
    if (!Number.isFinite(routeIdx)) routeIdx = 0;

    const activeFileIdxAtOpen =
        typeof window.currentMultiIndex === "number"
            ? window.currentMultiIndex
            : 0;

    const activeRouteIdxAtOpen =
        typeof window.currentActiveIndex === "number"
            ? window.currentActiveIndex
            : 0;

    const stack =
        window.multiGpxStack ||
        multiGpxStack ||
        [];

    const currentFile =
        stack[fileIdx];

    
    const originalFileName =
        currentFile ? currentFile.name : undefined;

    const originalFileDisplayName =
        currentFile ? currentFile.displayName : undefined;

    const originalFileFileName =
        currentFile ? currentFile.fileName : undefined;

    let targetRoute = null;

    
    if (
        currentFile &&
        Array.isArray(currentFile.routes) &&
        currentFile.routes[routeIdx]
    ) {
        targetRoute =
            currentFile.routes[routeIdx];
    }

    
    if (
        !targetRoute &&
        typeof allTracks !== "undefined" &&
        Array.isArray(allTracks) &&
        allTracks[routeIdx]
    ) {
        targetRoute =
            allTracks[routeIdx];
    }

    
    if (
        !targetRoute &&
        currentFile &&
        (
            currentFile.isDrawTrack === true ||
            currentFile.isHandDrawRoute === true ||
            (
                Array.isArray(currentFile.points) &&
                currentFile.points.length > 0
            ) ||
            (
                Array.isArray(currentFile.segments) &&
                currentFile.segments.length > 0
            )
        )
    ) {
        targetRoute =
            currentFile;
    }

    if (!targetRoute) {
        alert("找不到要改名的子路線");
        return;
    }

    if (targetRoute.isCombined === true) {
        alert("結合路線不能改名");
        return;
    }

    const modal = document.getElementById('renameModal');
    const input = document.getElementById('modalRouteName');
    const confirmBtn = document.getElementById('modalRouteConfirm');
    const cancelBtn = document.getElementById('modalRouteCancel');

    if (!modal || !input || !confirmBtn) return;

    const oldName =
        targetRoute.routeDisplayName ||
        targetRoute.displayName ||
        targetRoute.name ||
        "子路線 " + routeIdx;

    input.value = oldName;

    const isNowFS = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.body.classList.contains('iphone-fullscreen')
    );

    const mapContainer = document.getElementById('map');

    if (isNowFS && mapContainer && modal.parentElement !== mapContainer) {
        mapContainer.appendChild(modal);
    } else if (!isNowFS && modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }

    modal.style.setProperty('display', 'flex', 'important');
    modal.style.setProperty('position', 'fixed', 'important');
    modal.style.setProperty('top', '0', 'important');
    modal.style.setProperty('left', '0', 'important');
    modal.style.setProperty('width', '100%', 'important');
    modal.style.setProperty('height', '100%', 'important');
    modal.style.setProperty('align-items', 'center', 'important');
    modal.style.setProperty('justify-content', 'center', 'important');
    modal.style.setProperty('z-index', '2147483647', 'important');

    const gpxManageModal = document.getElementById('gpxManageModal');
    if (gpxManageModal && gpxManageModal !== modal) {
        gpxManageModal.style.setProperty('z-index', '2147483645', 'important');
    }

    if (typeof L !== "undefined" && L.DomEvent) {
        L.DomEvent.disableClickPropagation(modal);
        L.DomEvent.disableScrollPropagation(modal);
    }

    setTimeout(function() {
        input.focus();
        input.select();
    }, 100);

    const closeModal = function() {
        modal.style.display = 'none';
        window.removeEventListener('keydown', handleEscKey);
        input.removeEventListener('keydown', handleEnterKey);
    };

    const restoreFileName = function() {
        
        if (currentFile) {
            currentFile.name = originalFileName;
            currentFile.displayName = originalFileDisplayName;
            currentFile.fileName = originalFileFileName;
        }
    };

		const applyRename = function(nameToApply) {
		
		    
		    const activeFileIdxNow =
		        typeof window.currentMultiIndex === "number"
		            ? window.currentMultiIndex
		            : 0;
		
		    const activeRouteIdxNow =
		        typeof window.currentActiveIndex === "number"
		            ? window.currentActiveIndex
		            : 0;
		
		    
		    if (currentFile && targetRoute === currentFile) {
		        targetRoute.routeDisplayName = nameToApply;
		    } else {
		        targetRoute.name = nameToApply;
		        targetRoute.displayName = nameToApply;
		        targetRoute.routeDisplayName = nameToApply;
		    }
		
		    if (
		        currentFile &&
		        Array.isArray(currentFile.routes) &&
		        currentFile.routes[routeIdx]
		    ) {
		        if (currentFile.routes[routeIdx] === currentFile) {
		            currentFile.routes[routeIdx].routeDisplayName = nameToApply;
		        } else {
		            currentFile.routes[routeIdx].name = nameToApply;
		            currentFile.routes[routeIdx].displayName = nameToApply;
		            currentFile.routes[routeIdx].routeDisplayName = nameToApply;
		        }
		
		        if (!currentFile.customRouteNames) {
		            currentFile.customRouteNames = {};
		        }
		
		        currentFile.customRouteNames[routeIdx] = nameToApply;
		    }
		
		    
		    if (
		        currentFile &&
		        (
		            !Array.isArray(currentFile.routes) ||
		            !currentFile.routes[routeIdx]
		        )
		    ) {
		        if (!currentFile.customRouteNames) {
		            currentFile.customRouteNames = {};
		        }
		
		        currentFile.customRouteNames[routeIdx] = nameToApply;
		    }
		
		    
		    if (fileIdx === activeFileIdxNow) {
		
		        if (
		            Array.isArray(window.allTracks) &&
		            window.allTracks[routeIdx]
		        ) {
		            if (currentFile && window.allTracks[routeIdx] === currentFile) {
		                window.allTracks[routeIdx].routeDisplayName = nameToApply;
		            } else {
		                window.allTracks[routeIdx].name = nameToApply;
		                window.allTracks[routeIdx].displayName = nameToApply;
		                window.allTracks[routeIdx].routeDisplayName = nameToApply;
		            }
		        }
		
		        if (
		            typeof allTracks !== "undefined" &&
		            Array.isArray(allTracks) &&
		            allTracks[routeIdx]
		        ) {
		            if (currentFile && allTracks[routeIdx] === currentFile) {
		                allTracks[routeIdx].routeDisplayName = nameToApply;
		            } else {
		                allTracks[routeIdx].name = nameToApply;
		                allTracks[routeIdx].displayName = nameToApply;
		                allTracks[routeIdx].routeDisplayName = nameToApply;
		            }
		        }
		
		        
		        window.currentMultiIndex = activeFileIdxNow;
		        window.currentActiveIndex = activeRouteIdxNow;
		
		        if (typeof updateRouteSelectDropdown === "function") {
		            updateRouteSelectDropdown();
		        }
		
		        const routeSelectAfter =
		            document.getElementById("routeSelect");
		
		        if (
		            routeSelectAfter &&
		            routeSelectAfter.options &&
		            routeSelectAfter.options.length > activeRouteIdxNow
		        ) {
		            routeSelectAfter.value =
		                String(activeRouteIdxNow);
		        }
		
		        if (typeof renderRouteInfo === "function") {
		            renderRouteInfo();
		        }
		
		    } else {
		
		        
		        window.currentMultiIndex = activeFileIdxNow;
		        window.currentActiveIndex = activeRouteIdxNow;
		    }
		
		    
		    restoreFileName();
		
		    if (typeof renderMultiGpxButtons === "function") {
		        renderMultiGpxButtons();
		    }
		
				if (!window.gpxManagerExpanded) {
				    window.gpxManagerExpanded = {};
				}
				
				window.gpxManagerExpanded[fileIdx] = true;
				
				
				const gpxManageModal =
				    document.getElementById("gpxManageModal");
				
				const isGpxManagerOpen =
				    gpxManageModal &&
				    gpxManageModal.style.display !== "none";
				
				if (
				    !skipOpenGpxManager &&
				    isGpxManagerOpen &&
				    typeof window.refreshGpxManagerIfOpen === "function"
				) {
				    window.refreshGpxManagerIfOpen();
				
				} else if (
				    !skipOpenGpxManager &&
				    isGpxManagerOpen &&
				    typeof showGpxManagementModal === "function"
				) {
				    showGpxManagementModal();
				}
		
		    if (
		        typeof historyManager !== "undefined" &&
		        historyManager &&
		        typeof historyManager.updateUI === "function"
		    ) {
		        historyManager.updateUI();
		    }
		};

    const handleConfirm = function() {
        const newName = input.value.trim();

        if (newName !== "" && newName !== oldName) {

            const command = {
                
                managedFileIndex: fileIdx,
                routeIndex: routeIdx,
                skipAutoLoadRouteAfterUndo: true,

                do: function() {
                    applyRename(newName);
                },

                undo: function() {
                    applyRename(oldName);
                }
            };

            if (
                typeof historyManager !== "undefined" &&
                historyManager &&
                typeof historyManager.execute === "function"
            ) {
                historyManager.execute(command);
            } else {
                command.do();
            }
        }

        closeModal();
    };

    const handleEnterKey = function(e) {
        if (e.key === "Enter") {
            e.preventDefault();
            handleConfirm();
        }
    };

    const handleEscKey = function(e) {
        if (e.key === "Escape") {
            closeModal();
        }
    };

    window.addEventListener('keydown', handleEscKey);
    input.addEventListener('keydown', handleEnterKey);

    confirmBtn.onclick = handleConfirm;

    if (cancelBtn) {
        cancelBtn.onclick = closeModal;
    }
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

    const routeSelect =
        document.getElementById("routeSelect");

    const container =
        document.getElementById("routeSelectContainer");

    if (!routeSelect || !container) return;

    const stackIdx =
        typeof window.currentMultiIndex === "number"
            ? window.currentMultiIndex
            : 0;

    const stack =
        window.multiGpxStack ||
        multiGpxStack ||
        [];

    const currentFile =
        stack && stack[stackIdx];

    routeSelect.innerHTML = "";

    
    const hasRoutes =
        currentFile &&
        Array.isArray(currentFile.routes) &&
        currentFile.routes.length > 1;

    if (!hasRoutes) {
        container.style.setProperty("display", "none", "important");
        container.style.visibility = "hidden";
        container.style.pointerEvents = "none";
        container.style.opacity = "0";

        window.currentActiveIndex =
            0;

        if (currentFile) {
            if (
                Array.isArray(currentFile.routes) &&
                currentFile.routes.length === 1
            ) {
                allTracks =
                    currentFile.routes;

                window.allTracks =
                    currentFile.routes;

            } else {
                allTracks =
                    [currentFile];

                window.allTracks =
                    allTracks;
            }
        }

        routeSelect.value =
            "0";

        routeSelect.selectedIndex =
            0;

        return;
    }

    
    allTracks =
        currentFile.routes;

    window.allTracks =
        currentFile.routes;

    currentFile.routes.forEach((route, i) => {
        if (!route) return;

        
        route.routeIndex =
            i;

        route.index =
            i;

        route.originalIndex =
            i;

        const opt =
            document.createElement("option");

        opt.value =
            String(i);

        const baseName =
				    route.routeDisplayName ||
				    route.displayName ||
				    route.name ||
				    `路線 ${i + 1}`;
				
				const isCombinedRoute =
				    route.isCombined === true ||
				    route.type === "combined" ||
				    route.routeType === "combined" ||
				    (
				        i === 0 &&
				        typeof baseName === "string" &&
				        baseName.indexOf("結合") !== -1
				    );
				
				route.isCombined =
				    isCombinedRoute === true;
				
				if (isCombinedRoute) {
				    opt.textContent =
				        `【 ${baseName} 】`;
				} else {
				    opt.textContent =
				        baseName;
				}

        routeSelect.appendChild(opt);
    });

    let activeIdx =
        typeof window.currentActiveIndex === "number"
            ? window.currentActiveIndex
            : 0;

    if (
        activeIdx < 0 ||
        activeIdx >= currentFile.routes.length
    ) {
        activeIdx =
            0;

        window.currentActiveIndex =
            0;
    }

    routeSelect.value =
        String(activeIdx);

    routeSelect.selectedIndex =
        activeIdx;

    container.style.setProperty("display", "block", "important");
    container.style.visibility =
        "visible";

    container.style.pointerEvents =
        "auto";

    container.style.opacity =
        "1";

    
    routeSelect.blur();

    void routeSelect.offsetWidth;
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
    const chartContainerBeforeFocus =
        document.getElementById("chartContainer");

    const tipLabelBeforeFocus =
        document.getElementById("chartTipToggleLabel");

    const btnBeforeFocus =
        document.getElementById("toggleChartBtn");

    const wasChartOpenBeforeFocus =
        chartContainerBeforeFocus &&
        window.getComputedStyle(chartContainerBeforeFocus).display !== "none";

    window.currentToolTarget = {
        type: "waypoint",
        fileIdx:
            typeof window.currentMultiIndex === "number"
                ? window.currentMultiIndex
                : 0,
        routeIdx:
            typeof window.currentActiveIndex === "number"
                ? window.currentActiveIndex
                : 0,
        wptIdx: Number(originalIdx)
    };

    document.querySelectorAll(".wpt-table tr").forEach(function(row) {
        row.classList.remove("wpt-selected-row");
    });

    const selectedRow =
        document.querySelector(
            '.wpt-table tr[data-idx="' + originalIdx + '"]'
        );

    if (selectedRow) {
        selectedRow.classList.add("wpt-selected-row");
    }

    if (typeof window.renderRouteToolControl === "function") {
        window.renderRouteToolControl();
    }

    const stackIdx =
        window.currentMultiIndex !== undefined
            ? window.currentMultiIndex
            : 0;

    const routeIdx =
        window.currentActiveIndex !== undefined
            ? window.currentActiveIndex
            : 0;

    const wpt =
        multiGpxStack &&
        multiGpxStack[stackIdx] &&
        multiGpxStack[stackIdx].waypoints
            ? multiGpxStack[stackIdx].waypoints[originalIdx]
            : null;

    window.currentToolTarget = {
        type: "waypoint",
        fileIdx: stackIdx,
        routeIdx: routeIdx,
        wptIdx: Number(originalIdx)
    };

    if (wpt) {
        window.focusWaypoint(
            wpt.lat,
            wpt.lon,
            wpt.name,
            0,
            wpt.ele
        );
    }

    
    setTimeout(function() {
        const chartContainer =
            document.getElementById("chartContainer");

        const tipLabel =
            document.getElementById("chartTipToggleLabel");

        const btn =
            document.getElementById("toggleChartBtn");

        if (!wasChartOpenBeforeFocus) {
            if (chartContainer) {
                chartContainer.style.setProperty(
                    "display",
                    "none",
                    "important"
                );
            }

            if (tipLabel) {
                tipLabel.style.setProperty(
                    "display",
                    "none",
                    "important"
                );
            }

            if (btn) {
                btn.textContent =
                    "展開高度表";
            }

            if (window.chart) {
                window.chart.destroy();
                window.chart =
                    null;
            }

        } else {
            if (chartContainer) {
                chartContainer.style.setProperty(
                    "display",
                    "block",
                    "important"
                );
            }

            if (tipLabel) {
                tipLabel.style.setProperty(
                    "display",
                    "flex",
                    "important"
                );
            }

            if (btn) {
                btn.textContent =
                    "收合高度表";
            }
        }
    }, 120);
};

window.handleWptEditByIndex = function(originalIdx) {
    const stackIdx =
        window.currentMultiIndex !== undefined
            ? window.currentMultiIndex
            : 0;

    const routeIdx =
        window.currentActiveIndex !== undefined
            ? window.currentActiveIndex
            : 0;

    const wpt =
        multiGpxStack &&
        multiGpxStack[stackIdx] &&
        multiGpxStack[stackIdx].waypoints
            ? multiGpxStack[stackIdx].waypoints[originalIdx]
            : null;

    window.currentToolTarget = {
        type: "waypoint",
        fileIdx: stackIdx,
        routeIdx: routeIdx,
        wptIdx: Number(originalIdx)
    };

    document.querySelectorAll(".wpt-table tr").forEach(function(row) {
        row.classList.remove("wpt-selected-row");
    });

    const selectedRow =
        document.querySelector(
            '.wpt-table tr[data-idx="' + originalIdx + '"]'
        );

    if (selectedRow) {
        selectedRow.classList.add("wpt-selected-row");
    }

    if (typeof window.renderRouteToolControl === "function") {
        window.renderRouteToolControl();
    }

		if (wpt) {
		    window.__preserveChartStateForWptAction = true;
		
		    handleWptEdit(
		        originalIdx,
		        wpt.lat,
		        wpt.lon,
		        wpt.ele,
		        wpt.name,
		        wpt.localTime,
		        originalIdx
		    );
		
		    setTimeout(function() {
		        window.__preserveChartStateForWptAction = false;
		    }, 300);
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
    if (pTag) {
        pTag.innerHTML = `您確定要刪除這 ${checked.length} 個選取的航點？`;
    }

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

        const stackIdx =
            typeof window.currentMultiIndex !== 'undefined'
                ? window.currentMultiIndex
                : 0;

        const activeIdx =
            typeof window.currentActiveIndex !== 'undefined'
                ? window.currentActiveIndex
                : 0;

        
        const fileIdxAtDelete =
            stackIdx;

        const routeIdxAtDelete =
            activeIdx;

        const currentStackItem =
            multiGpxStack &&
            multiGpxStack[fileIdxAtDelete];

        const activeRoute =
            allTracks &&
            allTracks[routeIdxAtDelete];

        if (!currentStackItem && !activeRoute) {
            closeModal();
            return;
        }

        let sourceWpts = [];

        if (
            currentStackItem &&
            Array.isArray(currentStackItem.waypoints) &&
            currentStackItem.waypoints.length > 0
        ) {
            sourceWpts = currentStackItem.waypoints;

        } else if (
            activeRoute &&
            Array.isArray(activeRoute.waypoints)
        ) {
            sourceWpts = activeRoute.waypoints;

        } else if (
            currentStackItem &&
            Array.isArray(currentStackItem.waypoints)
        ) {
            sourceWpts = currentStackItem.waypoints;

        } else {
            sourceWpts = [];
        }

        
        const oldWpts =
            sourceWpts.slice();

        const indices =
            Array.from(checked)
                .map(cb => {
                    const v =
                        cb.getAttribute('data-idx') ??
                        cb.getAttribute('data-original-idx') ??
                        cb.value;

                    const n =
                        parseInt(v, 10);

                    return Number.isFinite(n) ? n : null;
                })
                .filter(n => n !== null)
                .sort((a, b) => b - a);

        const syncRouteSelectToDeleteRoute = () => {
            window.currentMultiIndex =
                fileIdxAtDelete;

            window.currentActiveIndex =
                routeIdxAtDelete;

            const routeSelect =
                document.getElementById("routeSelect");

            if (
                routeSelect &&
                routeSelect.options &&
                routeSelect.options.length > routeIdxAtDelete
            ) {
                routeSelect.value =
                    String(routeIdxAtDelete);
            }
        };

        const syncWaypointRefs = (newWpts) => {

            if (currentStackItem) {
                currentStackItem.waypoints = newWpts;
            }

            if (
                currentStackItem &&
                Array.isArray(currentStackItem.routes)
            ) {
                currentStackItem.routes.forEach(route => {
                    if (route) {
                        route.waypoints = newWpts;
                    }
                });
            }

            if (
                typeof allTracks !== 'undefined' &&
                Array.isArray(allTracks)
            ) {
                allTracks.forEach(track => {
                    if (track) {
                        track.waypoints = newWpts;
                    }
                });
            }

            if (
                typeof window.allTracks !== 'undefined' &&
                Array.isArray(window.allTracks)
            ) {
                window.allTracks.forEach(track => {
                    if (track) {
                        track.waypoints = newWpts;
                    }
                });
            }

            if (
                currentStackItem &&
                typeof rebuildXmlFromWaypoints === 'function'
            ) {
                rebuildXmlFromWaypoints(currentStackItem);
            }

            if (
                currentStackItem &&
                typeof syncWaypointsToFile === 'function'
            ) {
                syncWaypointsToFile(currentStackItem);
            }
        };

        const refreshAfterDelete = () => {

            syncRouteSelectToDeleteRoute();

            if (
                typeof currentPopup !== 'undefined' &&
                currentPopup
            ) {
                map.closePopup();
            }

            if (
                typeof wptMarkers !== 'undefined' &&
                Array.isArray(wptMarkers)
            ) {
                wptMarkers.forEach(m => {
                    if (m && map.hasLayer(m)) {
                        map.removeLayer(m);
                    }
                });
                wptMarkers = [];
            }

            map.eachLayer(layer => {
                if (
                    layer instanceof L.CircleMarker &&
                    layer.options &&
                    layer.options.radius === 7
                ) {
                    map.removeLayer(layer);
                }
            });

						if (typeof loadRoute === 'function') {
						    loadRoute(
						        routeIdxAtDelete,
						        null,
						        {
						            skipAutoFitBounds: true,
						            preserveChartState: true
						        }
						    );
						}

            const routeForWpt =
                allTracks && allTracks[routeIdxAtDelete]
                    ? allTracks[routeIdxAtDelete]
                    : currentStackItem;

				if (typeof renderWaypointsAndPeaks === 'function') {
				    renderWaypointsAndPeaks(routeForWpt);
				}
				
				
				if (
				    window.currentToolTarget &&
				    window.currentToolTarget.type === "waypoint"
				) {
				    const selectedIdx =
				        Number(window.currentToolTarget.wptIdx);
				
				    if (Number.isFinite(selectedIdx)) {
				        document.querySelectorAll(".wpt-table tr").forEach(function(row) {
				            row.classList.remove("wpt-selected-row");
				        });
				
				        const selectedRow =
				            document.querySelector(
				                '.wpt-table tr[data-idx="' + selectedIdx + '"]'
				            );
				
				        if (selectedRow) {
				            selectedRow.classList.add("wpt-selected-row");
				        }
				    }
				}
				
				if (typeof updateWptIconStatus === 'function') {
				    updateWptIconStatus();
				}
				
				if (typeof window.renderRouteToolControl === "function") {
				    window.renderRouteToolControl();
				}

            if (typeof updateSelectedCount === 'function') {
                updateSelectedCount();
            }

            const selectAll =
                document.getElementById('selectAllWpts');

            if (selectAll) {
                selectAll.checked = false;
            }
        };

        historyManager.execute({

            fileIdx: fileIdxAtDelete,
            routeIdx: routeIdxAtDelete,

            do: () => {

                syncRouteSelectToDeleteRoute();

                const removeSet =
                    new Set(indices);

                const liveWpts =
                    sourceWpts;

                const newWpts =
                    liveWpts.filter((w, idx) => {
                        return !removeSet.has(idx);
                    });

                syncWaypointRefs(newWpts);
                refreshAfterDelete();
            },

            undo: () => {

                syncRouteSelectToDeleteRoute();

                const restored =
                    oldWpts.slice();

                syncWaypointRefs(restored);
                refreshAfterDelete();
            },

            redo: () => {

                syncRouteSelectToDeleteRoute();

                const removeSet =
                    new Set(indices);

                const liveWpts =
                    sourceWpts;

                const newWpts =
                    liveWpts.filter((w, idx) => {
                        return !removeSet.has(idx);
                    });

                syncWaypointRefs(newWpts);
                refreshAfterDelete();
            }
        });

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
            const symInfo =
                typeof window.getWaypointIconInfo === "function"
                    ? window.getWaypointIconInfo(wpt)
                    : null;
            const symText =
                wpt.sym ||
                (symInfo && symInfo.gpxSym ? symInfo.gpxSym : "Waypoint");
            const symNode = xmlDoc.createElement("sym");
            symNode.textContent = symText;
            newWpt.appendChild(symNode);
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
let wptDragMode = null;

window.initWptDragSelect = function() {
    const tableBody = document.getElementById("wptTableBody");
    if (!tableBody) return;

    tableBody.onmousedown = null;
    tableBody.onmouseover = null;
    tableBody.ontouchstart = null;

    const getBoxesByMode = function(mode) {
        if (mode === "display") {
            return tableBody.querySelectorAll(".wpt-display-checkbox");
        }

        return tableBody.querySelectorAll(".wpt-checkbox");
    };

		 const applyDisplayCheckboxStates = function() {
		    const fileIdx =
		        typeof window.currentMultiIndex === "number"
		            ? window.currentMultiIndex
		            : 0;
		
		    const routeIdx =
		        typeof window.currentActiveIndex === "number"
		            ? window.currentActiveIndex
		            : 0;
		
		    const currentFile =
		        window.multiGpxStack &&
		        window.multiGpxStack[fileIdx];
		
		    if (
		        !currentFile ||
		        !Array.isArray(currentFile.waypoints)
		    ) {
		        return;
		    }
		
		    const currentRoute =
		        window.allTracks &&
		        window.allTracks[routeIdx]
		            ? window.allTracks[routeIdx]
		            : (
		                currentFile.routes &&
		                currentFile.routes[routeIdx]
		                    ? currentFile.routes[routeIdx]
		                    : currentFile
		            );
		
		    
		    if (
		        currentRoute &&
		        currentRoute.isCombined === true
		    ) {
		        const displayBoxes =
		            tableBody.querySelectorAll(".wpt-display-checkbox");
		
		        displayBoxes.forEach(function(cb) {
		            if (cb) {
		                cb.checked = true;
		            }
		        });
		
		        if (typeof loadRoute === "function") {
		            loadRoute(routeIdx, null);
		        }
		
		        return;
		    }
		
		    const displayBoxes =
		        tableBody.querySelectorAll(".wpt-display-checkbox");
		
		    const nRouteIdx =
		        Number(routeIdx);
		
		    displayBoxes.forEach(function(cb) {
		        if (!cb || cb.disabled) return;
		
		        const originalIdx =
		            parseInt(cb.dataset.idx, 10);
		
		        if (
		            !Number.isFinite(originalIdx) ||
		            !currentFile.waypoints[originalIdx]
		        ) {
		            return;
		        }
		
		        const wpt =
		            currentFile.waypoints[originalIdx];
		
		        if (!Array.isArray(wpt.visibleRouteIndexes)) {
		            wpt.visibleRouteIndexes = [];
		        }
		
		        if (!Array.isArray(wpt.hiddenRouteIndexes)) {
		            wpt.hiddenRouteIndexes = [];
		        }
		
		        wpt.visibleRouteIndexes =
		            wpt.visibleRouteIndexes
		                .map(Number)
		                .filter(function(idx) {
		                    return Number.isFinite(idx);
		                });
		
		        wpt.hiddenRouteIndexes =
		            wpt.hiddenRouteIndexes
		                .map(Number)
		                .filter(function(idx) {
		                    return Number.isFinite(idx);
		                });
		
		        if (cb.checked) {
		            if (!wpt.visibleRouteIndexes.includes(nRouteIdx)) {
		                wpt.visibleRouteIndexes.push(nRouteIdx);
		            }
		
		            wpt.hiddenRouteIndexes =
		                wpt.hiddenRouteIndexes.filter(function(idx) {
		                    return idx !== nRouteIdx;
		                });
		
		        } else {
		            if (!wpt.hiddenRouteIndexes.includes(nRouteIdx)) {
		                wpt.hiddenRouteIndexes.push(nRouteIdx);
		            }
		
		            wpt.visibleRouteIndexes =
		                wpt.visibleRouteIndexes.filter(function(idx) {
		                    return idx !== nRouteIdx;
		                });
		        }
		    });
		
		    
		    if (Array.isArray(currentFile.routes)) {
		        currentFile.routes.forEach(function(route) {
		            if (route) {
		                route.waypoints =
		                    currentFile.waypoints;
		            }
		        });
		    }
		
		    if (Array.isArray(window.allTracks)) {
		        window.allTracks.forEach(function(route) {
		            if (route) {
		                route.waypoints =
		                    currentFile.waypoints;
		            }
		        });
		    }
		
		    if (typeof syncWaypointsToFile === "function") {
		        syncWaypointsToFile(currentFile);
		    }
		
		    if (typeof rebuildXmlFromWaypoints === "function") {
		        rebuildXmlFromWaypoints(currentFile);
		    }
		
		    
		    if (typeof loadRoute === "function") {
		        loadRoute(routeIdx, null);
		
		    } else if (typeof window.refreshWaypointMarkersOnly === "function") {
		        window.refreshWaypointMarkersOnly(routeIdx, null);
		    }
		
		    if (typeof updateWptIconStatus === "function") {
		        updateWptIconStatus();
		    }
		};

    const suppressOneNativeClick = function(box) {
        const suppressNextClick = function(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
        };

        box.addEventListener(
            "click",
            suppressNextClick,
            {
                once: true,
                capture: true
            }
        );
    };

    const handleStart = function(e) {
        const target =
            e.target;

        const row =
            target.closest("tr");

        if (!row) return;

        const deleteCheckbox =
            target.closest(".wpt-checkbox");

        const displayCheckbox =
            target.closest(".wpt-display-checkbox");

        if (
            displayCheckbox &&
            displayCheckbox.disabled
        ) {
            return;
        }

        if (displayCheckbox) {
            wptDragMode = "display";
        } else if (deleteCheckbox) {
            wptDragMode = "delete";
        } else {
            return;
        }

        const allBoxes =
            getBoxesByMode(wptDragMode);

        if (!allBoxes || allBoxes.length === 0) return;

        isWptDragging = true;
        wptDragStartPos = row.sectionRowIndex;

        wptInitialStates =
            Array.from(allBoxes).map(function(cb) {
                return cb.checked;
            });

        const startBox =
            allBoxes[wptDragStartPos];

        if (!startBox) return;

        
        wptDragTargetState =
            !startBox.checked;

        startBox.checked =
            wptDragTargetState;

        
        suppressOneNativeClick(startBox);

        if (wptDragMode === "delete") {
            if (typeof updateSelectedCount === "function") {
                updateSelectedCount();
            }
        }

        if (e.type === "mousedown") {
            window.addEventListener("mousemove", handleMove);
            window.addEventListener("mouseup", handleEnd, { once: true });
        } else if (e.type === "touchstart") {
            window.addEventListener("touchmove", handleMove, { passive: false });
            window.addEventListener("touchend", handleEnd, { once: true });
        }

        e.preventDefault();
        e.stopPropagation();

        if (typeof e.stopImmediatePropagation === "function") {
            e.stopImmediatePropagation();
        }
    };

    const handleMove = function(e) {
        if (!isWptDragging) return;

        let targetRow;

        if (e.type === "touchmove") {
            const touch =
                e.touches[0];

            const element =
                document.elementFromPoint(
                    touch.clientX,
                    touch.clientY
                );

            targetRow =
                element
                    ? element.closest("tr")
                    : null;

        } else {
            targetRow =
                e.target.closest("tr");
        }

        if (!targetRow) return;

        const currentPos =
            targetRow.sectionRowIndex;

        const allBoxes =
            getBoxesByMode(wptDragMode);

        if (
            !allBoxes ||
            wptDragStartPos === -1 ||
            !allBoxes[wptDragStartPos]
        ) {
            return;
        }

        const start =
            Math.min(wptDragStartPos, currentPos);

        const end =
            Math.max(wptDragStartPos, currentPos);

        allBoxes.forEach(function(cb, i) {
            if (!cb) return;

            if (
                wptDragMode === "display" &&
                cb.disabled
            ) {
                return;
            }

            if (i >= start && i <= end) {
                cb.checked =
                    wptDragTargetState;
            } else {
                cb.checked =
                    wptInitialStates[i];
            }
        });

        if (wptDragMode === "delete") {
            if (typeof updateSelectedCount === "function") {
                updateSelectedCount();
            }
        }

        if (e.type === "touchmove") {
            e.preventDefault();
        }
    };

    const handleEnd = function() {
        if (!isWptDragging) return;

        const endedMode =
            wptDragMode;

        isWptDragging = false;
        wptDragStartPos = -1;
        wptDragMode = null;

        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("touchmove", handleMove);

        if (endedMode === "display") {
            applyDisplayCheckboxStates();
        }

        if (endedMode === "delete") {
            setTimeout(function() {
                if (typeof updateSelectedCount === "function") {
                    updateSelectedCount();
                }
            }, 50);
        }
    };

    tableBody.removeEventListener("mousedown", handleStart);
    tableBody.addEventListener("mousedown", handleStart);

    tableBody.removeEventListener("touchstart", handleStart);
    tableBody.addEventListener("touchstart", handleStart, { passive: false });
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
		
		    const command =
		        this.undoStack.pop();
		
		    if (command && command.fileIndex !== undefined) {
		        window.currentMultiIndex =
		            command.fileIndex;
		    }
		
		    command.undo();
		
		    this.redoStack.push(command);
		
		    if (
		        !command.skipAutoLoadRouteAfterUndo &&
		        typeof loadRoute === 'function'
		    ) {
		        loadRoute(
		            window.currentActiveIndex || 0
		        );
		    }
		
		    if (typeof renderMultiGpxButtons === "function") {
		        renderMultiGpxButtons();
		    }
		
		    if (typeof updateRouteSelectDropdown === "function") {
		        updateRouteSelectDropdown();
		    }
		
				const hasAnyTrackDataAfterUndo =
				    Array.isArray(window.multiGpxStack) &&
				    window.multiGpxStack.some(function(file) {
				        if (!file) return false;
				
				        if (
				            Array.isArray(file.points) &&
				            file.points.length > 0
				        ) {
				            return true;
				        }
				
				        if (
				            Array.isArray(file.segments) &&
				            file.segments.length > 0
				        ) {
				            return true;
				        }
				
				        if (Array.isArray(file.routes)) {
				            return file.routes.some(function(route) {
				                if (!route || route.isCombined === true) {
				                    return false;
				                }
				
				                return (
				                    (
				                        Array.isArray(route.points) &&
				                        route.points.length > 0
				                    ) ||
				                    (
				                        Array.isArray(route.segments) &&
				                        route.segments.length > 0
				                    )
				                );
				            });
				        }
				
				        return false;
				    });
				
				if (hasAnyTrackDataAfterUndo) {
				    if (typeof renderRouteInfo === "function") {
				        renderRouteInfo();
				    }
				
				} else {
				    const routeSummary =
				        document.getElementById("routeSummary");
				
				    if (routeSummary) {
				        routeSummary.innerHTML =
				            "";
				    }
				
				    if (typeof clearRouteDirectionMarkers === "function") {
				        clearRouteDirectionMarkers();
				    }
				
				    if (window.chart) {
				        window.chart.destroy();
				        window.chart =
				            null;
				    }
				
				    const chartContainer =
				        document.getElementById("chartContainer");
				
				    if (chartContainer) {
				        chartContainer.style.setProperty(
				            "display",
				            "none",
				            "important"
				        );
				    }
				
				    const tipLabel =
				        document.getElementById("chartTipToggleLabel");
				
				    if (tipLabel) {
				        tipLabel.style.setProperty(
				            "display",
				            "none",
				            "important"
				        );
				    }
				
				    const toggleChartBtn =
				        document.getElementById("toggleChartBtn");
				
				    if (toggleChartBtn) {
				        toggleChartBtn.style.setProperty(
				            "display",
				            "none",
				            "important"
				        );
				
				        toggleChartBtn.textContent =
				            "展開高度表";
				    }
				
				    if (typeof trackPoints !== "undefined") {
				        trackPoints =
				            [];
				    }
				
				    window.trackPoints =
				        [];
				}
		
		    if (typeof updateWptIconStatus === "function") {
		        updateWptIconStatus();
		    }
		
		    if (typeof window.refreshGpxManagerIfOpen === "function") {
		        window.refreshGpxManagerIfOpen();
		    }
		
		    this.updateUI();
		}
		
		redo() {
		    if (this.redoStack.length === 0) return;
		
		    this.clearMapMarkers();
		
		    const command =
		        this.redoStack.pop();
		
		    if (command && command.fileIndex !== undefined) {
		        window.currentMultiIndex =
		            command.fileIndex;
		    }
		
		    if (command && typeof command.redo === "function") {
		        command.redo();
		    } else {
		        command.do();
		    }
		
		    this.undoStack.push(command);
		
		    if (
		        !command.skipAutoLoadRouteAfterUndo &&
		        typeof loadRoute === 'function'
		    ) {
		        loadRoute(
		            window.currentActiveIndex || 0
		        );
		    }
		
		    if (typeof renderMultiGpxButtons === "function") {
		        renderMultiGpxButtons();
		    }
		
		    if (typeof updateRouteSelectDropdown === "function") {
		        updateRouteSelectDropdown();
		    }
		
		    if (typeof renderRouteInfo === "function") {
		        renderRouteInfo();
		    }
		
		    if (typeof updateWptIconStatus === "function") {
		        updateWptIconStatus();
		    }
		
		    if (typeof window.refreshGpxManagerIfOpen === "function") {
		        window.refreshGpxManagerIfOpen();
		    }
		
		    this.updateUI();
		}

    clearMapMarkers() {
		    if (typeof map === 'undefined') return;
		
		    if (
		        window.activeFocusCircle &&
		        map.hasLayer(window.activeFocusCircle)
		    ) {
		        map.removeLayer(window.activeFocusCircle);
		    }
		
		    window.activeFocusCircle = null;
		
		    if (
		        window.activeRouteHaloLayer &&
		        map.hasLayer(window.activeRouteHaloLayer)
		    ) {
		        map.removeLayer(window.activeRouteHaloLayer);
		    }
		
		    window.activeRouteHaloLayer = null;
		
		    if (
		        window.activeRouteLayer &&
		        map.hasLayer(window.activeRouteLayer)
		    ) {
		        map.removeLayer(window.activeRouteLayer);
		    }
		
		    window.activeRouteLayer = null;
		
		    if (
		        window.splitRouteHitLayer &&
		        map.hasLayer(window.splitRouteHitLayer)
		    ) {
		        map.removeLayer(window.splitRouteHitLayer);
		    }
		
		    window.splitRouteHitLayer = null;
		
				if (Array.isArray(window.routePreviewLayers)) {
				    window.routePreviewLayers.forEach(function(layer) {
				        if (
				            layer &&
				            map.hasLayer(layer)
				        ) {
				            map.removeLayer(layer);
				        }
				    });
				}
				
				window.routePreviewLayers = [];
				
				if (
				    typeof markers !== "undefined" &&
				    Array.isArray(markers)
				) {
				    markers.forEach(function(marker) {
				        if (
				            marker &&
				            map.hasLayer(marker)
				        ) {
				            map.removeLayer(marker);
				        }
				    });
				
				    markers = [];
				}
		
		    map.eachLayer(function(layer) {
		        if (!layer || !layer.options) return;
		
		        if (
		            layer instanceof L.CircleMarker &&
		            layer.options.radius === 7
		        ) {
		            map.removeLayer(layer);
		            return;
		        }
		
		        if (layer instanceof L.Polyline) {
		            const color =
		                String(layer.options.color || "").toLowerCase();
		
		            const weight =
		                Number(layer.options.weight || 0);
		
		            const opacity =
		                Number(layer.options.opacity || 0);
		
		            const isWhiteHalo =
		                (
		                    color === "#ffffff" ||
		                    color === "white" ||
		                    color === "rgb(255,255,255)" ||
		                    color === "rgb(255, 255, 255)"
		                ) &&
		                weight >= 8 &&
		                opacity >= 0.5;
		
		            if (isWhiteHalo) {
		                map.removeLayer(layer);
		            }
		        }
		    });
		
		    if (window.wptLayer) {
		        window.wptLayer.clearLayers();
		    }
		}

    updateUI() {
    const ub = document.getElementById('undoBtn');
    const rb = document.getElementById('redoBtn');

    if (ub) {
        
        if (this.undoStack.length > 0) {
            ub.classList.remove('disabled');
            ub.removeAttribute('disabled');
        } else {
            ub.classList.add('disabled');
            ub.setAttribute('disabled', 'disabled');
        }
        
        
        const u = this.getBtnState('undo');
        ub.style.setProperty('color', u.color, 'important');
        ub.style.setProperty('opacity', u.opacity, 'important');
    }

    if (rb) {
        
        if (this.redoStack.length > 0) {
            rb.classList.remove('disabled');
            rb.removeAttribute('disabled');
        } else {
            rb.classList.add('disabled');
            rb.setAttribute('disabled', 'disabled');
        }
        
        const r = this.getBtnState('redo');
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

    
    const resetPageAndMapOffset = function() {
        document.documentElement.scrollLeft = 0;
        document.body.scrollLeft = 0;

        document.documentElement.style.marginLeft = "0px";
        document.documentElement.style.transform = "";

        document.body.style.marginLeft = "0px";
        document.body.style.transform = "";
        document.body.style.left = "0px";
        document.body.style.right = "0px";

        const mapEl =
            document.getElementById("map");

        if (mapEl) {
            mapEl.style.left = "0px";
            mapEl.style.right = "0px";
            mapEl.style.marginLeft = "0px";
            mapEl.style.marginRight = "0px";
            mapEl.style.transform = "";
        }
    };

    
    const closeConfirmAndRestore = function(callback) {
        modal.style.display = "none";

        
        document.documentElement.style.overflow = "";
        document.body.style.overflow = "";

        
        resetPageAndMapOffset();

        if (
            typeof map !== "undefined" &&
            map
        ) {
            setTimeout(function() {
                if (typeof map.invalidateSize === "function") {
                    map.invalidateSize();
                }

                if (typeof map.panBy === "function") {
                    map.panBy([0, 0], {
                        animate: false
                    });
                }
            }, 50);
        }

        if (callback) {
            callback();
        }
    };

    const h3Tag = modal.querySelector('h3');
    if (h3Tag) {
        h3Tag.innerText = title;
        h3Tag.style.textAlign = "center";
        h3Tag.style.fontSize = "20px";
        h3Tag.style.fontWeight = "700";
        h3Tag.style.margin = "0 0 14px 0";
        h3Tag.style.color = "#2c3e50";
    }

    const pTag = modal.querySelector('p');
    if (pTag) {
        pTag.innerHTML = message;
        pTag.style.textAlign = "center";
        pTag.style.fontSize = "15px";
        pTag.style.lineHeight = "1.7";
        pTag.style.color = "#444";
        pTag.style.margin = "0 0 18px 0";
    }

    const confirmBtn = document.getElementById('modalDeleteConfirm');
    const cancelBtn = document.getElementById('modalDeleteCancel');

    if (confirmBtn) {
        confirmBtn.innerText = btnText;
        confirmBtn.style.fontSize = "15px";
        confirmBtn.style.fontWeight = "600";
        confirmBtn.style.padding = "9px 18px";
        confirmBtn.style.borderRadius = "8px";
    }

    if (cancelBtn) {
        cancelBtn.innerText = "取消";
        cancelBtn.style.fontSize = "15px";
        cancelBtn.style.fontWeight = "600";
        cancelBtn.style.padding = "9px 18px";
        cancelBtn.style.borderRadius = "8px";
    }

    const oldExtraBtn = document.getElementById("modalThirdChoiceBtn");
    if (oldExtraBtn) {
        oldExtraBtn.remove();
    }

    const btnParent = confirmBtn && confirmBtn.parentNode;
    if (btnParent) {
        btnParent.style.display = "flex";
        btnParent.style.justifyContent = "center";
        btnParent.style.alignItems = "center";
        btnParent.style.gap = "8px";
        btnParent.style.flexWrap = "wrap";
    }

    modal.style.display = 'flex';

    
    resetPageAndMapOffset();

    
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    
    modal.style.touchAction = "none";

    modal.onwheel = function(e) {
        e.preventDefault();
    };

    modal.ontouchmove = function(e) {
        e.preventDefault();
    };

    if (typeof L !== "undefined" && L.DomEvent) {
        L.DomEvent.disableClickPropagation(modal);
        L.DomEvent.disableScrollPropagation(modal);
    }

    if (confirmBtn) {
        confirmBtn.onclick = function() {
            closeConfirmAndRestore(onConfirm);
        };
    }

    if (cancelBtn) {
        cancelBtn.onclick = function() {
            closeConfirmAndRestore(onCancel);
        };
    }
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
            const stackIdx =
						    window.currentMultiIndex || 0;
						
						const currentFile =
						    window.multiGpxStack &&
						    window.multiGpxStack[stackIdx];
						
						const shouldShowRouteSelect =
						    currentFile &&
						    Array.isArray(currentFile.routes) &&
						    currentFile.routes.length > 1;
						
						if (shouldShowRouteSelect) {
						    routeSelectContainer.style.cssText = `
						        display: block !important;
						        position: absolute !important;
						        top: 15px !important;
						        left: 55px !important;
						        z-index: 900 !important;
						        background: white !important; 
						        padding: 4px 12px !important;
						        border-radius: 20px !important;
						        color: #000000 !important;
						        max-width: 240px !important;
						        font-size: 14px !important; 
						        border: 1px solid rgba(255,255,255,0.3) !important;
						        box-shadow: 0 2px 6px rgba(0,0,0,0.3) !important;
						    `;
						} else {
						    routeSelectContainer.style.setProperty("display", "none", "important");
						    routeSelectContainer.style.visibility = "hidden";
						    routeSelectContainer.style.pointerEvents = "none";
						    routeSelectContainer.style.opacity = "0";
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
									
									    
									    if (
									        modal.id === 'gpxManageModal' &&
									        el.classList.contains('gpx-subroute-text')
									    ) {
									        el.style.setProperty('font-size', '14px', 'important');
									        el.style.setProperty('line-height', '1.3', 'important');

									        return;
									    }
									
									    if (
									        modal.id === 'gpxManageModal' &&
									        el.classList.contains('gpx-subroute-meta')
									    ) {
									        el.style.setProperty('font-size', '13px', 'important');
									        el.style.setProperty('line-height', '1.3', 'important');
									        return;
									    }
									
									    if (
									        modal.id === 'gpxManageModal' &&
									        el.classList.contains('gpx-subroute-badge')
									    ) {
									        el.style.setProperty('font-size', '13px', 'important');
									        el.style.setProperty('line-height', '1.2', 'important');
									        return;
									    }
									
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
    
    if (sideToolbar) {
    sideToolbar.addEventListener("mousedown", function() {
    }, true);

    sideToolbar.addEventListener("touchstart", function() {
    }, true);
}

    if (!sideToolbar) return;

    const isFirstRender =
        sideToolbar.innerHTML.trim() === "";

    if (isFirstRender) {
        sideToolbar.innerHTML = `
            <div id="side-tool-container" style="display: flex; flex-direction: column; gap: 10px; align-items: center; padding: 5px;">
                <button type="button" id="exportPdfMapBtn" class="side-tool-btn" title="匯出 PDF 地圖">
								    <span class="material-icons">picture_as_pdf</span>
								</button>
                
                <button type="button" id="drawModeBtn" class="side-tool-btn" title="開啟繪製模式">
                    <span class="material-icons">draw</span>
                </button>
                
                <button type="button" id="drawMethodBtn" class="side-tool-btn" title="切換直線/手繪" style="display:none !important; background:#fffbe6;">
                    <span class="material-icons" id="drawMethodIcon">gesture</span>
                </button>
                
                <button type="button" id="sideWptNameBtn" class="side-tool-btn disabled" title="顯示/隱藏航點名稱">
                    <span class="material-icons" id="sideWptIcon">visibility</span>
                </button>
                
                <button type="button" id="undoBtn" class="side-tool-btn disabled" title="復原 (Undo)">
                    <span class="material-icons">undo</span>
                </button>
                <button type="button" id="redoBtn" class="side-tool-btn disabled" title="重做 (Redo)">
                    <span class="material-icons">redo</span>
                </button>
            </div>
        `;

        const btns = sideToolbar.querySelectorAll('.side-tool-btn');
        btns.forEach(btn => {
            L.DomEvent.disableClickPropagation(btn);
            L.DomEvent.disableScrollPropagation(btn);
        });

        const drawBtn = document.getElementById('drawModeBtn');
        const methodBtn = document.getElementById('drawMethodBtn');
        const methodIcon = document.getElementById('drawMethodIcon');

				drawBtn.onclick = function(e) {
				    L.DomEvent.stopPropagation(e);
				
				    
				    if (isDrawingMode) {
				        isDrawingMode =
				            false;
				
				        isScribbling =
				            false;
				
				        tempDrawPoints =
				            [];
				
				        lastScribbleLatLng =
				            null;
				
				        
				        drawMethod =
				            "scribble";
				
				        preScribbleStackLength =
				            null;
				
				        preScribblePointLength =
				            null;
				
				        window.drawTargetMode =
				            null;
				
				        const toast =
				            document.getElementById("map-toast");
				
				        if (toast) {
				            toast.style.opacity =
				                "0";
				        }
				
				        if (window.mapToastTimer) {
				            clearTimeout(window.mapToastTimer);
				            window.mapToastTimer =
				                null;
				        }
				
				        window.currentMapToast =
				            null;
				
				        this.style.setProperty(
				            "background",
				            "white",
				            "important"
				        );
				
				        this.style.setProperty(
				            "color",
				            "#5f6368",
				            "important"
				        );
				
				        const methodBtn =
				            document.getElementById("drawMethodBtn");
				
				        if (methodBtn) {
				            methodBtn.style.display =
				                "none";
				        }
				
				        const methodIcon =
				            document.getElementById("drawMethodIcon");
				
				        if (methodIcon) {
				            methodIcon.innerText =
				                "gesture";
				        }
				
				        const mapEl =
				            document.getElementById("map");
				
				        if (mapEl) {
				            mapEl.style.cursor =
				                "";
				        }
				
				        if (map && map.dragging) {
				            map.dragging.enable();
				        }
				
				        if (map && map.boxZoom) {
				            map.boxZoom.enable();
				        }
				
				        return;
				    }
				
				    
				    const stackBefore =
				        window.multiGpxStack ||
				        multiGpxStack ||
				        [];
				
				    const stackLenBefore =
				        Array.isArray(stackBefore)
				            ? stackBefore.length
				            : 0;
				
				    const undoLenBefore =
				        (
				            typeof historyManager !== "undefined" &&
				            historyManager &&
				            Array.isArray(historyManager.undoStack)
				        )
				            ? historyManager.undoStack.length
				            : 0;
				
				    const canStart =
				        prepareDrawingModeStart();
				
				    if (canStart === "pending") {
				        return;
				    }
				
				    if (!canStart) {
				        return;
				    }
				
				    
				    const stackAfterPrepare =
				        window.multiGpxStack ||
				        multiGpxStack ||
				        [];
				
				    const undoLenAfterPrepare =
				        (
				            typeof historyManager !== "undefined" &&
				            historyManager &&
				            Array.isArray(historyManager.undoStack)
				        )
				            ? historyManager.undoStack.length
				            : undoLenBefore;
				
				    if (
				        stackLenBefore === 0 &&
				        Array.isArray(stackAfterPrepare) &&
				        stackAfterPrepare.length === 1 &&
				        undoLenAfterPrepare === undoLenBefore
				    ) {
				        const maybeAutoBlank =
				            stackAfterPrepare[0];
				
				        const isAutoBlank =
				            maybeAutoBlank &&
				            (
				                maybeAutoBlank.isBlankProject === true ||
				                maybeAutoBlank.isDrawTrack === true ||
				                maybeAutoBlank.isHandDrawRoute === true ||
				                String(maybeAutoBlank.name || "").includes("自訂路線")
				            );
				
				        if (isAutoBlank) {
				            if (
				                maybeAutoBlank.layer &&
				                map &&
				                map.hasLayer(maybeAutoBlank.layer)
				            ) {
				                map.removeLayer(maybeAutoBlank.layer);
				            }
				
				            if (
				                maybeAutoBlank.layerGroup &&
				                map &&
				                map.hasLayer(maybeAutoBlank.layerGroup)
				            ) {
				                map.removeLayer(maybeAutoBlank.layerGroup);
				            }
				
				            stackAfterPrepare.splice(
				                0,
				                1
				            );
				
				            window.multiGpxStack =
				                stackAfterPrepare;
				
				            try {
				                multiGpxStack =
				                    stackAfterPrepare;
				            } catch (err) {}
				
				            window.allTracks =
				                [];
				
				            try {
				                allTracks =
				                    [];
				            } catch (err) {}
				
				            window.trackPoints =
				                [];
				
				            try {
				                trackPoints =
				                    [];
				            } catch (err) {}
				
				            if (
				                typeof polyline !== "undefined" &&
				                polyline &&
				                typeof polyline.setLatLngs === "function"
				            ) {
				                polyline.setLatLngs([]);
				            }
				        }
				    }
				
						activateDrawingModeUi();
						
						
						isScribbling =
						    false;
						
						tempDrawPoints =
						    [];
						
						lastScribbleLatLng =
						    null;
						
						drawMethod =
						    "scribble";
						
						preScribbleStackLength =
						    null;
						
						preScribblePointLength =
						    null;
						
						window.drawTargetMode =
						    null;
						
						
						const activeFileIdx =
						    typeof window.currentMultiIndex === "number"
						        ? window.currentMultiIndex
						        : 0;
						
						const activeFile =
						    window.multiGpxStack &&
						    window.multiGpxStack[activeFileIdx];
						
						if (activeFile) {
						    window.currentMultiIndex =
						        activeFileIdx;
						
						    if (
						        !Array.isArray(activeFile.routes) ||
						        activeFile.routes.length === 0
						    ) {
						        window.currentActiveIndex =
						            0;
						
						        window.allTracks =
						            [activeFile];
						
						        try {
						            allTracks =
						                window.allTracks;
						        } catch (err) {}
						
						        window.trackPoints =
						            Array.isArray(activeFile.points)
						                ? activeFile.points
						                : [];
						
						        try {
						            trackPoints =
						                window.trackPoints;
						        } catch (err) {}
						
						    } else {
						        const safeRouteIdx =
						            Math.max(
						                0,
						                Math.min(
						                    window.currentActiveIndex || 0,
						                    activeFile.routes.length - 1
						                )
						            );
						
						        window.currentActiveIndex =
						            safeRouteIdx;
						
						        if (typeof syncDrawingGlobals === "function") {
						            syncDrawingGlobals(
						                activeFile,
						                safeRouteIdx
						            );
						        } else {
						            window.allTracks =
						                activeFile.routes;
						
						            try {
						                allTracks =
						                    activeFile.routes;
						            } catch (err) {}
						
						            window.trackPoints =
						                activeFile.routes[safeRouteIdx] &&
						                Array.isArray(activeFile.routes[safeRouteIdx].points)
						                    ? activeFile.routes[safeRouteIdx].points
						                    : [];
						
						            try {
						                trackPoints =
						                    window.trackPoints;
						            } catch (err) {}
						        }
						    }
						
						    if (typeof updateRouteSelectDropdown === "function") {
						        updateRouteSelectDropdown();
						    }
						
						    const routeSelect =
						        document.getElementById("routeSelect");
						
						    if (routeSelect) {
						        routeSelect.value =
						            String(window.currentActiveIndex || 0);
						    }
						}
				
				    const methodIcon =
				        document.getElementById("drawMethodIcon");
				
				    if (methodIcon) {
				        methodIcon.innerText =
				            "gesture";
				    }
				
				    if (
				        typeof historyManager !== "undefined" &&
				        historyManager &&
				        typeof historyManager.updateUI === "function"
				    ) {
				        historyManager.updateUI();
				    }
				    
				    if (typeof installPdfExportFeature === "function") {
						    installPdfExportFeature();
						}
						
						if (typeof installPdfAreaSelectMapEvents === "function") {
						    installPdfAreaSelectMapEvents();
						}
						
						};
				

        methodBtn.onclick = function(e) {
            L.DomEvent.stopPropagation(e);

            drawMethod = (drawMethod === 'scribble' ? 'click' : 'scribble');

            methodIcon.innerText = (drawMethod === 'click' ? 'timeline' : 'gesture');

            if (drawMethod === 'scribble') {
                map.dragging.disable();
                map.boxZoom.disable();

                if (typeof showMapToast === 'function') {
                    showMapToast("手繪模式：按住拖曳繪製\n\n電腦：按住 Ctrl 移動地圖\n手機：兩指按住移動地圖");
                }

            } else {
                map.dragging.enable();
                map.boxZoom.enable();

                if (typeof showMapToast === 'function') {
                    showMapToast("直線模式：點擊新增點");
                }
            }
        };
        

        document.getElementById('sideWptNameBtn').onclick = (e) => toggleWptNames();
        document.getElementById('undoBtn').onclick = (e) => historyManager.undo();
        document.getElementById('redoBtn').onclick = (e) => historyManager.redo();
    }

    
    const hasAnyWaypoints =
        (
            window.multiGpxStack &&
            Array.isArray(window.multiGpxStack) &&
            window.multiGpxStack.some(item =>
                item &&
                Array.isArray(item.waypoints) &&
                item.waypoints.length > 0
            )
        ) ||
        (
            typeof allTracks !== "undefined" &&
            Array.isArray(allTracks) &&
            allTracks.some(track =>
                track &&
                Array.isArray(track.waypoints) &&
                track.waypoints.length > 0
            )
        );

    if (
        (isFirstRender || hasAnyWaypoints) &&
        typeof updateWptIconStatus === 'function'
    ) {
        updateWptIconStatus();
    }

    if (
        window.historyManager &&
        typeof historyManager.updateUI === 'function'
    ) {
        historyManager.updateUI();
    }
}


document.addEventListener('DOMContentLoaded', renderSideToolbar);

function updateWptIconStatus() {
    const sideBtn = document.getElementById('side-toolbar')?.querySelector('#sideWptNameBtn');
    if (!sideBtn) return;

    const stackIdx = window.currentMultiIndex || 0;
    const activeIdx = window.currentActiveIndex || 0;
    const currentStack = (window.multiGpxStack && window.multiGpxStack[stackIdx]);
    const currentRoute = (window.allTracks && window.allTracks[activeIdx]);
    
    const wptTableBody = document.getElementById('wptTableBody');
    const hasVisibleWaypoints = (wptTableBody && wptTableBody.rows.length > 0) || 
                                 !!(currentStack?.waypoints?.length > 0) || 
                                 !!(currentRoute?.waypoints?.length > 0);

    if (hasVisibleWaypoints) {
        sideBtn.classList.remove('disabled');
        sideBtn.title = "顯示/隱藏航點名稱";
        
        const isActive = (typeof showWptNameAlways !== 'undefined' && showWptNameAlways);
        sideBtn.style.setProperty('background', isActive ? "#1a73e8" : "white", 'important');
        sideBtn.style.setProperty('color', isActive ? "white" : "#5f6368", 'important');
        const icon = sideBtn.querySelector('.material-icons');
        if (icon) icon.innerText = isActive ? "visibility" : "visibility_off";
    } else {
        sideBtn.classList.add('disabled');
        sideBtn.title = "目前無航點可顯示";
        sideBtn.style.setProperty('background', "white", 'important');
        sideBtn.style.setProperty('color', "#ccc", 'important');
        const icon = sideBtn.querySelector('.material-icons');
        if (icon) icon.innerText = "visibility_off";
    }
}

window.skipUnsavedCheck = false;

window.confirmIfChanged = function(action, customTitle = "是否確定離開") {

    const hasChanges = typeof historyManager !== 'undefined' && 
                       historyManager.undoStack.length > 0;

    if (hasChanges) {
        window.showAppConfirm(
            customTitle,
            "偵測到您已編輯過資料，請確認是否已匯出儲存。若繼續操作，目前的編輯內容將不會保留。<br><br>確定繼續嗎？",
            function() {
                window.skipUnsavedCheck = true; 
                action();
            },
            null,
            "確定"
        );
    } else {

        action();
    }
};


window.addEventListener('beforeunload', function (e) {
    if (window.skipUnsavedCheck) return;

    const hasChanges = typeof historyManager !== 'undefined' && 
                       historyManager.undoStack.length > 0;
    
    if (hasChanges) {
        e.preventDefault();
        e.returnValue = ''; 
    }
});


function addPointToTrack(latlng, useHistory = true) {

    if (
        !window.multiGpxStack ||
        window.multiGpxStack.length === 0
    ) {
        ensureCustomDrawTrack();
    }

    const {
        currentFile,
        targetTrack,
        stackIdx,
        routeIdx
    } = getActiveDrawingTarget();

    if (!currentFile || !targetTrack) return;

    if (!Array.isArray(targetTrack.points)) targetTrack.points = [];
    if (!Array.isArray(targetTrack.segments)) targetTrack.segments = [];

    let totalDistance = 0;

    if (targetTrack.points.length > 0) {
        const prev = targetTrack.points[targetTrack.points.length - 1];

        totalDistance = prev.distance || 0;

        totalDistance += calculateDistance(
            prev.lat,
            prev.lon,
            latlng.lat,
            latlng.lng
        );
    }

    const p = {
        lat: latlng.lat,
        lon: latlng.lng,
        ele: 0,
        time: new Date().toISOString(),
        timeLocal: formatDate(new Date()),
        distance: totalDistance
    };

    const command = {

        point: p,
        currentFile,
        targetTrack,
        fileIndex: stackIdx,
        routeIndex: routeIdx,
        skipAutoLoadRouteAfterUndo: true,

        do: function () {

            this.targetTrack.points.push(this.point);

            this.targetTrack.segments = [
                this.targetTrack.points.map(pt => [pt.lat, pt.lon])
            ];

            if (
                this.currentFile &&
                !this.currentFile.isDrawTrack &&
                typeof rebuildCombinedRouteForFile === 'function'
            ) {
                rebuildCombinedRouteForFile(this.currentFile);
            }

            if (
                this.currentFile &&
                this.currentFile.isDrawTrack &&
                this.targetTrack.layer instanceof L.Polyline
            ) {
                this.targetTrack.layer.setLatLngs(this.targetTrack.segments);

                this.targetTrack.layer.setStyle({
                    color: this.targetTrack.color || "#0000FF",
                    weight: 6,
                    opacity: 1,
                    dashArray: null,
                    interactive: true
                });

                
                this.targetTrack.layer.off('click');

                this.targetTrack.layer.on('click', (e) => {
                    if (!e || !e.latlng) return;

                    L.DomEvent.stopPropagation(e);

                    const pts =
                        Array.isArray(this.targetTrack.points)
                            ? this.targetTrack.points
                            : [];

                    if (!pts || pts.length === 0) return;

                    let minD = Infinity;
                    let idx = 0;

                    pts.forEach((pt, pIdx) => {
                        if (!pt) return;

                        const lat =
                            Number(pt.lat);

                        const lon =
                            Number(
                                pt.lon !== undefined
                                    ? pt.lon
                                    : pt.lng
                            );

                        if (
                            !Number.isFinite(lat) ||
                            !Number.isFinite(lon)
                        ) {
                            return;
                        }

                        const d =
                            Math.sqrt(
                                Math.pow(lat - e.latlng.lat, 2) +
                                Math.pow(lon - e.latlng.lng, 2)
                            );

                        if (d < minD) {
                            minD = d;
                            idx = pIdx;
                        }
                    });

                    
                    if (minD * 111000 > 50) {
                        return;
                    }

                    window.trackPoints = pts;
                    trackPoints = pts;

                    const progressBar =
                        document.getElementById('gpxProgressBar');

                    if (progressBar) {
                        progressBar.value = idx;
                        progressBar.dispatchEvent(
                            new Event('input', { bubbles: true })
                        );
                    }

                    if (
                        typeof chart !== "undefined" &&
                        chart
                    ) {
                        const meta =
                            chart.getDatasetMeta(0);

                        const point =
                            meta.data[idx];

                        if (point) {
                            chart.setActiveElements([
                                {
                                    datasetIndex: 0,
                                    index: idx
                                }
                            ]);

                            chart.tooltip.setActiveElements(
                                [
                                    {
                                        datasetIndex: 0,
                                        index: idx
                                    }
                                ],
                                {
                                    x: point.x,
                                    y: point.y
                                }
                            );

                            chart.update('none');
                        }
                    }

                    if (!hoverMarker) {
                        hoverMarker =
                            L.circleMarker(
                                [
                                    pts[idx].lat,
                                    pts[idx].lon
                                ],
                                {
                                    radius: 7,
                                    color: '#ffffff',
                                    weight: 2,
                                    fillColor: '#1a73e8',
                                    fillOpacity: 1,
                                    interactive: false
                                }
                            ).addTo(map);

                    } else if (!map.hasLayer(hoverMarker)) {
                        hoverMarker.addTo(map);
                    }

                    hoverMarker
                        .setLatLng([
                            pts[idx].lat,
                            pts[idx].lon
                        ])
                        .bringToFront();

                    if (typeof showCustomPopup === 'function') {
                        showCustomPopup(
                            idx,
                            "位置資訊",
                            null
                        );
                    }
                });

                if (this.targetTrack.layer.bringToFront) {
                    this.targetTrack.layer.bringToFront();
                }
            }

            window.trackPoints = this.targetTrack.points;
            trackPoints = this.targetTrack.points;

            if (typeof syncTrackToRawGpx === 'function') {
                syncTrackToRawGpx(this.targetTrack);
            }

            window.currentActiveIndex = this.routeIndex;

            const routeSelect = document.getElementById("routeSelect");

            if (
                routeSelect &&
                routeSelect.options &&
                routeSelect.options.length > this.routeIndex
            ) {
                routeSelect.value = String(this.routeIndex);
            }

            loadRoute(this.routeIndex, null);

            if (typeof renderRouteInfo === 'function') {
                renderRouteInfo();
            }
        },

        undo: function () {

            this.targetTrack.points.pop();

            if (!Array.isArray(this.targetTrack.points)) {
                this.targetTrack.points = [];
            }

            if (this.targetTrack.points.length === 0) {
                this.targetTrack.segments = [];
            } else {
                this.targetTrack.segments = [
                    this.targetTrack.points.map(pt => [pt.lat, pt.lon])
                ];
            }

            if (
                this.currentFile &&
                !this.currentFile.isDrawTrack &&
                typeof rebuildCombinedRouteForFile === 'function'
            ) {
                rebuildCombinedRouteForFile(this.currentFile);
            }

            if (
                this.currentFile &&
                this.currentFile.isDrawTrack &&
                this.targetTrack.layer instanceof L.Polyline
            ) {
                this.targetTrack.layer.setLatLngs(this.targetTrack.segments || []);

                this.targetTrack.layer.setStyle({
                    color: this.targetTrack.color || "#0000FF",
                    weight: 6,
                    opacity: this.targetTrack.points.length > 0 ? 1 : 0,
                    dashArray: null,
                    interactive: this.targetTrack.points.length > 0
                });

                
                this.targetTrack.layer.off('click');

                if (this.targetTrack.points.length > 0) {
                    this.targetTrack.layer.on('click', (e) => {
                        if (!e || !e.latlng) return;

                        L.DomEvent.stopPropagation(e);

                        const pts =
                            Array.isArray(this.targetTrack.points)
                                ? this.targetTrack.points
                                : [];

                        if (!pts || pts.length === 0) return;

                        let minD = Infinity;
                        let idx = 0;

                        pts.forEach((pt, pIdx) => {
                            if (!pt) return;

                            const lat =
                                Number(pt.lat);

                            const lon =
                                Number(
                                    pt.lon !== undefined
                                        ? pt.lon
                                        : pt.lng
                                );

                            if (
                                !Number.isFinite(lat) ||
                                !Number.isFinite(lon)
                            ) {
                                return;
                            }

                            const d =
                                Math.sqrt(
                                    Math.pow(lat - e.latlng.lat, 2) +
                                    Math.pow(lon - e.latlng.lng, 2)
                                );

                            if (d < minD) {
                                minD = d;
                                idx = pIdx;
                            }
                        });

                        if (minD * 111000 > 50) {
                            return;
                        }

                        window.trackPoints = pts;
                        trackPoints = pts;

                        const progressBar =
                            document.getElementById('gpxProgressBar');

                        if (progressBar) {
                            progressBar.value = idx;
                            progressBar.dispatchEvent(
                                new Event('input', { bubbles: true })
                            );
                        }

                        if (!hoverMarker) {
                            hoverMarker =
                                L.circleMarker(
                                    [
                                        pts[idx].lat,
                                        pts[idx].lon
                                    ],
                                    {
                                        radius: 7,
                                        color: '#ffffff',
                                        weight: 2,
                                        fillColor: '#1a73e8',
                                        fillOpacity: 1,
                                        interactive: false
                                    }
                                ).addTo(map);

                        } else if (!map.hasLayer(hoverMarker)) {
                            hoverMarker.addTo(map);
                        }

                        hoverMarker
                            .setLatLng([
                                pts[idx].lat,
                                pts[idx].lon
                            ])
                            .bringToFront();

                        if (typeof showCustomPopup === 'function') {
                            showCustomPopup(
                                idx,
                                "位置資訊",
                                null
                            );
                        }
                    });
                }
            }

            window.trackPoints = this.targetTrack.points;
            trackPoints = this.targetTrack.points;

            if (typeof syncTrackToRawGpx === 'function') {
                syncTrackToRawGpx(this.targetTrack);
            }

            window.currentActiveIndex = this.routeIndex;

            loadRoute(this.routeIndex, null);

            if (typeof renderRouteInfo === 'function') {
                renderRouteInfo();
            }
        }
    };

    if (useHistory) {
        historyManager.undoStack.push(command);
        historyManager.redoStack = [];
        command.do();
        historyManager.updateUI();
    } else {
        command.do();
    }
}

function executeCreateNewProject() {
    window.confirmIfChanged(() => {
        const currentUrl = window.location.origin + window.location.pathname;
        const targetUrl = currentUrl + "?drawMode=true";
        
        
        
        window.location.href = targetUrl;
    }, "確定要關閉檔案並開啟新繪製嗎？");
}

window.addEventListener('load', () => {
    const params = new URLSearchParams(window.location.search);
    const isDrawMode = params.get('drawMode');

    if (isDrawMode === 'true') {

        
        setTimeout(() => {
            try {
                
                const btn = document.getElementById('drawModeBtn');
                
                if (btn) {
                    btn.click();

                    setTimeout(() => {
                    }, 500);
                } else {
                }

                window.history.replaceState({}, document.title, window.location.pathname);

            } catch (error) {
            }
        }, 100); 
    } else {
    }
});

function cloneCustomRouteNames(customRouteNames) {
    if (!customRouteNames || typeof customRouteNames !== "object") {
        return null;
    }

    return JSON.parse(JSON.stringify(customRouteNames));
}


function rebuildAndRefreshManagedTrack(fileIdx, routeIdx, shouldSwitchToFile = false) {
    const stack =
        window.multiGpxStack ||
        multiGpxStack ||
        [];

    const currentFile =
        stack[fileIdx];

    if (!currentFile) return;

    if (
        typeof rebuildCombinedRouteForFile === "function" &&
        Array.isArray(currentFile.routes) &&
        currentFile.routes.length > 0 &&
        currentFile.routes[0] &&
        currentFile.routes[0].isCombined === true
    ) {
        rebuildCombinedRouteForFile(currentFile);
    }

    
    if (shouldSwitchToFile) {
        if (
            Array.isArray(currentFile.routes) &&
            currentFile.routes.length > 0
        ) {
            if (routeIdx < 0 || routeIdx >= currentFile.routes.length) {
                routeIdx = 0;
            }
        } else {
            routeIdx = 0;
        }

        window.currentMultiIndex = fileIdx;
        window.currentActiveIndex = routeIdx;

        if (typeof syncDrawingGlobals === "function") {
            syncDrawingGlobals(currentFile, routeIdx);
        } else {
            window.allTracks = currentFile.routes || [currentFile];
            allTracks = window.allTracks;
        }

        if (typeof updateRouteSelectDropdown === "function") {
            updateRouteSelectDropdown();
        }

        const routeSelect =
            document.getElementById("routeSelect");

        if (
            routeSelect &&
            routeSelect.options &&
            routeSelect.options.length > routeIdx
        ) {
            routeSelect.value = String(routeIdx);
        }

        if (typeof loadRoute === "function") {
            loadRoute(routeIdx);
        }

        if (typeof renderRouteInfo === "function") {
            renderRouteInfo();
        }

        if (typeof renderWaypointsAndPeaks === "function") {
            const routeForWpt =
                currentFile.routes && currentFile.routes[routeIdx]
                    ? currentFile.routes[routeIdx]
                    : currentFile;

            renderWaypointsAndPeaks(routeForWpt);
        }

        if (typeof syncProgressBarWithTrack === "function") {
            syncProgressBarWithTrack(true);
        }
    }

    if (typeof renderMultiGpxButtons === "function") {
        renderMultiGpxButtons();
    }

    if (!window.gpxManagerExpanded) {
        window.gpxManagerExpanded = {};
    }

    window.gpxManagerExpanded[fileIdx] = true;

    if (typeof showGpxManagementModal === "function") {
        showGpxManagementModal();
    }

    if (
        typeof historyManager !== "undefined" &&
        historyManager &&
        typeof historyManager.updateUI === "function"
    ) {
        historyManager.updateUI();
    }
}

window.deleteSubRoute = function(fileIdx, routeIdx, options = {}) {
	  if (
		    window.activeRouteHaloLayer &&
		    typeof map !== "undefined" &&
		    map.hasLayer(window.activeRouteHaloLayer)
		) {
		    map.removeLayer(window.activeRouteHaloLayer);
		}
		
		window.activeRouteHaloLayer =
		    null;
		
		if (
		    window.activeRouteLayer &&
		    typeof map !== "undefined" &&
		    map.hasLayer(window.activeRouteLayer)
		) {
		    map.removeLayer(window.activeRouteLayer);
		}
		
		window.activeRouteLayer =
		    null;
		
		if (
		    window.splitRouteHitLayer &&
		    typeof map !== "undefined" &&
		    map.hasLayer(window.splitRouteHitLayer)
		) {
		    map.removeLayer(window.splitRouteHitLayer);
		}
		
		window.splitRouteHitLayer =
		    null;
		
		if (Array.isArray(window.routePreviewLayers)) {
		    window.routePreviewLayers.forEach(function(layer) {
		        if (
		            layer &&
		            typeof map !== "undefined" &&
		            map.hasLayer(layer)
		        ) {
		            map.removeLayer(layer);
		        }
		    });
		
		    window.routePreviewLayers =
		        [];
		}
	
    const deleteOptions =
        options && typeof options === "object"
            ? options
            : {};

    const skipOpenGpxManager =
        deleteOptions.skipOpenGpxManager === true;


    const hideGpxManagerIfNeeded = function() {
        if (!skipOpenGpxManager) return;

        const gpxManageModal =
            document.getElementById("gpxManageModal");

        if (gpxManageModal) {
            gpxManageModal.style.display = "none";
        }
    };

    const stack =
        window.multiGpxStack ||
        multiGpxStack ||
        [];

    const currentFile =
        stack[fileIdx];

    if (!currentFile) {
        alert("找不到要刪除的路線");
        return;
    }

    
    let targetRoute = null;
    let isFileRouteDelete = false;

    if (
        Array.isArray(currentFile.routes) &&
        currentFile.routes[routeIdx]
    ) {
        targetRoute =
            currentFile.routes[routeIdx];

    } else if (
        currentFile.isDrawTrack === true ||
        currentFile.isHandDrawRoute === true ||
        (
            Array.isArray(currentFile.points) &&
            currentFile.points.length > 0
        ) ||
        (
            Array.isArray(currentFile.segments) &&
            currentFile.segments.length > 0
        )
    ) {
        targetRoute =
            currentFile;

        routeIdx = 0;
        isFileRouteDelete = true;
    }

    if (!targetRoute) {
        alert("找不到要刪除的路線");
        return;
    }

    if (targetRoute.isCombined === true) {
        alert("結合路線不能刪除");
        return;
    }

    const routeName =
        targetRoute.displayName ||
        targetRoute.routeDisplayName ||
        targetRoute.name ||
        "路線";

    const activeFileBeforeDelete =
        typeof window.currentMultiIndex === "number"
            ? window.currentMultiIndex
            : 0;

    const activeRouteBeforeDelete =
        typeof window.currentActiveIndex === "number"
            ? window.currentActiveIndex
            : 0;

    const customRouteNamesBefore =
        typeof cloneCustomRouteNames === "function"
            ? cloneCustomRouteNames(currentFile.customRouteNames)
            : (
                currentFile.customRouteNames
                    ? JSON.parse(JSON.stringify(currentFile.customRouteNames))
                    : null
            );

    const clonePoints = function(points) {
        return Array.isArray(points)
            ? points.map(function(p) {
                return { ...p };
            })
            : [];
    };

    const cloneSegments = function(segments) {
        return Array.isArray(segments)
            ? segments.map(function(seg) {
                return Array.isArray(seg)
                    ? seg.map(function(p) {
                        if (Array.isArray(p)) {
                            return p.slice();
                        }

                        if (p && typeof p === "object") {
                            return { ...p };
                        }

                        return p;
                    })
                    : [];
            })
            : [];
    };

    
    const routesBeforeDelete =
        Array.isArray(currentFile.routes)
            ? currentFile.routes.slice()
            : [];

    const filePointsBefore =
        clonePoints(currentFile.points);

    const fileSegmentsBefore =
        cloneSegments(currentFile.segments);

    const targetPointsBefore =
        clonePoints(targetRoute.points);

    const targetSegmentsBefore =
        cloneSegments(targetRoute.segments);

    const fileLayerBefore =
        currentFile.layer || null;

    const fileFlagsBefore = {
        isDrawTrack: currentFile.isDrawTrack,
        isHandDrawRoute: currentFile.isHandDrawRoute,
        isCombined: currentFile.isCombined,
        isWaypointOnly: currentFile.isWaypointOnly,
        routesDeletedByUser: currentFile._routesDeletedByUser
    };

    
    let customRouteNamesAfter = null;

    if (
        !isFileRouteDelete &&
        customRouteNamesBefore
    ) {
        customRouteNamesAfter = {};

        Object.keys(customRouteNamesBefore).forEach(function(key) {
            const oldIdx =
                parseInt(key, 10);

            if (!Number.isFinite(oldIdx)) return;

            if (oldIdx < routeIdx) {
                customRouteNamesAfter[oldIdx] =
                    customRouteNamesBefore[key];

            } else if (oldIdx > routeIdx) {
                customRouteNamesAfter[oldIdx - 1] =
                    customRouteNamesBefore[key];
            }
        });
    }

    const getRealRoutes = function(file) {
        if (
            !file ||
            !Array.isArray(file.routes)
        ) {
            return [];
        }

        return file.routes.filter(function(route) {
            if (!route) return false;
            if (route.isCombined === true) return false;

            return (
                (Array.isArray(route.points) && route.points.length > 0) ||
                (Array.isArray(route.segments) && route.segments.length > 0) ||
                route.isDrawTrack === true ||
                route.isHandDrawRoute === true ||
                route.isMergedRoute === true
            );
        });
    };

		const clearMapWhenNoRoutes = function(file) {
		
		    if (
		        file &&
		        file.layer instanceof L.Polyline
		    ) {
		        if (
		            typeof map !== "undefined" &&
		            map.hasLayer(file.layer)
		        ) {
		            map.removeLayer(file.layer);
		        }
		
		        file.layer = null;
		    }
		
		    if (
		        typeof polyline !== "undefined" &&
		        polyline &&
		        typeof polyline.setLatLngs === "function"
		    ) {
		        polyline.setLatLngs([]);
		    }
		
		    if (Array.isArray(window.routePreviewLayers)) {
		        window.routePreviewLayers.forEach(function(layer) {
		            if (
		                layer &&
		                typeof map !== "undefined" &&
		                map.hasLayer(layer)
		            ) {
		                map.removeLayer(layer);
		            }
		        });
		
		        window.routePreviewLayers = [];
		    }
		
		    if (
		        typeof markers !== "undefined" &&
		        Array.isArray(markers)
		    ) {
		        markers.forEach(function(m) {
		            if (
		                m &&
		                typeof map !== "undefined" &&
		                map.hasLayer(m)
		            ) {
		                map.removeLayer(m);
		            }
		        });
		
		        markers = [];
		    }
		
		    
		
		    if (
		        typeof hoverMarker !== "undefined" &&
		        hoverMarker &&
		        typeof map !== "undefined" &&
		        map.hasLayer(hoverMarker)
		    ) {
		        map.removeLayer(hoverMarker);
		    }
		
		    if (typeof hoverMarker !== "undefined") {
		        hoverMarker = null;
		    }
		
		    if (
		        window.activeFocusCircle &&
		        typeof map !== "undefined" &&
		        map.hasLayer(window.activeFocusCircle)
		    ) {
		        map.removeLayer(window.activeFocusCircle);
		        window.activeFocusCircle = null;
		    }
		
		    const routeSelect =
		        document.getElementById("routeSelect");
		
		    if (routeSelect) {
		        routeSelect.innerHTML = "";
		        routeSelect.value = "";
		    }
		
		    const routeSelectContainer =
		        document.getElementById("routeSelectContainer");
		
		    if (routeSelectContainer) {
		        routeSelectContainer.style.display = "none";
		    }
		
		    const routeSummary =
		        document.getElementById("routeSummary");
		
		    if (routeSummary) {
		        routeSummary.innerHTML =
		            file &&
		            Array.isArray(file.waypoints) &&
		            file.waypoints.length > 0
		                ? "目前只有航點，沒有路線資料"
		                : "目前沒有路線資料";
		    }
		
		    if (window.chart) {
		        window.chart.destroy();
		        window.chart = null;
		    }
		
		    const progressBar =
		        document.getElementById("gpxProgressBar");
		
		    if (progressBar) {
		        progressBar.value = 0;
		        progressBar.max = 0;
		    }
		
		    if (typeof trackPoints !== "undefined") {
		        trackPoints = [];
		    }
		
		    window.trackPoints = [];
		};

    const cleanupFileAfterDelete = function(file) {
        if (!file) return;

        
        if (isFileRouteDelete) {
            file.points = [];
            file.segments = [];

            if (Array.isArray(file.routes)) {
                file.routes = [];
            }

            file.isDrawTrack = false;
            file.isHandDrawRoute = false;
            file.isCombined = false;

            file.isWaypointOnly =
                Array.isArray(file.waypoints) &&
                file.waypoints.length > 0;

            file._routesDeletedByUser = true;

            window.currentActiveIndex = 0;

            window.allTracks = [];

            if (typeof allTracks !== "undefined") {
                allTracks = [];
            }

            clearMapWhenNoRoutes(file);
            return;
        }

        if (!Array.isArray(file.routes)) {
            return;
        }

        const realRoutes =
            getRealRoutes(file);

        
        if (realRoutes.length === 0) {
            file.routes = [];
            file.points = [];
            file.segments = [];

            if (
                file.layer instanceof L.Polyline
            ) {
                if (
                    typeof map !== "undefined" &&
                    map.hasLayer(file.layer)
                ) {
                    map.removeLayer(file.layer);
                }

                file.layer = null;
            }

            file.isDrawTrack = false;
            file.isHandDrawRoute = false;
            file.isCombined = false;

            file.isWaypointOnly =
                Array.isArray(file.waypoints) &&
                file.waypoints.length > 0;

            file._routesDeletedByUser = true;

            window.currentActiveIndex = 0;

            window.allTracks = [];

            if (typeof allTracks !== "undefined") {
                allTracks = [];
            }

            clearMapWhenNoRoutes(file);
        }
    };

		const getNextRouteIndexAfterDelete = function() {
		    if (activeFileBeforeDelete !== fileIdx) {
		        return activeRouteBeforeDelete;
		    }
		
		    if (
		        !Array.isArray(currentFile.routes) ||
		        currentFile.routes.length === 0
		    ) {
		        return 0;
		    }
		
		    
		    let startIdx =
		        routeIdx;
		
		    if (startIdx >= currentFile.routes.length) {
		        startIdx =
		            currentFile.routes.length - 1;
		    }
		
		    
		    for (
		        let i = startIdx;
		        i < currentFile.routes.length;
		        i++
		    ) {
		        if (
		            currentFile.routes[i] &&
		            currentFile.routes[i].isCombined !== true
		        ) {
		            return i;
		        }
		    }
		
		    
		    for (
		        let i = startIdx - 1;
		        i >= 0;
		        i--
		    ) {
		        if (
		            currentFile.routes[i] &&
		            currentFile.routes[i].isCombined !== true
		        ) {
		            return i;
		        }
		    }
		
		    
		    return 0;
		};

    const doDeleteWithHistory = function() {
        const command = {
            managedFileIndex: fileIdx,
            routeIndex: routeIdx,
            skipAutoLoadRouteAfterUndo: true,

            do: function() {
            	  if (
						        window.activeRouteHaloLayer &&
						        typeof map !== "undefined" &&
						        map.hasLayer(window.activeRouteHaloLayer)
						    ) {
						        map.removeLayer(window.activeRouteHaloLayer);
						    }
						
						    window.activeRouteHaloLayer =
						        null;
						
						    if (
						        window.activeRouteLayer &&
						        typeof map !== "undefined" &&
						        map.hasLayer(window.activeRouteLayer)
						    ) {
						        map.removeLayer(window.activeRouteLayer);
						    }
						
						    window.activeRouteLayer =
						        null;
						
						    if (
						        window.splitRouteHitLayer &&
						        typeof map !== "undefined" &&
						        map.hasLayer(window.splitRouteHitLayer)
						    ) {
						        map.removeLayer(window.splitRouteHitLayer);
						    }
						
						    window.splitRouteHitLayer =
						        null;
						
						    if (Array.isArray(window.routePreviewLayers)) {
						        window.routePreviewLayers.forEach(function(layer) {
						            if (
						                layer &&
						                typeof map !== "undefined" &&
						                map.hasLayer(layer)
						            ) {
						                map.removeLayer(layer);
						            }
						        });
						
						        window.routePreviewLayers =
						            [];
						    }
						
						    if (
						        targetRoute &&
						        targetRoute.hitLayer &&
						        typeof map !== "undefined" &&
						        map.hasLayer(targetRoute.hitLayer)
						    ) {
						        map.removeLayer(targetRoute.hitLayer);
						    }
						
						    if (targetRoute) {
						        targetRoute.hitLayer =
						            null;
						    }
						
						    if (
						        targetRoute &&
						        targetRoute.layer &&
						        typeof map !== "undefined" &&
						        map.hasLayer(targetRoute.layer)
						    ) {
						        map.removeLayer(targetRoute.layer);
						    }
						
						    if (targetRoute) {
						        targetRoute.layer =
						            null;
						    }
						
						    if (!currentFile) {
						        return;
						    }
						
						    if (isFileRouteDelete) {
						        targetRoute.points = [];
						        targetRoute.segments = [];
						        
	                } else {
                    if (!Array.isArray(currentFile.routes)) {
                        return;
                    }

                    
                    let deleteIdx =
                        currentFile.routes.indexOf(targetRoute);

                    if (deleteIdx === -1) {
                        if (currentFile.routes[routeIdx] === targetRoute) {
                            deleteIdx = routeIdx;
                        }
                    }

                    if (deleteIdx === -1) {
                        return;
                    }

                    currentFile.routes.splice(deleteIdx, 1);

                    if (customRouteNamesAfter) {
                        currentFile.customRouteNames =
                            typeof cloneCustomRouteNames === "function"
                                ? cloneCustomRouteNames(customRouteNamesAfter)
                                : JSON.parse(JSON.stringify(customRouteNamesAfter));

                    } else if (currentFile.customRouteNames) {
                        delete currentFile.customRouteNames;
                    }
                }

                cleanupFileAfterDelete(currentFile);

                const shouldSwitchToFile =
                    activeFileBeforeDelete === fileIdx;

                const nextIdx =
                    getNextRouteIndexAfterDelete();

                
                if (
                    currentFile &&
                    (
                        !Array.isArray(currentFile.routes) ||
                        currentFile.routes.length === 0
                    )
                ) {
                    window.currentMultiIndex = fileIdx;
                    window.currentActiveIndex = 0;

                    if (typeof renderMultiGpxButtons === "function") {
                        renderMultiGpxButtons();
                    }

                    if (typeof renderWaypointsAndPeaks === "function") {
                        renderWaypointsAndPeaks(currentFile);
                    }

                    if (typeof window.refreshWaypointMarkersOnly === "function") {
                        window.refreshWaypointMarkersOnly(0, null);
                    }

                    
                    if (
                        !skipOpenGpxManager &&
                        typeof showGpxManagementModal === "function"
                    ) {
                        showGpxManagementModal();
                    }

                    hideGpxManagerIfNeeded();

                    if (
                        typeof historyManager !== "undefined" &&
                        historyManager &&
                        typeof historyManager.updateUI === "function"
                    ) {
                        historyManager.updateUI();
                    }

                    return;
                }

                if (
                    typeof rebuildAndRefreshManagedTrack === "function"
                ) {
                    rebuildAndRefreshManagedTrack(
                        fileIdx,
                        nextIdx,
                        shouldSwitchToFile
                    );

                    hideGpxManagerIfNeeded();

                } else if (
                    typeof loadRoute === "function" &&
                    shouldSwitchToFile
                ) {
                    loadRoute(nextIdx, null);

                    hideGpxManagerIfNeeded();
                }
            },

            undo: function() {
                if (!currentFile) {
                    return;
                }

                currentFile.routes =
                    routesBeforeDelete.slice();

                currentFile.points =
                    clonePoints(filePointsBefore);

                currentFile.segments =
                    cloneSegments(fileSegmentsBefore);

                
                if (isFileRouteDelete) {
                    targetRoute.points =
                        clonePoints(targetPointsBefore);

                    targetRoute.segments =
                        cloneSegments(targetSegmentsBefore);

                    currentFile.points =
                        targetRoute.points;

                    currentFile.segments =
                        targetRoute.segments;
                }

                currentFile.layer =
                    fileLayerBefore;

                currentFile.isDrawTrack =
                    fileFlagsBefore.isDrawTrack;

                currentFile.isHandDrawRoute =
                    fileFlagsBefore.isHandDrawRoute;

                currentFile.isCombined =
                    fileFlagsBefore.isCombined;

                currentFile.isWaypointOnly =
                    fileFlagsBefore.isWaypointOnly;

                if (fileFlagsBefore.routesDeletedByUser === undefined) {
                    delete currentFile._routesDeletedByUser;
                } else {
                    currentFile._routesDeletedByUser =
                        fileFlagsBefore.routesDeletedByUser;
                }

                if (customRouteNamesBefore) {
                    currentFile.customRouteNames =
                        typeof cloneCustomRouteNames === "function"
                            ? cloneCustomRouteNames(customRouteNamesBefore)
                            : JSON.parse(JSON.stringify(customRouteNamesBefore));

                } else if (currentFile.customRouteNames) {
                    delete currentFile.customRouteNames;
                }

                const shouldSwitchToFile =
                    activeFileBeforeDelete === fileIdx;

                
                if (
                    typeof rebuildAndRefreshManagedTrack === "function" &&
                    !isFileRouteDelete
                ) {
                    rebuildAndRefreshManagedTrack(
                        fileIdx,
                        routeIdx,
                        shouldSwitchToFile
                    );

                    hideGpxManagerIfNeeded();

                } else if (
                    typeof syncDrawingGlobals === "function" &&
                    isFileRouteDelete
                ) {
                    syncDrawingGlobals(currentFile, 0);

                    if (typeof loadRoute === "function") {
                        loadRoute(0, null);
                    }

                    if (typeof renderRouteInfo === "function") {
                        renderRouteInfo();
                    }

                    if (typeof renderMultiGpxButtons === "function") {
                        renderMultiGpxButtons();
                    }

                    hideGpxManagerIfNeeded();

                    if (
                        typeof historyManager !== "undefined" &&
                        historyManager &&
                        typeof historyManager.updateUI === "function"
                    ) {
                        historyManager.updateUI();
                    }

                } else if (
                    typeof loadRoute === "function" &&
                    shouldSwitchToFile
                ) {
                    loadRoute(0, null);

                    hideGpxManagerIfNeeded();
                }
            }
        };

        if (
            typeof historyManager !== "undefined" &&
            historyManager &&
            typeof historyManager.execute === "function"
        ) {
            historyManager.execute(command);
        } else {
            command.do();
        }
    };

    if (typeof window.showAppConfirm === "function") {
        window.showAppConfirm(
            "刪除路線",
            "確定要刪除「" + routeName + "」嗎？<br>航點會保留。",
            doDeleteWithHistory,
            null,
            "刪除"
        );

        const confirmModal =
            document.getElementById("deleteConfirmModal") ||
            document.getElementById("appConfirmModal") ||
            document.querySelector(".app-confirm-modal");

        const gpxManageModal =
            document.getElementById("gpxManageModal");

        if (confirmModal) {
            confirmModal.style.setProperty(
                "z-index",
                "2147483647",
                "important"
            );
        }

        if (gpxManageModal) {
            gpxManageModal.style.setProperty(
                "z-index",
                "2147483645",
                "important"
            );
        }

    } else {
        if (confirm("確定要刪除「" + routeName + "」嗎？航點會保留。")) {
            doDeleteWithHistory();
        }
    }
};

window.gpxMergeSelections = window.gpxMergeSelections || {};

window.toggleMergeRouteSelection = function(fileIdx, routeIdx) {
    window.gpxMergeSelections = window.gpxMergeSelections || {};
    window.gpxMergeOrder = window.gpxMergeOrder || {};

    if (!window.gpxMergeSelections[fileIdx]) {
        window.gpxMergeSelections[fileIdx] = {};
    }

    if (!Array.isArray(window.gpxMergeOrder[fileIdx])) {
        window.gpxMergeOrder[fileIdx] = [];
    }

    const currentFile =
        window.multiGpxStack &&
        window.multiGpxStack[fileIdx];

    if (
        !currentFile ||
        !Array.isArray(currentFile.routes) ||
        !currentFile.routes[routeIdx]
    ) {
        return;
    }

    const route =
        currentFile.routes[routeIdx];

    if (
        route.isCombined === true ||
        !(
            (Array.isArray(route.points) && route.points.length > 0) ||
            (Array.isArray(route.segments) && route.segments.length > 0)
        )
    ) {
        return;
    }

    const isSelected =
        window.gpxMergeSelections[fileIdx][routeIdx] === true;

    if (isSelected) {
        
        delete window.gpxMergeSelections[fileIdx][routeIdx];

        window.gpxMergeOrder[fileIdx] =
            window.gpxMergeOrder[fileIdx].filter(function(idx) {
                return Number(idx) !== Number(routeIdx);
            });

    } else {
        
        window.gpxMergeSelections[fileIdx][routeIdx] = true;

        if (
            !window.gpxMergeOrder[fileIdx]
                .map(Number)
                .includes(Number(routeIdx))
        ) {
            window.gpxMergeOrder[fileIdx].push(Number(routeIdx));
        }
    }

    if (typeof showGpxManagementModal === "function") {
        const scrollBodyBefore =
            document.getElementById("gpxManageScrollBody");

        const oldScrollTop =
            scrollBodyBefore
                ? scrollBodyBefore.scrollTop
                : 0;

        showGpxManagementModal();

        setTimeout(function() {
            const scrollBodyAfter =
                document.getElementById("gpxManageScrollBody");

            if (scrollBodyAfter) {
                scrollBodyAfter.scrollTop =
                    oldScrollTop;
            }
        }, 0);
    }
};


window.clearMergeRouteSelection = function(fileIdx) {
    window.gpxMergeSelections = window.gpxMergeSelections || {};
    window.gpxMergeOrder = window.gpxMergeOrder || {};

    window.gpxMergeSelections[fileIdx] = {};
    window.gpxMergeOrder[fileIdx] = [];

    if (typeof showGpxManagementModal === "function") {
        const scrollBodyBefore =
            document.getElementById("gpxManageScrollBody");

        const oldScrollTop =
            scrollBodyBefore
                ? scrollBodyBefore.scrollTop
                : 0;

        showGpxManagementModal();

        setTimeout(function() {
            const scrollBodyAfter =
                document.getElementById("gpxManageScrollBody");

            if (scrollBodyAfter) {
                scrollBodyAfter.scrollTop =
                    oldScrollTop;
            }
        }, 0);
    }
};


window.mergeSelectedSubRoutes = function(fileIdx) {
    if (window.event) {
        window.event.stopPropagation();
        window.event.preventDefault();
    }

    const stack =
        window.multiGpxStack ||
        multiGpxStack ||
        [];

    const currentFile =
        stack[fileIdx];

    if (
        !currentFile ||
        !Array.isArray(currentFile.routes)
    ) {
        alert("找不到要合併的 GPX");
        return;
    }

    const selectedMap =
        window.gpxMergeSelections &&
        window.gpxMergeSelections[fileIdx]
            ? window.gpxMergeSelections[fileIdx]
            : {};

    const orderList =
        window.gpxMergeOrder &&
        Array.isArray(window.gpxMergeOrder[fileIdx])
            ? window.gpxMergeOrder[fileIdx].map(Number)
            : [];

    
    let selectedIndexes =
        orderList
            .filter(function(idx, pos, arr) {
                return (
                    Number.isFinite(idx) &&
                    arr.indexOf(idx) === pos &&
                    selectedMap[idx] === true &&
                    currentFile.routes[idx]
                );
            });

    Object.keys(selectedMap).forEach(function(key) {
        const idx =
            parseInt(key, 10);

        if (
            Number.isFinite(idx) &&
            selectedMap[idx] === true &&
            currentFile.routes[idx] &&
            !selectedIndexes.includes(idx)
        ) {
            selectedIndexes.push(idx);
        }
    });

    const selectedRoutes =
        selectedIndexes
            .map(function(idx) {
                return currentFile.routes[idx];
            })
            .filter(function(route) {
                if (!route) return false;
                if (route.isCombined === true) return false;

                return (
                    (Array.isArray(route.points) && route.points.length > 0) ||
                    (Array.isArray(route.segments) && route.segments.length > 0)
                );
            });

    if (selectedRoutes.length < 2) {
        alert("請至少選擇兩條有軌跡資料的子路線");
        return;
    }

    
    const getRouteFirstPoint = function(route) {
        if (
            route &&
            Array.isArray(route.points) &&
            route.points.length > 0
        ) {
            return route.points[0];
        }

        if (
            route &&
            Array.isArray(route.segments) &&
            route.segments.length > 0
        ) {
            const firstSeg =
                route.segments[0];

            if (
                Array.isArray(firstSeg) &&
                firstSeg.length > 0
            ) {
                const p =
                    firstSeg[0];

                if (Array.isArray(p)) {
                    return {
                        lat: p[0],
                        lon: p[1]
                    };
                }

                if (p && typeof p === "object") {
                    return {
                        lat: p.lat,
                        lon: p.lon !== undefined ? p.lon : p.lng
                    };
                }
            }
        }

        return null;
    };

    const getRouteLastPoint = function(route) {
        if (
            route &&
            Array.isArray(route.points) &&
            route.points.length > 0
        ) {
            return route.points[route.points.length - 1];
        }

        if (
            route &&
            Array.isArray(route.segments) &&
            route.segments.length > 0
        ) {
            const lastSeg =
                route.segments[route.segments.length - 1];

            if (
                Array.isArray(lastSeg) &&
                lastSeg.length > 0
            ) {
                const p =
                    lastSeg[lastSeg.length - 1];

                if (Array.isArray(p)) {
                    return {
                        lat: p[0],
                        lon: p[1]
                    };
                }

                if (p && typeof p === "object") {
                    return {
                        lat: p.lat,
                        lon: p.lon !== undefined ? p.lon : p.lng
                    };
                }
            }
        }

        return null;
    };

    const getRouteNameForMergeWarning = function(route, fallbackIndex) {
        return (
            route.routeDisplayName ||
            route.displayName ||
            route.name ||
            "路線 " + fallbackIndex
        );
    };

    const longConnectionWarnings = [];
    const warningDistanceMeters = 500;

    for (let i = 1; i < selectedRoutes.length; i++) {
        const prevRoute =
            selectedRoutes[i - 1];

        const nextRoute =
            selectedRoutes[i];

        const prevEnd =
            getRouteLastPoint(prevRoute);

        const nextStart =
            getRouteFirstPoint(nextRoute);

        if (!prevEnd || !nextStart) continue;

        let distMeters = 0;

        if (typeof calculateDistance === "function") {
            distMeters =
                calculateDistance(
                    Number(prevEnd.lat),
                    Number(prevEnd.lon),
                    Number(nextStart.lat),
                    Number(nextStart.lon)
                ) * 1000;
        } else {
            distMeters =
                Math.sqrt(
                    Math.pow(Number(prevEnd.lat) - Number(nextStart.lat), 2) +
                    Math.pow(Number(prevEnd.lon) - Number(nextStart.lon), 2)
                ) * 111000;
        }

        if (distMeters > warningDistanceMeters) {
            longConnectionWarnings.push({
                fromName:
                    getRouteNameForMergeWarning(prevRoute, i),
                toName:
                    getRouteNameForMergeWarning(nextRoute, i + 1),
                distance:
                    distMeters
            });
        }
    }

    
    const runMerge = function() {

        
        const sourceRouteIndexes =
            selectedIndexes.slice();

        const sourceRouteIds =
            selectedIndexes
                .map(function(idx) {
                    const route =
                        currentFile.routes[idx];

                    return route && route.id
                        ? route.id
                        : null;
                })
                .filter(function(id) {
                    return !!id;
                });

        let mergedSegments = [];
        let rawSegmentPointGroups = [];

        
        selectedRoutes.forEach(function(route) {
            const pts =
                Array.isArray(route.points)
                    ? route.points
                    : [];

            if (
                Array.isArray(route.segments) &&
                route.segments.length > 0
            ) {
                route.segments.forEach(function(seg) {
                    if (!Array.isArray(seg) || seg.length === 0) return;

                    const segmentLatLngs = [];
                    const segmentPoints = [];

                    seg.forEach(function(latlng) {
                        let lat;
                        let lon;

                        if (Array.isArray(latlng)) {
                            lat = latlng[0];
                            lon = latlng[1];

                        } else if (latlng && typeof latlng === "object") {
                            lat = latlng.lat;
                            lon =
                                latlng.lon !== undefined
                                    ? latlng.lon
                                    : latlng.lng;
                        }

                        if (
                            typeof lat === "number" &&
                            typeof lon === "number" &&
                            Number.isFinite(lat) &&
                            Number.isFinite(lon)
                        ) {
                            segmentLatLngs.push([lat, lon]);

                            const matchedPoint =
                                pts.find(function(p) {
                                    return (
                                        p &&
                                        Math.abs(Number(p.lat) - Number(lat)) < 0.0000001 &&
                                        Math.abs(Number(p.lon) - Number(lon)) < 0.0000001
                                    );
                                });

                            segmentPoints.push(
                                matchedPoint
                                    ? { ...matchedPoint }
                                    : {
                                        lat: lat,
                                        lon: lon,
                                        ele: 0,
                                        time: null,
                                        timeLocal: "",
                                        distance: 0
                                    }
                            );
                        }
                    });

                    if (segmentLatLngs.length > 0) {
                        mergedSegments.push(segmentLatLngs);
                        rawSegmentPointGroups.push(segmentPoints);
                    }
                });

            } else if (pts.length > 0) {
                const segmentLatLngs =
                    pts.map(function(p) {
                        return [p.lat, p.lon];
                    });

                mergedSegments.push(segmentLatLngs);

                rawSegmentPointGroups.push(
                    pts.map(function(p) {
                        return { ...p };
                    })
                );
            }
        });

        if (rawSegmentPointGroups.length === 0) {
            alert("沒有可合併的軌跡點");
            return;
        }

        
        let totalDist = 0;
        let recalculatedPoints = [];
        let recalculatedSegments = [];

        rawSegmentPointGroups.forEach(function(segmentPoints) {
            const recalculatedSegment = [];

            segmentPoints.forEach(function(p, idx) {
                if (idx > 0) {
                    const prev =
                        segmentPoints[idx - 1];

                    if (typeof calculateDistance === "function") {
                        totalDist += calculateDistance(
                            prev.lat,
                            prev.lon,
                            p.lat,
                            p.lon
                        );
                    }
                }

                const newPoint = {
                    ...p,
                    distance: totalDist
                };

                recalculatedPoints.push(newPoint);
                recalculatedSegment.push([
                    newPoint.lat,
                    newPoint.lon
                ]);
            });

            if (recalculatedSegment.length > 0) {
                recalculatedSegments.push(recalculatedSegment);
            }
        });

        let mergeNo = 1;

        currentFile.routes.forEach(function(route) {
            if (!route) return;

            const name =
                route.routeDisplayName ||
                route.displayName ||
                route.name ||
                "";

            const match =
                String(name).match(/^合併路線\s*(\d+)?$/);

            if (match) {
                const n =
                    match[1]
                        ? parseInt(match[1], 10)
                        : 1;

                if (Number.isFinite(n)) {
                    mergeNo =
                        Math.max(mergeNo, n + 1);
                }
            }
        });

        const mergedName =
            mergeNo === 1
                ? "合併路線"
                : "合併路線 " + mergeNo;

        const continuousMergedSegment =
            recalculatedPoints.map(function(p) {
                return [p.lat, p.lon];
            });
					
				const mergedWaypoints =
				    Array.isArray(currentFile.waypoints)
				        ? currentFile.waypoints.filter(function(wpt) {
            if (!wpt) return false;

            
            return sourceRouteIndexes.some(function(sourceRouteIdx) {
                const sourceRoute =
                    currentFile.routes &&
                    currentFile.routes[sourceRouteIdx]
                        ? currentFile.routes[sourceRouteIdx]
                        : null;

                if (!sourceRoute) {
                    return false;
                }

                if (typeof window.isWaypointVisibleOnCurrentRoute === "function") {
                    return window.isWaypointVisibleOnCurrentRoute(
                        wpt,
                        sourceRouteIdx,
                        sourceRoute
                    );
                }

                
                if (wpt.belongsToRoute !== undefined) {
                    return Number(wpt.belongsToRoute) === Number(sourceRouteIdx);
                }

                return false;
            });
        })
        : [];
        
        const mergedRoute = {
            id: "merged_route_" + Date.now(),
            name: mergedName,
            displayName: mergedName,
            routeDisplayName: mergedName,
            fileName: currentFile.fileName || currentFile.name || "GPX",
            color: currentFile.color || "#0000FF",

            
            points: recalculatedPoints,

            
            segments: [
                continuousMergedSegment
            ],

            
            originalMergedSegments: recalculatedSegments,

						waypoints: mergedWaypoints,

            visible: true,
            isCombined: false,
            isDrawTrack: false,
            isHandDrawRoute: false,
						isMergedRoute: true,
						
						
						useOwnWaypointsOnly: true,
						
						sourceRouteIndexes: sourceRouteIndexes,
						sourceRouteIds: sourceRouteIds
        };

        const activeFileBeforeMerge =
            typeof window.currentMultiIndex === "number"
                ? window.currentMultiIndex
                : 0;

        const activeRouteBeforeMerge =
            typeof window.currentActiveIndex === "number"
                ? window.currentActiveIndex
                : 0;

        const selectionSnapshot =
            JSON.parse(JSON.stringify(selectedMap || {}));

        const orderSnapshot =
            window.gpxMergeOrder &&
            Array.isArray(window.gpxMergeOrder[fileIdx])
                ? window.gpxMergeOrder[fileIdx].slice()
                : [];

        const command = {
            managedFileIndex: fileIdx,
            skipAutoLoadRouteAfterUndo: true,

            do: function() {
                if (
                    !currentFile ||
                    !Array.isArray(currentFile.routes)
                ) {
                    return;
                }

                if (!currentFile.routes.includes(mergedRoute)) {
                    currentFile.routes.push(mergedRoute);
                }

                const mergedRouteIdx =
                    currentFile.routes.indexOf(mergedRoute);

                if (!window.gpxMergeSelections) {
                    window.gpxMergeSelections = {};
                }

                if (!window.gpxMergeOrder) {
                    window.gpxMergeOrder = {};
                }

                window.gpxMergeSelections[fileIdx] = {};
                window.gpxMergeOrder[fileIdx] = [];

                const shouldSwitchToFile =
                    activeFileBeforeMerge === fileIdx;

                rebuildAndRefreshManagedTrack(
                    fileIdx,
                    mergedRouteIdx,
                    shouldSwitchToFile
                );

                if (shouldSwitchToFile) {
                    const routeForWpt =
                        currentFile.routes &&
                        currentFile.routes[mergedRouteIdx]
                            ? currentFile.routes[mergedRouteIdx]
                            : mergedRoute;

                    if (typeof renderWaypointsAndPeaks === "function") {
                        renderWaypointsAndPeaks(routeForWpt);
                    }

                    if (typeof updateWptIconStatus === "function") {
                        updateWptIconStatus();
                    }
                }
            },

            undo: function() {
                if (
                    !currentFile ||
                    !Array.isArray(currentFile.routes)
                ) {
                    return;
                }

                const idx =
                    currentFile.routes.indexOf(mergedRoute);

                if (idx > -1) {
                    currentFile.routes.splice(idx, 1);
                }

                if (!window.gpxMergeSelections) {
                    window.gpxMergeSelections = {};
                }

                if (!window.gpxMergeOrder) {
                    window.gpxMergeOrder = {};
                }

                window.gpxMergeSelections[fileIdx] =
                    JSON.parse(JSON.stringify(selectionSnapshot));

                window.gpxMergeOrder[fileIdx] =
                    orderSnapshot.slice();

                const shouldSwitchToFile =
                    activeFileBeforeMerge === fileIdx;

                let routeIdxToShow =
                    activeRouteBeforeMerge;

                if (
                    !Array.isArray(currentFile.routes) ||
                    currentFile.routes.length === 0
                ) {
                    routeIdxToShow = 0;
                } else if (
                    routeIdxToShow < 0 ||
                    routeIdxToShow >= currentFile.routes.length
                ) {
                    routeIdxToShow = 0;
                }

                rebuildAndRefreshManagedTrack(
                    fileIdx,
                    routeIdxToShow,
                    shouldSwitchToFile
                );

                if (shouldSwitchToFile) {
                    const routeForWpt =
                        currentFile.routes &&
                        currentFile.routes[routeIdxToShow]
                            ? currentFile.routes[routeIdxToShow]
                            : currentFile;

                    if (typeof renderWaypointsAndPeaks === "function") {
                        renderWaypointsAndPeaks(routeForWpt);
                    }

                    if (typeof updateWptIconStatus === "function") {
                        updateWptIconStatus();
                    }
                }
            }
        };

        if (
            typeof historyManager !== "undefined" &&
            historyManager &&
            typeof historyManager.execute === "function"
        ) {
            historyManager.execute(command);
        } else {
            command.do();
        }
    };

    
    if (longConnectionWarnings.length > 0) {
        const warningHtml =
            "偵測到合併路線之間距離較遠，<br>匯出後可能會出現長直線：<br><br>" +
            longConnectionWarnings.map(function(item, idx) {
								 return (
								    '<span style="font-weight:700; color:#0b3d91;">「' +
								    item.fromName +
								    '」 → 「' +
								    item.toName +
								    '」約 ' +
								    item.distance.toFixed(0) +
								    ' m</span>'
								);
            }).join("<br>") +
            "<br><br>建議先確認合併順序，或反轉其中一條路線。<br>仍要合併嗎？";

				if (typeof window.showAppConfirm === "function") {
				    window.showAppConfirm(
				        "合併路線提醒",
				        warningHtml,
				        runMerge,
				        null,
				        "仍要合併"
				    );
				
				    
				    setTimeout(function() {
				        const confirmModal =
				            document.getElementById("deleteConfirmModal") ||
				            document.getElementById("appConfirmModal") ||
				            document.querySelector(".app-confirm-modal");
				
				        const gpxManageModal =
				            document.getElementById("gpxManageModal");
				
				        const searchModal =
				            document.getElementById("searchModal");
				
				        const renameModal =
				            document.getElementById("renameModal");
				
				        const coordModal =
				            document.getElementById("coordModal");
				
				        const wptEditModal =
				            document.getElementById("wptEditModal");
				
				        
				        const fsElement =
				            document.fullscreenElement ||
				            document.webkitFullscreenElement ||
				            document.mozFullScreenElement ||
				            document.msFullscreenElement;
				
				        const mapEl =
				            document.getElementById("map");
				
				        const isIphoneFakeFullscreen =
				            document.body.classList.contains("iphone-fullscreen");
				
				        if (
				            confirmModal &&
				            fsElement &&
				            confirmModal.parentElement !== fsElement
				        ) {
				            fsElement.appendChild(confirmModal);
				        }
				
				        if (
				            confirmModal &&
				            !fsElement &&
				            isIphoneFakeFullscreen &&
				            mapEl &&
				            confirmModal.parentElement !== mapEl
				        ) {
				            mapEl.appendChild(confirmModal);
				        }
				
				        
				        [
				            gpxManageModal,
				            searchModal,
				            renameModal,
				            coordModal,
				            wptEditModal
				        ].forEach(function(modal) {
				            if (!modal) return;
				
				            modal.style.setProperty(
				                "z-index",
				                "2147483644",
				                "important"
				            );
				        });
				
				        
				        if (confirmModal) {
				            confirmModal.style.setProperty(
				                "position",
				                "fixed",
				                "important"
				            );
				
				            confirmModal.style.setProperty(
				                "top",
				                "0",
				                "important"
				            );
				
				            confirmModal.style.setProperty(
				                "left",
				                "0",
				                "important"
				            );
				
				            confirmModal.style.setProperty(
				                "width",
				                "100vw",
				                "important"
				            );
				
				            confirmModal.style.setProperty(
				                "height",
				                "100vh",
				                "important"
				            );
				
				            confirmModal.style.setProperty(
				                "z-index",
				                "2147483647",
				                "important"
				            );
				
				            confirmModal.style.setProperty(
				                "display",
				                "flex",
				                "important"
				            );
				
				            confirmModal.style.setProperty(
				                "justify-content",
				                "center",
				                "important"
				            );
				
				            confirmModal.style.setProperty(
				                "align-items",
				                "center",
				                "important"
				            );
				
				            
				            const confirmContent =
				                confirmModal.firstElementChild;
				
				            if (confirmContent) {
				                confirmContent.style.setProperty(
				                    "position",
				                    "relative",
				                    "important"
				                );
				
				                confirmContent.style.setProperty(
				                    "z-index",
				                    "2147483647",
				                    "important"
				                );
				            }
				        }
				    }, 30);
				
				} else {
            const warningText =
                "偵測到合併路線之間距離較遠，匯出後可能會出現長直線。\n\n" +
                longConnectionWarnings.map(function(item, idx) {
                    return (
                        (idx + 1) + ". 「" +
                        item.fromName +
                        "」 → 「" +
                        item.toName +
                        "」約 " +
                        item.distance.toFixed(0) +
                        " m"
                    );
                }).join("\n") +
                "\n\n建議先確認合併順序，或反轉其中一條路線。\n\n仍要合併嗎？";

            if (confirm(warningText)) {
                runMerge();
            }
        }

        return;
    }

    runMerge();
};

window.reverseSubRoute = function(fileIdx, routeIdx, options = {}) {

    const reverseOptions =
        options && typeof options === "object"
            ? options
            : {};

    const skipOpenGpxManager =
        reverseOptions.skipOpenGpxManager === true;

    const stack =
        window.multiGpxStack ||
        multiGpxStack ||
        [];

    const currentFileAtStart =
        stack[fileIdx];

    if (!currentFileAtStart) {
        alert("找不到要反轉的路線");
        return;
    }

    let normalizedRouteIdx =
        routeIdx;

    let isFileRoute =
        false;

    const getLiveReverseTarget = function() {
        const liveStack =
            window.multiGpxStack ||
            multiGpxStack ||
            [];

        const liveFile =
            liveStack[fileIdx];

        if (!liveFile) {
            return null;
        }

        let liveRoute =
            null;

        if (
            Array.isArray(liveFile.routes) &&
            liveFile.routes[normalizedRouteIdx]
        ) {
            liveRoute =
                liveFile.routes[normalizedRouteIdx];

            return {
                file: liveFile,
                route: liveRoute,
                routeIdx: normalizedRouteIdx,
                isFileRoute: false
            };
        }

        if (
            liveFile.isDrawTrack === true ||
            liveFile.isHandDrawRoute === true ||
            (
                Array.isArray(liveFile.points) &&
                liveFile.points.length > 0
            ) ||
            (
                Array.isArray(liveFile.segments) &&
                liveFile.segments.length > 0
            )
        ) {
            return {
                file: liveFile,
                route: liveFile,
                routeIdx: 0,
                isFileRoute: true
            };
        }

        return null;
    };

    const firstTarget =
        getLiveReverseTarget();

    if (
        firstTarget &&
        firstTarget.isFileRoute === true
    ) {
        normalizedRouteIdx =
            0;

        isFileRoute =
            true;
    }

    if (
        !firstTarget ||
        !firstTarget.route
    ) {
        alert("找不到要反轉的路線");
        return;
    }

    const targetRouteAtStart =
        firstTarget.route;

    if (targetRouteAtStart.isCombined === true) {
        alert("結合路線不能直接反轉，請反轉子路線");
        return;
    }

    const hasPoints =
        Array.isArray(targetRouteAtStart.points) &&
        targetRouteAtStart.points.length > 1;

    const hasSegments =
        Array.isArray(targetRouteAtStart.segments) &&
        targetRouteAtStart.segments.length > 0;

    if (!hasPoints && !hasSegments) {
        alert("此路線沒有足夠的軌跡點可反轉");
        return;
    }

    const routeName =
        targetRouteAtStart.routeDisplayName ||
        targetRouteAtStart.displayName ||
        targetRouteAtStart.name ||
        "路線";

    const activeFileBeforeReverse =
        typeof window.currentMultiIndex === "number"
            ? window.currentMultiIndex
            : 0;

    const activeRouteBeforeReverse =
        typeof window.currentActiveIndex === "number"
            ? window.currentActiveIndex
            : 0;

    const clonePoints = function(points) {
        return Array.isArray(points)
            ? points.map(function(p) {
                return { ...p };
            })
            : [];
    };

    const cloneSegments = function(segments) {
        return Array.isArray(segments)
            ? segments.map(function(seg) {
                return Array.isArray(seg)
                    ? seg.map(function(latlng) {
                        if (Array.isArray(latlng)) {
                            return latlng.slice();
                        }

                        if (latlng && typeof latlng === "object") {
                            return { ...latlng };
                        }

                        return latlng;
                    })
                    : [];
            })
            : [];
    };

    const pointsBefore =
        clonePoints(targetRouteAtStart.points);

    const segmentsBefore =
        cloneSegments(targetRouteAtStart.segments);

    const filePointsBefore =
        clonePoints(currentFileAtStart.points);

    const fileSegmentsBefore =
        cloneSegments(currentFileAtStart.segments);

    const recomputePointDistances = function(points) {
        if (!Array.isArray(points)) return [];

        let totalDist =
            0;

        return points.map(function(p, idx, arr) {
            const np =
                { ...p };

            if (idx === 0) {
                totalDist =
                    0;

            } else {
                const prev =
                    arr[idx - 1];

                if (typeof calculateDistance === "function") {
                    totalDist += calculateDistance(
                        prev.lat,
                        prev.lon,
                        p.lat,
                        p.lon
                    );
                }
            }

            np.distance =
                totalDist;

            return np;
        });
    };

    const reverseRouteData = function(route) {

        if (
            Array.isArray(route.points) &&
            route.points.length > 0
        ) {
            route.points =
                recomputePointDistances(
                    route.points
                        .slice()
                        .reverse()
                        .map(function(p) {
                            return { ...p };
                        })
                );
        }

        if (
            Array.isArray(route.segments) &&
            route.segments.length > 0
        ) {
            route.segments =
                route.segments
                    .slice()
                    .reverse()
                    .map(function(seg) {
                        if (!Array.isArray(seg)) return [];

                        return seg
                            .slice()
                            .reverse()
                            .map(function(latlng) {
                                if (Array.isArray(latlng)) {
                                    return latlng.slice();
                                }

                                if (latlng && typeof latlng === "object") {
                                    return { ...latlng };
                                }

                                return latlng;
                            });
                    });

        } else if (
            Array.isArray(route.points) &&
            route.points.length > 0
        ) {
            route.segments = [
                route.points.map(function(p) {
                    return [
                        p.lat,
                        p.lon
                    ];
                })
            ];
        }

        if (
            (!Array.isArray(route.segments) || route.segments.length === 0) &&
            Array.isArray(route.points) &&
            route.points.length > 0
        ) {
            route.segments = [
                route.points.map(function(p) {
                    return [
                        p.lat,
                        p.lon
                    ];
                })
            ];
        }
    };

    const restoreRouteData = function(route, points, segments) {
        route.points =
            clonePoints(points);

        route.segments =
            cloneSegments(segments);

        if (
            (!Array.isArray(route.segments) || route.segments.length === 0) &&
            Array.isArray(route.points) &&
            route.points.length > 0
        ) {
            route.segments = [
                route.points.map(function(p) {
                    return [
                        p.lat,
                        p.lon
                    ];
                })
            ];
        }
    };

    const refreshAfterReverse = function() {
        const liveTarget =
            getLiveReverseTarget();

        if (!liveTarget || !liveTarget.file) {
            return;
        }

        const liveFile =
            liveTarget.file;

        const liveRouteIdx =
            liveTarget.routeIdx;

        const liveIsFileRoute =
            liveTarget.isFileRoute;

        if (
            liveFile &&
            Array.isArray(liveFile.routes) &&
            liveFile.routes.length > 1 &&
            liveFile.routes[0] &&
            liveFile.routes[0].isCombined === true &&
            typeof rebuildCombinedRouteForFile === "function"
        ) {
            rebuildCombinedRouteForFile(liveFile);
        }

        const shouldSwitchToFile =
            activeFileBeforeReverse === fileIdx;

        if (shouldSwitchToFile) {
            window.currentMultiIndex =
                fileIdx;

            window.currentActiveIndex =
                liveIsFileRoute ? 0 : liveRouteIdx;

            if (typeof syncDrawingGlobals === "function") {
                syncDrawingGlobals(
                    liveFile,
                    liveIsFileRoute ? 0 : liveRouteIdx
                );

            } else {
                if (
                    Array.isArray(liveFile.routes) &&
                    liveFile.routes.length > 0
                ) {
                    window.allTracks =
                        liveFile.routes;

                    if (typeof allTracks !== "undefined") {
                        allTracks =
                            window.allTracks;
                    }

                    const routeForTrack =
                        liveFile.routes[
                            liveIsFileRoute ? 0 : liveRouteIdx
                        ];

                    if (routeForTrack) {
                        trackPoints =
                            routeForTrack.points || [];

                        window.trackPoints =
                            trackPoints;
                    }

                } else {
                    window.allTracks =
                        [liveFile];

                    if (typeof allTracks !== "undefined") {
                        allTracks =
                            window.allTracks;
                    }

                    trackPoints =
                        liveFile.points || [];

                    window.trackPoints =
                        trackPoints;
                }
            }

            if (typeof updateRouteSelectDropdown === "function") {
                updateRouteSelectDropdown();
            }

            const routeSelect =
                document.getElementById("routeSelect");

            if (
                routeSelect &&
                routeSelect.options &&
                routeSelect.options.length > (liveIsFileRoute ? 0 : liveRouteIdx)
            ) {
                routeSelect.value =
                    String(liveIsFileRoute ? 0 : liveRouteIdx);

                routeSelect.selectedIndex =
                    liveIsFileRoute ? 0 : liveRouteIdx;
            }

            if (typeof loadRoute === "function") {
                loadRoute(
                    liveIsFileRoute ? 0 : liveRouteIdx,
                    null,
                    {
                        skipAutoFitBounds: true,
                        preserveChartState: true
                    }
                );
            }

            if (typeof renderRouteInfo === "function") {
                renderRouteInfo();
            }
        }

        if (typeof renderMultiGpxButtons === "function") {
            renderMultiGpxButtons();
        }

        if (!window.gpxManagerExpanded) {
            window.gpxManagerExpanded = {};
        }

        window.gpxManagerExpanded[fileIdx] =
            true;

        if (
            !skipOpenGpxManager &&
            typeof showGpxManagementModal === "function"
        ) {
            showGpxManagementModal();
        }
        
        if (
            typeof historyManager !== "undefined" &&
            historyManager &&
            typeof historyManager.updateUI === "function"
        ) {
            historyManager.updateUI();
        }
    };

    const applyReverse = function() {
        const liveTarget =
            getLiveReverseTarget();

        if (
            !liveTarget ||
            !liveTarget.file ||
            !liveTarget.route
        ) {
            return;
        }

        const liveFile =
            liveTarget.file;

        const liveRoute =
            liveTarget.route;

        reverseRouteData(
            liveRoute
        );

        if (liveTarget.isFileRoute) {
            liveFile.points =
                clonePoints(liveRoute.points);

            liveFile.segments =
                cloneSegments(liveRoute.segments);

        } else if (
            liveFile &&
            (
                !Array.isArray(liveFile.routes) ||
                liveFile.routes.length <= 1 ||
                liveFile.isDrawTrack === true
            )
        ) {
            liveFile.points =
                clonePoints(liveRoute.points);

            liveFile.segments =
                cloneSegments(liveRoute.segments);
        }

        if (
            liveFile.layer instanceof L.Polyline &&
            Array.isArray(liveFile.segments)
        ) {
            liveFile.layer.setLatLngs(
                liveFile.segments
            );
        }

        refreshAfterReverse();
    };

    const undoReverse = function() {
        const liveTarget =
            getLiveReverseTarget();

        if (
            !liveTarget ||
            !liveTarget.file ||
            !liveTarget.route
        ) {
            return;
        }

        const liveFile =
            liveTarget.file;

        const liveRoute =
            liveTarget.route;

        restoreRouteData(
            liveRoute,
            pointsBefore,
            segmentsBefore
        );

        if (liveTarget.isFileRoute) {
            liveFile.points =
                clonePoints(filePointsBefore);

            liveFile.segments =
                cloneSegments(fileSegmentsBefore);

        } else if (
            liveFile &&
            (
                !Array.isArray(liveFile.routes) ||
                liveFile.routes.length <= 1 ||
                liveFile.isDrawTrack === true
            )
        ) {
            liveFile.points =
                clonePoints(filePointsBefore);

            liveFile.segments =
                cloneSegments(fileSegmentsBefore);
        }

        if (
            liveFile.layer instanceof L.Polyline &&
            Array.isArray(liveFile.segments)
        ) {
            liveFile.layer.setLatLngs(
                liveFile.segments
            );
        }
       

        refreshAfterReverse();
    };

    const command = {
        fileIndex: fileIdx,
        managedFileIndex: fileIdx,
        routeIndex: normalizedRouteIdx,
        skipAutoLoadRouteAfterUndo: true,

        do: function() {
            applyReverse();
        },

        undo: function() {
            undoReverse();
        },

        redo: function() {
            applyReverse();
        }
    };

    const runReverse = function() {
        if (
            typeof historyManager !== "undefined" &&
            historyManager &&
            typeof historyManager.execute === "function"
        ) {
            historyManager.execute(command);

        } else {
            command.do();
        }
    };

    if (typeof window.showAppConfirm === "function") {
        window.showAppConfirm(
            "反轉路線",
            "確定要反轉「" + routeName + "」嗎？",
            runReverse,
            null,
            "反轉"
        );

        const confirmModal =
            document.getElementById("deleteConfirmModal") ||
            document.getElementById("appConfirmModal") ||
            document.querySelector(".app-confirm-modal");

        const gpxManageModal =
            document.getElementById("gpxManageModal");

        if (confirmModal) {
            confirmModal.style.setProperty(
                "z-index",
                "2147483647",
                "important"
            );
        }

        if (gpxManageModal) {
            gpxManageModal.style.setProperty(
                "z-index",
                "2147483645",
                "important"
            );
        }

    } else {
        if (confirm("確定要反轉「" + routeName + "」嗎？")) {
            runReverse();
        }
    }
};


window.renderRouteToolControl = function() {
    const mapEl =
        document.getElementById("map");

    if (!mapEl) return;

    let control =
        document.getElementById("routeToolControl");

    if (!control) {
        control =
            document.createElement("div");

        control.id =
            "routeToolControl";

        control.innerHTML = `
            <button type="button"
                    id="routeToolMainBtn"
                    class="route-tool-main-btn"
                    title="路線工具">
                <span class="material-icons">build</span>
            </button>

            <div id="routeToolPanel" class="route-tool-panel">

                <div class="route-tool-copy-paste-row">
						    <button type="button"
						            class="route-tool-icon-btn route-tool-icon-text-btn"
						            data-action="copy-route"
						            title="複製路線">
						        <span class="material-icons route-tool-top-icon">content_copy</span>
						        <span class="route-tool-icon-label">複製</span>
						    </button>
						
						    <button type="button"
						            class="route-tool-icon-btn route-tool-icon-text-btn"
						            data-action="paste-route"
						            title="貼上路線">
						        <span class="material-icons route-tool-top-icon">content_paste</span>
						        <span class="route-tool-icon-label">貼上</span>
						    </button>
						
						    <button type="button"
						            class="route-tool-icon-btn route-tool-icon-text-btn"
						            data-action="delete"
						            title="刪除路線">
						        <span class="material-icons route-tool-top-icon">delete_outline</span>
						        <span class="route-tool-icon-label">刪除</span>
						    </button>
						</div>	
                <div class="route-tool-item" data-action="rename">
                    <span class="material-icons" style="font-size:18px;">edit</span>
                    <span>編輯名稱</span>
                </div>
                
                <div class="route-tool-item" data-action="split">
                    <span class="material-icons" style="font-size:18px;">content_cut</span>
                    <span>分割路線</span>
                </div>

                <div class="route-tool-item" data-action="reverse">
                    <span class="material-icons" style="font-size:18px;">swap_vert</span>
                    <span>反轉路線</span>
                </div>


                <div class="route-tool-item" data-action="elevation">
                    <span class="material-icons" style="font-size:18px;">terrain</span>
                    <span>取得高度</span>
                </div>
            </div>
        `;

        mapEl.appendChild(control);

        if (typeof L !== "undefined" && L.DomEvent) {
            L.DomEvent.disableClickPropagation(control);
            L.DomEvent.disableScrollPropagation(control);
        }
    }

    const mainBtn =
        document.getElementById("routeToolMainBtn");

    const panel =
        document.getElementById("routeToolPanel");

    if (!mainBtn || !panel) return;

    const getCurrentRouteToolTarget = function() {
        const fileIdx =
            typeof window.currentMultiIndex === "number"
                ? window.currentMultiIndex
                : 0;

        const routeIdx =
            typeof window.currentActiveIndex === "number"
                ? window.currentActiveIndex
                : 0;

        const currentFile =
            window.multiGpxStack &&
            window.multiGpxStack[fileIdx];

        if (!currentFile) {
            return {
                fileIdx,
                routeIdx,
                route: null,
                canOperate: false,
                isCombinedRoute: false
            };
        }

        let route = null;

        if (
            Array.isArray(currentFile.routes) &&
            currentFile.routes[routeIdx]
        ) {
            route =
                currentFile.routes[routeIdx];

        } else {
            route =
                currentFile;
        }

        const isCombinedRoute =
            route &&
            (
                route.isCombined === true ||
                (
                    Number(routeIdx) === 0 &&
                    Array.isArray(currentFile.routes) &&
                    currentFile.routes.length > 1
                ) ||
                String(route.name || "").includes("結合") ||
                String(route.displayName || "").includes("結合") ||
                String(route.routeDisplayName || "").includes("結合")
            );

        const hasRouteData =
            route &&
            (
                (
                    Array.isArray(route.points) &&
                    route.points.length > 0
                ) ||
                (
                    Array.isArray(route.segments) &&
                    route.segments.length > 0
                ) ||
                route.isDrawTrack === true ||
                route.isHandDrawRoute === true ||
                route.isMergedRoute === true
            );

        return {
            fileIdx,
            routeIdx,
            route,
            canOperate:
                !!route &&
                !!hasRouteData &&
                !isCombinedRoute,
            isCombinedRoute
        };
    };
    
    const getCurrentWaypointToolTarget = function() {
    const toolTarget =
        window.currentToolTarget;

    if (
        !toolTarget ||
        toolTarget.type !== "waypoint" ||
        typeof toolTarget.wptIdx !== "number"
    ) {
        return {
            isWaypoint: false,
            file: null,
            route: null,
            fileIdx: null,
            routeIdx: null,
            wptIdx: null,
            waypoint: null
        };
    }

    const stack =
        window.multiGpxStack ||
        multiGpxStack ||
        [];

    const file =
        stack[toolTarget.fileIdx];

    if (!file) {
        return {
            isWaypoint: false,
            file: null,
            route: null,
            fileIdx: null,
            routeIdx: null,
            wptIdx: null,
            waypoint: null
        };
    }

    const routeIdx =
        typeof toolTarget.routeIdx === "number"
            ? toolTarget.routeIdx
            : (
                typeof window.currentActiveIndex === "number"
                    ? window.currentActiveIndex
                    : 0
            );

    const route =
        Array.isArray(file.routes) && file.routes[routeIdx]
            ? file.routes[routeIdx]
            : file;

    let waypoint =
        null;

    if (
        Array.isArray(file.waypoints) &&
        file.waypoints[toolTarget.wptIdx]
    ) {
        waypoint =
            file.waypoints[toolTarget.wptIdx];

    } else if (
        route &&
        Array.isArray(route.waypoints) &&
        route.waypoints[toolTarget.wptIdx]
    ) {
        waypoint =
            route.waypoints[toolTarget.wptIdx];
    }

    return {
        isWaypoint: !!waypoint,
        file: file,
        route: route,
        fileIdx: toolTarget.fileIdx,
        routeIdx: routeIdx,
        wptIdx: toolTarget.wptIdx,
        waypoint: waypoint
    };
		};

		const refreshPanelState = function() {
		    const target =
		        getCurrentRouteToolTarget();
		
		    const waypointTarget =
		        getCurrentWaypointToolTarget();
		
		    const isWaypointMode =
		        waypointTarget &&
		        waypointTarget.isWaypoint === true;
		
		    const items =
		        panel.querySelectorAll(
		            ".route-tool-item, .route-tool-icon-btn"
		        );
		
		    items.forEach(function(item) {
		        const action =
		            item.dataset.action;
		
		        let canUse =
		            isWaypointMode
		                ? false
		                : target.canOperate;
		
		        if (action === "split") {
		            canUse =
		                !isWaypointMode &&
		                target.canOperate &&
		                target.route &&
		                Array.isArray(target.route.points) &&
		                target.route.points.length > 2;
		        }
		
		        if (action === "reverse") {
		            canUse =
		                !isWaypointMode &&
		                target.canOperate &&
		                target.route &&
		                target.route.isCombined !== true;
		        }
		
		        if (action === "elevation") {
		            canUse =
		                !isWaypointMode &&
		                target.canOperate &&
		                target.route &&
		                Array.isArray(target.route.points) &&
		                target.route.points.length > 0;
		        }
		
		        if (action === "rename") {
		            canUse =
		                isWaypointMode ||
		                (
		                    target.canOperate &&
		                    target.route &&
		                    target.route.isCombined !== true
		                );
		        }
		
		        if (action === "copy-route") {
		            canUse =
		                isWaypointMode ||
		                (
		                    target.canOperate &&
		                    target.route &&
		                    target.route.isCombined !== true &&
		                    Array.isArray(target.route.points) &&
		                    target.route.points.length >= 2
		                );
		        }
		
		        if (action === "paste-route") {
		            const stack =
		                window.multiGpxStack ||
		                multiGpxStack ||
		                [];
		
		            const currentFile =
		                stack[target.fileIdx];
		
		            canUse =
		                !!currentFile &&
		                (
		                    (
		                        !!window.copiedWaypointForPaste &&
		                        !!window.copiedWaypointForPaste.waypoint
		                    ) ||
		                    (
		                        !!window.copiedRouteForPaste &&
		                        !!window.copiedRouteForPaste.route
		                    )
		                );
		        }
		
		        if (action === "delete") {
		            canUse =
		                isWaypointMode ||
		                (
		                    target.canOperate &&
		                    target.route &&
		                    target.route.isCombined !== true
		                );
		        }
		
		        if (
		            isWaypointMode &&
		            (
		                action === "split" ||
		                action === "reverse" ||
		                action === "elevation"
		            )
		        ) {
		            item.title =
		                "此功能僅支援路線";
		        } else {
		            item.title =
		                "";
		        }
		
		        if (canUse) {
		            item.classList.remove("disabled");
		            item.dataset.disabled = "false";
		        } else {
		            item.classList.add("disabled");
		            item.dataset.disabled = "true";
		        }
		    });
		
		    if (target.route || isWaypointMode) {
		        mainBtn.classList.remove("disabled");
		    } else {
		        mainBtn.classList.add("disabled");
		    }
		};

    const closeRouteToolPanel = function() {
        control.classList.remove("open");
        mainBtn.classList.remove("active");
    };

		const executeRouteToolAction = function(action) {
		    const target =
		        getCurrentRouteToolTarget();
		
		    const waypointTarget =
		        getCurrentWaypointToolTarget();
		
		    if (action === "paste-route") {
		        const stack =
		            window.multiGpxStack ||
		            multiGpxStack ||
		            [];
		
		        const file =
		            stack[target.fileIdx];
		
		        if (!file) return;
		
		        if (
		            window.copiedWaypointForPaste &&
		            window.copiedWaypointForPaste.waypoint
		        ) {
		            if (!Array.isArray(file.waypoints)) {
		                file.waypoints = [];
		            }
		
		            const copied =
		                JSON.parse(
		                    JSON.stringify(
		                        window.copiedWaypointForPaste.waypoint
		                    )
		                );
		
		            const baseName =
		                copied.name ||
		                copied.label ||
		                "航點";
		
		            const existingNames =
		                file.waypoints.map(function(w) {
		                    return String(
		                        w && (w.name || w.label || "")
		                    );
		                });
		
		            let newName =
		                baseName;
		
		            let n =
		                2;
		
		            while (existingNames.includes(newName)) {
		                newName =
		                    baseName + " " + n;
		                n++;
		            }
		
		            copied.name =
		                newName;
		
		            copied.label =
		                newName;
		
		            copied.id =
		                "pasted_wpt_" + Date.now();
		
		            copied.belongsToFile =
		                target.fileIdx;
		
		            copied.belongsToRoute =
		                typeof window.currentActiveIndex === "number"
		                    ? window.currentActiveIndex
		                    : 0;
		
		            copied.isCustom =
		                true;
		
		            delete copied.hiddenRouteIndexes;
		            delete copied.visibleRouteIndexes;
		
		            const insertIdx =
		                file.waypoints.length;
		
		            const refreshAfterPasteWaypoint = function() {
		                if (Array.isArray(file.routes)) {
		                    file.routes.forEach(function(route) {
		                        if (route) {
		                            route.waypoints =
		                                file.waypoints;
		                        }
		                    });
		                }
		
		                const routeIdx =
		                    typeof window.currentActiveIndex === "number"
		                        ? window.currentActiveIndex
		                        : 0;
		
		                const routeForWpt =
		                    Array.isArray(file.routes) &&
		                    file.routes[routeIdx]
		                        ? file.routes[routeIdx]
		                        : file;
		
		                routeForWpt.waypoints =
		                    file.waypoints;
		
		                if (typeof loadRoute === "function") {
		                    loadRoute(
		                        routeIdx,
		                        null,
		                        {
		                            skipAutoFitBounds: true,
		                            preserveChartState: true
		                        }
		                    );
		                }
		
		                if (typeof renderWaypointsAndPeaks === "function") {
		                    renderWaypointsAndPeaks(routeForWpt);
		                }
		
		                if (typeof updateWptTable === "function") {
		                    updateWptTable();
		                }
		
		                if (typeof updateWptIconStatus === "function") {
		                    updateWptIconStatus();
		                }
		
		                if (typeof window.renderRouteToolControl === "function") {
		                    window.renderRouteToolControl();
		                }
		            };
		
		            const command = {
		                fileIndex: target.fileIdx,
		                waypointIndex: insertIdx,
		                skipAutoLoadRouteAfterUndo: true,
		
		                do: function() {
		                    const exists =
		                        file.waypoints.some(function(w) {
		                            return w && w.id === copied.id;
		                        });
		
		                    if (!exists) {
		                        file.waypoints.splice(
		                            insertIdx,
		                            0,
		                            copied
		                        );
		                    }
		
		                    window.currentToolTarget = {
		                        type: "waypoint",
		                        fileIdx: target.fileIdx,
		                        routeIdx:
		                            typeof window.currentActiveIndex === "number"
		                                ? window.currentActiveIndex
		                                : 0,
		                        wptIdx: insertIdx
		                    };
		
		                    refreshAfterPasteWaypoint();
		                },
		
		                undo: function() {
		                    const idx =
		                        file.waypoints.findIndex(function(w) {
		                            return w && w.id === copied.id;
		                        });
		
		                    if (idx > -1) {
		                        file.waypoints.splice(
		                            idx,
		                            1
		                        );
		                    }
		
		                    window.currentToolTarget = {
		                        type: "route",
		                        fileIdx: target.fileIdx,
		                        routeIdx:
		                            typeof window.currentActiveIndex === "number"
		                                ? window.currentActiveIndex
		                                : 0,
		                        wptIdx: null
		                    };
		
		                    refreshAfterPasteWaypoint();
		                },
		
		                redo: function() {
		                    this.do();
		                }
		            };
		
		            if (
		                typeof historyManager !== "undefined" &&
		                historyManager &&
		                typeof historyManager.execute === "function"
		            ) {
		                historyManager.execute(command);
		            } else {
		                command.do();
		            }
		
		            if (typeof showMapToast === "function") {
		                showMapToast("已貼上航點");
		            }
		
		            return;
		        }
		
		        if (typeof window.pasteCopiedRouteToCurrentFile === "function") {
		            window.pasteCopiedRouteToCurrentFile(
		                target.fileIdx
		            );
		        } else {
		            alert("尚未建立貼上路線功能");
		        }
		
		        return;
		    }
		
		    if (action === "copy-route") {
		        if (waypointTarget.isWaypoint) {
		            window.copiedWaypointForPaste = {
		                type: "waypoint",
		                waypoint: JSON.parse(
		                    JSON.stringify(
		                        waypointTarget.waypoint
		                    )
		                )
		            };
		
		            window.copiedRouteForPaste =
		                null;
		
		            if (typeof showMapToast === "function") {
		                showMapToast("已複製航點");
		            }
		
		            return;
		        }
		
		        if (!target.route || !target.canOperate) {
		            return;
		        }
		
		        if (typeof window.copyCurrentRouteForPaste === "function") {
		            window.copyCurrentRouteForPaste(
		                target.fileIdx,
		                target.routeIdx
		            );
		
		            window.copiedWaypointForPaste =
		                null;
		
		        } else {
		            alert("尚未建立複製路線功能");
		        }
		
		        return;
		    }
		
		    if (action === "rename") {
		        if (waypointTarget.isWaypoint) {
		            if (typeof handleWptEditByIndex === "function") {
		                handleWptEditByIndex(
		                    waypointTarget.wptIdx
		                );
		            }
		
		            return;
		        }
		
		        if (!target.route || !target.canOperate) {
		            return;
		        }
		
		        if (typeof renameSubRoute === "function") {
		            renameSubRoute(
		                target.fileIdx,
		                target.routeIdx,
		                {
		                    skipOpenGpxManager: true
		                }
		            );
		        }
		
		        return;
		    }
		
		    if (action === "delete") {
		        if (waypointTarget.isWaypoint) {
		            if (typeof deleteWaypoint === "function") {
		                deleteWaypoint(
		                    waypointTarget.wptIdx
		                );
		            }
		
		            return;
		        }
		
		        if (!target.route || !target.canOperate) {
		            return;
		        }
		
		        if (typeof deleteSubRoute === "function") {
		            deleteSubRoute(
		                target.fileIdx,
		                target.routeIdx,
		                {
		                    skipOpenGpxManager: true
		                }
		            );
		        }
		
		        return;
		    }
		
		    if (!target.route || !target.canOperate) {
		        return;
		    }
		
		    if (action === "split") {
		        if (typeof window.startSplitRouteMode === "function") {
		            window.startSplitRouteMode(
		                target.fileIdx,
		                target.routeIdx
		            );
		        }
		
		        return;
		    }
		
		    if (action === "reverse") {
		        if (typeof reverseSubRoute === "function") {
		            reverseSubRoute(
		                target.fileIdx,
		                target.routeIdx,
		                {
		                    skipOpenGpxManager: true
		                }
		            );
		        }
		
		        return;
		    }
		
		    if (action === "elevation") {
		        if (typeof window.fillElevationForRoute === "function") {
		            window.fillElevationForRoute(
		                target.fileIdx,
		                target.routeIdx
		            );
		        } else {
		            alert("尚未建立取得高度功能");
		        }
		
		        return;
		    }
		};

    mainBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();

        refreshPanelState();

        control.classList.toggle("open");

        if (control.classList.contains("open")) {
            mainBtn.classList.add("active");
        } else {
            mainBtn.classList.remove("active");
        }
    };

    panel.querySelectorAll(
        ".route-tool-item, .route-tool-icon-btn"
    ).forEach(function(item) {
        item.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();

            if (item.dataset.disabled === "true") {
                return;
            }

            closeRouteToolPanel();

            executeRouteToolAction(
                item.dataset.action
            );
        };
    });

    if (!window.routeToolOutsideCloseInstalled) {
        window.routeToolOutsideCloseInstalled = true;

        document.addEventListener(
            "mousedown",
            function(e) {
                const c =
                    document.getElementById("routeToolControl");

                if (!c) return;

                if (c.contains(e.target)) return;

                c.classList.remove("open");

                const btn =
                    document.getElementById("routeToolMainBtn");

                if (btn) {
                    btn.classList.remove("active");
                }
            },
            true
        );

        document.addEventListener(
            "touchstart",
            function(e) {
                const c =
                    document.getElementById("routeToolControl");

                if (!c) return;

                if (c.contains(e.target)) return;

                c.classList.remove("open");

                const btn =
                    document.getElementById("routeToolMainBtn");

                if (btn) {
                    btn.classList.remove("active");
                }
            },
            true
        );
    }

    if (!window.routeToolKeyboardShortcutInstalled) {
        window.routeToolKeyboardShortcutInstalled =
            true;

        document.addEventListener("keydown", function(e) {
            const target =
                e.target;

            const tagName =
                target && target.tagName
                    ? target.tagName.toLowerCase()
                    : "";

            const isTyping =
                tagName === "input" ||
                tagName === "textarea" ||
                tagName === "select" ||
                (
                    target &&
                    target.isContentEditable
                );

            if (isTyping) {
                return;
            }

            const key =
                String(e.key || "").toLowerCase();

            const isMac =
                navigator.platform &&
                navigator.platform.toUpperCase().indexOf("MAC") >= 0;

            const isMainModifier =
                isMac
                    ? e.metaKey && !e.ctrlKey
                    : e.ctrlKey && !e.metaKey;

            const isCopy =
                isMainModifier &&
                key === "c";

            const isPaste =
                isMainModifier &&
                key === "v";

            const isDelete =
                e.key === "Delete" ||
                e.key === "Backspace";

            if (isCopy) {
                e.preventDefault();
                e.stopPropagation();

                executeRouteToolAction(
                    "copy-route"
                );

                return;
            }

            if (isPaste) {
                e.preventDefault();
                e.stopPropagation();

                executeRouteToolAction(
                    "paste-route"
                );

                return;
            }

            if (isDelete) {
                e.preventDefault();
                e.stopPropagation();

                executeRouteToolAction(
                    "delete"
                );

                return;
            }
        });
    }

    refreshPanelState();
};

window.refreshGpxManagerIfOpen = function() {
    const modal =
        document.getElementById("gpxManageModal");

    const isOpen =
        modal &&
        modal.style.display !== "none";

    if (
        !isOpen ||
        typeof showGpxManagementModal !== "function"
    ) {
        return;
    }

    const scrollBodyBefore =
        document.getElementById("gpxManageScrollBody");

    const oldScrollTop =
        scrollBodyBefore
            ? scrollBodyBefore.scrollTop
            : 0;

    showGpxManagementModal();

    setTimeout(function() {
        const scrollBodyAfter =
            document.getElementById("gpxManageScrollBody");

        if (scrollBodyAfter) {
            scrollBodyAfter.scrollTop =
                oldScrollTop;
        }
    }, 0);
};

window.fixPageAndMapOffset = function() {
    
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;

    
    document.documentElement.style.marginLeft = "0px";
    document.documentElement.style.transform = "";

    document.body.style.marginLeft = "0px";
    document.body.style.transform = "";
    document.body.style.left = "0px";
    document.body.style.right = "0px";

    const mapEl =
        document.getElementById("map");

    if (mapEl) {
        mapEl.style.left = "0px";
        mapEl.style.right = "0px";
        mapEl.style.marginLeft = "0px";
        mapEl.style.marginRight = "0px";
        mapEl.style.transform = "";
    }

    if (
        typeof map !== "undefined" &&
        map
    ) {
        setTimeout(function() {
            if (typeof map.invalidateSize === "function") {
                map.invalidateSize();
            }

            if (typeof map.panBy === "function") {
                map.panBy([0, 0], {
                    animate: false
                });
            }
        }, 50);
    }
};

function cloneRouteForSplit(route) {
    if (!route) {
        return null;
    }

    const skipKeys = {
        layer: true,
        hitLayer: true,
        layerGroup: true,
        marker: true,
        markers: true,
        wptMarkers: true,
        popup: true,
        tooltip: true,
        _map: true,
        _leaflet_id: true,
        _events: true,
        _eventParents: true,
        _renderer: true,
        dragging: true,
        editing: true
    };

    const isLeafletObject = function(value) {
        if (!value || typeof value !== "object") {
            return false;
        }

        if (
            typeof L !== "undefined" &&
            L.Layer &&
            value instanceof L.Layer
        ) {
            return true;
        }

        return (
            value._leaflet_id !== undefined ||
            value._map !== undefined
        );
    };

    const cloneValue = function(value) {
        if (
            value === null ||
            value === undefined ||
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean"
        ) {
            return value;
        }

        if (typeof value === "function") {
            return undefined;
        }

        if (isLeafletObject(value)) {
            return undefined;
        }

        if (Array.isArray(value)) {
            return value
                .map(function(item) {
                    return cloneValue(item);
                })
                .filter(function(item) {
                    return item !== undefined;
                });
        }

        if (typeof value === "object") {
            const result = {};

            Object.keys(value).forEach(function(key) {
                if (skipKeys[key]) {
                    return;
                }

                const cloned =
                    cloneValue(value[key]);

                if (cloned !== undefined) {
                    result[key] =
                        cloned;
                }
            });

            return result;
        }

        return undefined;
    };

    const cloned =
        cloneValue(route);

    if (!Array.isArray(cloned.points)) {
        cloned.points = [];
    }

    if (!Array.isArray(cloned.segments)) {
        cloned.segments = [];
    }

    delete cloned.layer;
    delete cloned.hitLayer;
    delete cloned.layerGroup;
    delete cloned.marker;
    delete cloned.markers;
    delete cloned.wptMarkers;

    return cloned;
}

function cloneWaypointsForSplit(waypoints) {
    return JSON.parse(JSON.stringify(waypoints || []));
}

function pointsToSingleSegment(points) {
    return [
        points.map(function(p) {
            return [p.lat, p.lon];
        })
    ];
}

function getUniqueSplitRouteName(routes, baseName) {
    baseName =
        String(baseName || "子路線").trim();

    let maxNo = 1;

    const pattern =
        new RegExp("^" + baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*(\\d+)?$");

    routes.forEach(function(route) {
        if (!route) return;

        const name =
            String(
                route.routeDisplayName ||
                route.displayName ||
                route.name ||
                ""
            ).trim();

        const match =
            name.match(pattern);

        if (match) {
            const n =
                match[1]
                    ? parseInt(match[1], 10)
                    : 1;

            if (Number.isFinite(n)) {
                maxNo =
                    Math.max(maxNo, n);
            }
        }
    });

    return baseName + " " + (maxNo + 1);
}

function findNearestPointIndexOnRoute(latlng, route) {
    if (
        !latlng ||
        !route ||
        !Array.isArray(route.points) ||
        route.points.length === 0
    ) {
        return -1;
    }

    let nearestIdx =
        -1;

    let nearestDist =
        Infinity;

    route.points.forEach(function(p, idx) {
        if (!p) return;

        const d =
            Math.sqrt(
                Math.pow(Number(p.lat) - Number(latlng.lat), 2) +
                Math.pow(Number(p.lon) - Number(latlng.lng), 2)
            );

        if (d < nearestDist) {
            nearestDist =
                d;

            nearestIdx =
                idx;
        }
    });

    return nearestIdx;
}

function isWaypointAfterSplitPoint(wpt, beforePoints, afterPoints, splitIdx) {
    if (!wpt) return false;

    const splitPoint =
        beforePoints &&
        beforePoints[beforePoints.length - 1]
            ? beforePoints[beforePoints.length - 1]
            : null;

    if (
        splitPoint &&
        Number.isFinite(Number(splitPoint.distance)) &&
        Number.isFinite(Number(wpt.distance))
    ) {
        return Number(wpt.distance) >= Number(splitPoint.distance);
    }

    if (
        splitPoint &&
        splitPoint.time &&
        wpt.time
    ) {
        const splitTime =
            new Date(splitPoint.time).getTime();

        const wptTime =
            new Date(wpt.time).getTime();

        if (
            Number.isFinite(splitTime) &&
            Number.isFinite(wptTime)
        ) {
            return wptTime >= splitTime;
        }
    }

    const allPoints =
        beforePoints.concat(afterPoints.slice(1));

    let nearestIdx =
        -1;

    let nearestDist =
        Infinity;

    allPoints.forEach(function(p, idx) {
        if (!p) return;

        const d =
            Math.sqrt(
                Math.pow(Number(p.lat) - Number(wpt.lat), 2) +
                Math.pow(Number(p.lon) - Number(wpt.lon), 2)
            );

        if (d < nearestDist) {
            nearestDist =
                d;

            nearestIdx =
                idx;
        }
    });

    return nearestIdx >= splitIdx;
}

function remapRouteIndexArrayForSplit(arr, routeIdx, newRouteIdx, moveToSecond) {
    if (!Array.isArray(arr)) return [];

    let result =
        arr
            .map(Number)
            .filter(function(idx) {
                return Number.isFinite(idx);
            })
            .map(function(idx) {

                if (idx > routeIdx) {
                    return idx + 1;
                }

                return idx;
            });

    if (moveToSecond) {
        result =
            result.map(function(idx) {
                return idx === routeIdx
                    ? newRouteIdx
                    : idx;
            });
    }

    return Array.from(new Set(result));
}

function refreshAfterSplit(fileIdx, routeIdxToShow) {
    const stack =
        window.multiGpxStack ||
        multiGpxStack ||
        [];

    const currentFile =
        stack[fileIdx];

    if (!currentFile) return;

    window.currentMultiIndex =
        fileIdx;

    window.currentActiveIndex =
        routeIdxToShow;

    if (typeof rebuildCombinedRouteForFile === "function") {
        rebuildCombinedRouteForFile(currentFile);
    }

    if (typeof syncDrawingGlobals === "function") {
        syncDrawingGlobals(
            currentFile,
            routeIdxToShow
        );
    }

    if (typeof updateRouteSelectDropdown === "function") {
        updateRouteSelectDropdown();
    }

    const routeSelect =
        document.getElementById("routeSelect");

    if (
        routeSelect &&
        routeSelect.options &&
        routeSelect.options.length > routeIdxToShow
    ) {
        routeSelect.value =
            String(routeIdxToShow);
    }

    if (typeof loadRoute === "function") {
        loadRoute(routeIdxToShow, null);
    }

    if (typeof renderRouteInfo === "function") {
        renderRouteInfo();
    }

    if (typeof renderMultiGpxButtons === "function") {
        renderMultiGpxButtons();
    }

    if (typeof window.refreshGpxManagerIfOpen === "function") {
        window.refreshGpxManagerIfOpen();
    }

    if (
        typeof historyManager !== "undefined" &&
        historyManager &&
        typeof historyManager.updateUI === "function"
    ) {
        historyManager.updateUI();
    }
}

window.splitSubRoute = function(fileIdx, routeIdx, splitPointIndex, options = {}) {
    const stack =
        window.multiGpxStack ||
        multiGpxStack ||
        [];

    const currentFile =
        stack[fileIdx];

    if (!currentFile) {
        alert("找不到要分割的路線");
        return;
    }

    let targetRoute =
        null;

    if (
        Array.isArray(currentFile.routes) &&
        currentFile.routes[routeIdx]
    ) {
        targetRoute =
            currentFile.routes[routeIdx];

    } else if (
        currentFile &&
        (
            currentFile.isDrawTrack === true ||
            currentFile.isHandDrawRoute === true ||
            options.isFileRoute === true
        ) &&
        Array.isArray(currentFile.points) &&
        currentFile.points.length >= 2
    ) {
        routeIdx =
            0;

        targetRoute =
            currentFile;
    }

    if (!targetRoute) {
        alert("找不到要分割的路線");
        return;
    }

    if (targetRoute.isCombined === true) {
        alert("結合路線不能直接分割，請切到子路線再分割");
        return;
    }

    if (
        !Array.isArray(targetRoute.points) ||
        targetRoute.points.length < 2
    ) {
        alert("此路線點數不足，無法分割");
        return;
    }

    splitPointIndex =
        parseInt(splitPointIndex, 10);

    const hasInsertPoint =
        options &&
        options.insertPoint;

    if (
        !Number.isFinite(splitPointIndex) ||
        splitPointIndex <= 0 ||
        (
            !hasInsertPoint &&
            splitPointIndex >= targetRoute.points.length - 1
        ) ||
        (
            hasInsertPoint &&
            splitPointIndex >= targetRoute.points.length
        )
    ) {
        alert("分割位置太靠近起點或終點，請選路線中間位置");
        return;
    }

    const fileStateBefore = {
        routes: Array.isArray(currentFile.routes)
            ? currentFile.routes.map(function(route) {
                return cloneRouteForSplit(route);
            })
            : null,

        points: Array.isArray(currentFile.points)
            ? currentFile.points.map(function(p) {
                return { ...p };
            })
            : [],

        segments: Array.isArray(currentFile.segments)
            ? JSON.parse(JSON.stringify(currentFile.segments))
            : [],

        waypoints: cloneWaypointsForSplit(currentFile.waypoints || []),

        isDrawTrack: currentFile.isDrawTrack === true,
        isHandDrawRoute: currentFile.isHandDrawRoute === true,
        isCombined: currentFile.isCombined === true,

        customRouteNames: currentFile.customRouteNames
            ? { ...currentFile.customRouteNames }
            : {}
    };

    const routesBefore =
        fileStateBefore.routes
            ? fileStateBefore.routes.map(function(route) {
                return cloneRouteForSplit(route);
            })
            : [];

    const waypointsBefore =
        cloneWaypointsForSplit(fileStateBefore.waypoints || []);

    
    const restoreWaypointsInPlaceForSplit = function(snapshotWaypoints) {
        const source =
            cloneWaypointsForSplit(snapshotWaypoints || []);

        if (!Array.isArray(currentFile.waypoints)) {
            currentFile.waypoints =
                [];
        }

        currentFile.waypoints.length =
            source.length;

        source.forEach(function(srcWpt, idx) {
            if (!currentFile.waypoints[idx]) {
                currentFile.waypoints[idx] =
                    {};
            }

            Object.keys(currentFile.waypoints[idx]).forEach(function(key) {
                delete currentFile.waypoints[idx][key];
            });

            Object.assign(
                currentFile.waypoints[idx],
                srcWpt
            );
        });

        if (Array.isArray(currentFile.routes)) {
            currentFile.routes.forEach(function(route) {
                if (route) {
                    route.waypoints =
                        currentFile.waypoints;
                }
            });
        }

        if (Array.isArray(window.allTracks)) {
            window.allTracks.forEach(function(route) {
                if (route) {
                    route.waypoints =
                        currentFile.waypoints;
                }
            });
        }
    };

    const activeFileBefore =
        typeof window.currentMultiIndex === "number"
            ? window.currentMultiIndex
            : 0;

    const activeRouteBefore =
        typeof window.currentActiveIndex === "number"
            ? window.currentActiveIndex
            : 0;

    let newRouteIdxAfterSplit =
        routeIdx + 1;

    const applySplit = function() {

        
        restoreWaypointsInPlaceForSplit(
            waypointsBefore
        );

        if (
            fileStateBefore.routes &&
            fileStateBefore.routes.length > 0
        ) {
            currentFile.routes =
                fileStateBefore.routes.map(function(route) {
                    return cloneRouteForSplit(route);
                });

        } else {
            const firstRouteName =
                currentFile.routeDisplayName ||
                currentFile.displayName ||
                currentFile.name ||
                "自訂路線";

            const firstRoute = {
                id: currentFile.id || ("draw_route_" + Date.now()),
                name: firstRouteName,
                displayName: firstRouteName,
                routeDisplayName: firstRouteName,
                fileName: currentFile.fileName || currentFile.name || "自訂路線",
                color: currentFile.color || "#0000FF",
                points: fileStateBefore.points.map(function(p) {
                    return { ...p };
                }),
                segments: JSON.parse(JSON.stringify(fileStateBefore.segments || [])),
                waypoints: currentFile.waypoints || [],
                visible: true,
                isCombined: false,
                isDrawTrack: true,
                isHandDrawRoute: true
            };

            currentFile.routes =
                [firstRoute];

            routeIdx =
                0;
        }

        
        if (Array.isArray(currentFile.routes)) {
            currentFile.routes.forEach(function(route) {
                if (route) {
                    route.waypoints =
                        currentFile.waypoints || [];
                }
            });
        }

        currentFile.isDrawTrack =
            false;

        currentFile.isHandDrawRoute =
            false;

        currentFile.isCombined =
            false;

        const routeToSplit =
            currentFile.routes[routeIdx];

        let points =
            Array.isArray(routeToSplit.points)
                ? routeToSplit.points.slice()
                : [];

        if (
            options &&
            options.insertPoint
        ) {
            const insertPoint = {
                ...options.insertPoint
            };

            if (
                splitPointIndex > 0 &&
                splitPointIndex < points.length
            ) {
                points.splice(
                    splitPointIndex,
                    0,
                    insertPoint
                );
            }
        }

        routeToSplit.points =
            points;

        const firstPoints =
            points.slice(0, splitPointIndex + 1);

        const secondPoints =
            points.slice(splitPointIndex);

        const baseName =
            routeToSplit.routeDisplayName ||
            routeToSplit.displayName ||
            routeToSplit.name ||
            "子路線";

        const newRouteName =
            getUniqueSplitRouteName(
                currentFile.routes,
                baseName
            );

        routeToSplit.points =
            firstPoints;

        routeToSplit.segments =
            pointsToSingleSegment(firstPoints);

        routeToSplit.isCombined =
            false;

        routeToSplit.waypoints =
            currentFile.waypoints || [];

        const newRoute = {
            ...cloneRouteForSplit(routeToSplit),
            id: "split_route_" + Date.now(),
            name: newRouteName,
            displayName: newRouteName,
            routeDisplayName: newRouteName,
            points: secondPoints,
            segments: pointsToSingleSegment(secondPoints),
            visible: true,
            isCombined: false,
            isDrawTrack: routeToSplit.isDrawTrack === true,
            isHandDrawRoute: routeToSplit.isHandDrawRoute === true,
            waypoints: currentFile.waypoints || []
        };

        currentFile.routes.splice(
            routeIdx + 1,
            0,
            newRoute
        );

        newRouteIdxAfterSplit =
            routeIdx + 1;

        if (Array.isArray(currentFile.waypoints)) {
            currentFile.waypoints.forEach(function(wpt) {
                if (!wpt) return;

                const moveToSecond =
                    isWaypointAfterSplitPoint(
                        wpt,
                        firstPoints,
                        secondPoints,
                        splitPointIndex
                    );

                if (wpt.belongsToRoute !== undefined) {
                    const oldBelongs =
                        Number(wpt.belongsToRoute);

                    if (oldBelongs > routeIdx) {
                        wpt.belongsToRoute =
                            oldBelongs + 1;

                    } else if (
                        oldBelongs === routeIdx &&
                        moveToSecond
                    ) {
                        wpt.belongsToRoute =
                            newRouteIdxAfterSplit;
                    }
                }

                wpt.visibleRouteIndexes =
                    remapRouteIndexArrayForSplit(
                        wpt.visibleRouteIndexes,
                        routeIdx,
                        newRouteIdxAfterSplit,
                        moveToSecond
                    );

                wpt.hiddenRouteIndexes =
                    remapRouteIndexArrayForSplit(
                        wpt.hiddenRouteIndexes,
                        routeIdx,
                        newRouteIdxAfterSplit,
                        moveToSecond
                    );
            });
        }

        const combinedIdxBeforeNormalize =
            currentFile.routes.findIndex(function(route) {
                return route && route.isCombined === true;
            });

        if (
            combinedIdxBeforeNormalize === -1 &&
            currentFile.routes.length >= 2
        ) {
            const childRoutes =
                currentFile.routes.map(function(route) {
                    if (route) {
                        route.isCombined =
                            false;
                    }

                    route.waypoints =
                        currentFile.waypoints || [];

                    return route;
                });

            const originalFirstRoute =
                childRoutes[0];

            const originalFirstRouteName =
                originalFirstRoute.routeDisplayName ||
                originalFirstRoute.displayName ||
                originalFirstRoute.name ||
                baseName ||
                "路線";

            const combinedName =
                originalFirstRouteName;

            const combinedPoints =
                [];

            childRoutes.forEach(function(route) {
                if (
                    route &&
                    Array.isArray(route.points)
                ) {
                    route.points.forEach(function(p) {
                        combinedPoints.push(p);
                    });
                }
            });

            const combinedRoute = {
                id: "combined_route_" + Date.now(),
                name: combinedName,
                displayName: combinedName,
                routeDisplayName: combinedName,
                fileName: currentFile.fileName || currentFile.name || originalFirstRouteName,
                color: originalFirstRoute.color || currentFile.color || "#0000FF",
                points: combinedPoints,
                segments: pointsToSingleSegment(combinedPoints),
                waypoints: currentFile.waypoints || [],
                visible: true,
                isCombined: true,
                isDrawTrack: false,
                isHandDrawRoute: false
            };

            currentFile.routes =
                [combinedRoute].concat(childRoutes);

            newRouteIdxAfterSplit =
                newRouteIdxAfterSplit + 1;

            if (Array.isArray(currentFile.waypoints)) {
                currentFile.waypoints.forEach(function(wpt) {
                    if (!wpt) return;

                    if (wpt.belongsToRoute !== undefined) {
                        const oldBelongs =
                            Number(wpt.belongsToRoute);

                        if (Number.isFinite(oldBelongs)) {
                            wpt.belongsToRoute =
                                oldBelongs + 1;
                        }
                    }

                    if (Array.isArray(wpt.visibleRouteIndexes)) {
                        wpt.visibleRouteIndexes =
                            wpt.visibleRouteIndexes.map(function(idx) {
                                const n =
                                    Number(idx);

                                return Number.isFinite(n)
                                    ? n + 1
                                    : idx;
                            });
                    }

                    if (Array.isArray(wpt.hiddenRouteIndexes)) {
                        wpt.hiddenRouteIndexes =
                            wpt.hiddenRouteIndexes.map(function(idx) {
                                const n =
                                    Number(idx);

                                return Number.isFinite(n)
                                    ? n + 1
                                    : idx;
                            });
                    }
                });
            }

        } else {
            const combinedIdx =
                currentFile.routes.findIndex(function(route) {
                    return route && route.isCombined === true;
                });

            if (combinedIdx > -1) {
                const combinedRoute =
                    currentFile.routes[combinedIdx];

                const combinedPoints =
                    [];

                currentFile.routes.forEach(function(route, idx) {
                    if (
                        idx !== combinedIdx &&
                        route &&
                        route.isCombined !== true &&
                        Array.isArray(route.points)
                    ) {
                        route.points.forEach(function(p) {
                            combinedPoints.push(p);
                        });
                    }
                });

                combinedRoute.points =
                    combinedPoints;

                combinedRoute.segments =
                    pointsToSingleSegment(combinedPoints);

                combinedRoute.waypoints =
                    currentFile.waypoints || [];

                combinedRoute.visible =
                    true;

                combinedRoute.isCombined =
                    true;
            }
        }

        currentFile.routes.forEach(function(route) {
            if (route) {
                route.waypoints =
                    currentFile.waypoints || [];
            }
        });

        currentFile.customRouteNames =
            {};

        currentFile.routes.forEach(function(route, idx) {
            if (!route) return;

            const routeName =
                route.routeDisplayName ||
                route.displayName ||
                route.name ||
                ("路線" + idx);

            currentFile.customRouteNames[idx] =
                routeName;
        });

        if (
            currentFile.routes[0] &&
            currentFile.routes[0].isCombined === true
        ) {
            currentFile.points =
                currentFile.routes[0].points || [];

            currentFile.segments =
                currentFile.routes[0].segments || [];

        } else {
            currentFile.points =
                routeToSplit.points;

            currentFile.segments =
                routeToSplit.segments;
        }

        refreshAfterSplit(
            fileIdx,
            newRouteIdxAfterSplit
        );

        if (typeof window.scheduleGpxDraftSave === "function") {
            window.scheduleGpxDraftSave();
        }
    };

    const undoSplit = function() {

        
        restoreWaypointsInPlaceForSplit(
            fileStateBefore.waypoints || []
        );

        if (
            fileStateBefore.routes &&
            fileStateBefore.routes.length > 0
        ) {
            currentFile.routes =
                fileStateBefore.routes.map(function(route) {
                    return cloneRouteForSplit(route);
                });

        } else {
            delete currentFile.routes;
        }

        currentFile.points =
            fileStateBefore.points.map(function(p) {
                return { ...p };
            });

        currentFile.segments =
            JSON.parse(JSON.stringify(fileStateBefore.segments || []));

        currentFile.isDrawTrack =
            fileStateBefore.isDrawTrack;

        currentFile.isHandDrawRoute =
            fileStateBefore.isHandDrawRoute;

        currentFile.isCombined =
            fileStateBefore.isCombined;

        currentFile.customRouteNames =
            fileStateBefore.customRouteNames
                ? { ...fileStateBefore.customRouteNames }
                : {};

        if (
            Array.isArray(currentFile.routes)
        ) {
            currentFile.routes.forEach(function(route) {
                if (route) {
                    route.waypoints =
                        currentFile.waypoints || [];
                }
            });
        }

        if (
            fileStateBefore.routes &&
            fileStateBefore.routes[routeIdx]
        ) {
            currentFile.points =
                fileStateBefore.routes[routeIdx].points || [];

            currentFile.segments =
                fileStateBefore.routes[routeIdx].segments || [];
        }

        allTracks =
            Array.isArray(currentFile.routes) && currentFile.routes.length > 0
                ? currentFile.routes
                : [currentFile];

        window.allTracks =
            allTracks;

        if (Array.isArray(window.allTracks)) {
            window.allTracks.forEach(function(route) {
                if (route) {
                    route.waypoints =
                        currentFile.waypoints || [];
                }
            });
        }

        trackPoints =
            Array.isArray(currentFile.points)
                ? currentFile.points
                : [];

        window.trackPoints =
            trackPoints;

        window.currentMultiIndex =
            activeFileBefore;

        window.currentActiveIndex =
            activeRouteBefore;

        if (typeof updateRouteSelectDropdown === "function") {
            updateRouteSelectDropdown();
        }

        if (
            typeof activeRouteLayer !== "undefined" &&
            activeRouteLayer &&
            map &&
            map.hasLayer(activeRouteLayer)
        ) {
            map.removeLayer(activeRouteLayer);
            activeRouteLayer =
                null;
        }

        if (
            typeof window.activeRouteLayer !== "undefined" &&
            window.activeRouteLayer &&
            map &&
            map.hasLayer(window.activeRouteLayer)
        ) {
            map.removeLayer(window.activeRouteLayer);
            window.activeRouteLayer =
                null;
        }

        if (
            window.activeRouteHaloLayer &&
            map &&
            map.hasLayer(window.activeRouteHaloLayer)
        ) {
            map.removeLayer(window.activeRouteHaloLayer);
            window.activeRouteHaloLayer =
                null;
        }

        refreshAfterSplit(
            fileIdx,
            activeRouteBefore
        );

        if (typeof window.scheduleGpxDraftSave === "function") {
            window.scheduleGpxDraftSave();
        }
    };

    const command = {
        fileIndex: fileIdx,

        managedFileIndex: fileIdx,
        routeIndex: routeIdx,
        skipAutoLoadRouteAfterUndo: true,

        do: function() {
            applySplit();
        },

        undo: function() {
            undoSplit();
        },

        redo: function() {
            applySplit();
        }
    };

    if (
        typeof historyManager !== "undefined" &&
        historyManager &&
        typeof historyManager.execute === "function"
    ) {
        historyManager.execute(command);

    } else {
        command.do();
    }
};

window.startSplitRouteMode = function(fileIdx, routeIdx) {
	
	   if (typeof isDrawingMode !== 'undefined' && isDrawingMode) {
        isDrawingMode = false;

        const drawBtn = document.getElementById('drawModeBtn');
        const methodBtn = document.getElementById('drawMethodBtn');

        if (drawBtn) {
            drawBtn.style.setProperty('background', "white", 'important');
            drawBtn.style.setProperty('color', "#5f6368", 'important');
        }

        if (methodBtn) {
            methodBtn.style.display = "none";
        }

        document.getElementById('map').style.cursor = '';

        if (typeof map !== 'undefined') {
            map.dragging.enable();
            map.boxZoom.enable();
        }
    }
    
   const oldToast =
        document.getElementById("map-toast");

    if (oldToast) {
        oldToast.style.opacity = "0";
    }

    if (window.mapToastTimer) {
        clearTimeout(window.mapToastTimer);
        window.mapToastTimer = null;
    }

    window.currentMapToast = null;
	
    if (window.splitRoutePickMode) {
        if (typeof window.cancelSplitRouteMode === "function") {
            window.cancelSplitRouteMode();
        }

        if (typeof showMapToast === "function") {
            showMapToast("已取消分割模式");
        }

        return;
    }

    const stack =
        window.multiGpxStack ||
        multiGpxStack ||
        [];

    const currentFile =
        stack[fileIdx];

    if (!currentFile) {
        alert("找不到要分割的路線");
        return;
    }

    let route = null;

    let realRouteIdx =
        routeIdx;

    
    if (
        Array.isArray(currentFile.routes) &&
        currentFile.routes[routeIdx]
    ) {
        route =
            currentFile.routes[routeIdx];

    
    } else if (
        currentFile &&
        (
            currentFile.isDrawTrack === true ||
            currentFile.isHandDrawRoute === true
        ) &&
        Array.isArray(currentFile.points)
    ) {
        route =
            currentFile;

        realRouteIdx =
            0;

    
    } else if (
        Array.isArray(window.allTracks) &&
        window.allTracks[routeIdx]
    ) {
        route =
            window.allTracks[routeIdx];
    }

    if (!route) {
        alert("找不到要分割的路線");
        return;
    }

    if (route.isCombined === true) {
        alert("結合路線不能直接分割，請選子路線");
        return;
    }

    
    if (
        !Array.isArray(route.points) ||
        route.points.length < 2
    ) {
        alert("此路線點數不足，無法分割");
        return;
    }

    window.splitRoutePickMode = {
        fileIdx: fileIdx,
        routeIdx: realRouteIdx,
        isFileRoute: route === currentFile
    };
    
    
		if (
		    window.splitRouteHitLayer &&
		    typeof map !== "undefined" &&
		    map.hasLayer(window.splitRouteHitLayer)
		) {
		    map.removeLayer(window.splitRouteHitLayer);
		}
		
		window.splitRouteHitLayer =
		    null;
		
		const splitLatLngs =
		    Array.isArray(route.segments) &&
		    route.segments.length > 0
		        ? route.segments
		        : [
		            route.points.map(function(p) {
		                return [
		                    p.lat,
		                    p.lon
		                ];
		            })
		        ];
		
		window.splitRouteHitLayer =
		    L.polyline(
		        splitLatLngs,
		        {
		            color: "#000000",
		            weight: 30,
		            opacity: 0.01,
		            interactive: true,
		            bubblingMouseEvents: false
		        }
		    ).addTo(map);
		
		window.splitRouteHitLayer.on("click", function(e) {
		    L.DomEvent.stopPropagation(e);
		
		    if (typeof window.executeSplitRoutePick === "function") {
		        window.executeSplitRoutePick(e.latlng);
		    }
		});
		
		if (
		    window.splitRouteHitLayer &&
		    typeof window.splitRouteHitLayer.bringToFront === "function"
		) {
		    window.splitRouteHitLayer.bringToFront();
		}
    
    const splitToolItem =
        document.querySelector('.route-tool-item[data-action="split"]');

    if (splitToolItem) {
        splitToolItem.classList.add("active");
        splitToolItem.dataset.active = "true";
    }
		
    let splitHint =
        document.getElementById("splitRouteModeHint");

    if (!splitHint) {
        splitHint =
            document.createElement("div");

        splitHint.id =
            "splitRouteModeHint";

        splitHint.style.cssText =
            "position:absolute;" +
            "left:50%;" +
            "top:20px;" +
            "transform:translateX(-50%);" +
            "z-index:2147483647;" +
            "background:rgba(0,0,0,0.78);" +
            "color:white;" +
            "padding:10px 20px;" +
            "border-radius:20px;" +
            "line-height:24px;" +
            "font-size:14px;" +
            "font-weight:600;" +
            "box-shadow:0 4px 12px rgba(0,0,0,0.25);" +
            "cursor:pointer;" +
            "user-select:none;" +
            "-webkit-user-select:none;";

        splitHint.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();

            if (typeof window.cancelSplitRouteMode === "function") {
                window.cancelSplitRouteMode();
            }

            if (typeof showMapToast === "function") {
                showMapToast("已取消分割模式");
            }
        };
    }

    const fsParent =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        (
            document.body.classList.contains("iphone-fullscreen")
                ? document.getElementById("map")
                : null
        ) ||
        document.body;

    if (splitHint.parentElement !== fsParent) {
        fsParent.appendChild(splitHint);
    }
		
    splitHint.innerHTML =
        "分割模式中：請在路線上點選要分割的位置，點此取消";
		
    splitHint.style.display =
        "block";

    if (!document.getElementById("splitCursorStyle")) {
        const style =
            document.createElement("style");

        style.id =
            "splitCursorStyle";

        style.innerHTML = `
            #map.split-cursor-mode,
            #map.split-cursor-mode *,
            #map.split-cursor-mode .leaflet-interactive {
                cursor: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><g transform='translate(16 16) rotate(210) translate(-16 -16)'><text x='7' y='22' font-size='22' fill='black' stroke='white' stroke-width='3' paint-order='stroke fill'>✂</text></g></svg>") 8 8, crosshair !important;
            }
        `;

        document.head.appendChild(style);
    }

    const mapEl =
        document.getElementById("map");

    if (mapEl) {
        mapEl.classList.add("split-cursor-mode");
        mapEl.style.cursor = "";
    }

};

window.cancelSplitRouteMode = function() {
		if (
		    window.splitRouteHitLayer &&
		    typeof map !== "undefined" &&
		    map.hasLayer(window.splitRouteHitLayer)
		) {
		    map.removeLayer(window.splitRouteHitLayer);
		}
		
		window.splitRouteHitLayer =
		    null;
		    
    window.splitRoutePickMode =
        null;

    const mapEl =
        document.getElementById("map");

    if (mapEl) {
        mapEl.classList.remove("split-cursor-mode");
        mapEl.style.cursor = "";
    }

    const splitHint =
        document.getElementById("splitRouteModeHint");

    if (splitHint) {
        splitHint.style.display = "none";
    }

    document
        .querySelectorAll('.route-tool-item[data-action="split"]')
        .forEach(function(item) {
            item.classList.remove("active");
            item.dataset.active = "false";
        });

    const routeToolControl =
        document.getElementById("routeToolControl");

    if (routeToolControl) {
        routeToolControl.classList.remove("open");
    }

    const routeToolMainBtn =
        document.getElementById("routeToolMainBtn");

    if (routeToolMainBtn) {
        routeToolMainBtn.classList.remove("active");
    }
};

window.executeSplitRoutePick = function(latlng) {
    if (!window.splitRoutePickMode) {
        return false;
    }

    const splitInfo =
        window.splitRoutePickMode;

    const stack =
        window.multiGpxStack ||
        multiGpxStack ||
        [];

    const currentFile =
        stack[splitInfo.fileIdx];

    let route = null;

    
    if (
        currentFile &&
        Array.isArray(currentFile.routes) &&
        currentFile.routes[splitInfo.routeIdx]
    ) {
        route =
            currentFile.routes[splitInfo.routeIdx];

    
    } else if (
        currentFile &&
        (
            currentFile.isDrawTrack === true ||
            currentFile.isHandDrawRoute === true ||
            splitInfo.isFileRoute === true
        ) &&
        Array.isArray(currentFile.points)
    ) {
        route =
            currentFile;

    
    } else if (
        Array.isArray(window.allTracks) &&
        window.allTracks[splitInfo.routeIdx]
    ) {
        route =
            window.allTracks[splitInfo.routeIdx];
    }

    if (
        !route ||
        !Array.isArray(route.points) ||
        route.points.length < 2
    ) {
        window.cancelSplitRouteMode();

        if (typeof showMapToast === "function") {
            showMapToast("找不到可以分割的路線，已取消分割模式");
        }

        return true;
    }

    if (
        typeof map === "undefined" ||
        !map ||
        typeof map.latLngToContainerPoint !== "function"
    ) {
        window.cancelSplitRouteMode();

        if (typeof showMapToast === "function") {
            showMapToast("地圖尚未準備完成，已取消分割模式");
        }

        return true;
    }

    const clickPoint =
        map.latLngToContainerPoint(latlng);

    let nearestSegmentIdx =
        -1;

    let nearestPixelDistance =
        Infinity;

    let projectedPoint =
        null;

    
    for (let i = 0; i < route.points.length - 1; i++) {
        const p1 =
            route.points[i];

        const p2 =
            route.points[i + 1];

        if (!p1 || !p2) continue;

        const p1Lat =
            Number(p1.lat);

        const p1Lon =
            Number(p1.lon);

        const p2Lat =
            Number(p2.lat);

        const p2Lon =
            Number(p2.lon);

        if (
            !Number.isFinite(p1Lat) ||
            !Number.isFinite(p1Lon) ||
            !Number.isFinite(p2Lat) ||
            !Number.isFinite(p2Lon)
        ) {
            continue;
        }

        const a =
            map.latLngToContainerPoint(
                L.latLng(p1Lat, p1Lon)
            );

        const b =
            map.latLngToContainerPoint(
                L.latLng(p2Lat, p2Lon)
            );

        const abx =
            b.x - a.x;

        const aby =
            b.y - a.y;

        const apx =
            clickPoint.x - a.x;

        const apy =
            clickPoint.y - a.y;

        const abLenSq =
            abx * abx + aby * aby;

        if (abLenSq === 0) continue;

        let t =
            (apx * abx + apy * aby) / abLenSq;

        t =
            Math.max(
                0,
                Math.min(1, t)
            );

        const projX =
            a.x + abx * t;

        const projY =
            a.y + aby * t;

        const dx =
            clickPoint.x - projX;

        const dy =
            clickPoint.y - projY;

        const pixelDist =
            Math.sqrt(dx * dx + dy * dy);

        if (pixelDist < nearestPixelDistance) {
            nearestPixelDistance =
                pixelDist;

            nearestSegmentIdx =
                i;

            const projLat =
                p1Lat + (p2Lat - p1Lat) * t;

            const projLon =
                p1Lon + (p2Lon - p1Lon) * t;

            let projDistance =
                undefined;

            if (
                Number.isFinite(Number(p1.distance)) &&
                Number.isFinite(Number(p2.distance))
            ) {
                projDistance =
                    Number(p1.distance) +
                    (
                        Number(p2.distance) -
                        Number(p1.distance)
                    ) * t;
            }

            projectedPoint = {
                lat: projLat,
                lon: projLon,
                ele: Number.isFinite(Number(p1.ele))
                    ? Number(p1.ele)
                    : 0,
                time: p1.time || null,
                timeLocal: p1.timeLocal || null,
                distance: projDistance
            };
        }
    }

    const isTouchDevice =
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0;

    const maxPixelDistance =
        isTouchDevice
            ? 40
            : 26;

    if (
        nearestSegmentIdx < 0 ||
        !projectedPoint ||
        nearestPixelDistance > maxPixelDistance
    ) {
        window.cancelSplitRouteMode();

        if (typeof showMapToast === "function") {
            showMapToast("未點到路線，已取消分割模式");
        }

        return true;
    }

    
    const splitPointIndex =
        nearestSegmentIdx + 1;

    const routeIdxForSplit =
        splitInfo.isFileRoute === true
            ? 0
            : splitInfo.routeIdx;

    window.cancelSplitRouteMode();

    if (typeof window.splitSubRoute === "function") {
        window.splitSubRoute(
            splitInfo.fileIdx,
            routeIdxForSplit,
            splitPointIndex,
            {
                source: "tool",
                insertPoint: projectedPoint,
                isFileRoute: splitInfo.isFileRoute === true
            }
        );
    }

    return true;
};

if (!window.splitModeAutoCancelInstalled) {
    window.splitModeAutoCancelInstalled = true;

    document.addEventListener(
        "click",
        function(e) {
            if (!window.splitRoutePickMode) return;

            const target =
                e.target;

            if (!target) return;

            if (
                target.closest &&
                target.closest("#splitRouteModeHint")
            ) {
                return;
            }

            if (
                target.closest &&
                target.closest('.route-tool-item[data-action="split"]')
            ) {
                return;
            }

            const shouldCancelSplit =
                target.closest("#drawModeBtn") ||
                target.closest("#gpxManageBtn") ||
                target.closest("#routeSelect") ||
                target.closest("#searchBtn") ||
                target.closest("#coordSearchBtn") ||
                target.closest("#locateBtn") ||
                target.closest("#side-toolbar") ||
                target.closest(".leaflet-control") ||
                target.closest("#multiGpxBtnBar");

            if (shouldCancelSplit) {
                if (typeof window.cancelSplitRouteMode === "function") {
                    window.cancelSplitRouteMode();
                }
            }
        },
        true
    );
}

window.findClickedRouteByPriority = function(latlng) {
    const stack =
        window.multiGpxStack ||
        multiGpxStack ||
        [];

    const currentFileIdx =
        typeof window.currentMultiIndex === "number"
            ? window.currentMultiIndex
            : 0;

    const clickPoint =
        map.latLngToContainerPoint(latlng);

    const isTouchDevice =
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0;

    const maxPixelDistance =
        isTouchDevice
            ? 36
            : 22;

    const findNearestInRouteList = function(fileIdx, routes, options = {}) {
        if (!Array.isArray(routes)) {
            return null;
        }

        let best =
            null;

        routes.forEach(function(route, routeIdx) {
            if (!route) return;

            
            if (route.visible === false) {
                return;
            }

            if (
                options.skipCombined === true &&
                route.isCombined === true
            ) {
                return;
            }

            const points =
                Array.isArray(route.points)
                    ? route.points
                    : [];

            if (points.length < 2) return;

            for (let i = 0; i < points.length - 1; i++) {
                const p1 =
                    points[i];

                const p2 =
                    points[i + 1];

                if (!p1 || !p2) continue;

                const p1Lat =
                    Number(p1.lat);

                const p1Lon =
                    Number(p1.lon);

                const p2Lat =
                    Number(p2.lat);

                const p2Lon =
                    Number(p2.lon);

                if (
                    !Number.isFinite(p1Lat) ||
                    !Number.isFinite(p1Lon) ||
                    !Number.isFinite(p2Lat) ||
                    !Number.isFinite(p2Lon)
                ) {
                    continue;
                }

                const a =
                    map.latLngToContainerPoint(
                        L.latLng(p1Lat, p1Lon)
                    );

                const b =
                    map.latLngToContainerPoint(
                        L.latLng(p2Lat, p2Lon)
                    );

                const abx =
                    b.x - a.x;

                const aby =
                    b.y - a.y;

                const apx =
                    clickPoint.x - a.x;

                const apy =
                    clickPoint.y - a.y;

                const abLenSq =
                    abx * abx + aby * aby;

                if (abLenSq === 0) continue;

                let t =
                    (apx * abx + apy * aby) / abLenSq;

                t =
                    Math.max(
                        0,
                        Math.min(1, t)
                    );

                const projX =
                    a.x + abx * t;

                const projY =
                    a.y + aby * t;

                const dx =
                    clickPoint.x - projX;

                const dy =
                    clickPoint.y - projY;

                const pixelDistance =
                    Math.sqrt(dx * dx + dy * dy);

                if (
                    pixelDistance <= maxPixelDistance &&
                    (
                        !best ||
                        pixelDistance < best.pixelDistance
                    )
                ) {
                    best = {
                        fileIdx: fileIdx,
                        routeIdx: routeIdx,
                        route: route,
                        pointIdx: i,
                        pixelDistance: pixelDistance
                    };
                }
            }
        });

        return best;
    };

    
    const currentFile =
        stack[currentFileIdx];

    if (
        currentFile &&
        currentFile.visible !== false &&
        Array.isArray(currentFile.routes) &&
        currentFile.routes.length > 1
    ) {
        const currentChildHit =
            findNearestInRouteList(
                currentFileIdx,
                currentFile.routes,
                {
                    skipCombined: true
                }
            );

        if (currentChildHit) {
            currentChildHit.priority =
                "current-child-route";

            return currentChildHit;
        }
    }

    
    for (let fileIdx = 0; fileIdx < stack.length; fileIdx++) {
        if (fileIdx === currentFileIdx) continue;

        const file =
            stack[fileIdx];

        if (!file) continue;

        if (file.visible === false) {
            continue;
        }

        let routes = [];

        if (
            Array.isArray(file.routes) &&
            file.routes.length > 0
        ) {
            routes =
                file.routes;

        } else if (
            Array.isArray(file.points)
        ) {
            routes =
                [file];
        }

        const otherHit =
            findNearestInRouteList(
                fileIdx,
                routes,
                {
                    skipCombined: false
                }
            );

        if (otherHit) {
            otherHit.priority =
                "other-route";

            return otherHit;
        }
    }

    return null;
};

const MAPTILER_API_KEY =
	   "pGiOxxxfkdxrIcOn3mo7";

window.fetchElevationMapTilerForPoints = async function(points) {
    if (!Array.isArray(points) || points.length === 0) {
        return [];
    }

    const validPoints =
        points.filter(function(p) {
            return (
                p &&
                Number.isFinite(Number(p.lat)) &&
                Number.isFinite(Number(p.lon))
            );
        });

    if (validPoints.length === 0) {
        return [];
    }

    const locations =
        validPoints.map(function(p) {
            return (
                Number(p.lon).toFixed(6) +
                "," +
                Number(p.lat).toFixed(6)
            );
        }).join(";");

    const url =
        "https://api.maptiler.com/elevation/" +
        locations +
        ".json?key=" +
        encodeURIComponent(MAPTILER_API_KEY);

    const res =
        await fetch(url);

    const text =
        await res.text();

    let data = null;

    try {
        data =
            JSON.parse(text);
    } catch (err) {
        console.error("MapTiler 回傳不是 JSON：", text);
        throw new Error("MapTiler 回傳不是 JSON");
    }

    if (!res.ok) {
        console.error("MapTiler HTTP 錯誤：", res.status, data);
        throw new Error("MapTiler 高度查詢失敗：" + res.status);
    }

    if (Array.isArray(data)) {
        return data.map(function(item) {
            if (
                Array.isArray(item) &&
                item.length >= 3 &&
                Number.isFinite(Number(item[2]))
            ) {
                return Number(item[2]);
            }

            if (
                item &&
                Number.isFinite(Number(item.elevation))
            ) {
                return Number(item.elevation);
            }

            return null;
        });
    }

    if (
        data &&
        Array.isArray(data.features)
    ) {
        return data.features.map(function(feature) {
            const coords =
                feature &&
                feature.geometry &&
                feature.geometry.coordinates;

            if (
                Array.isArray(coords) &&
                coords.length >= 3 &&
                Number.isFinite(Number(coords[2]))
            ) {
                return Number(coords[2]);
            }

            const ele =
                feature &&
                feature.properties &&
                feature.properties.elevation;

            if (Number.isFinite(Number(ele))) {
                return Number(ele);
            }

            return null;
        });
    }

    if (
        data &&
        Array.isArray(data.results)
    ) {
        return data.results.map(function(item) {
            if (
                item &&
                Number.isFinite(Number(item.elevation))
            ) {
                return Number(item.elevation);
            }

            return null;
        });
    }

    console.error("MapTiler 高度資料格式未知：", data);
    throw new Error("MapTiler 高度資料格式未知");
};

window.fillElevationForRoute = async function(fileIdx, routeIdx) {
    const stack =
        window.multiGpxStack ||
        multiGpxStack ||
        [];

    const currentFile =
        stack[fileIdx];

    if (!currentFile) {
        alert("找不到目前 GPX / 路線");
        return;
    }

    let targetRoute =
        null;

    if (
        Array.isArray(currentFile.routes) &&
        currentFile.routes[routeIdx]
    ) {
        targetRoute =
            currentFile.routes[routeIdx];

    } else if (
        Array.isArray(currentFile.points)
    ) {
        targetRoute =
            currentFile;

        routeIdx =
            0;
    }

    if (!targetRoute) {
        alert("找不到要取得高度的路線");
        return;
    }

    if (targetRoute.isCombined === true) {
        alert("結合路線不能直接取得高度，請切到子路線再取得高度");
        return;
    }

    if (
        !Array.isArray(targetRoute.points) ||
        targetRoute.points.length === 0
    ) {
        alert("目前路線沒有點位可取得高度");
        return;
    }

    const routeName =
        targetRoute.routeDisplayName ||
        targetRoute.displayName ||
        targetRoute.name ||
        "目前路線";

    const runFillElevation = async function() {
        try {
            if (typeof showMapToast === "function") {
                showMapToast("正在取得高度...");
            }

            const points =
                targetRoute.points;

            const batchSize =
                50;

            for (let i = 0; i < points.length; i += batchSize) {
                const batch =
                    points.slice(i, i + batchSize);

                const elevations =
                    await window.fetchElevationMapTilerForPoints(batch);

                elevations.forEach(function(ele, idx) {
                    const p =
                        batch[idx];

                    if (
                        p &&
                        ele !== null &&
                        ele !== undefined &&
                        Number.isFinite(Number(ele))
                    ) {
                        p.ele =
                            Math.round(Number(ele));
                    }
                });

                if (typeof showMapToast === "function") {
                    showMapToast(
                        "正在取得高度... " +
                        Math.min(i + batch.length, points.length) +
                        " / " +
                        points.length
                    );
                }

                await new Promise(function(resolve) {
                    setTimeout(resolve, 150);
                });
            }

            targetRoute.segments = [
                targetRoute.points.map(function(p) {
                    return [
                        p.lat,
                        p.lon
                    ];
                })
            ];

            if (
                currentFile &&
                Array.isArray(currentFile.routes) &&
                currentFile.routes.length > 1 &&
                currentFile.routes[0] &&
                currentFile.routes[0].isCombined === true &&
                typeof rebuildCombinedRouteForFile === "function"
            ) {
                rebuildCombinedRouteForFile(currentFile);
            }

            window.currentMultiIndex =
                fileIdx;

            window.currentActiveIndex =
                routeIdx;

            if (typeof syncDrawingGlobals === "function") {
                syncDrawingGlobals(
                    currentFile,
                    routeIdx
                );
            }

            if (typeof updateRouteSelectDropdown === "function") {
                updateRouteSelectDropdown();
            }

            const routeSelect =
                document.getElementById("routeSelect");

            if (routeSelect) {
                routeSelect.value =
                    String(routeIdx);

                routeSelect.selectedIndex =
                    routeIdx;
            }

            if (typeof loadRoute === "function") {
                loadRoute(
                    routeIdx,
                    null,
                    {
                        skipAutoFitBounds: true,
                        preserveChartState: true
                    }
                );
            }

            if (typeof drawElevationChart === "function") {
                drawElevationChart();
            }

            if (typeof renderRouteInfo === "function") {
                renderRouteInfo();
            }

            if (typeof renderMultiGpxButtons === "function") {
                renderMultiGpxButtons();
            }

            if (typeof showMapToast === "function") {
                showMapToast("高度取得完成");
            }
            


        } catch (err) {

            if (typeof showMapToast === "function") {
                showMapToast("高度取得失敗");
            } else {
                alert("高度取得失敗");
            }
        }
    };

    if (typeof window.showAppConfirm === "function") {
        window.showAppConfirm(
            "取得高度",
            "確定要為「" + routeName + "」取得高度嗎？<br>這會覆蓋此路線目前的高度資料。<br>(高度資料由MapTiler提供)",
            runFillElevation,
            null,
            "取得高度"
        );
    } else {
        if (
            confirm(
                "確定要為「" +
                routeName +
                "」取得高度嗎？\n這會覆蓋此路線目前的高度資料。\n(高度資料由MapTiler提供)"
            )
        ) {
            runFillElevation();
        }
    }
};

window.fetchElevationForSinglePoint = async function(lat, lon) {
    const point = {
        lat: Number(lat),
        lon: Number(lon)
    };

    if (
        !Number.isFinite(point.lat) ||
        !Number.isFinite(point.lon)
    ) {
        throw new Error("座標格式錯誤");
    }

    if (typeof window.fetchElevationMapTilerForPoints === "function") {
        const elevations =
            await window.fetchElevationMapTilerForPoints([point]);

        if (
            Array.isArray(elevations) &&
            elevations.length > 0 &&
            Number.isFinite(Number(elevations[0]))
        ) {
            return Number(elevations[0]);
        }
    }

    if (typeof window.fetchElevationOpenMeteoForPoints === "function") {
        const elevations =
            await window.fetchElevationOpenMeteoForPoints([point]);

        if (
            Array.isArray(elevations) &&
            elevations.length > 0 &&
            Number.isFinite(Number(elevations[0]))
        ) {
            return Number(elevations[0]);
        }
    }

    throw new Error("無法取得高度");
};

window.closeMapToast = function() {
    const toast =
        document.getElementById("map-toast");

    if (window.mapToastTimer) {
        clearTimeout(window.mapToastTimer);
        window.mapToastTimer = null;
    }

    if (!toast) return;

    toast.style.opacity =
        "0";

    toast.innerText =
        "";

    toast.style.display =
        "none";

    window.currentMapToast =
        null;
};






window.findNearestPointOnCurrentRoute = function(lat, lon, maxMeters = 50) {
    if (
        !Array.isArray(trackPoints) ||
        trackPoints.length < 2 ||
        !map ||
        typeof map.latLngToContainerPoint !== "function"
    ) {
        return null;
    }

    const targetLat = Number(lat);
    const targetLon = Number(lon);

    if (
        !Number.isFinite(targetLat) ||
        !Number.isFinite(targetLon)
    ) {
        return null;
    }

    const targetPoint =
        map.latLngToContainerPoint(
            L.latLng(targetLat, targetLon)
        );

    let nearest = null;
    let minPixelDist = Infinity;

    for (let i = 0; i < trackPoints.length - 1; i++) {
        const p1 = trackPoints[i];
        const p2 = trackPoints[i + 1];

        if (!p1 || !p2) continue;

        const p1Lat = Number(p1.lat);
        const p1Lon = Number(p1.lon);
        const p2Lat = Number(p2.lat);
        const p2Lon = Number(p2.lon);

        if (
            !Number.isFinite(p1Lat) ||
            !Number.isFinite(p1Lon) ||
            !Number.isFinite(p2Lat) ||
            !Number.isFinite(p2Lon)
        ) {
            continue;
        }

        const a =
            map.latLngToContainerPoint(
                L.latLng(p1Lat, p1Lon)
            );

        const b =
            map.latLngToContainerPoint(
                L.latLng(p2Lat, p2Lon)
            );

        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const apx = targetPoint.x - a.x;
        const apy = targetPoint.y - a.y;

        const abLenSq =
            abx * abx + aby * aby;

        if (abLenSq === 0) continue;

        let t =
            (apx * abx + apy * aby) / abLenSq;

        t =
            Math.max(
                0,
                Math.min(1, t)
            );

        const projX =
            a.x + abx * t;

        const projY =
            a.y + aby * t;

        const dx =
            targetPoint.x - projX;

        const dy =
            targetPoint.y - projY;

        const pixelDist =
            Math.sqrt(dx * dx + dy * dy);

        if (pixelDist < minPixelDist) {
            const snapLat =
                p1Lat + (p2Lat - p1Lat) * t;

            const snapLon =
                p1Lon + (p2Lon - p1Lon) * t;

            let snapEle =
                Number(p1.ele || 0);

            if (
                Number.isFinite(Number(p1.ele)) &&
                Number.isFinite(Number(p2.ele))
            ) {
                snapEle =
                    Number(p1.ele) +
                    (
                        Number(p2.ele) -
                        Number(p1.ele)
                    ) * t;
            }

            let snapDistance =
                undefined;

            if (
                Number.isFinite(Number(p1.distance)) &&
                Number.isFinite(Number(p2.distance))
            ) {
                snapDistance =
                    Number(p1.distance) +
                    (
                        Number(p2.distance) -
                        Number(p1.distance)
                    ) * t;
            }

            nearest = {
                lat: snapLat,
                lon: snapLon,
                ele: Math.round(snapEle),
                distance: snapDistance,
                segmentIndex: i,
                t: t,
                leftPoint: p1,
                rightPoint: p2,
                time: p1.time || null,
                timeLocal: p1.timeLocal || p1.localTime || null
            };

            minPixelDist =
                pixelDist;
        }
    }

    if (!nearest) return null;

    const meters =
        map.distance(
            L.latLng(targetLat, targetLon),
            L.latLng(nearest.lat, nearest.lon)
        );

    nearest.meters =
        meters;

    if (meters > maxMeters) {
        return null;
    }

    return nearest;
};

// ==========================================
// 複製 / 貼上路線
// ==========================================

window.copiedRouteForPaste =
    null;


window.cloneRouteForCopyPaste = function(route) {
    return JSON.parse(
        JSON.stringify(
            route,
            function(key, value) {
                if (
                    key === "layer" ||
                    key === "hitLayer" ||
                    key === "marker" ||
                    key === "tooltip" ||
                    key === "popup" ||
                    key === "_map" ||
                    key === "_leaflet_id" ||
                    typeof value === "function"
                ) {
                    return undefined;
                }

                return value;
            }
        )
    );
};


window.getRouteNameForCopyPaste = function(route) {
    return (
        route.routeDisplayName ||
        route.displayName ||
        route.name ||
        "複製路線"
    );
};


window.getUniquePastedRouteName = function(routes, baseName) {
    const existingNames =
        new Set();

    if (Array.isArray(routes)) {
        routes.forEach(function(route) {
            if (!route) return;

            [
                route.routeDisplayName,
                route.displayName,
                route.name
            ].forEach(function(name) {
                if (name) {
                    existingNames.add(String(name));
                }
            });
        });
    }

    let index =
        2;

    let candidate =
        baseName + " " + index;

    while (existingNames.has(candidate)) {
        index++;
        candidate =
            baseName + " " + index;
    }

    return candidate;
};


window.pointsToSegmentForCopyPaste = function(points) {
    if (!Array.isArray(points)) {
        return [];
    }

    return points.map(function(p) {
        return [
            Number(p.lat),
            Number(p.lon)
        ];
    }).filter(function(p) {
        return (
            Number.isFinite(p[0]) &&
            Number.isFinite(p[1])
        );
    });
};


window.rebuildCombinedRouteForCopyPaste = function(file) {
    if (
        !file ||
        !Array.isArray(file.routes) ||
        file.routes.length === 0
    ) {
        return;
    }

    let combinedRoute =
        file.routes.find(function(route) {
            return route && route.isCombined === true;
        });

    if (!combinedRoute) {
        return;
    }

    const combinedPoints =
        [];

    const combinedSegments =
        [];

    file.routes.forEach(function(route) {
        if (
            !route ||
            route.isCombined === true
        ) {
            return;
        }

        if (
            Array.isArray(route.points) &&
            route.points.length > 0
        ) {
            route.points.forEach(function(p) {
                combinedPoints.push(p);
            });
        }

        if (
            Array.isArray(route.segments) &&
            route.segments.length > 0
        ) {
            route.segments.forEach(function(seg) {
                combinedSegments.push(seg);
            });

        } else if (
            Array.isArray(route.points) &&
            route.points.length > 0
        ) {
            combinedSegments.push(
                window.pointsToSegmentForCopyPaste(route.points)
            );
        }
    });

    combinedRoute.points =
        combinedPoints;

    combinedRoute.segments =
        combinedSegments.length > 0
            ? combinedSegments
            : [
                window.pointsToSegmentForCopyPaste(combinedPoints)
            ];

    combinedRoute.waypoints =
        file.waypoints || [];

    combinedRoute.visible =
        true;

    combinedRoute.isCombined =
        true;
};


window.ensureFileRoutesForPaste = function(file) {
    if (!file) return;

    if (
        Array.isArray(file.routes) &&
        file.routes.length > 0
    ) {
        const hasCombined =
            file.routes.some(function(route) {
                return route && route.isCombined === true;
            });

        if (!hasCombined && file.routes.length >= 1) {
            const firstRoute =
                file.routes[0];

            const combinedName =
                firstRoute.routeDisplayName ||
                firstRoute.displayName ||
                firstRoute.name ||
                file.name ||
                "結合路線";

            const combinedRoute = {
                id: "combined_route_" + Date.now(),
                name: combinedName,
                displayName: combinedName,
                routeDisplayName: combinedName,
                fileName: file.fileName || file.name || combinedName,
                color: file.color || firstRoute.color || "#0000FF",
                points: [],
                segments: [],
                waypoints: file.waypoints || [],
                visible: true,
                isCombined: true,
                isDrawTrack: false,
                isHandDrawRoute: false
            };

            file.routes.unshift(
                combinedRoute
            );

            window.rebuildCombinedRouteForCopyPaste(file);
        }

        return;
    }

    const baseName =
        file.routeDisplayName ||
        file.displayName ||
        file.name ||
        file.fileName ||
        "路線";

    const childRoute = {
        id: file.id || ("route_" + Date.now()),
        name: baseName,
        displayName: baseName,
        routeDisplayName: baseName,
        fileName: file.fileName || file.name || baseName,
        color: file.color || "#0000FF",
        points: Array.isArray(file.points)
            ? window.cloneRouteForCopyPaste(file.points)
            : [],
        segments: Array.isArray(file.segments) && file.segments.length > 0
            ? window.cloneRouteForCopyPaste(file.segments)
            : [
                window.pointsToSegmentForCopyPaste(file.points || [])
            ],
        waypoints: file.waypoints || [],
        visible: true,
        isCombined: false,
        isDrawTrack: file.isDrawTrack === true,
        isHandDrawRoute: file.isHandDrawRoute === true
    };

    const combinedRoute = {
        id: "combined_route_" + Date.now(),
        name: baseName,
        displayName: baseName,
        routeDisplayName: baseName,
        fileName: file.fileName || file.name || baseName,
        color: file.color || "#0000FF",
        points: [],
        segments: [],
        waypoints: file.waypoints || [],
        visible: true,
        isCombined: true,
        isDrawTrack: false,
        isHandDrawRoute: false
    };

    file.routes =
        [
            combinedRoute,
            childRoute
        ];

    file.isDrawTrack =
        false;

    file.isHandDrawRoute =
        false;

    file.isCombined =
        false;

    window.rebuildCombinedRouteForCopyPaste(file);
};


window.refreshAfterCopyPasteRoute = function(fileIdx, routeIdx) {
    window.currentMultiIndex =
        fileIdx;

    window.currentActiveIndex =
        routeIdx;

    const stack =
        window.multiGpxStack ||
        multiGpxStack ||
        [];

    const file =
        stack[fileIdx];

    if (
        file &&
        Array.isArray(file.routes)
    ) {
        window.allTracks =
            file.routes;

        try {
            allTracks =
                file.routes;
        } catch (err) {}
    }

    if (typeof updateRouteSelectDropdown === "function") {
        updateRouteSelectDropdown();
    }

    const routeSelect =
        document.getElementById("routeSelect");

    if (routeSelect) {
        routeSelect.value =
            String(routeIdx);

        routeSelect.selectedIndex =
            routeIdx;
    }

    if (typeof renderMultiGpxButtons === "function") {
        renderMultiGpxButtons();
    }

    if (typeof loadRoute === "function") {
        loadRoute(
            routeIdx,
            null,
            {
                skipAutoFitBounds: true,
                preserveChartState: true
            }
        );
    }

    if (typeof renderRouteInfo === "function") {
        renderRouteInfo();
    }

    if (typeof window.refreshGpxManagerIfOpen === "function") {
		        window.refreshGpxManagerIfOpen();
	  }

};


window.copyCurrentRouteForPaste = function(fileIdx, routeIdx) {
    const stack =
        window.multiGpxStack ||
        multiGpxStack ||
        [];

    const file =
        stack[fileIdx];

    if (!file) {
        alert("找不到目前 GPX");
        return;
    }

    let route =
        null;

    if (
        Array.isArray(file.routes) &&
        file.routes[routeIdx]
    ) {
        route =
            file.routes[routeIdx];

    } else {
        route =
            file;
    }

    if (!route) {
        alert("找不到要複製的路線");
        return;
    }

    if (route.isCombined === true) {
        alert("結合路線不能複製，請切到子路線再複製");
        return;
    }

    if (
        !Array.isArray(route.points) ||
        route.points.length < 2
    ) {
        alert("此路線沒有足夠點位，無法複製");
        return;
    }

    const routeName =
        window.getRouteNameForCopyPaste(route);

    window.copiedRouteForPaste = {
        copiedAt: Date.now(),
        sourceFileIdx: fileIdx,
        sourceRouteIdx: routeIdx,
        name: routeName,
        route: window.cloneRouteForCopyPaste(route)
    };

    if (typeof showMapToast === "function") {
        showMapToast("已複製路線：「" + routeName + "」");
    }
};


window.pasteCopiedRouteToCurrentFile = function(targetFileIdx) {

    if (
        !window.copiedRouteForPaste ||
        !window.copiedRouteForPaste.route
    ) {
        alert("尚未複製路線");
        return;
    }

    const getLiveStack = function() {
        return (
            window.multiGpxStack ||
            multiGpxStack ||
            []
        );
    };

    const getLiveTargetFile = function() {
        const liveStack =
            getLiveStack();

        return liveStack[targetFileIdx] || null;
    };

    const targetFile =
        getLiveTargetFile();

    if (!targetFile) {
        alert("找不到要貼上的 GPX");
        return;
    }

    const beforeState =
        window.cloneRouteForCopyPaste(targetFile);

    const activeRouteBefore =
        typeof window.currentActiveIndex === "number"
            ? window.currentActiveIndex
            : 0;

    let afterState =
        null;

    let pastedRouteIdx =
        0;

    let pastedRouteId =
        null;

    const restoreFileState = function(state) {
        const liveTargetFile =
            getLiveTargetFile();

        if (!liveTargetFile) {
            return;
        }

        const keepLayer =
            liveTargetFile.layer;

        const keepLayerGroup =
            liveTargetFile.layerGroup;

        Object.keys(liveTargetFile).forEach(function(key) {
            if (
                key !== "layer" &&
                key !== "layerGroup"
            ) {
                delete liveTargetFile[key];
            }
        });

        Object.assign(
            liveTargetFile,
            window.cloneRouteForCopyPaste(state)
        );

        if (keepLayer) {
            liveTargetFile.layer =
                keepLayer;
        }

        if (keepLayerGroup) {
            liveTargetFile.layerGroup =
                keepLayerGroup;
        }

        if (Array.isArray(liveTargetFile.routes)) {
            liveTargetFile.routes.forEach(function(route) {
                if (route) {
                    route.waypoints =
                        liveTargetFile.waypoints || [];
                }
            });
        }
    };

    const clearDisplayedPasteRoute = function(liveTargetFile) {
        if (
            typeof polyline !== "undefined" &&
            polyline &&
            typeof polyline.setLatLngs === "function"
        ) {
            polyline.setLatLngs([]);
        }

        if (Array.isArray(window.routePreviewLayers)) {
            window.routePreviewLayers.forEach(function(layer) {
                if (
                    layer &&
                    typeof map !== "undefined" &&
                    map.hasLayer(layer)
                ) {
                    map.removeLayer(layer);
                }
            });

            window.routePreviewLayers =
                [];
        }

        if (
            liveTargetFile &&
            liveTargetFile.layer &&
            typeof liveTargetFile.layer.setLatLngs === "function" &&
            (
                !Array.isArray(liveTargetFile.points) ||
                liveTargetFile.points.length === 0
            )
        ) {
            liveTargetFile.layer.setLatLngs([]);
        }
    };

    const refreshPasteTarget = function(routeIdx) {
        const liveTargetFile =
            getLiveTargetFile();

        if (!liveTargetFile) {
            return;
        }

        window.currentMultiIndex =
            targetFileIdx;

        window.currentActiveIndex =
            routeIdx || 0;

        if (typeof window.syncDrawingGlobals === "function") {
            window.syncDrawingGlobals(
                liveTargetFile,
                routeIdx || 0
            );

        } else {
            if (
                Array.isArray(liveTargetFile.routes) &&
                liveTargetFile.routes.length > 0
            ) {
                window.allTracks =
                    liveTargetFile.routes;

                try {
                    allTracks =
                        window.allTracks;
                } catch (err) {}

                const activeRoute =
                    liveTargetFile.routes[routeIdx || 0] ||
                    liveTargetFile.routes[0];

                window.trackPoints =
                    activeRoute && Array.isArray(activeRoute.points)
                        ? activeRoute.points
                        : [];

                try {
                    trackPoints =
                        window.trackPoints;
                } catch (err) {}

            } else {
                window.allTracks =
                    [liveTargetFile];

                try {
                    allTracks =
                        window.allTracks;
                } catch (err) {}

                window.trackPoints =
                    liveTargetFile.points || [];

                try {
                    trackPoints =
                        window.trackPoints;
                } catch (err) {}
            }
        }

        if (typeof renderMultiGpxButtons === "function") {
            renderMultiGpxButtons();
        }

        if (typeof updateRouteSelectDropdown === "function") {
            updateRouteSelectDropdown();
        }

        if (typeof window.refreshAfterCopyPasteRoute === "function") {
            window.refreshAfterCopyPasteRoute(
                targetFileIdx,
                routeIdx || 0
            );

        } else if (typeof loadRoute === "function") {
            loadRoute(
                routeIdx || 0,
                null,
                {
                    skipAutoFitBounds: true,
                    preserveChartState: true
                }
            );
        }

        if (typeof renderRouteInfo === "function") {
            renderRouteInfo();
        }
        
        if (typeof window.refreshGpxManagerIfOpen === "function") {
				    window.refreshGpxManagerIfOpen();
				}


    };

    const applyPaste = function() {
        restoreFileState(beforeState);

        const liveTargetFile =
            getLiveTargetFile();

        if (!liveTargetFile) {
            return;
        }

        window.ensureFileRoutesForPaste(
            liveTargetFile
        );
        
        const originalActiveRouteIdx =
				    typeof window.currentActiveIndex === "number"
				        ? window.currentActiveIndex
				        : 0;

        const copied =
            window.cloneRouteForCopyPaste(
                window.copiedRouteForPaste.route
            );

        const baseName =
            window.copiedRouteForPaste.name ||
            window.getRouteNameForCopyPaste(copied);

        const newName =
            window.getUniquePastedRouteName(
                liveTargetFile.routes,
                baseName
            );

        pastedRouteId =
            "pasted_route_" + Date.now();

        copied.id =
            pastedRouteId;

        copied.name =
            newName;

        copied.displayName =
            newName;

        copied.routeDisplayName =
            newName;

        copied.fileName =
            liveTargetFile.fileName ||
            liveTargetFile.name ||
            newName;

        copied.color =
            liveTargetFile.color ||
            copied.color ||
            "#0000FF";

        copied.visible =
            true;

        copied.isCombined =
            false;

        copied.isDrawTrack =
            copied.isDrawTrack === true;

        copied.isHandDrawRoute =
            copied.isHandDrawRoute === true;

        copied.waypoints =
            liveTargetFile.waypoints || [];
            
        if (Array.isArray(liveTargetFile.waypoints)) {
						    liveTargetFile.waypoints.forEach(function(wpt) {
						        if (!wpt) return;
						
						        if (typeof wpt.belongsToRoute !== "number") {
						            wpt.belongsToRoute =
						                originalActiveRouteIdx;
						        }
						
						        if (!Array.isArray(wpt.visibleRouteIndexes)) {
						            wpt.visibleRouteIndexes =
						                [wpt.belongsToRoute];
						        }
						    });
						}

        if (
            !Array.isArray(copied.segments) ||
            copied.segments.length === 0
        ) {
            copied.segments =
                [
                    window.pointsToSegmentForCopyPaste(
                        copied.points || []
                    )
                ];
        }

        liveTargetFile.routes.push(
            copied
        );

        pastedRouteIdx =
            liveTargetFile.routes.length - 1;

        window.rebuildCombinedRouteForCopyPaste(
            liveTargetFile
        );

        if (
            liveTargetFile.routes[0] &&
            liveTargetFile.routes[0].isCombined === true
        ) {
            liveTargetFile.points =
                liveTargetFile.routes[0].points || [];

            liveTargetFile.segments =
                liveTargetFile.routes[0].segments || [];
        }

        afterState =
            window.cloneRouteForCopyPaste(
                liveTargetFile
            );

        refreshPasteTarget(
            pastedRouteIdx
        );
    };

    const undoPaste = function() {
        const liveTargetFile =
            getLiveTargetFile();

        if (!liveTargetFile) {
            return;
        }

        
        let removeIdx =
            -1;

        if (
            pastedRouteId &&
            Array.isArray(liveTargetFile.routes)
        ) {
            removeIdx =
                liveTargetFile.routes.findIndex(function(route) {
                    return route && route.id === pastedRouteId;
                });
        }

        if (
            removeIdx === -1 &&
            Array.isArray(liveTargetFile.routes) &&
            liveTargetFile.routes[pastedRouteIdx] &&
            liveTargetFile.routes[pastedRouteIdx].isCombined !== true
        ) {
            removeIdx =
                pastedRouteIdx;
        }

        if (
            removeIdx !== -1 &&
            Array.isArray(liveTargetFile.routes)
        ) {
            const removedRoute =
                liveTargetFile.routes[removeIdx];

            if (
                removedRoute &&
                removedRoute.layer &&
                typeof map !== "undefined" &&
                map.hasLayer(removedRoute.layer)
            ) {
                map.removeLayer(removedRoute.layer);
            }

            liveTargetFile.routes.splice(
                removeIdx,
                1
            );

            const realRoutes =
                liveTargetFile.routes.filter(function(route) {
                    if (!route) return false;
                    if (route.isCombined === true) return false;

                    return (
                        (Array.isArray(route.points) && route.points.length > 0) ||
                        (Array.isArray(route.segments) && route.segments.length > 0) ||
                        route.isDrawTrack === true ||
                        route.isHandDrawRoute === true ||
                        route.isMergedRoute === true
                    );
                });

            if (realRoutes.length > 0) {
                window.rebuildCombinedRouteForCopyPaste(
                    liveTargetFile
                );

                if (
                    liveTargetFile.routes[0] &&
                    liveTargetFile.routes[0].isCombined === true
                ) {
                    liveTargetFile.points =
                        liveTargetFile.routes[0].points || [];

                    liveTargetFile.segments =
                        liveTargetFile.routes[0].segments || [];
                }

            } else {
                liveTargetFile.routes =
                    [];

                liveTargetFile.points =
                    [];

                liveTargetFile.segments =
                    [];

                liveTargetFile.isDrawTrack =
                    true;

                liveTargetFile.isHandDrawRoute =
                    true;

                liveTargetFile.isCombined =
                    false;

                if (
                    liveTargetFile.layer &&
                    typeof liveTargetFile.layer.setLatLngs === "function"
                ) {
                    liveTargetFile.layer.setLatLngs([]);
                }
            }

        } else {
            
            restoreFileState(beforeState);
        }

        clearDisplayedPasteRoute(
            liveTargetFile
        );

        refreshPasteTarget(
            activeRouteBefore
        );
    };

    const redoPaste = function() {
        if (afterState) {
            restoreFileState(afterState);

            refreshPasteTarget(
                pastedRouteIdx
            );

        } else {
            applyPaste();
        }
    };

    const command = {
        fileIndex: targetFileIdx,
        managedFileIndex: targetFileIdx,
        routeIndex: pastedRouteIdx,
        skipAutoLoadRouteAfterUndo: true,

        do: function() {
            applyPaste();
        },

        undo: function() {
            undoPaste();
        },

        redo: function() {
            redoPaste();
        }
    };

    if (
        typeof historyManager !== "undefined" &&
        historyManager &&
        typeof historyManager.execute === "function"
    ) {
        historyManager.execute(command);

    } else {
        command.do();
    }

    if (typeof showMapToast === "function") {
        showMapToast("已貼上路線");
    }
};

window.getNextGpxColor = function(index) {
    const colorIndex =
        Number.isFinite(Number(index))
            ? Number(index)
            : (
                Array.isArray(window.multiGpxStack)
                    ? window.multiGpxStack.length
                    : (
                        Array.isArray(multiGpxStack)
                            ? multiGpxStack.length
                            : 0
                    )
            );

    return multiColors[
        colorIndex % multiColors.length
    ];
};

window.getUniqueBlankRouteName = function() {
    const stack =
        window.multiGpxStack ||
        multiGpxStack ||
        [];

    const baseName =
        "自訂路線";

    const existingNames =
        new Set();

    stack.forEach(function(gpx) {
        if (!gpx) return;

        [
            gpx.name,
            gpx.displayName,
            gpx.routeDisplayName,
            gpx.fileName
        ].forEach(function(name) {
            if (!name) return;

            existingNames.add(
                String(name)
                    .replace(/\.gpx$/i, "")
                    .trim()
            );
        });
    });

    if (!existingNames.has(baseName)) {
        return baseName;
    }

    let index =
        2;

    let candidate =
        baseName + " " + index;

    while (existingNames.has(candidate)) {
        index++;

        candidate =
            baseName + " " + index;
    }

    return candidate;
};

window.updateLoadedGpxCountDisplay = function() {
    const display =
        document.getElementById("fileNameDisplay");

    if (!display) return;

    const stack =
        window.multiGpxStack ||
        multiGpxStack ||
        [];

    if (!Array.isArray(stack) || stack.length === 0) {
        display.innerHTML =
            "";

        const hint =
            document.getElementById("importHint");

        if (hint) {
            hint.style.display =
                "";
        }

        const refreshIcon =
            document.getElementById("refreshIcon");

        if (refreshIcon) {
            refreshIcon.style.display =
                "";
        }

        return;
    }

    const totalCount =
        stack.length;

    const blankCount =
        stack.filter(function(item) {
            return item && item.isBlankProject === true;
        }).length;

    const gpxCount =
        totalCount - blankCount;

    let text =
        "目前載入 " + totalCount + " 個路線檔";

    display.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <span>${text}</span>
        </div>
    `;

    const hint =
        document.getElementById("importHint");

    if (hint) {
        hint.style.display =
            "none";
    }

    const refreshIcon =
        document.getElementById("refreshIcon");

    if (refreshIcon) {
        refreshIcon.style.display =
            "none";
    }
};

window.closeAllGpxFilesDirect = function() {
	  if (
		    window.activeRouteHaloLayer &&
		    typeof map !== "undefined" &&
		    map.hasLayer(window.activeRouteHaloLayer)
		) {
		    map.removeLayer(window.activeRouteHaloLayer);
		}
		
		window.activeRouteHaloLayer =
		    null;
		
		if (
		    window.activeRouteLayer &&
		    typeof map !== "undefined" &&
		    map.hasLayer(window.activeRouteLayer)
		) {
		    map.removeLayer(window.activeRouteLayer);
		}
		
		window.activeRouteLayer =
		    null;
		
		if (
		    window.splitRouteHitLayer &&
		    typeof map !== "undefined" &&
		    map.hasLayer(window.splitRouteHitLayer)
		) {
		    map.removeLayer(window.splitRouteHitLayer);
		}
		
		window.splitRouteHitLayer =
		    null;
		
		if (Array.isArray(window.routePreviewLayers)) {
		    window.routePreviewLayers.forEach(function(layer) {
		        if (
		            layer &&
		            typeof map !== "undefined" &&
		            map.hasLayer(layer)
		        ) {
		            map.removeLayer(layer);
		        }
		    });
		
		    window.routePreviewLayers =
		        [];
		}
		
		if (
		    typeof polyline !== "undefined" &&
		    polyline &&
		    typeof polyline.setLatLngs === "function"
		) {
		    polyline.setLatLngs([]);
		}
		
		if (
		    typeof markers !== "undefined" &&
		    Array.isArray(markers)
		) {
		    markers.forEach(function(m) {
		        if (
		            m &&
		            typeof map !== "undefined" &&
		            map.hasLayer(m)
		        ) {
		            map.removeLayer(m);
		        }
		    });
		
		    markers =
		        [];
		}
		
		if (
		    typeof hoverMarker !== "undefined" &&
		    hoverMarker &&
		    typeof map !== "undefined" &&
		    map.hasLayer(hoverMarker)
		) {
		    map.removeLayer(hoverMarker);
		}
		
		if (typeof hoverMarker !== "undefined") {
		    hoverMarker =
		        null;
		}
    window.skipUnsavedCheck = true;

    if (typeof clearAllMultiGPX === 'function') {
        clearAllMultiGPX();
    }

    if (window.historyManager) {
        historyManager.clear();
    }

    if (
        typeof polyline !== 'undefined' &&
        polyline
    ) {
        map.removeLayer(polyline);
    }

    if (
        typeof isDrawingMode !== "undefined" &&
        isDrawingMode
    ) {
        isDrawingMode =
            false;

        map.dragging.enable();
        map.boxZoom.enable();
    }

    window.multiGpxStack =
        [];

    try {
        multiGpxStack =
            window.multiGpxStack;
    } catch (err) {}

    window.allTracks =
        [];

    try {
        allTracks =
            window.allTracks;
    } catch (err) {}

    window.trackPoints =
        [];

    try {
        trackPoints =
            window.trackPoints;
    } catch (err) {}
    	
    location.reload();
};

window.closeCurrentGpxFileDirect = function() {
	  window.isClosingGpxFile = true;
	  
    const stack =
        window.multiGpxStack ||
        multiGpxStack ||
        [];

    if (
        !Array.isArray(stack) ||
        stack.length === 0
    ) {
        return;
    }

    const closeIdx =
        typeof window.currentMultiIndex === "number"
            ? window.currentMultiIndex
            : 0;

    const safeCloseIdx =
        Math.max(
            0,
            Math.min(
                closeIdx,
                stack.length - 1
            )
        );

    const target =
        stack[safeCloseIdx];

    if (!target) {
        return;
    }

    if (
        target.layer &&
        map &&
        map.hasLayer(target.layer)
    ) {
        map.removeLayer(target.layer);
    }

    if (
        target.layerGroup &&
        map &&
        map.hasLayer(target.layerGroup)
    ) {
        map.removeLayer(target.layerGroup);
    }

    if (Array.isArray(target.routes)) {
        target.routes.forEach(function(route) {
            if (!route) return;

            if (
                route.layer &&
                map &&
                map.hasLayer(route.layer)
            ) {
                map.removeLayer(route.layer);
            }

            if (
                route.hitLayer &&
                map &&
                map.hasLayer(route.hitLayer)
            ) {
                map.removeLayer(route.hitLayer);
            }
        });
    }

    if (
        window.activeRouteHaloLayer &&
        map &&
        map.hasLayer(window.activeRouteHaloLayer)
    ) {
        map.removeLayer(window.activeRouteHaloLayer);
    }

    window.activeRouteHaloLayer =
        null;

    if (
        window.activeRouteLayer &&
        map &&
        map.hasLayer(window.activeRouteLayer)
    ) {
        map.removeLayer(window.activeRouteLayer);
    }

    window.activeRouteLayer =
        null;

    if (Array.isArray(window.routePreviewLayers)) {
        window.routePreviewLayers.forEach(function(layer) {
            if (
                layer &&
                map &&
                map.hasLayer(layer)
            ) {
                map.removeLayer(layer);
            }
        });

        window.routePreviewLayers =
            [];
    }

    if (
        window.splitRouteHitLayer &&
        map &&
        map.hasLayer(window.splitRouteHitLayer)
    ) {
        map.removeLayer(window.splitRouteHitLayer);
    }

    window.splitRouteHitLayer =
        null;

    stack.splice(
        safeCloseIdx,
        1
    );

    window.multiGpxStack =
        stack;

    try {
        multiGpxStack =
            stack;
    } catch (err) {}

    if (stack.length === 0) {
        if (typeof window.closeAllGpxFilesDirect === "function") {
            window.closeAllGpxFilesDirect();
        }

        return;
    }

    const nextIdx =
        Math.min(
            safeCloseIdx,
            stack.length - 1
        );

    window.currentMultiIndex =
        nextIdx;

    window.currentActiveIndex =
        0;

    const currentFile =
        stack[nextIdx];

    if (
        currentFile &&
        Array.isArray(currentFile.routes) &&
        currentFile.routes.length > 0
    ) {
        window.allTracks =
            currentFile.routes;

        try {
            allTracks =
                currentFile.routes;
        } catch (err) {}

    } else if (currentFile) {
        window.allTracks =
            [
                currentFile
            ];

        try {
            allTracks =
                [
                    currentFile
                ];
        } catch (err) {}

    } else {
        window.allTracks =
            [];

        try {
            allTracks =
                [];
        } catch (err) {}
    }

    const activeRoute =
        window.allTracks &&
        window.allTracks[0]
            ? window.allTracks[0]
            : null;

    window.trackPoints =
        activeRoute &&
        Array.isArray(activeRoute.points)
            ? activeRoute.points
            : [];

    try {
        trackPoints =
            window.trackPoints;
    } catch (err) {}

    if (typeof renderMultiGpxButtons === "function") {
        renderMultiGpxButtons();
    }

    if (typeof updateRouteSelectDropdown === "function") {
        updateRouteSelectDropdown();
    }

    const routeSelect =
        document.getElementById("routeSelect");

    if (routeSelect) {
        routeSelect.value =
            "0";

        routeSelect.selectedIndex =
            0;
    }

    const focusGpx =
        stack[nextIdx];

    if (
        focusGpx &&
        focusGpx.visible !== false &&
        typeof switchMultiGpx === "function"
    ) {
        switchMultiGpx(
            nextIdx
        );

    } else if (
        focusGpx &&
        focusGpx.visible !== false &&
        typeof loadRoute === "function"
    ) {
        loadRoute(
            0,
            null,
            {
                skipAutoFitBounds: true,
                preserveChartState: true
            }
        );
    }

    if (typeof renderRouteInfo === "function") {
        renderRouteInfo();
    }

    if (typeof window.updateLoadedGpxCountDisplay === "function") {
        window.updateLoadedGpxCountDisplay();
    }

    if (typeof window.refreshGpxManagerIfOpen === "function") {
        window.refreshGpxManagerIfOpen();
    }


    if (typeof showMapToast === "function") {
        showMapToast("已關閉目前路線檔");
    }
    
    setTimeout(function() {
		    window.isClosingGpxFile =
		        false;
		}, 300);
};

window.showCloseFileChoiceModal = function() {
    const stack =
        window.multiGpxStack ||
        multiGpxStack ||
        [];

    const totalCount =
        Array.isArray(stack)
            ? stack.length
            : 0;

    if (totalCount <= 0) {
        return;
    }

    const currentIdx =
        typeof window.currentMultiIndex === "number"
            ? window.currentMultiIndex
            : 0;

    const currentFile =
        stack[currentIdx];

    const currentName =
        currentFile
            ? (
                currentFile.name ||
                currentFile.fileName ||
                currentFile.displayName ||
                "目前路線檔"
            )
            : "目前路線檔";

    let modal =
        document.getElementById("closeFileChoiceModal");

    if (!modal) {
        modal =
            document.createElement("div");

        modal.id =
            "closeFileChoiceModal";

        modal.innerHTML = `
            <div class="close-file-choice-box">
                <div class="close-file-choice-icon-wrap">
                    <span class="material-icons close-file-choice-icon">warning</span>
                </div>

                <div class="close-file-choice-title">關閉檔案</div>

                <div id="closeFileChoiceMessage" class="close-file-choice-message"></div>

                <div class="close-file-choice-actions">
                    <button type="button" id="closeAllFilesBtn" class="close-choice-btn danger">
                        關閉所有檔案
                    </button>

                    <button type="button" id="closeCurrentFileBtn" class="close-choice-btn primary">
                        關閉目前檔案
                    </button>

                    <button type="button" id="cancelCloseFileBtn" class="close-choice-btn cancel">
                        取消
                    </button>
                </div>
            </div>
        `;
    }

    
    const fullscreenParent =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement ||
        null;

    const modalParent =
        fullscreenParent ||
        (
            document.body.classList.contains("iphone-fullscreen")
                ? document.getElementById("map")
                : null
        ) ||
        document.body;

    if (modal.parentElement !== modalParent) {
        modalParent.appendChild(modal);
    } else {
        
        modalParent.appendChild(modal);
    }

    const msg =
        modal.querySelector("#closeFileChoiceMessage");

    if (msg) {
        msg.innerHTML =
            "目前檔案：「" + currentName + "」<br>" +
            "<span class='close-file-warning-text'>若有尚未匯出的修改，關閉後將不會保留。</span>";
    }

    
    modal.style.setProperty(
        "display",
        "flex",
        "important"
    );

    modal.style.setProperty(
        "position",
        "fixed",
        "important"
    );

    modal.style.setProperty(
        "inset",
        "0",
        "important"
    );

    modal.style.setProperty(
        "z-index",
        "2147483647",
        "important"
    );

    modal.style.setProperty(
        "pointer-events",
        "auto",
        "important"
    );

    let closeModal = null;

    const handleCloseFileEscKey = function(e) {
        if (e.key === "Escape") {
            if (typeof closeModal === "function") {
                closeModal();
            }
        }
    };

    closeModal = function() {
        modal.style.setProperty(
            "display",
            "none",
            "important"
        );

        window.removeEventListener(
            "keydown",
            handleCloseFileEscKey
        );
    };

    window.removeEventListener(
        "keydown",
        handleCloseFileEscKey
    );

    window.addEventListener(
        "keydown",
        handleCloseFileEscKey
    );

    const closeAllBtn =
        modal.querySelector("#closeAllFilesBtn");

    const closeCurrentBtn =
        modal.querySelector("#closeCurrentFileBtn");

    const cancelBtn =
        modal.querySelector("#cancelCloseFileBtn");

    if (closeAllBtn) {
        closeAllBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();

            closeModal();

            if (typeof window.closeAllGpxFilesDirect === "function") {
                window.closeAllGpxFilesDirect();
            }
        };
    }

    if (closeCurrentBtn) {
        closeCurrentBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();

            closeModal();

            if (typeof window.closeCurrentGpxFileDirect === "function") {
                window.closeCurrentGpxFileDirect();
            }
        };
    }

    if (cancelBtn) {
        cancelBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();

            closeModal();
        };
    }

    modal.onclick = function(e) {
        if (e.target === modal) {
            closeModal();
        }
    };
};

window.selectRouteWithHalo = function(fileIdx, routeIdx, route, focusLatLng) {
    const nFileIdx =
        Number.isFinite(Number(fileIdx))
            ? Number(fileIdx)
            : (
                typeof window.currentMultiIndex === "number"
                    ? window.currentMultiIndex
                    : 0
            );

    const nRouteIdx =
        Number.isFinite(Number(routeIdx))
            ? Number(routeIdx)
            : (
                typeof window.currentActiveIndex === "number"
                    ? window.currentActiveIndex
                    : 0
            );

    const stack =
        window.multiGpxStack ||
        multiGpxStack ||
        [];

    const currentFile =
        stack[nFileIdx];

    const targetRoute =
        route ||
        (
            currentFile &&
            Array.isArray(currentFile.routes) &&
            currentFile.routes[nRouteIdx]
                ? currentFile.routes[nRouteIdx]
                : currentFile
        );

    if (!targetRoute) {
        return;
    }

    
    window.currentToolTarget = {
        type: "route",
        fileIdx: nFileIdx,
        routeIdx: nRouteIdx,
        wptIdx: null
    };

    
    if (
        typeof currentPopup !== "undefined" &&
        currentPopup &&
        typeof map !== "undefined" &&
        map &&
        typeof map.hasLayer === "function" &&
        map.hasLayer(currentPopup)
    ) {
        map.closePopup(currentPopup);
    }

    try {
        currentPopup =
            null;
    } catch (err) {}

    if (
        typeof map !== "undefined" &&
        map &&
        typeof map.closePopup === "function"
    ) {
        map.closePopup();
    }

    
    if (
        window.activeFocusCircle &&
        typeof map !== "undefined" &&
        map &&
        typeof map.hasLayer === "function" &&
        map.hasLayer(window.activeFocusCircle)
    ) {
        map.removeLayer(window.activeFocusCircle);
    }

    window.activeFocusCircle =
        null;

    
    const hasFocusLatLng =
        focusLatLng &&
        Number.isFinite(Number(focusLatLng.lat)) &&
        (
            Number.isFinite(Number(focusLatLng.lng)) ||
            Number.isFinite(Number(focusLatLng.lon))
        );

    if (hasFocusLatLng) {
        const focusLat =
            Number(focusLatLng.lat);

        const focusLng =
            Number.isFinite(Number(focusLatLng.lng))
                ? Number(focusLatLng.lng)
                : Number(focusLatLng.lon);

        if (
            typeof hoverMarker === "undefined" ||
            !hoverMarker
        ) {
            hoverMarker =
                L.circleMarker(
                    [
                        focusLat,
                        focusLng
                    ],
                    {
                        radius: 7,
                        color: "#ffffff",
                        weight: 2,
                        fillColor: "#1a73e8",
                        fillOpacity: 1,
                        interactive: false
                    }
                ).addTo(map);

        } else {
            hoverMarker
                .setLatLng([
                    focusLat,
                    focusLng
                ])
                .addTo(map);
        }

        if (
            hoverMarker &&
            typeof hoverMarker.bringToFront === "function"
        ) {
            hoverMarker.bringToFront();
        }

    } else {
        if (
            typeof hoverMarker !== "undefined" &&
            hoverMarker &&
            typeof map !== "undefined" &&
            map &&
            typeof map.hasLayer === "function" &&
            map.hasLayer(hoverMarker)
        ) {
            map.removeLayer(hoverMarker);
        }

        try {
            hoverMarker =
                null;
        } catch (err) {}
    }

    
    if (
        typeof map !== "undefined" &&
        map &&
        typeof map.eachLayer === "function" &&
        typeof L !== "undefined"
    ) {
        map.eachLayer(function(layer) {
            if (
                layer === hoverMarker
            ) {
                return;
            }

            if (
                layer instanceof L.CircleMarker &&
                layer.options &&
                Number(layer.options.radius) >= 6 &&
                Number(layer.options.radius) <= 8
            ) {
                const color =
                    String(layer.options.color || "").toLowerCase();

                const fillColor =
                    String(layer.options.fillColor || "").toLowerCase();

                const isFocusBlueDot =
                    fillColor === "#1a73e8" ||
                    color === "#1a73e8" ||
                    fillColor === "#3388ff" ||
                    color === "#3388ff";

                if (isFocusBlueDot) {
                    map.removeLayer(layer);
                }
            }
        });
    }

    
    if (
        window.activeRouteHaloLayer &&
        typeof map !== "undefined" &&
        map &&
        typeof map.hasLayer === "function" &&
        map.hasLayer(window.activeRouteHaloLayer)
    ) {
        map.removeLayer(window.activeRouteHaloLayer);
    }

    window.activeRouteHaloLayer =
        null;

    
    let haloLatLngs =
        [];

    if (
        Array.isArray(targetRoute.segments) &&
        targetRoute.segments.length > 0
    ) {
        haloLatLngs =
            targetRoute.segments;

    } else if (
        Array.isArray(targetRoute.points) &&
        targetRoute.points.length > 0
    ) {
        haloLatLngs =
            [
                targetRoute.points
                    .map(function(p) {
                        return [
                            Number(p.lat),
                            Number(p.lon)
                        ];
                    })
                    .filter(function(pt) {
                        return (
                            Number.isFinite(pt[0]) &&
                            Number.isFinite(pt[1])
                        );
                    })
            ];
    }

    
    if (
        haloLatLngs &&
        haloLatLngs.length > 0
    ) {
        window.activeRouteHaloLayer =
            L.polyline(
                haloLatLngs,
                {
                    color: "#ffffff",
                    weight: 10,
                    opacity: 0.9,
                    interactive: false
                }
            ).addTo(map);

        
        if (
            window.activeRouteHaloLayer &&
            typeof window.activeRouteHaloLayer.bringToBack === "function"
        ) {
            window.activeRouteHaloLayer.bringToBack();
        }

        if (
            targetRoute.layer &&
            typeof targetRoute.layer.bringToFront === "function"
        ) {
            targetRoute.layer.bringToFront();
        }

        if (
            targetRoute.hitLayer &&
            typeof targetRoute.hitLayer.bringToFront === "function"
        ) {
            targetRoute.hitLayer.bringToFront();
        }
    }

    
    document.querySelectorAll(".wpt-table tr").forEach(function(row) {
        row.classList.remove("wpt-selected-row");
    });

    
    if (typeof window.renderRouteToolControl === "function") {
        window.renderRouteToolControl();
    }
};

if (!document.getElementById("routeDirectionMarkerStyle")) {
    const style =
        document.createElement("style");

    style.id =
        "routeDirectionMarkerStyle";

    style.innerHTML = `
        .route-direction-arrow-wrap {
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
        }

        .route-direction-arrow-inner {
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            transform-origin: center center;
            opacity: 0.95;
        }

        .route-direction-arrow-text {
            font-size: 28px;
            font-weight: 900;
            color: #D23500;
            line-height: 28px;
            -webkit-text-stroke: 0.8px #ffffff;
            font-family: Arial, sans-serif;
        }
    `;

    document.head.appendChild(style);
}

window.routeDirectionLayerGroup =
    null;

window.showRouteDirectionMarkers =
    true;

function getDirectionMarkerPixelSpacing() {
    const z =
        typeof map !== "undefined" && map
            ? map.getZoom()
            : 15;

    if (z <= 11) return 240;
    if (z <= 13) return 200;
    if (z <= 15) return 150;
    if (z <= 17) return 110;

    return 80;
}

function clearRouteDirectionMarkers() {
    if (
        window.routeDirectionLayerGroup &&
        typeof map !== "undefined" &&
        map &&
        map.hasLayer(window.routeDirectionLayerGroup)
    ) {
        map.removeLayer(window.routeDirectionLayerGroup);
    }

    window.routeDirectionLayerGroup =
        null;
}

function getRouteDirectionLatLngs(route) {
    if (!route) return [];

    if (
        Array.isArray(route.segments) &&
        route.segments.length > 0
    ) {
        const result =
            [];

        route.segments.forEach(function(seg) {
            if (!Array.isArray(seg)) return;

            seg.forEach(function(pt) {
                if (Array.isArray(pt)) {
                    result.push([
                        Number(pt[0]),
                        Number(pt[1])
                    ]);

                } else if (pt && typeof pt === "object") {
                    result.push([
                        Number(pt.lat),
                        Number(
                            pt.lng !== undefined
                                ? pt.lng
                                : pt.lon
                        )
                    ]);
                }
            });
        });

        return result.filter(function(pt) {
            return (
                Number.isFinite(pt[0]) &&
                Number.isFinite(pt[1])
            );
        });
    }

    if (
        Array.isArray(route.points) &&
        route.points.length > 0
    ) {
        return route.points
            .map(function(p) {
                return [
                    Number(p.lat),
                    Number(
                        p.lng !== undefined
                            ? p.lng
                            : p.lon
                    )
                ];
            })
            .filter(function(pt) {
                return (
                    Number.isFinite(pt[0]) &&
                    Number.isFinite(pt[1])
                );
            });
    }

    return [];
}

function getDirectionAngleByLayerPoint(latlngA, latlngB) {
    const p1 =
        map.latLngToLayerPoint(latlngA);

    const p2 =
        map.latLngToLayerPoint(latlngB);

    const dx =
        p2.x - p1.x;

    const dy =
        p2.y - p1.y;

    return Math.atan2(dx, -dy) * 180 / Math.PI;
}

function renderRouteDirectionMarkers(route) {
    clearRouteDirectionMarkers();

    if (
        window.showRouteDirectionMarkers !== true ||
        typeof map === "undefined" ||
        !map
    ) {
        return;
    }

    let targetRoute =
        route || null;

    if (!targetRoute) {
        const stack =
            window.multiGpxStack ||
            multiGpxStack ||
            [];

        const fileIdx =
            typeof window.currentMultiIndex === "number"
                ? window.currentMultiIndex
                : 0;

        const routeIdx =
            typeof window.currentActiveIndex === "number"
                ? window.currentActiveIndex
                : 0;

        const currentFile =
            stack[fileIdx];

        if (
            currentFile &&
            Array.isArray(currentFile.routes) &&
            currentFile.routes[routeIdx]
        ) {
            targetRoute =
                currentFile.routes[routeIdx];

        } else {
            targetRoute =
                currentFile;
        }
    }

    if (!targetRoute) {
        return;
    }

    const latLngPairs =
        getRouteDirectionLatLngs(targetRoute);

    if (latLngPairs.length < 2) {
        return;
    }
    
    const makeDirectionPointKey = function(lat, lng) {
		    return (
		        Number(lat).toFixed(7) +
		        "," +
		        Number(lng).toFixed(7)
		    );
		};
		
		const allowedDirectionSegmentKeys =
		    new Set();
		
		if (
		    targetRoute &&
		    targetRoute.isCombined === true &&
		    Array.isArray(targetRoute.segments) &&
		    targetRoute.segments.length > 0
		) {
		    targetRoute.segments.forEach(function(seg) {
		        if (
		            !Array.isArray(seg) ||
		            seg.length < 2
		        ) {
		            return;
		        }
		
		        for (let i = 1; i < seg.length; i++) {
		            const prevRaw =
		                seg[i - 1];
		
		            const currRaw =
		                seg[i];
		
		            const prevLat =
		                Array.isArray(prevRaw)
		                    ? Number(prevRaw[0])
		                    : Number(prevRaw.lat);
		
		            const prevLng =
		                Array.isArray(prevRaw)
		                    ? Number(prevRaw[1])
		                    : Number(
		                        prevRaw.lon !== undefined
		                            ? prevRaw.lon
		                            : prevRaw.lng
		                    );
		
		            const currLat =
		                Array.isArray(currRaw)
		                    ? Number(currRaw[0])
		                    : Number(currRaw.lat);
		
		            const currLng =
		                Array.isArray(currRaw)
		                    ? Number(currRaw[1])
		                    : Number(
		                        currRaw.lon !== undefined
		                            ? currRaw.lon
		                            : currRaw.lng
		                    );
		
		            if (
		                !Number.isFinite(prevLat) ||
		                !Number.isFinite(prevLng) ||
		                !Number.isFinite(currLat) ||
		                !Number.isFinite(currLng)
		            ) {
		                continue;
		            }
		
		            allowedDirectionSegmentKeys.add(
		                makeDirectionPointKey(prevLat, prevLng) +
		                "->" +
		                makeDirectionPointKey(currLat, currLng)
		            );
		        }
		    });
		}

    const spacingPx =
        getDirectionMarkerPixelSpacing();

    window.routeDirectionLayerGroup =
        L.layerGroup();

    let totalPx =
        0;

    const segmentInfos =
        [];

    for (let i = 1; i < latLngPairs.length; i++) {
        const prev =
            L.latLng(
                latLngPairs[i - 1][0],
                latLngPairs[i - 1][1]
            );

        const curr =
            L.latLng(
                latLngPairs[i][0],
                latLngPairs[i][1]
            );
            
            if (
        targetRoute &&
        targetRoute.isCombined === true &&
        allowedDirectionSegmentKeys.size > 0
    ) {
        const segmentKey =
            makeDirectionPointKey(prev.lat, prev.lng) +
            "->" +
            makeDirectionPointKey(curr.lat, curr.lng);

        if (!allowedDirectionSegmentKeys.has(segmentKey)) {
            continue;
        }
    }

        const p1 =
            map.latLngToLayerPoint(prev);

        const p2 =
            map.latLngToLayerPoint(curr);

        const segmentPx =
            p1.distanceTo(p2);

        if (
            !Number.isFinite(segmentPx) ||
            segmentPx <= 0
        ) {
            continue;
        }

        segmentInfos.push({
            prev: prev,
            curr: curr,
            startPx: totalPx,
            endPx: totalPx + segmentPx,
            segmentPx: segmentPx
        });

        totalPx +=
            segmentPx;
    }

    if (
        !Number.isFinite(totalPx) ||
        totalPx <= 0
    ) {
        return;
    }

    const edgePaddingPx =
        Math.max(
            50,
            spacingPx * 0.8
        );

    const markerDistances =
        [];

    const middleDistancePx =
        totalPx / 2;

    if (
        Number.isFinite(middleDistancePx) &&
        middleDistancePx > 0 &&
        middleDistancePx < totalPx
    ) {
        markerDistances.push(
            middleDistancePx
        );
    }

    let dForward =
        middleDistancePx + spacingPx;

    while (dForward < totalPx - edgePaddingPx) {
        markerDistances.push(
            dForward
        );

        dForward +=
            spacingPx;
    }


    let dBackward =
        middleDistancePx - spacingPx;

    while (dBackward > edgePaddingPx) {
        markerDistances.push(
            dBackward
        );

        dBackward -=
            spacingPx;
    }

    const uniqueDistances =
        [];

    markerDistances
        .sort(function(a, b) {
            return a - b;
        })
        .forEach(function(d) {
            const duplicated =
                uniqueDistances.some(function(existing) {
                    return Math.abs(existing - d) < 1;
                });

            if (!duplicated) {
                uniqueDistances.push(
                    d
                );
            }
        });
        
    const placedArrowLayerPoints =
 		   [];

		const minArrowClusterDistancePx =
		    70; // 同一區域 70px 內只保留一個箭頭，可調 50 / 70 / 90    

    uniqueDistances.forEach(function(distancePx) {
        let targetSegment =
            null;

        for (let i = 0; i < segmentInfos.length; i++) {
            if (
                distancePx >= segmentInfos[i].startPx &&
                distancePx <= segmentInfos[i].endPx
            ) {
                targetSegment =
                    segmentInfos[i];

                break;
            }
        }

        if (!targetSegment) return;

        const t =
            targetSegment.segmentPx > 0
                ? (
                    (distancePx - targetSegment.startPx) /
                    targetSegment.segmentPx
                )
                : 0;

        const safeT =
            Math.max(
                0,
                Math.min(
                    1,
                    t
                )
            );

        const markerLat =
            targetSegment.prev.lat +
            (
                targetSegment.curr.lat -
                targetSegment.prev.lat
            ) * safeT;

        const markerLng =
            targetSegment.prev.lng +
            (
                targetSegment.curr.lng -
                targetSegment.prev.lng
            ) * safeT;
            
        const arrowLayerPoint =
				    map.latLngToLayerPoint(
				        L.latLng(
				            markerLat,
				            markerLng
				        )
				    );
				
				const hasNearbyArrow =
				    placedArrowLayerPoints.some(function(existingPoint) {
				        return (
				            existingPoint &&
				            arrowLayerPoint.distanceTo(existingPoint) <
				                minArrowClusterDistancePx
				        );
				    });
				
				if (hasNearbyArrow) {
				    return;
				}
				
				placedArrowLayerPoints.push(
				    arrowLayerPoint
				);

        const angle =
            getDirectionAngleByLayerPoint(
                targetSegment.prev,
                targetSegment.curr
            );

        const marker =
            L.marker(
                [
                    markerLat,
                    markerLng
                ],
                {
                    interactive: false,
                    zIndexOffset: 900,
                    icon: L.divIcon({
                        className: "route-direction-arrow-icon",
                        iconSize: [24, 24],
                        iconAnchor: [12, 12],
                        html:
                            '<div class="route-direction-arrow-wrap">' +
                                '<div class="route-direction-arrow-inner route-direction-arrow-text" style="transform: rotate(' + (angle + 90) + 'deg);">' +
                                    '&lt;' +
                                '</div>' +
                            '</div>'
                    })
                }
            );

        window.routeDirectionLayerGroup.addLayer(
            marker
        );
    });

    if (
        window.routeDirectionLayerGroup &&
        window.routeDirectionLayerGroup.getLayers().length > 0
    ) {
        window.routeDirectionLayerGroup.addTo(
            map
        );
    }
}

// ======================================================
// PDF 地圖匯出模組：框選範圍 → A4/A3 → 匯出 PDF
// 請貼在 app.js 最後
// ======================================================

let pdfSelectMode = false;
let pdfSelectStartLatLng = null;
let pdfSelectRect = null;
let pdfSelectedBounds = null;
let pdfExportMap = null;
    
window.pdfSuppressMapClickUntil = 0;

const PDF_PAPER_SIZES = {
    150: {
        A4: {
            portrait: {
                width: 1240,
                height: 1754
            },
            landscape: {
                width: 1754,
                height: 1240
            }
        },
        A3: {
            portrait: {
                width: 1754,
                height: 2480
            },
            landscape: {
                width: 2480,
                height: 1754
            }
        }
    },
    300: {
        A4: {
            portrait: {
                width: 2480,
                height: 3508
            },
            landscape: {
                width: 3508,
                height: 2480
            }
        },
        A3: {
            portrait: {
                width: 3508,
                height: 4961
            },
            landscape: {
                width: 4961,
                height: 3508
            }
        }
    }
};

function installPdfExportFeature() {
    const btn =
        document.getElementById("exportPdfMapBtn");

    if (btn) {
				btn.onclick = function() {
				    if (pdfSelectMode === true) {
				        cancelPdfAreaSelect();
				    } else {
				        startPdfAreaSelect();
				    }
				};
    }

    const cancelBtn =
        document.getElementById("pdfExportCancelBtn");

    if (cancelBtn) {
        cancelBtn.onclick = function() {
            hidePdfExportDialog();
        };
    }

    const confirmBtn =
        document.getElementById("pdfExportConfirmBtn");

    if (confirmBtn) {
        confirmBtn.onclick = function() {
            const paper =
                document.getElementById("pdfPaperSize").value || "A4";

            const orientation =
                document.getElementById("pdfOrientation").value || "landscape";

            const fitMode =
                "contain";

            const dpi =
                document.getElementById("pdfDpiMode").value || "150";
                
            const wptIconSize =
						    document.getElementById("pdfWptIconSize").value || "medium";
						
						const wptLabelSize =
						    document.getElementById("pdfWptLabelSize").value || "medium";
						    
						const wptDisplayModeEl =
						    document.getElementById("pdfWptDisplayMode");
						
						const wptDisplayMode =
						    wptDisplayModeEl
						        ? wptDisplayModeEl.value
						        : "iconAndDot";

						exportSelectedMapToPdf({
						    paper: paper,
						    orientation: orientation,
						    fitMode: fitMode,
						    dpi: dpi,
						    wptIconSize: wptIconSize,
						    wptLabelSize: wptLabelSize,
						    wptDisplayMode: wptDisplayMode
						});
        };
    }
}

function showPdfSelectHint() {
	
    const hint =
        document.getElementById("pdfSelectHintBox");

    if (!hint) return;

    const fullscreenEl =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        null;

    if (
        fullscreenEl &&
        hint.parentElement !== fullscreenEl
    ) {
        fullscreenEl.appendChild(
            hint
        );
    }

    hint.style.display =
        "block";
}

function hidePdfSelectHint() {
    const hint =
        document.getElementById("pdfSelectHintBox");

    if (hint) {
        hint.style.display =
            "none";
    }
}

function startPdfAreaSelect() {
    if (
        typeof map === "undefined" ||
        !map
    ) {
        alert("地圖尚未初始化");
        return;
    }

    pdfSelectMode =
        true;
        
    const pdfBtn =
		    document.getElementById("exportPdfMapBtn");
		
		if (pdfBtn) {
		    pdfBtn.style.setProperty(
		        "background",
		        "#1a73e8",
		        "important"
		    );
		
		    pdfBtn.style.setProperty(
		        "color",
		        "white",
		        "important"
		    );
		
		    pdfBtn.title =
		        "取消匯出 PDF 範圍選取";
		}

    pdfSelectStartLatLng =
        null;

    pdfSelectedBounds =
        null;

    if (
        pdfSelectRect &&
        map.hasLayer(pdfSelectRect)
    ) {
        map.removeLayer(pdfSelectRect);
    }

    pdfSelectRect =
        null;

    const mapEl =
        document.getElementById("map");

    if (mapEl) {
        mapEl.classList.add("pdf-export-selecting");
    }

    if (map.dragging) {
        map.dragging.disable();
    }

    showPdfSelectHint();
}

function finishPdfAreaSelect() {
		hidePdfSelectHint();
	
    pdfSelectMode =
        false;

    pdfSelectStartLatLng =
        null;

    const mapEl =
        document.getElementById("map");

    if (mapEl) {
        mapEl.classList.remove("pdf-export-selecting");
    }

    if (
        typeof map !== "undefined" &&
        map &&
        map.dragging
    ) {
        map.dragging.enable();
    }
}


function cancelPdfAreaSelect() {
	
		const pdfBtn =
		    document.getElementById("exportPdfMapBtn");
		
		if (pdfBtn) {
		    pdfBtn.style.removeProperty("background");
		    pdfBtn.style.removeProperty("color");
		
		    pdfBtn.title =
		        "匯出 PDF 地圖";
		}
    window.pdfSuppressMapClickUntil =
        Date.now() + 1000;

    pdfSelectMode =
        false;

    pdfSelectStartLatLng =
        null;

    pdfSelectedBounds =
        null;

    hidePdfSelectHint();

    if (
        pdfSelectRect &&
        typeof map !== "undefined" &&
        map &&
        map.hasLayer(pdfSelectRect)
    ) {
        map.removeLayer(pdfSelectRect);
    }

    pdfSelectRect =
        null;

    const mapEl =
        document.getElementById("map");

    if (mapEl) {
        mapEl.classList.remove("pdf-export-selecting");
    }

    if (
        typeof map !== "undefined" &&
        map &&
        map.dragging
    ) {
        map.dragging.enable();
    }
}

function showPdfExportDialog(bounds) {
    pdfSelectedBounds =
        bounds;

    window.pdfDialogOpen =
        true;

    window.pdfSuppressMapClickUntil =
        Date.now() + 1000;

    const overlay =
        document.getElementById("pdfExportDialogOverlay");

    if (!overlay) return;

    const fullscreenEl =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        null;

    if (
        fullscreenEl &&
        overlay.parentElement !== fullscreenEl
    ) {
        fullscreenEl.appendChild(
            overlay
        );
    }

    overlay.style.display =
        "flex";
}

function hidePdfExportDialog() {
		window.pdfDialogOpen = false;
		
		window.pdfSuppressMapClickUntil =
        Date.now() + 1000;
		
		const pdfBtn =
		    document.getElementById("exportPdfMapBtn");
		
		if (pdfBtn) {
		    pdfBtn.style.removeProperty("background");
		    pdfBtn.style.removeProperty("color");
		
		    pdfBtn.title =
		        "匯出 PDF 地圖";
		}
    window.pdfSuppressMapClickUntil =
        Date.now() + 1000;

    const overlay =
        document.getElementById("pdfExportDialogOverlay");

    if (overlay) {
        overlay.style.display =
            "none";
    }

    if (
        pdfSelectRect &&
        typeof map !== "undefined" &&
        map &&
        map.hasLayer(pdfSelectRect)
    ) {
        map.removeLayer(pdfSelectRect);
    }

    pdfSelectRect =
        null;

    pdfSelectMode =
        false;

    pdfSelectStartLatLng =
        null;

    if (
        typeof map !== "undefined" &&
        map &&
        map.dragging
    ) {
        map.dragging.enable();
    }
}

function getLatLngFromTouchEvent(touchEvent, useChangedTouch) {
    if (
        typeof map === "undefined" ||
        !map ||
        !touchEvent
    ) {
        return null;
    }

    let touch =
        null;

    if (
        useChangedTouch === true &&
        touchEvent.changedTouches &&
        touchEvent.changedTouches.length > 0
    ) {
        touch =
            touchEvent.changedTouches[0];

    } else if (
        touchEvent.touches &&
        touchEvent.touches.length > 0
    ) {
        touch =
            touchEvent.touches[0];
    }

    if (!touch) {
        return null;
    }

    const container =
        map.getContainer();

    const rect =
        container.getBoundingClientRect();

    const x =
        touch.clientX - rect.left;

    const y =
        touch.clientY - rect.top;

    const point =
        L.point(
            x,
            y
        );

    return map.containerPointToLatLng(
        point
    );
}

function installPdfAreaSelectMapEvents() {
    if (
        typeof map === "undefined" ||
        !map ||
        window.pdfAreaSelectMapEventsInstalled
    ) {
        return;
    }

    window.pdfAreaSelectMapEventsInstalled =
        true;

		map.on("mousedown", function(e) {
		    if (!pdfSelectMode) return;
		    if (!e || !e.latlng) return;
		
		    window.pdfSuppressMapClickUntil =
		        Date.now() + 800;
		
		    if (e.originalEvent) {
		        L.DomEvent.stop(e.originalEvent);
		    }

        pdfSelectStartLatLng =
            e.latlng;

        if (
            pdfSelectRect &&
            map.hasLayer(pdfSelectRect)
        ) {
            map.removeLayer(pdfSelectRect);
        }

        pdfSelectRect =
            L.rectangle(
                L.latLngBounds(
                    pdfSelectStartLatLng,
                    pdfSelectStartLatLng
                ),
                {
                    color: "#1a73e8",
                    weight: 2,
                    fillColor: "#1a73e8",
                    fillOpacity: 0.12,
                    dashArray: "6,4"
                }
            ).addTo(map);
    });

				map.on("mousemove", function(e) {
				    if (!pdfSelectMode) return;
				    if (!pdfSelectStartLatLng) return;
				    if (!e || !e.latlng) return;
				
				    window.pdfSuppressMapClickUntil =
				        Date.now() + 800;
				
				    if (e.originalEvent) {
				        L.DomEvent.stop(e.originalEvent);
				    }

        const bounds =
            L.latLngBounds(
                pdfSelectStartLatLng,
                e.latlng
            );

        if (pdfSelectRect) {
            pdfSelectRect.setBounds(
                bounds
            );
        }
    });

				map.on("mouseup", function(e) {
				    if (!pdfSelectMode) return;
				    if (!pdfSelectStartLatLng) return;
				    if (!e || !e.latlng) return;
				
				    window.pdfSuppressMapClickUntil =
				        Date.now() + 1000;
				
				    if (e.originalEvent) {
				        L.DomEvent.stop(e.originalEvent);
				    }

        const bounds =
            L.latLngBounds(
                pdfSelectStartLatLng,
                e.latlng
            );

        finishPdfAreaSelect();

        if (
            !bounds ||
            !bounds.isValid()
        ) {
            alert("框選範圍無效");
            return;
        }

        showPdfExportDialog(
            bounds
        );
    });
    
    const mapContainer =
		    map.getContainer();
		
		if (mapContainer && !window.pdfTouchAreaSelectInstalled) {
		    window.pdfTouchAreaSelectInstalled =
		        true;
		
		    mapContainer.addEventListener(
		        "touchstart",
		        function(e) {
		            if (!pdfSelectMode) return;
		
		            window.pdfSuppressMapClickUntil =
		                Date.now() + 1000;
		
		            if (e.cancelable) {
		                e.preventDefault();
		            }
		
		            e.stopPropagation();
		
								const latlng =
								    getLatLngFromTouchEvent(
								        e,
								        false
								    );
		
		            if (!latlng) return;
		
		            pdfSelectStartLatLng =
		                latlng;
		
		            if (
		                pdfSelectRect &&
		                map.hasLayer(pdfSelectRect)
		            ) {
		                map.removeLayer(pdfSelectRect);
		            }
		
		            pdfSelectRect =
		                L.rectangle(
		                    L.latLngBounds(
		                        pdfSelectStartLatLng,
		                        pdfSelectStartLatLng
		                    ),
		                    {
		                        color: "#1a73e8",
		                        weight: 2,
		                        fillColor: "#1a73e8",
		                        fillOpacity: 0.12,
		                        dashArray: "6,4"
		                    }
		                ).addTo(map);
		        },
		        {
		            passive: false
		        }
		    );
		
		    mapContainer.addEventListener(
		        "touchmove",
		        function(e) {
		            if (!pdfSelectMode) return;
		            if (!pdfSelectStartLatLng) return;
		
		            window.pdfSuppressMapClickUntil =
		                Date.now() + 1000;
		
		            if (e.cancelable) {
		                e.preventDefault();
		            }
		
		            e.stopPropagation();
		
								const latlng =
								    getLatLngFromTouchEvent(
								        e,
								        false
								    );
		
		            if (!latlng) return;
		
		            const bounds =
		                L.latLngBounds(
		                    pdfSelectStartLatLng,
		                    latlng
		                );
		
		            if (pdfSelectRect) {
		                pdfSelectRect.setBounds(
		                    bounds
		                );
		            }
		        },
		        {
		            passive: false
		        }
		    );
		
		    mapContainer.addEventListener(
		        "touchend",
		        function(e) {
		            if (!pdfSelectMode) return;
		            if (!pdfSelectStartLatLng) return;
		
		            window.pdfSuppressMapClickUntil =
		                Date.now() + 1200;
		
		            if (e.cancelable) {
		                e.preventDefault();
		            }
		
		            e.stopPropagation();
		
		            const endLatLng =
							    getLatLngFromTouchEvent(
							        e,
							        true
							    );
		
		            if (!endLatLng) {
		                cancelPdfAreaSelect();
		                return;
		            }
		
		            const bounds =
		                L.latLngBounds(
		                    pdfSelectStartLatLng,
		                    endLatLng
		                );
		
		            finishPdfAreaSelect();
		
		            if (
		                !bounds ||
		                !bounds.isValid()
		            ) {
		                alert("框選範圍無效");
		                return;
		            }
		
		            showPdfExportDialog(
		                bounds
		            );
		        },
		        {
		            passive: false
		        }
		    );
		}
}

function getPdfPaperPixelSize(options) {
    const dpi =
        String(options.dpi || "150");

    const paper =
        options.paper || "A4";

    const orientation =
        options.orientation || "landscape";

    return PDF_PAPER_SIZES[dpi][paper][orientation];
}

function createPdfExportMapContainer(size) {
    const wrapper =
        document.getElementById("pdfExportMapWrapper");

    const mapDiv =
        document.getElementById("pdfExportMap");

    if (!wrapper || !mapDiv) {
        throw new Error("找不到 pdfExportMapWrapper / pdfExportMap");
    }

    mapDiv.style.width =
        size.width + "px";

    mapDiv.style.height =
        size.height + "px";

    wrapper.style.width =
        size.width + "px";

    wrapper.style.height =
        size.height + "px";

    if (pdfExportMap) {
        pdfExportMap.remove();
        pdfExportMap =
            null;
    }

		pdfExportMap =
		    L.map(
		        "pdfExportMap",
		        {
		            zoomControl: false,
		            attributionControl: false,
		            preferCanvas: true,
		            fadeAnimation: false,
		            zoomAnimation: false,
		            markerZoomAnimation: false,
		
		            // 重要：讓 fitBounds 可以用小數 zoom，
		            // 避免因為整數 zoom 導致匯出範圍被放大太多。
		            zoomSnap: 0,
		            zoomDelta: 0.25
		        }
		    );

    return pdfExportMap;
}

function copyVisibleTileLayersToExportMap(exportMap) {
    let copied =
        false;

    if (
        typeof map !== "undefined" &&
        map &&
        typeof map.eachLayer === "function"
    ) {
        map.eachLayer(function(layer) {
            if (!(layer instanceof L.TileLayer)) {
                return;
            }

            if (!layer._url) {
                return;
            }

            const options =
                Object.assign(
                    {},
                    layer.options || {}
                );

            options.crossOrigin =
                true;

            const newLayer =
                L.tileLayer(
                    layer._url,
                    options
                );

            newLayer.addTo(
                exportMap
            );

            copied =
                true;
        });
    }

    if (!copied) {
        L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                maxZoom: 19,
                crossOrigin: true
            }
        ).addTo(exportMap);
    }
}

function getCurrentExportFileAndRoutes() {
    const stack =
        window.multiGpxStack ||
        [];

    const fileIdx =
        typeof window.currentMultiIndex === "number"
            ? window.currentMultiIndex
            : 0;

    const currentFile =
        stack[fileIdx];

    if (!currentFile) {
        return {
            currentFile: null,
            routes: []
        };
    }

    let routes =
        [];

    if (
        Array.isArray(currentFile.routes) &&
        currentFile.routes.length > 0
    ) {
        routes =
            currentFile.routes.filter(function(route) {
                return (
                    route &&
                    route.visible !== false
                );
            });

    } else {
        routes =
            [currentFile];
    }

    return {
        currentFile: currentFile,
        routes: routes
    };
}

function normalizeSegmentLatLngs(seg) {
    if (!Array.isArray(seg)) {
        return [];
    }

    return seg
        .map(function(pt) {
            if (Array.isArray(pt)) {
                return [
                    Number(pt[0]),
                    Number(pt[1])
                ];
            }

            return [
                Number(pt.lat),
                Number(
                    pt.lon !== undefined
                        ? pt.lon
                        : pt.lng
                )
            ];
        })
        .filter(function(pt) {
            return (
                Number.isFinite(pt[0]) &&
                Number.isFinite(pt[1])
            );
        });
}

function addRoutesToExportMap(exportMap) {
    const result =
        getCurrentExportFileAndRoutes();

    const currentFile =
        result.currentFile;

    const routes =
        result.routes;

    routes.forEach(function(route) {
        if (!route) return;

        const color =
            route.color ||
            (
                currentFile &&
                currentFile.color
            ) ||
            "#0000FF";

        if (
            Array.isArray(route.segments) &&
            route.segments.length > 0
        ) {
            route.segments.forEach(function(seg) {
                const latLngs =
                    normalizeSegmentLatLngs(seg);

                if (latLngs.length >= 2) {
                    L.polyline(
                        latLngs,
                        {
                            color: color,
                            weight: 5,
                            opacity: 1
                        }
                    ).addTo(exportMap);
                }
            });

            return;
        }

        if (
            Array.isArray(route.points) &&
            route.points.length >= 2
        ) {
            const latLngs =
                route.points
                    .map(function(p) {
                        return [
                            Number(p.lat),
                            Number(
                                p.lon !== undefined
                                    ? p.lon
                                    : p.lng
                            )
                        ];
                    })
                    .filter(function(pt) {
                        return (
                            Number.isFinite(pt[0]) &&
                            Number.isFinite(pt[1])
                        );
                    });

            if (latLngs.length >= 2) {
                L.polyline(
                    latLngs,
                    {
                        color: color,
                        weight: 5,
                        opacity: 1
                    }
                ).addTo(exportMap);
            }
        }
    });
}

function createScaledPdfWaypointIcon(w, scale) {
    if (
        typeof window.createWaypointDivIcon !== "function"
    ) {
        return null;
    }

    const baseIcon =
        window.createWaypointDivIcon(w);

    if (!baseIcon || !baseIcon.options) {
        return baseIcon;
    }

    const baseSize =
        baseIcon.options.iconSize || [32, 32];

    const baseAnchor =
        baseIcon.options.iconAnchor || [16, 26];

    const width =
        Array.isArray(baseSize)
            ? Number(baseSize[0])
            : (
                typeof baseSize.x === "number"
                    ? Number(baseSize.x)
                    : 32
            );

    const height =
        Array.isArray(baseSize)
            ? Number(baseSize[1])
            : (
                typeof baseSize.y === "number"
                    ? Number(baseSize.y)
                    : 32
            );

    const anchorX =
        Array.isArray(baseAnchor)
            ? Number(baseAnchor[0])
            : (
                typeof baseAnchor.x === "number"
                    ? Number(baseAnchor.x)
                    : 16
            );

    const anchorY =
        Array.isArray(baseAnchor)
            ? Number(baseAnchor[1])
            : (
                typeof baseAnchor.y === "number"
                    ? Number(baseAnchor.y)
                    : 30
            );

    const safeScale =
        Number.isFinite(Number(scale))
            ? Number(scale)
            : 1;

    return L.divIcon({
        className:
            (baseIcon.options.className || "") +
            " pdf-scaled-wpt-icon",

        iconSize: [
            width * safeScale,
            height * safeScale
        ],

        iconAnchor: [
            anchorX * safeScale,
            anchorY * safeScale
        ],

        popupAnchor: [
            0,
            -anchorY * safeScale
        ],

        html:
            '<div style="' +
                'position:relative;' +
                'width:' + width + 'px;' +
                'height:' + height + 'px;' +
                'transform: scale(' + safeScale + ');' +
                'transform-origin: 0 0;' +
            '">' +
                (baseIcon.options.html || "") +
            '</div>'
    });
}

function addWaypointsToExportMap(exportMap, options) {
    const result =
        getCurrentExportFileAndRoutes();

    const currentFile =
        result.currentFile;

    if (!currentFile) return;

    options =
        options || {};

    const waypoints =
        Array.isArray(currentFile.waypoints)
            ? currentFile.waypoints
            : [];

    const activeIdx =
        typeof window.currentActiveIndex === "number"
            ? window.currentActiveIndex
            : 0;

    const activeRoute =
        currentFile &&
        Array.isArray(currentFile.routes) &&
        currentFile.routes[activeIdx]
            ? currentFile.routes[activeIdx]
            : currentFile;

    
    const iconScaleMap = {
        small: 1,
        medium: 1.4,
        large: 1.8
    };

    const labelSizeMap = {
        small: 12,
        medium: 16,
        large: 22
    };

    const pdfIconScale =
        iconScaleMap[
            options.wptIconSize || "medium"
        ] || 1.4;

    const pdfLabelSize =
        labelSizeMap[
            options.wptLabelSize || "medium"
        ] || 16;

    waypoints.forEach(function(w) {
        if (!w) return;

        const lat =
            Number(w.lat);

        const lon =
            Number(
                w.lon !== undefined
                    ? w.lon
                    : w.lng
            );

        if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lon)
        ) {
            return;
        }

        let visible =
            true;

        if (
            typeof window.isWaypointVisibleOnCurrentRoute === "function"
        ) {
            visible =
                window.isWaypointVisibleOnCurrentRoute(
                    w,
                    activeIdx,
                    activeRoute
                );
        }

        if (!visible) {
            return;
        }

				const wptDisplayMode =
				    options && options.wptDisplayMode
				        ? options.wptDisplayMode
				        : "iconAndDot";
				
				const shouldShowWptIcon =
				    wptDisplayMode === "iconAndDot" ||
				    wptDisplayMode === "iconOnly";
				
				const shouldShowWptDot =
				    wptDisplayMode === "iconAndDot" ||
				    wptDisplayMode === "dotOnly";
				
				let marker =
				    null;
				
				if (shouldShowWptIcon) {
				    const icon =
				        createScaledPdfWaypointIcon(
				            w,
				            pdfIconScale
				        );
				
				    marker =
				        L.marker(
				            [
				                lat,
				                lon
				            ],
				            icon
				                ? {
				                    icon: icon
				                }
				                : {}
				        ).addTo(exportMap);
				}

				const wptDotColor =
					    typeof window.getWaypointIconColor === "function"
					        ? window.getWaypointIconColor(w)
					        : (
					            w.iconColor && String(w.iconColor).trim() !== ""
					                ? String(w.iconColor).trim()
					                : "#1a73e8"
					        );
				if (shouldShowWptDot) {
				    const wptDotColor =
				        typeof window.getWaypointIconColor === "function"
				            ? window.getWaypointIconColor(w)
				            : (
				                w.iconColor && String(w.iconColor).trim() !== ""
				                    ? String(w.iconColor).trim()
				                    : "#1a73e8"
				            );
				
				    L.circleMarker(
				        [
				            lat,
				            lon
				        ],
				        {
				            radius: Math.max(
				                3,
				                3.5 * pdfIconScale
				            ),
				            color: "rgba(255, 255, 255, 1)",
				            weight: 1,
				            fillColor: wptDotColor,
				            fillOpacity: 0.85,
				            interactive: false,
				            pane: "markerPane"
				        }
				    ).addTo(exportMap);
				}

				if (
				    typeof showWptNameAlways !== "undefined" &&
				    showWptNameAlways === true &&
				    w.name
				) {
				    const labelTarget =
				        marker ||
				        L.marker(
				            [
				                lat,
				                lon
				            ],
				            {
				                interactive: false,
				                opacity: 0,
				                icon: L.divIcon({
				                    className: "pdf-wpt-label-anchor",
				                    html: "",
				                    iconSize: [1, 1],
				                    iconAnchor: [0, 0]
				                })
				            }
				        ).addTo(exportMap);
				
				    labelTarget.bindTooltip(
				        '<span style="font-size:' + pdfLabelSize + 'px; font-weight:bold;">' +
				            String(w.name) +
				        '</span>',
				        {
				            permanent: true,
				            direction: "right",
				            offset: [
				                10 * pdfIconScale,
				                0
				            ],
				            className: "pdf-wpt-name-label"
				        }
				    ).openTooltip();
				}
    });
}

function cloneLeafletLayerForExport(layer) {
    if (!layer) {
        return null;
    }

    if (layer instanceof L.LayerGroup) {
        const group =
            L.layerGroup();

        layer.eachLayer(function(childLayer) {
            const clonedChild =
                cloneLeafletLayerForExport(childLayer);

            if (clonedChild) {
                group.addLayer(
                    clonedChild
                );
            }
        });

        return group;
    }

    if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
        return L.polyline(
            layer.getLatLngs(),
            Object.assign(
                {},
                layer.options || {}
            )
        );
    }

    if (layer instanceof L.Polygon) {
        return L.polygon(
            layer.getLatLngs(),
            Object.assign(
                {},
                layer.options || {}
            )
        );
    }

    if (layer instanceof L.Rectangle) {
        return L.rectangle(
            layer.getBounds(),
            Object.assign(
                {},
                layer.options || {}
            )
        );
    }

    if (layer instanceof L.CircleMarker) {
        return L.circleMarker(
            layer.getLatLng(),
            Object.assign(
                {},
                layer.options || {}
            )
        );
    }

    if (layer instanceof L.Marker) {
        return L.marker(
            layer.getLatLng(),
            Object.assign(
                {},
                layer.options || {}
            )
        );
    }

    return null;
}

function addGridLabelsAndLinesToExportMap(exportMap, options) {
		options =
		    options || {};
		
		const gridLabelFontSize =
		    options.paper === "A3"
		        ? 22
		        : 18;
    if (
        typeof gridLayers === "undefined" ||
        !gridLayers ||
        typeof map === "undefined" ||
        !map ||
        typeof proj4 === "undefined"
    ) {
        return;
    }

    const bounds =
        exportMap.getBounds();

    const zoom =
        exportMap.getZoom();

    const exportGridLayers = {
        WGS84: L.layerGroup(),
        TWD97: L.layerGroup(),
        TWD67: L.layerGroup(),
        SubGrid: L.layerGroup()
    };

    const createLabel = function(lat, lon, text, color, anchor) {
        anchor =
            anchor || [0, 0];

        return L.marker(
            [
                lat,
                lon
            ],
            {
                icon: L.divIcon({
                    className: "grid-label",
                    html:
                        '<div style="' +
                            'color:' + color + ';' +
                            'font-size:' + gridLabelFontSize + 'px;' +
                            'font-weight:bold;' +
                            'text-shadow:' +
                                '-1px -1px 0 #fff,' +
                                '1px -1px 0 #fff,' +
                                '-1px 1px 0 #fff,' +
                                '1px 1px 0 #fff;' +
                            'white-space:nowrap;' +
                            'background:transparent;' +
                            'padding:0;' +
                        '">' +
                            text +
                        '</div>',
                    iconSize: [0, 0],
                    iconAnchor: anchor
                }),
                interactive: false
            }
        );
    };

    const stepMeter =
        zoom > 13
            ? 1000
            : 5000;

    const subStepMeter =
        100;

    const drawTWDGrid = function(layer, def, color, sourceLayer) {
        if (!map.hasLayer(sourceLayer)) {
            return;
        }

        const sw =
            proj4(
                WGS84_DEF,
                def,
                [
                    bounds.getWest(),
                    bounds.getSouth()
                ]
            );

        const ne =
            proj4(
                WGS84_DEF,
                def,
                [
                    bounds.getEast(),
                    bounds.getNorth()
                ]
            );

        for (
            let x = Math.floor(sw[0] / stepMeter) * stepMeter;
            x <= ne[0];
            x += stepMeter
        ) {
            const pTop =
                proj4(
                    def,
                    WGS84_DEF,
                    [
                        x,
                        ne[1]
                    ]
                );

            const pBot =
                proj4(
                    def,
                    WGS84_DEF,
                    [
                        x,
                        sw[1]
                    ]
                );

            L.polyline(
                [
                    [
                        pTop[1],
                        pTop[0]
                    ],
                    [
                        pBot[1],
                        pBot[0]
                    ]
                ],
                {
                    color: color,
                    weight: 1.2,
                    opacity: 0.75,
                    interactive: false
                }
            ).addTo(layer);

            createLabel(
                pTop[1],
                pTop[0],
                "X " + Math.round(x),
                color,
                [0, 0]
            ).addTo(layer);

            createLabel(
                pBot[1],
                pBot[0],
                "X " + Math.round(x),
                color,
                [0, 20]
            ).addTo(layer);
        }

        for (
            let y = Math.floor(sw[1] / stepMeter) * stepMeter;
            y <= ne[1];
            y += stepMeter
        ) {
            const pLeft =
                proj4(
                    def,
                    WGS84_DEF,
                    [
                        sw[0],
                        y
                    ]
                );

            const pRight =
                proj4(
                    def,
                    WGS84_DEF,
                    [
                        ne[0],
                        y
                    ]
                );

            L.polyline(
                [
                    [
                        pLeft[1],
                        pLeft[0]
                    ],
                    [
                        pRight[1],
                        pRight[0]
                    ]
                ],
                {
                    color: color,
                    weight: 1.2,
                    opacity: 0.75,
                    interactive: false
                }
            ).addTo(layer);

            createLabel(
                pLeft[1],
                pLeft[0],
                "Y " + Math.round(y),
                color,
                [-5, 12]
            ).addTo(layer);

            createLabel(
                pRight[1],
                pRight[0],
                "Y " + Math.round(y),
                color,
                [70, 12]
            ).addTo(layer);
        }

        if (
            map.hasLayer(gridLayers.SubGrid) &&
            zoom >= 13
        ) {
            for (
                let x = Math.floor(sw[0] / subStepMeter) * subStepMeter;
                x <= ne[0];
                x += subStepMeter
            ) {
                if (x % 1000 === 0) {
                    continue;
                }

                const pTop =
                    proj4(
                        def,
                        WGS84_DEF,
                        [
                            x,
                            ne[1]
                        ]
                    );

                const pBot =
                    proj4(
                        def,
                        WGS84_DEF,
                        [
                            x,
                            sw[1]
                        ]
                    );

                L.polyline(
                    [
                        [
                            pTop[1],
                            pTop[0]
                        ],
                        [
                            pBot[1],
                            pBot[0]
                        ]
                    ],
                    {
                        color: color,
                        weight: 0.8,
                        opacity: 0.65,
                        dashArray: "2, 4",
                        interactive: false
                    }
                ).addTo(exportGridLayers.SubGrid);
            }

            for (
                let y = Math.floor(sw[1] / subStepMeter) * subStepMeter;
                y <= ne[1];
                y += subStepMeter
            ) {
                if (y % 1000 === 0) {
                    continue;
                }

                const pLeft =
                    proj4(
                        def,
                        WGS84_DEF,
                        [
                            sw[0],
                            y
                        ]
                    );

                const pRight =
                    proj4(
                        def,
                        WGS84_DEF,
                        [
                            ne[0],
                            y
                        ]
                    );

                L.polyline(
                    [
                        [
                            pLeft[1],
                            pLeft[0]
                        ],
                        [
                            pRight[1],
                            pRight[0]
                        ]
                    ],
                    {
                        color: color,
                        weight: 0.8,
                        opacity: 0.65,
                        dashArray: "2, 4",
                        interactive: false
                    }
                ).addTo(exportGridLayers.SubGrid);
            }
        }
    };

    drawTWDGrid(
        exportGridLayers.TWD97,
        TWD97_DEF,
        "#4a90e2",
        gridLayers.TWD97
    );

    drawTWDGrid(
        exportGridLayers.TWD67,
        TWD67_DEF,
        "#e67e22",
        gridLayers.TWD67
    );

    if (map.hasLayer(gridLayers.WGS84)) {
        const stepDeg =
            zoom > 14
                ? 0.005
                : (
                    zoom > 12
                        ? 0.01
                        : 0.05
                );

        const wgsColor =
            "#666";

        for (
            let lo = Math.floor(bounds.getWest() / stepDeg) * stepDeg;
            lo <= bounds.getEast();
            lo += stepDeg
        ) {
            L.polyline(
                [
                    [
                        bounds.getSouth(),
                        lo
                    ],
                    [
                        bounds.getNorth(),
                        lo
                    ]
                ],
                {
                    color: wgsColor,
                    weight: 1,
                    opacity: 0.6,
                    dashArray: "5,10",
                    interactive: false
                }
            ).addTo(exportGridLayers.WGS84);

            createLabel(
                bounds.getNorth(),
                lo,
                lo.toFixed(3) + "°E",
                wgsColor,
                [0, 0]
            ).addTo(exportGridLayers.WGS84);

            createLabel(
                bounds.getSouth(),
                lo,
                lo.toFixed(3) + "°E",
                wgsColor,
                [0, 20]
            ).addTo(exportGridLayers.WGS84);
        }

        for (
            let la = Math.floor(bounds.getSouth() / stepDeg) * stepDeg;
            la <= bounds.getNorth();
            la += stepDeg
        ) {
            L.polyline(
                [
                    [
                        la,
                        bounds.getWest()
                    ],
                    [
                        la,
                        bounds.getEast()
                    ]
                ],
                {
                    color: wgsColor,
                    weight: 1,
                    opacity: 0.6,
                    dashArray: "5,10",
                    interactive: false
                }
            ).addTo(exportGridLayers.WGS84);

            createLabel(
                la,
                bounds.getWest(),
                la.toFixed(3) + "°N",
                wgsColor,
                [-5, 12]
            ).addTo(exportGridLayers.WGS84);

            createLabel(
                la,
                bounds.getEast(),
                la.toFixed(3) + "°N",
                wgsColor,
                [70, 12]
            ).addTo(exportGridLayers.WGS84);
        }
    }

    if (map.hasLayer(gridLayers.WGS84)) {
        exportGridLayers.WGS84.addTo(
            exportMap
        );
    }

    if (map.hasLayer(gridLayers.TWD97)) {
        exportGridLayers.TWD97.addTo(
            exportMap
        );
    }

    if (map.hasLayer(gridLayers.TWD67)) {
        exportGridLayers.TWD67.addTo(
            exportMap
        );
    }

    if (map.hasLayer(gridLayers.SubGrid)) {
        exportGridLayers.SubGrid.addTo(
            exportMap
        );
    }
}

function addGridToExportMapIfEnabled(exportMap, options) {
    addGridLabelsAndLinesToExportMap(
        exportMap,
        options
    );
}

function fitExportMapToBounds(exportMap, bounds, options, size) {
    if (!bounds || !bounds.isValid()) {
        return;
    }

    exportMap.fitBounds(
        bounds,
        {
            padding: [0, 0],
            animate: false
        }
    );
}

function getCoverBoundsForPaper(bounds, pixelWidth, pixelHeight) {
    
    return bounds;
}

function waitForMapTilesLoaded(targetMap) {
    return new Promise(function(resolve) {
        let pending =
            0;

        let finished =
            false;

        const done =
            function() {
                if (finished) return;

                finished =
                    true;

                setTimeout(
                    resolve,
                    500
                );
            };

        targetMap.eachLayer(function(layer) {
            if (layer instanceof L.TileLayer) {
                pending++;

                layer.once(
                    "load",
                    function() {
                        pending--;

                        if (pending <= 0) {
                            done();
                        }
                    }
                );
            }
        });

        setTimeout(function() {
            done();
        }, 3000);

        if (pending === 0) {
            done();
        }
    });
}

async function exportSelectedMapToPdf(options) {
    if (!pdfSelectedBounds) {
        alert("尚未選擇輸出範圍");
        return;
    }

    if (
        typeof html2canvas === "undefined"
    ) {
        alert("html2canvas 尚未載入");
        return;
    }

    if (
        !window.jspdf ||
        !window.jspdf.jsPDF
    ) {
        alert("jsPDF 尚未載入");
        return;
    }

    const confirmBtn =
        document.getElementById("pdfExportConfirmBtn");

    if (confirmBtn) {
        confirmBtn.disabled =
            true;

        confirmBtn.textContent =
            "產生中...";
    }

    try {
        const size =
            getPdfPaperPixelSize(options);

        const exportMap =
            createPdfExportMapContainer(size);

				copyVisibleTileLayersToExportMap(
				    exportMap
				);
				
				fitExportMapToBounds(
				    exportMap,
				    pdfSelectedBounds,
				    options,
				    size
				);
				
				exportMap.invalidateSize(
				    true
				);
				
				
				addGridToExportMapIfEnabled(
				    exportMap,
				    options
				);
				
				addRoutesToExportMap(
				    exportMap
				);
				
				addWaypointsToExportMap(
				    exportMap,
				    options
				);

        await waitForMapTilesLoaded(
            exportMap
        );

        const exportEl =
            document.getElementById("pdfExportMap");

				const html2canvasScale =
				    options.dpi === "300"
				        ? 1
				        : 2;
				
				const canvas =
				    await html2canvas(
				        exportEl,
				        {
				            useCORS: true,
				            allowTaint: false,
				            scale: html2canvasScale,
				            backgroundColor: "#ffffff",
				            logging: false
				        }
				    );

        const imgData =
            canvas.toDataURL(
                "image/png",
                0.95
            );

        const jsPDF =
            window.jspdf.jsPDF;

        const pdf =
            new jsPDF({
                orientation: options.orientation,
                unit: "mm",
                format: options.paper.toLowerCase()
            });

        const pageWidth =
            pdf.internal.pageSize.getWidth();

        const pageHeight =
            pdf.internal.pageSize.getHeight();

        pdf.addImage(
            imgData,
            "PNG",
            0,
            0,
            pageWidth,
            pageHeight
        );

        const fileName =
            "map-export-" +
            options.paper +
            "-" +
            options.orientation +
            ".pdf";

        pdf.save(
            fileName
        );

        hidePdfExportDialog();

    } catch (err) {
        console.error(err);
        alert("匯出 PDF 失敗：" + err.message);

    } finally {
        if (confirmBtn) {
            confirmBtn.disabled =
                false;

            confirmBtn.textContent =
                "匯出";
        }

        if (pdfExportMap) {
            pdfExportMap.remove();
            pdfExportMap =
                null;
        }
    }
}

document.addEventListener("DOMContentLoaded", function() {
    installPdfExportFeature();
    installPdfAreaSelectMapEvents();
    installPdfDialogEventBlocker();
});

function createPdfWaypointIcon(w, size) {
    const safeName =
        w && w.name
            ? String(w.name)
            : "";

    return L.divIcon({
        className: "custom-wpt-icon pdf-custom-wpt-icon",
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        html:
            '<div class="wpt-map-icon" style="' +
                'width:' + size + 'px;' +
                'height:' + size + 'px;' +
                'font-size:' + Math.round(size * 0.7) + 'px;' +
            '">' +
                '<span class="material-icons" style="font-size:' + Math.round(size * 0.72) + 'px;">place</span>' +
            '</div>'
    });
}

function installPdfDialogEventBlocker() {
    const overlay =
        document.getElementById("pdfExportDialogOverlay");

    const dialog =
        document.getElementById("pdfExportDialog");

    if (!overlay || !dialog) return;

    
    overlay.addEventListener("click", function(e) {
        window.pdfSuppressMapClickUntil =
            Date.now() + 1000;

        if (e.target === overlay) {
            e.stopPropagation();
        }
    });

    
    [
        "click",
        "mousedown",
        "mouseup",
        "touchstart",
        "touchend",
        "pointerdown",
        "pointerup"
    ].forEach(function(evtName) {
        dialog.addEventListener(
            evtName,
            function(e) {
                window.pdfSuppressMapClickUntil =
                    Date.now() + 1000;

                e.stopPropagation();
            },
            false
        );
    });
}

function addGridLabelToLayer(layerGroup, latlng, text, options) {
    if (!layerGroup || !latlng || !text) return;

    options =
        options || {};

    const fontSize =
        options.fontSize || 11;

    const color =
        options.color || "#333";

    const background =
        options.background || "rgba(255,255,255,0.75)";

    const label =
        L.marker(
            latlng,
            {
                interactive: false,
                icon: L.divIcon({
                    className: "grid-coordinate-label",
                    iconSize: null,
                    iconAnchor: [0, 0],
                    html:
                        '<div style="' +
                            'font-size:' + fontSize + 'px;' +
                            'font-weight:bold;' +
                            'color:' + color + ';' +
                            'background:' + background + ';' +
                            'border:1px solid rgba(0,0,0,0.2);' +
                            'border-radius:3px;' +
                            'padding:1px 4px;' +
                            'white-space:nowrap;' +
                            'box-shadow:0 1px 2px rgba(0,0,0,0.2);' +
                        '">' +
                            text +
                        '</div>'
                })
            }
        );

    layerGroup.addLayer(
        label
    );
}

function getChildTextByLocalName(parent, localName) {
    if (!parent) return "";

    const nodes =
        parent.getElementsByTagName("*");

    for (let i = 0; i < nodes.length; i++) {
        const node =
            nodes[i];

        if (
            node.localName === localName ||
            node.nodeName === localName ||
            node.nodeName.endsWith(":" + localName)
        ) {
            return node.textContent
                ? node.textContent.trim()
                : "";
        }
    }

    return "";
}

function isLatLngInTaiwanArea(lat, lon) {
    lat =
        Number(lat);

    lon =
        Number(lon);

    if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon)
    ) {
        return false;
    }

    return (
        lat >= 21.5 &&
        lat <= 26.5 &&
        lon >= 118.0 &&
        lon <= 123.5
    );
}

window.openWeatherModal = async function(lat, lon, title) {
    const modal =
        document.getElementById("weatherModal");

    const titleEl =
        document.getElementById("weatherModalTitle");

    const bodyEl =
        document.getElementById("weatherModalBody");

    if (!modal || !bodyEl) {
        alert("找不到天氣視窗元素 weatherModal");
        return;
    }

		if (titleEl) {
		    const windyUrl =
		        typeof buildWindyUrl === "function"
		            ? buildWindyUrl(
		                lat,
		                lon,
		                "rain",
		                14
		            )
		            : "https://www.windy.com/";
		
		    titleEl.innerHTML =
				    '<div class="weather-title-main">' +
				        '<span>天氣預報｜</span>' +
				        '<span class="weather-title-location">' +
				            (title || "此位置") +
		        '</div>' +
		        '<div class="weather-title-source">' +
		            '<span>資料來源：Open-Meteo</span>' +
								'<a href="' + windyUrl + '" target="_blank" class="weather-windy-link" title="在 Windy 查看風雨圖">' +
								    '<span class="weather-windy-icon">≋</span>' +
								    '<span>前往Windy查看</span>' +
								'</a>'
		        '</div>';
		}

    bodyEl.innerHTML =
        '<div class="weather-loading">讀取天氣中...</div>';

    modal.style.display =
        "block";

    await loadWeatherForecastToModal(
        lat,
        lon
    );
};

window.closeWeatherModal = function() {
    const modal =
        document.getElementById("weatherModal");

    if (modal) {
        modal.style.display =
            "none";
    }
};

async function loadWeatherForecastToModal(lat, lon) {
    const bodyEl =
        document.getElementById("weatherModalBody");

    lat =
        Number(lat);

    lon =
        Number(lon);

    if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon)
    ) {
        if (bodyEl) {
            bodyEl.innerHTML =
                '<div class="weather-error">座標無效，無法查詢天氣。</div>';
        }

        return;
    }

    const url =
        "https://api.open-meteo.com/v1/forecast" +
        "?latitude=" + encodeURIComponent(lat) +
        "&longitude=" + encodeURIComponent(lon) +
        "&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m" +
        "&forecast_days=7" +
        "&timezone=auto";

    try {
        const response =
            await fetch(url);

        if (!response.ok) {
            throw new Error(
                "Weather API failed: " + response.status
            );
        }

        const data =
            await response.json();

        const html =
            buildWeatherForecastModalHtml(
                data
            );

        if (bodyEl) {
            bodyEl.innerHTML =
                html;
        }

    } catch (error) {
        console.error(
            "loadWeatherForecastToModal failed:",
            error
        );

        if (bodyEl) {
            bodyEl.innerHTML =
                '<div class="weather-error">天氣讀取失敗，請稍後再試。</div>';
        }
    }
}

function buildWeatherForecastModalHtml(data) {
    if (
        !data ||
        !data.hourly ||
        !Array.isArray(data.hourly.time)
    ) {
        return '<div class="weather-error">沒有天氣資料。</div>';
    }

    const h =
        data.hourly;

    const rows =
        h.time.map(function(time, i) {
            return {
                time: time,
                date: String(time).slice(0, 10),
                hour: Number(String(time).slice(11, 13)),
                temp: h.temperature_2m ? h.temperature_2m[i] : null,
                pop: h.precipitation_probability ? h.precipitation_probability[i] : null,
                rain: h.precipitation ? h.precipitation[i] : null,
                code: h.weather_code ? h.weather_code[i] : null,
                wind: h.wind_speed_10m ? h.wind_speed_10m[i] : null
            };
        });

    const dates =
        Array.from(
            new Set(
                rows.map(function(r) {
                    return r.date;
                })
            )
        );

    const first3Dates =
        dates.slice(0, 3);

    const laterDates =
        dates.slice(3, 7);

    let html =
        "";

    html +=
        '<div class="weather-section">' +
            '<div class="weather-section-title">未來 3 天｜每 3 小時</div>' +
            '<div class="weather-scroll-row">';

    first3Dates.forEach(function(date) {
        rows
            .filter(function(r) {
                return (
                    r.date === date &&
                    r.hour % 3 === 0
                );
            })
            .forEach(function(r) {
                html +=
                    buildHourlyWeatherCard(
                        r
                    );
            });
    });

    html +=
            '</div>' +
        '</div>';

    html +=
        '<div class="weather-section">' +
            '<div class="weather-section-title">第 4～7 天｜白天 / 晚上摘要</div>' +
            '<div class="weather-scroll-row">';

    laterDates.forEach(function(date) {
        const dayRows =
            rows.filter(function(r) {
                return (
                    r.date === date &&
                    r.hour >= 6 &&
                    r.hour < 18
                );
            });

        const nightRows =
            rows.filter(function(r) {
                return (
                    r.date === date &&
                    (
                        r.hour >= 18 ||
                        r.hour < 6
                    )
                );
            });

        html +=
            buildDayNightWeatherCard(
                date,
                dayRows,
                nightRows
            );
    });

    html +=
            '</div>' +
        '</div>';

    return html;
}

function buildHourlyWeatherCard(r) {
    const rainValue =
        r && Number.isFinite(Number(r.rain))
            ? Number(r.rain)
            : null;

    let rainWarningIcon =
        "";

    
    if (
        rainValue !== null &&
        rainValue >= 5
    ) {
        rainWarningIcon =
            " ⚠️";
    }

    return (
        '<div class="weather-card">' +
            '<div class="weather-card-date">' +
                formatWeatherDateShort(r.date) +
            '</div>' +
            '<div class="weather-card-time">' +
                String(r.time).slice(11, 16) +
            '</div>' +
            '<div class="weather-emoji-icon">' +
                getWeatherEmoji(r.code) +
            '</div>' +
            '<div class="weather-temp">' +
                formatWeatherValue(r.temp, "°C") +
            '</div>' +
            '<div>' +
                getWeatherCodeText(r.code) +
            '</div>' +
            '<div class="weather-rain">雨 ' +
                formatWeatherValue(r.pop, "%") +
            '</div>' +
            '<div class="weather-rain">量 ' +
                (
                    rainValue === null
                        ? "--"
                        : rainValue.toFixed(1) + "mm"
                ) +
                rainWarningIcon +
            '</div>' +
            '<div class="weather-wind">風 ' +
                formatWeatherValue(r.wind, "km/h") +
            '</div>' +
        '</div>'
    );
}

function buildDayNightWeatherCard(date, dayRows, nightRows) {
    return (
        '<div class="weather-day-card">' +
            '<div class="weather-day-title">' +
                formatWeatherDateShort(date) +
            '</div>' +
            buildDayNightWeatherLine(
                "白天",
                dayRows
            ) +
            buildDayNightWeatherLine(
                "晚上",
                nightRows
            ) +
        '</div>'
    );
}

function buildDayNightWeatherLine(label, rows) {
    if (
        !Array.isArray(rows) ||
        rows.length === 0
    ) {
        return (
            '<div class="weather-day-line">' +
                label +
                "：--" +
            '</div>'
        );
    }

    const temps =
        rows
            .map(function(r) {
                return Number(r.temp);
            })
            .filter(Number.isFinite);

    const pops =
        rows
            .map(function(r) {
                return Number(r.pop);
            })
            .filter(Number.isFinite);

    const rains =
        rows
            .map(function(r) {
                return Number(r.rain);
            })
            .filter(Number.isFinite);

    const winds =
        rows
            .map(function(r) {
                return Number(r.wind);
            })
            .filter(Number.isFinite);

    const codes =
        rows
            .map(function(r) {
                return Number(r.code);
            })
            .filter(Number.isFinite);

    const minTemp =
        temps.length
            ? Math.round(Math.min.apply(null, temps))
            : "--";

    const maxTemp =
        temps.length
            ? Math.round(Math.max.apply(null, temps))
            : "--";

    const maxPop =
        pops.length
            ? Math.round(Math.max.apply(null, pops))
            : "--";

    const rainSum =
        rains.length
            ? rains.reduce(function(sum, value) {
                return sum + value;
            }, 0)
            : null;

    const maxWind =
        winds.length
            ? Math.round(Math.max.apply(null, winds))
            : "--";

    const mainCode =
        typeof getMostSevereWeatherCode === "function"
            ? getMostSevereWeatherCode(codes)
            : getMostFrequentWeatherCode(codes);

    let rainWarningIcon =
        "";

    if (
        rainSum !== null &&
        rainSum >= 15
    ) {
        rainWarningIcon =
            " ⚠️";
    }

    return (
        '<div class="weather-day-line">' +
            '<b>' + label + '</b> ' +
            '<span class="weather-emoji-inline">' +
                getWeatherEmoji(mainCode) +
            '</span><br>' +
						minTemp + "~" + maxTemp + "°C　" + "<br>" +
						"降雨 " + maxPop + "%<br>" +
						"雨量 " + (
						    rainSum === null
						        ? "--"
						        : rainSum.toFixed(1)
						) + "mm" + rainWarningIcon + "<br>" +
						"風 " + maxWind + "km/h" +
        '</div>'
    );
}

function getMostFrequentWeatherCode(codes) {
    if (
        !Array.isArray(codes) ||
        codes.length === 0
    ) {
        return null;
    }

    const counter =
        {};

    codes.forEach(function(code) {
        counter[code] =
            (counter[code] || 0) + 1;
    });

    return Number(
        Object.keys(counter).sort(function(a, b) {
            return counter[b] - counter[a];
        })[0]
    );
}

function getWeatherEmoji(code) {
    code =
        Number(code);

    if (code === 0) return "☀️";
    if (code === 1) return "🌤️";
    if (code === 2) return "⛅";
    if (code === 3) return "☁️";

    if (code === 45 || code === 48) return "🌫️";

    // 毛毛雨 / 凍毛毛雨
    if (code === 51) return "🌧️️";
    if (code === 53) return "🌧️️";
    if (code === 55) return "🌧️";
    if (code === 56 || code === 57) return "🌧️";

    // 雨
    if (code === 61) return "🌧️"; // 小雨
    if (code === 63) return "🌧️"; // 中雨
    if (code === 65) return "☔";  // 大雨
    if (code === 66 || code === 67) return "🌧️";

    // 雪
    if (code === 71) return "🌨️";
    if (code === 73) return "❄️";
    if (code === 75) return "❄️";
    if (code === 77) return "❄️";

    // 陣雨
    if (code === 80) return "🌧️"; // 輕陣雨
    if (code === 81) return "🌧️"; // 中陣雨
    if (code === 82) return "☔";  // 強陣雨

    // 陣雪
    if (code === 85) return "🌨️";
    if (code === 86) return "❄️";

    // 雷雨
    if (code === 95) return "⛈️";
    if (code === 96 || code === 99) return "⛈️";

    return "☁️";
}

function getWeatherCodeText(code) {
    code =
        Number(code);

		const map = {
		    0: "晴朗",
		    1: "大致晴朗",
		    2: "局部多雲",
		    3: "陰天",
		
		    45: "霧",
		    48: "霧凇",
		
		    51: "輕微毛毛雨",
		    53: "中等毛毛雨",
		    55: "濃密毛毛雨",
		
		    56: "輕微凍毛毛雨",
		    57: "濃密凍毛毛雨",
		
		    61: "小雨",
		    63: "中雨",
		    65: "大雨",
		
		    66: "輕微凍雨",
		    67: "強凍雨",
		
		    71: "小雪",
		    73: "中雪",
		    75: "大雪",
		    77: "雪粒",
		
		    80: "輕微陣雨",
		    81: "中等陣雨",
		    82: "強烈陣雨",
		
		    85: "輕微陣雪",
		    86: "強烈陣雪",
		
		    95: "雷雨",
		    96: "雷雨伴輕微冰雹",
		    99: "雷雨伴強烈冰雹"
		};

    return map[code] || "未知";
}

function formatWeatherDateShort(dateStr) {
    const parts =
        String(dateStr).split("-");

    if (parts.length !== 3) {
        return dateStr;
    }

    return (
        Number(parts[1]) +
        "/" +
        Number(parts[2]) +
        " " +
        getWeatherWeekday(dateStr)
    );
}

function formatWeatherValue(value, unit) {
    if (
        value === null ||
        value === undefined ||
        !Number.isFinite(Number(value))
    ) {
        return "--";
    }

    return Math.round(Number(value)) + unit;
}

function formatWeatherValueOneDecimal(value, unit) {
    if (
        value === null ||
        value === undefined ||
        !Number.isFinite(Number(value))
    ) {
        return "--";
    }

    return Number(value).toFixed(1) + unit;
}

function getWeatherWeekday(dateStr) {
    const d =
        new Date(dateStr + "T00:00:00");

    if (isNaN(d.getTime())) {
        return "";
    }

    const weekdays =
        [
            "日",
            "一",
            "二",
            "三",
            "四",
            "五",
            "六"
        ];

    return "週" + weekdays[d.getDay()];
}

function getMostSevereWeatherCode(codes) {
    if (
        !Array.isArray(codes) ||
        codes.length === 0
    ) {
        return null;
    }

    const severityMap = {
        0: 0,
        1: 1,
        2: 2,
        3: 3,

        45: 4,
        48: 5,

        51: 6,
        53: 7,
        55: 8,
        56: 8,
        57: 9,

        61: 10,
        63: 12,
        65: 15,

        66: 13,
        67: 16,

        71: 10,
        73: 12,
        75: 15,
        77: 11,

        80: 10,
        81: 12,
        82: 16,

        85: 12,
        86: 16,

        95: 18,
        96: 19,
        99: 20
    };

    let selectedCode =
        null;

    let selectedSeverity =
        -1;

    codes.forEach(function(code) {
        code =
            Number(code);

        const severity =
            severityMap[code] !== undefined
                ? severityMap[code]
                : 0;

        if (severity > selectedSeverity) {
            selectedSeverity =
                severity;

            selectedCode =
                code;
        }
    });

    return selectedCode;
}

function buildWindyUrl(lat, lon, overlay = "rain", zoom = 14) {
    lat =
        Number(lat);

    lon =
        Number(lon);

    if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon)
    ) {
        return "https://www.windy.com/";
    }

    return (
        "https://www.windy.com/" +
        lat.toFixed(5) +
        "/" +
        lon.toFixed(5) +
        "?" +
        overlay +
        "," +
        lat.toFixed(5) +
        "," +
        lon.toFixed(5) +
        "," +
        zoom 
    );
}