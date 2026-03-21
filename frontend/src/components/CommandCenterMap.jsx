import React, { useState, useEffect, useRef, useMemo } from 'react';
import { mappls } from 'mappls-web-maps';
const mapplsClassObject = new mappls();
import { Layers, Map as MapIcon, Satellite, Activity, LocateFixed } from 'lucide-react';

const haversineDistance = (coords1, coords2) => {
    function toRad(x) { return (x * Math.PI) / 180; }
    const R = 6371e3;
    const dLat = toRad(coords2.lat - coords1.lat);
    const dLon = toRad(coords2.lng - coords1.lng);
    const lat1 = toRad(coords1.lat);
    const lat2 = toRad(coords2.lat);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const CommandCenterMap = ({ incidents }) => {
    const [center, setCenter] = useState({ lat: 28.6139, lng: 77.2090 }); 
    const [isLoaded, setIsLoaded] = useState(false);

    const [mapType, setMapType] = useState('standard'); 
    const [showTraffic, setShowTraffic] = useState(false);
    const [showHeatmap, setShowHeatmap] = useState(false);
    const [showControls, setShowControls] = useState(false);

    const mapRef = useRef(null);
    const markersRef = useRef([]);

    useEffect(() => {
        const loadObject = { map: true };
        mapplsClassObject.initialize(import.meta.env.VITE_MAPPLS_MAP_KEY, loadObject, () => {
            setIsLoaded(true);
        });
    }, []);

    useEffect(() => {
        if (incidents?.length > 0 && incidents[0]?.location) {
            setCenter({ lat: incidents[0].location.lat, lng: incidents[0].location.lng });
        }
    }, [incidents]);

    useEffect(() => {
        if (isLoaded && !mapRef.current) {
            const newMap = mapplsClassObject.Map({
                id: "mappls-admin-livemap",
                properties: {
                    center: [center.lat, center.lng],
                    zoom: 12,
                }
            });
            newMap.on("load", () => {
                mapRef.current = newMap;
                if (newMap.setMapType) newMap.setMapType('standard');
            });
        }
    }, [isLoaded, center]);

    // LAYER CONTROL LOGIC (mappls setStyle)
    useEffect(() => {
        if (!mapRef.current) return;
        try {
            // Mappls method prioritizing setMapType
            if (typeof mapplsClassObject.setMapStyle === 'function') {
                mapplsClassObject.setMapStyle({ map: mapRef.current, mapType: mapType });
            } else if (typeof mapRef.current.setMapType === 'function') {
                mapRef.current.setMapType(mapType);
            } else if (typeof mapRef.current.setMapStyle === 'function') {
                mapRef.current.setMapStyle(mapType);
            }
        } catch (error) {
            console.error("Error setting mapType:", error);
        }
    }, [mapType]);

    useEffect(() => {
        if (!mapRef.current) return;
        try {
            if (showTraffic) {
                if (typeof mapplsClassObject.Traffic === 'function') {
                    window.liveTrafficLayer = new mapplsClassObject.Traffic({map: mapRef.current, usage: 'live'});
                }
            } else {
                if (window.liveTrafficLayer && typeof window.liveTrafficLayer.remove === 'function') {
                    window.liveTrafficLayer.remove();
                    window.liveTrafficLayer = null;
                }
            }
        } catch (error) { console.error("Error toggling traffic:", error); }
    }, [showTraffic]);

    // HEATMAP LOGIC
    useEffect(() => {
        if (!mapRef.current || !isLoaded) return;
        const map = mapRef.current;

        if (map.getLayer('incident-heatmap')) map.removeLayer('incident-heatmap');
        if (map.getSource('incidents-source')) map.removeSource('incidents-source');

        if (showHeatmap && map.addSource) {
            const geojsonData = {
                type: 'FeatureCollection',
                features: (incidents || []).filter(i => i.location?.lat && i.location?.lng).map(inc => ({
                    type: 'Feature',
                    properties: {
                        weight: inc.severity === 'Critical' ? 1.0 : inc.severity === 'High' ? 0.8 : 0.4
                    },
                    geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(inc.location.lng), parseFloat(inc.location.lat)]
                    }
                }))
            };

            map.addSource('incidents-source', { type: 'geojson', data: geojsonData });
            map.addLayer({
                id: 'incident-heatmap',
                type: 'heatmap',
                source: 'incidents-source',
                maxzoom: 15,
                paint: {
                    'heatmap-weight': ['get', 'weight'],
                    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 11, 1, 15, 3],
                    'heatmap-color': [
                        'interpolate', ['linear'], ['heatmap-density'],
                        0, 'rgba(33,102,172,0)', 0.2, 'rgb(103,169,207)', 0.4, 'rgb(209,229,240)',
                        0.6, 'rgb(253,219,199)', 0.8, 'rgb(239,138,98)', 1, 'rgb(220, 38, 38)'
                    ],
                    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 5, 15, 40],
                    'heatmap-opacity': 0.8
                }
            });
        }
    }, [showHeatmap, incidents, isLoaded]);

    const clusters = useMemo(() => {
        const clustered = [];
        const visited = new Set();
        const clusterRadius = 400;

        (incidents || []).forEach((incident) => {
            if (visited.has(incident.id)) return;
            if (!incident.location || !incident.location.lat || !incident.location.lng) return;

            const cluster = [incident];
            visited.add(incident.id);

            (incidents || []).forEach((other) => {
                if (visited.has(other.id)) return;
                if (!other.location || !other.location.lat || !other.location.lng) return;

                const dist = haversineDistance(
                    { lat: incident.location.lat, lng: incident.location.lng },
                    { lat: other.location.lat, lng: other.location.lng }
                );

                if (dist <= clusterRadius) {
                    cluster.push(other);
                    visited.add(other.id);
                }
            });

            clustered.push(cluster);
        });
        return clustered;
    }, [incidents]);

    // RENDER MARKERS & BIND IOS POPUP
    useEffect(() => {
        if (!mapRef.current || clusters.length === 0) return;
        
        markersRef.current.forEach(m => { if (m && typeof m.remove === 'function') m.remove(); });
        markersRef.current = [];
        if (showHeatmap) return;

        clusters.forEach(cluster => {
            const mainIncident = cluster[0];
            const lat = parseFloat(mainIncident.location?.lat);
            const lng = parseFloat(mainIncident.location?.lng);
            if (isNaN(lat) || isNaN(lng)) return;
            
            let htmlContent = `<div class="cursor-pointer hover:scale-125 transition-transform" style="background-color: ${(mainIncident.status || 'Pending') === 'Resolved' ? '#22c55e' : mainIncident.severity === 'Critical' ? '#7f1d1d' : '#ef4444'}; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.4);"></div>`;

            if (cluster.length > 1) {
                htmlContent = `<div class="cursor-pointer hover:scale-110 transition-transform" style="background-color: #dc2626; color: white; width: 44px; height: 44px; border-radius: 50%; border: 4px solid white; box-shadow: 0 6px 12px rgba(220, 38, 38, 0.4); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; z-index: 100;">${cluster.length}</div>`;
            }
            
            const marker = mapplsClassObject.Marker({
                map: mapRef.current,
                position: { lat, lng },
                html: htmlContent
            });
            
            if (cluster.length > 1) {
                marker.addListener('click', () => {
                    // Fly to location
                    if (mapRef.current.flyTo) {
                        mapRef.current.flyTo({ center: [lng, lat], zoom: mapRef.current.getZoom() + 2, speed: 1.5, essential: true });
                    }
                    
                    // Generate iOS Premium Popup HTML
                    const cardsHtml = cluster.map(inc => {
                        const dateSt = inc.timestamp || inc.created_at || 'Recently';
                        const thumb = inc.imageUrl || inc.image_url || 'https://images.unsplash.com/photo-1541888046892-0b81dd825ca9?auto=format&fit=crop&q=80&w=200';
                        const badgeColor = inc.status === 'Resolved' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400';
                        return `
                            <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 12px; margin-bottom: 10px; display: flex; gap: 12px; align-items: center; backdrop-filter: blur(8px);">
                                <img src="${thumb}" style="width: 48px; height: 48px; object-fit: cover; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.5);" />
                                <div style="flex: 1;">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                                        <h4 style="color: white; font-weight: 700; font-size: 14px; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;">${inc.type || inc.category || 'Hazard'}</h4>
                                        <span style="font-size: 10px; padding: 3px 8px; border-radius: 6px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;" class="${badgeColor}">${inc.status || 'Pending'}</span>
                                    </div>
                                    <p style="color: #94a3b8; font-size: 12px; margin: 0; font-weight: 500;">${new Date(dateSt).toLocaleDateString()}</p>
                                </div>
                            </div>
                        `;
                    }).join('');

                    // 1. Generate an explicit DOM element for our iOS popup to bypass InfoWindow fallback bugs
                    let popupHtmlString = `
                    <div style="position: absolute; transform: translate(-50%, -100%); margin-top: -30px; z-index: 1000;" onclick="event.stopPropagation(); this.remove();">
                        <div style="background: rgba(20, 20, 20, 0.85); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 16px; width: 320px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; cursor: default;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 12px;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                    <h3 style="color: white; font-weight: 800; font-size: 16px; margin: 0;">Cluster Alert</h3>
                                </div>
                                <span style="background: #ef4444; color: white; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 800; cursor: pointer;">${cluster.length} Issues ✖</span>
                            </div>
                            <div style="max-height: 240px; overflow-y: auto; overflow-x: hidden; padding-right: 4px; scrollbar-width: thin;">
                                ${cardsHtml}
                            </div>
                        </div>
                        <div style="width: 0; height: 0; border-left: 10px solid transparent; border-right: 10px solid transparent; border-top: 10px solid rgba(20, 20, 20, 0.85); margin: 0 auto;"></div>
                    </div>`;

                    // 2. Clear any previously existing popup generated by us
                    if (window._activeMapplsPopup && typeof window._activeMapplsPopup.remove === 'function') {
                        window._activeMapplsPopup.remove();
                    }

                    // 3. Render pure custom HTML marker attached directly to Map canvas without Red Pin bloat
                    const AppleUIMarker = mapplsClassObject.Marker({
                        map: mapRef.current,
                        position: { lat, lng },
                        html: popupHtmlString
                    });

                    // Store ref to allow dismissal later when clicking other items
                    window._activeMapplsPopup = AppleUIMarker;
                });
            } else if (mapRef.current.flyTo) {
                marker.addListener('click', () => { 
                    if (window._activeMapplsPopup && typeof window._activeMapplsPopup.remove === 'function') {
                        window._activeMapplsPopup.remove();
                    }
                    mapRef.current.flyTo({ center: [lng, lat], zoom: 17, speed: 1.2 }); 
                });
            }
            
            markersRef.current.push(marker);
        });
        
    }, [clusters, showHeatmap]);

    if (!isLoaded) return <div className="h-full w-full flex items-center justify-center bg-slate-100 dark:bg-slate-900 animate-pulse rounded-3xl" />;

    return (
        <div className="flex-1 bg-[#1e293b] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden relative" style={{ minHeight: '400px', height: '100%' }}>
            {/* TOP RIGHT MAP CONTROLS BUTTON */}
            <div className="absolute top-4 right-4 z-[99]">
                <button 
                    onClick={() => setShowControls(!showControls)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900/90 backdrop-blur text-white rounded-xl shadow-lg border border-slate-700 font-semibold"
                >
                    <Layers size={18} /> Map Layers
                </button>
            </div>

            <div id="mappls-admin-livemap" style={{ width: '100%', height: '100%' }}></div>

            {/* FLOATING GIS CONTROL PANEL */}
            {showControls && (
                <div className="absolute top-16 right-4 w-64 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-5 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 z-50">
                    <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                        <Layers size={18} className="text-blue-500" /> GIS Controls
                    </h3>
                    
                    <div className="mb-4">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 block">Map Type</label>
                        <div className="grid grid-cols-1 gap-2">
                            <button onClick={() => setMapType('standard')} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${mapType === 'standard' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
                                <MapIcon size={16} /> Standard Vector
                            </button>
                            <button onClick={() => setMapType('satellite')} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${mapType === 'satellite' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
                                <Satellite size={16} /> Satellite Imagery
                            </button>
                            <button onClick={() => setMapType('hybrid')} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${mapType === 'hybrid' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
                                <Layers size={16} /> Hybrid Labels
                            </button>
                        </div>
                    </div>

                    <div className="h-[1px] bg-slate-200 dark:bg-slate-800 my-4"></div>

                    <div>
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 block">Data Layers</label>
                        <label className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg cursor-pointer transition-colors mb-1">
                            <div className="flex items-center gap-2">
                                <Activity size={16} className={showTraffic ? 'text-orange-500' : 'text-slate-400'} />
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Live Traffic</span>
                            </div>
                            <input type="checkbox" checked={showTraffic} onChange={(e) => setShowTraffic(e.target.checked)} className="w-4 h-4 rounded text-blue-600"/>
                        </label>

                        <label className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg cursor-pointer transition-colors">
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full bg-gradient-to-br from-yellow-400 to-red-600"></div>
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Heatmap Mode</span>
                            </div>
                            <input type="checkbox" checked={showHeatmap} onChange={(e) => setShowHeatmap(e.target.checked)} className="w-4 h-4 rounded text-blue-600"/>
                        </label>
                    </div>
                </div>
            )}

            {!showHeatmap && (
                <div className="absolute bottom-6 left-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 z-10 pointer-events-none">
                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Cluster Legend</h5>
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-red-600 border border-white flex items-center justify-center text-[10px] font-bold text-white shadow-md">1+</div>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Hazard Cluster</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="w-3 h-3 rounded-full bg-red-500 ml-1.5 shadow-sm"></span>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Single Ongoing Issue</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="w-3 h-3 rounded-full bg-green-500 ml-1.5 shadow-sm"></span>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Resolved Issue</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CommandCenterMap;
