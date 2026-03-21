import React, { useState, useEffect } from 'react';
import { MapPin, X, Navigation, Filter, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CivicLayout from './CivicLayout';
import { getDatabase, ref, onValue } from "firebase/database";
import { auth } from '../../services/firebase';
import { mappls } from 'mappls-web-maps';
const mapplsClassObject = new mappls();
import { useTheme } from '../../context/ThemeContext';

const containerStyle = {
    width: '100%',
    height: '100%'
};

// Light mode map styles
const lightMapStyles = [
    {
        featureType: "all",
        elementType: "geometry",
        stylers: [{ color: "#f1f5f9" }]
    },
    {
        featureType: "road",
        elementType: "geometry",
        stylers: [{ color: "#ffffff" }]
    },
    {
        featureType: "water",
        elementType: "geometry",
        stylers: [{ color: "#cbd5e1" }]
    }
];

// Dark mode map styles
const darkMapStyles = [
    {
        featureType: "all",
        elementType: "geometry",
        stylers: [{ color: "#1e293b" }]
    },
    {
        featureType: "all",
        elementType: "labels.text.stroke",
        stylers: [{ color: "#0f172a" }]
    },
    {
        featureType: "all",
        elementType: "labels.text.fill",
        stylers: [{ color: "#94a3b8" }]
    },
    {
        featureType: "road",
        elementType: "geometry",
        stylers: [{ color: "#334155" }]
    },
    {
        featureType: "water",
        elementType: "geometry",
        stylers: [{ color: "#0f172a" }]
    }
];

const LiveMap = () => {
    const { theme } = useTheme();
    const [isLoaded, setIsLoaded] = useState(false);
    const mapRef = React.useRef(null);
    const markersRef = React.useRef([]);

    useEffect(() => {
        const loadObject = { map: true };
        mapplsClassObject.initialize(import.meta.env.VITE_MAPPLS_MAP_KEY, loadObject, () => {
            setIsLoaded(true);
        });
    }, []);

    const [mapCenter, setMapCenter] = useState(null);
    const [selectedPin, setSelectedPin] = useState(null);
    const [pins, setPins] = useState([]);
    const [filterType, setFilterType] = useState('all');
    const [showFilters, setShowFilters] = useState(false);
    
    // Rerouting States
    const [routeOrigin, setRouteOrigin] = useState(null);
    const [routeDest, setRouteDest] = useState(null);
    const [routingMode, setRoutingMode] = useState(null);
    const [isRouting, setIsRouting] = useState(false);
    const routingLayerRef = React.useRef(null);
    const originMarkerRef = React.useRef(null);
    const destMarkerRef = React.useRef(null);
    const routingModeRef = React.useRef(routingMode);

    // Reporting States
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportCoords, setReportCoords] = useState(null);
    const [reportFile, setReportFile] = useState(null);
    const [isReporting, setIsReporting] = useState(false);
    const [reportError, setReportError] = useState(null);
    const [reportSuccess, setReportSuccess] = useState(null);
    const fileInputRef = React.useRef(null);

    useEffect(() => {
        routingModeRef.current = routingMode;
    }, [routingMode]);

    // Fetch Route
    const fetchSafeRoute = async () => {
        if (!routeOrigin || !routeDest) return;
        setIsRouting(true);
        try {
            const response = await fetch(`http://localhost:5001/api/routes/safe-path?startLat=${routeOrigin.lat}&startLng=${routeOrigin.lng}&endLat=${routeDest.lat}&endLng=${routeDest.lng}`);
            const data = await response.json();
            
            if (data.success && data.route && data.route.geometry) {
                if (routingLayerRef.current && typeof routingLayerRef.current.remove === 'function') {
                    routingLayerRef.current.remove();
                }
                
                let coordsList = typeof data.route.geometry === 'string' ? JSON.parse(data.route.geometry).coordinates : data.route.geometry.coordinates;
                const pathArr = coordsList.map(c => ({ lat: c[1], lng: c[0] }));
                
                routingLayerRef.current = mapplsClassObject.Polyline({
                    map: mapRef.current,
                    path: pathArr,
                    strokeColor: '#3b82f6',
                    strokeOpacity: 1.0,
                    strokeWeight: 6,
                    fitbounds: true
                });
            } else {
                alert("Failed to calculate safe route. It might not be possible to avoid all hazards or the backend was unreachable.");
            }
        } catch (error) {
            console.error(error);
            alert("Error fetching safe route");
        } finally {
            setIsRouting(false);
        }
    };
    
    // Clear Route
    const clearRoute = () => {
        if (routingLayerRef.current && typeof routingLayerRef.current.remove === 'function') {
            routingLayerRef.current.remove();
        }
        if (originMarkerRef.current && typeof originMarkerRef.current.remove === 'function') originMarkerRef.current.remove();
        if (destMarkerRef.current && typeof destMarkerRef.current.remove === 'function') destMarkerRef.current.remove();
        setRouteOrigin(null);
        setRouteDest(null);
        routingLayerRef.current = null;
        originMarkerRef.current = null;
        destMarkerRef.current = null;
    }

    // Report Submit
    const handleReportSubmit = async (e) => {
        e.preventDefault();
        if (!reportFile || !reportCoords) {
            setReportError("Please select an image file.");
            return;
        }

        setIsReporting(true);
        setReportError(null);
        setReportSuccess(null);

        try {
            const formData = new FormData();
            formData.append('image', reportFile);
            formData.append('lat', reportCoords.lat);
            formData.append('lng', reportCoords.lng);
            formData.append('user_phone', '9999999999'); // Mock Session Phone

            const response = await fetch('http://localhost:5001/api/tickets', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (response.ok) {
                setReportSuccess(`Verified! AI identified: ${data.ai_data?.issue_type} (Severity: ${data.ai_data?.severity}). Ticket saved to Database.`);
                // Dropping pin locally to reflect without full reload
                setPins(prev => [...prev, data.ticket]);
                setTimeout(() => {
                    setShowReportModal(false);
                }, 3500);
            } else {
                setReportError(data.error + " - " + (data.reason || ""));
            }
        } catch (error) {
            console.error(error);
            setReportError("Failed to connect to the server.");
        } finally {
            setIsReporting(false);
        }
    };

    const navigate = useNavigate();

    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setMapCenter({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    });
                },
                (error) => {
                    console.log("Location access denied or unavailable. Defaulting to India View.");
                    setMapCenter({ lat: 21.1458, lng: 79.0882 });
                }
            );
        } else {
            setMapCenter({ lat: 21.1458, lng: 79.0882 });
        }
    }, []);

    useEffect(() => {
        const db = getDatabase(auth.app);
        const reportsRef = ref(db, 'reports');

        onValue(reportsRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const loadedPins = Object.keys(data)
                    .map(key => ({
                        id: key,
                        ...data[key]
                    }))
                    .filter(pin => pin.location && pin.location.lat && pin.location.lng);

                setPins(loadedPins);
            }
        });
    }, []);

    // --- 1. Filter Logic ---
    const filteredPins = React.useMemo(() => {
        return pins.filter(pin => {
            if (filterType === 'all') return pin.status !== 'Resolved';
            if (filterType === 'critical') {
                return ['Fire & Safety', 'Medical/Ambulance', 'Police'].includes(pin.department) ||
                    pin.priority === 'Critical' ||
                    pin.type === 'SOS Emergency';
            }
            return pin.type?.toLowerCase() === filterType;
        });
    }, [pins, filterType]);

    // --- 2. Stats Calculation ---
    const criticalCount = pins.filter(p =>
        ['Fire & Safety', 'Medical/Ambulance', 'Police'].includes(p.department) ||
        p.priority === 'Critical' ||
        p.type === 'SOS Emergency'
    ).length;

    const pendingCount = pins.filter(p => p.status === 'Pending').length;
    const resolvedCount = pins.filter(p => p.status === 'Resolved' || p.status === 'Accepted').length;

    // --- 3. Clustering Helper: Haversine distance ---
    const haversineDistance = (coords1, coords2) => {
        function toRad(x) { return (x * Math.PI) / 180; }
        const R = 6371e3; // Earth radius in meters
        const dLat = toRad(coords2.lat - coords1.lat);
        const dLon = toRad(coords2.lng - coords1.lng);
        const lat1 = toRad(coords1.lat);
        const lat2 = toRad(coords2.lat);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    // --- 4. Clustering Logic (Applied on Filtered Pins) ---
    const clusters = React.useMemo(() => {
        const clustered = [];
        const visited = new Set();
        // Use filteredPins so clustering reacts to filters
        const activePins = filteredPins;

        activePins.forEach((pin) => {
            if (visited.has(pin.id)) return;
            if (!pin.location || !pin.location.lat || !pin.location.lng) return;

            const cluster = [pin];
            visited.add(pin.id);

            activePins.forEach((other) => {
                if (visited.has(other.id)) return;
                if (!other.location || !other.location.lat || !other.location.lng) return;

                const dist = haversineDistance(
                    { lat: parseFloat(pin.location.lat), lng: parseFloat(pin.location.lng) },
                    { lat: parseFloat(other.location.lat), lng: parseFloat(other.location.lng) }
                );

                if (dist <= 300) { // 300 meters radius
                    cluster.push(other);
                    visited.add(other.id);
                }
            });

            clustered.push(cluster);
        });

        return clustered;
    }, [filteredPins]);

    // Mappls map initialization and marker updates
    useEffect(() => {
        if (isLoaded && mapCenter && !mapRef.current) {
            const newMap = mapplsClassObject.Map({
                id: "mappls-civic-livemap",
                properties: {
                    center: [mapCenter.lat, mapCenter.lng],
                    zoom: 15,
                }
            });
            newMap.on("load", () => {
                mapRef.current = newMap;
                
                // Add user location marker
                mapplsClassObject.Marker({
                    map: newMap,
                    position: { lat: mapCenter.lat, lng: mapCenter.lng },
                    html: `<div style="width: 20px; height: 20px; background-color: #3b82f6; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.3);"></div>`
                });

                newMap.addListener('click', (e) => {
                    const rMode = routingModeRef.current;
                    const coords = { lat: e.lngLat.lat, lng: e.lngLat.lng };
                    
                    if (!rMode) {
                        // Open report modal instead of routing
                        setReportCoords(coords);
                        setShowReportModal(true);
                        setReportError(null);
                        setReportSuccess(null);
                        setReportFile(null);
                        return;
                    }
                    
                    if (rMode === 'origin') {
                        setRouteOrigin(coords);
                        if (originMarkerRef.current && typeof originMarkerRef.current.remove === 'function') originMarkerRef.current.remove();
                        originMarkerRef.current = mapplsClassObject.Marker({
                            map: newMap,
                            position: coords,
                            html: `<div style="background-color: #2563eb; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">A</div>`
                        });
                    } else if (rMode === 'dest') {
                        setRouteDest(coords);
                        if (destMarkerRef.current && typeof destMarkerRef.current.remove === 'function') destMarkerRef.current.remove();
                        destMarkerRef.current = mapplsClassObject.Marker({
                            map: newMap,
                            position: coords,
                            html: `<div style="background-color: #16a34a; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">B</div>`
                        });
                    }
                    setRoutingMode(null);
                });
            });
        } else if (mapRef.current && mapCenter) {
            mapRef.current.panTo([mapCenter.lat, mapCenter.lng]);
        }
    }, [isLoaded, mapCenter]);

    useEffect(() => {
        if (!mapRef.current || clusters.length === 0) return;
        
        markersRef.current.forEach(m => {
            if (m && typeof m.remove === 'function') m.remove();
        });
        markersRef.current = [];

        clusters.forEach(cluster => {
            const isCluster = cluster.length > 1;
            const pin = cluster[0];
            const lat = parseFloat(pin.location.lat);
            const lng = parseFloat(pin.location.lng);
            if (isNaN(lat) || isNaN(lng)) return;

            if (isCluster) {
                const marker = mapplsClassObject.Marker({
                    map: mapRef.current,
                    position: { lat, lng },
                    html: `<div style="background-color: #ea580c; color: white; width: 48px; height: 48px; border-radius: 50%; border: 4px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3); display: flex; flex-direction: column; align-items: center; justify-content: center; font-weight: 900; font-size: 16px; z-index: 100;">${cluster.length}</div>`
                });
                markersRef.current.push(marker);
                return;
            }

            const isCritical = ['Fire & Safety', 'Medical/Ambulance', 'Police'].includes(pin.department) || pin.priority === 'Critical' || pin.type === 'SOS Emergency';

            let iconEmoji = '🚩';
            if (pin.type?.toLowerCase().includes('pothole')) iconEmoji = '🚧';
            else if (pin.type?.toLowerCase().includes('garbage')) iconEmoji = '🗑️';
            else if (pin.type?.toLowerCase().includes('light')) iconEmoji = '💡';
            else if (pin.type?.toLowerCase().includes('water')) iconEmoji = '💧';
            else if (pin.type?.toLowerCase().includes('fire')) iconEmoji = '🔥';
            else if (pin.type?.toLowerCase().includes('traffic')) iconEmoji = '🚦';
            else if (pin.type?.toLowerCase().includes('sos')) iconEmoji = '🚨';

            let htmlContent = '';
            if (isCritical) {
                htmlContent = `<div style="background-color: #dc2626; color: white; width: 40px; height: 40px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 12px; z-index: 100;">SOS</div>`;
            } else {
                htmlContent = `<div style="font-size: 24px; filter: drop-shadow(0 4px 3px rgb(0 0 0 / 0.07));">${iconEmoji}</div>`;
            }

            const marker = mapplsClassObject.Marker({
                map: mapRef.current,
                position: { lat, lng },
                html: htmlContent
            });

            markersRef.current.push(marker);
        });
    }, [clusters]);

    return (
        <CivicLayout noPadding>
            <div className="relative h-full w-full bg-slate-100 dark:bg-slate-900 overflow-hidden">
                {/* Mappls Map */}
                {isLoaded && mapCenter ? (
                    <div id="mappls-civic-livemap" style={containerStyle}></div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full w-full bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                        <MapPin className="animate-bounce mb-3 text-blue-600 dark:text-blue-500" size={48} />
                        <span className="font-bold text-lg">Locating you...</span>
                        <span className="text-sm text-slate-500 dark:text-slate-500 mt-2">Please enable location access</span>
                    </div>
                )}

                {/* Top Stats Bar */}
                <div className="absolute top-4 left-4 right-4 flex gap-3 z-10 pointer-events-none">
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-lg pointer-events-auto border border-slate-200 dark:border-slate-700 flex-1">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="font-bold text-slate-900 dark:text-white text-lg">Live Map</h2>
                                <div className="text-xs text-slate-600 dark:text-slate-400 font-semibold mt-0.5 flex items-center gap-1">
                                    <div className="w-2 h-2 bg-blue-600 dark:bg-blue-500 rounded-full animate-pulse"></div>
                                    {filteredPins.length} Active Reports
                                </div>
                            </div>
                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className={`p-3 rounded-lg transition-colors ${showFilters ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
                            >
                                <Filter size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Mini Stats */}
                    <div className="hidden md:flex gap-3">
                        <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-lg shadow-lg pointer-events-auto border border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-2">
                                <AlertCircle size={20} className="text-red-600 dark:text-red-400" />
                                <div>
                                    <div className="text-2xl font-bold text-slate-900 dark:text-white">{criticalCount}</div>
                                    <div className="text-xs text-slate-600 dark:text-slate-400 font-semibold">Critical</div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-lg shadow-lg pointer-events-auto border border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-2">
                                <Clock size={20} className="text-blue-600 dark:text-blue-400" />
                                <div>
                                    <div className="text-2xl font-bold text-slate-900 dark:text-white">{pendingCount}</div>
                                    <div className="text-xs text-slate-600 dark:text-slate-400 font-semibold">Pending</div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-lg shadow-lg pointer-events-auto border border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-2">
                                <CheckCircle size={20} className="text-blue-600 dark:text-blue-400" />
                                <div>
                                    <div className="text-2xl font-bold text-slate-900 dark:text-white">{resolvedCount}</div>
                                    <div className="text-xs text-slate-600 dark:text-slate-400 font-semibold">Resolved</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filter Panel */}
                {showFilters && (
                    <div className="absolute top-24 left-4 bg-white dark:bg-slate-800 p-4 rounded-lg shadow-xl z-10 border border-slate-200 dark:border-slate-700 min-w-[240px]">
                        <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-3">Filter Reports</h3>
                        <div className="space-y-2">
                            {[
                                { value: 'all', label: 'All Reports', icon: '🗺️' },
                                { value: 'critical', label: 'Critical Only', icon: '🚨' },
                                { value: 'pothole', label: 'Potholes', icon: '🚧' },
                                { value: 'garbage', label: 'Garbage', icon: '🗑️' },
                                { value: 'light', label: 'Street Lights', icon: '💡' },
                                { value: 'water', label: 'Water Issues', icon: '💧' },
                            ].map(filter => (
                                <button
                                    key={filter.value}
                                    onClick={() => {
                                        setFilterType(filter.value);
                                        setShowFilters(false);
                                    }}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${filterType === filter.value
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                                        }`}
                                >
                                    <span className="text-xl">{filter.icon}</span>
                                    <span className="text-sm font-semibold">{filter.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Safe Routing Control Panel */}
                <div className="absolute top-24 right-4 bg-white dark:bg-slate-800 p-4 rounded-lg shadow-xl z-20 border border-slate-200 dark:border-slate-700 w-72">
                    <h3 className="font-bold text-slate-900 dark:text-white text-md mb-3 flex items-center gap-2">
                        <Navigation size={18} className="text-blue-600 dark:text-blue-400" /> Dynamic Reroute
                    </h3>
                    <div className="flex flex-col gap-2">
                        <button
                            onClick={() => setRoutingMode('origin')}
                            className={`w-full py-2 px-3 text-sm font-semibold rounded-md border ${routingMode === 'origin' ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-500 text-blue-700 dark:text-blue-300' : 'bg-slate-50 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'} transition-all text-left flex items-center justify-between`}
                        >
                            <span>{routeOrigin ? 'A: Selected' : 'Set Origin (A)'}</span>
                            <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex justify-center items-center text-xs">A</div>
                        </button>
                        <button
                            onClick={() => setRoutingMode('dest')}
                            className={`w-full py-2 px-3 text-sm font-semibold rounded-md border ${routingMode === 'dest' ? 'bg-green-100 dark:bg-green-900/40 border-green-500 text-green-700 dark:text-green-300' : 'bg-slate-50 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'} transition-all text-left flex items-center justify-between`}
                        >
                            <span>{routeDest ? 'B: Selected' : 'Set Destination (B)'}</span>
                            <div className="w-5 h-5 rounded-full bg-green-600 text-white flex justify-center items-center text-xs">B</div>
                        </button>
                        
                        <div className="flex gap-2 mt-2">
                            <button
                                onClick={fetchSafeRoute}
                                disabled={!routeOrigin || !routeDest || isRouting}
                                className="flex-1 py-2 px-3 bg-blue-600 text-white font-bold rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                                {isRouting ? 'Routing...' : 'Get Safe Route'}
                            </button>
                            <button
                                onClick={clearRoute}
                                className="py-2 px-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-bold rounded-md hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                                title="Clear Route"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        {routingMode && (
                            <div className="text-xs text-blue-600 dark:text-blue-400 animate-pulse mt-2 font-semibold">
                                Click on the map to set point...
                            </div>
                        )}
                    </div>
                </div>

                {/* Current Location Button */}
                <button
                    onClick={() => {
                        if (navigator.geolocation) {
                            navigator.geolocation.getCurrentPosition(
                                (position) => {
                                    setMapCenter({
                                        lat: position.coords.latitude,
                                        lng: position.coords.longitude
                                    });
                                }
                            );
                        }
                    }}
                    className="absolute bottom-32 right-4 p-4 bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-lg shadow-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700 z-10"
                >
                    <Navigation size={24} />
                </button>

                {/* Selected Pin Detail Card */}
                {selectedPin && (
                    <div className="absolute bottom-6 left-6 right-6 bg-white dark:bg-slate-800 p-6 rounded-lg shadow-xl z-20 border border-slate-200 dark:border-slate-700">
                        <div className="flex gap-4 items-start">
                            {/* Icon */}
                            <div className="w-14 h-14 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center text-3xl shrink-0">
                                {selectedPin.type === 'pothole' ? '🚧' :
                                    selectedPin.type === 'garbage' ? '🗑️' :
                                        selectedPin.type?.includes('SOS') ? '🚨' : '🚩'}
                            </div>

                            {/* Details */}
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-slate-900 dark:text-white text-lg capitalize mb-1">{selectedPin.type || 'Issue'}</h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3 line-clamp-2">
                                    {selectedPin.location?.address || 'Location information unavailable'}
                                </p>
                                <div className="flex gap-2 flex-wrap">
                                    <span className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-semibold">
                                        {selectedPin.status || 'Active'}
                                    </span>
                                    {selectedPin.department && (
                                        <span className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold">
                                            {selectedPin.department}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 shrink-0">
                                <button
                                    onClick={() => navigate(`/civic/report`)}
                                    className="px-5 py-3 bg-blue-600 dark:bg-blue-500 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
                                >
                                    Details
                                </button>
                                <button
                                    onClick={() => setSelectedPin(null)}
                                    className="p-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Report Issue Modal */}
                {showReportModal && (
                    <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
                            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                                <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                                    <AlertCircle className="text-red-500" /> Report Civic Hazard
                                </h3>
                                <button onClick={() => setShowReportModal(false)} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                                    <X size={24} />
                                </button>
                            </div>
                            
                            <form onSubmit={handleReportSubmit} className="p-6 flex flex-col gap-4">
                                <p className="text-sm text-slate-600 dark:text-slate-400">
                                    Submit a photo of the issue at your selected location. Our AI Forensics system will verify it automatically.
                                </p>
                                
                                <div className="p-4 bg-slate-100 dark:bg-slate-900 rounded-lg text-xs font-mono text-slate-500 flex justify-between">
                                    <span>Lat: {reportCoords?.lat.toFixed(5)}</span>
                                    <span>Lng: {reportCoords?.lng.toFixed(5)}</span>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Upload Photo</label>
                                    <input 
                                        type="file" 
                                        accept="image/*"
                                        ref={fileInputRef}
                                        onChange={(e) => setReportFile(e.target.files[0])}
                                        className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/30 dark:file:text-blue-400"
                                    />
                                    {reportFile && <p className="mt-2 text-xs text-green-600 font-semibold flex items-center gap-1"><CheckCircle size={14}/> {reportFile.name}</p>}
                                </div>

                                {reportError && (
                                    <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm font-semibold border border-red-200">
                                        🚨 {reportError}
                                    </div>
                                )}
                                
                                {reportSuccess && (
                                    <div className="p-3 bg-green-100 text-green-700 rounded-lg text-sm font-semibold border border-green-200">
                                        ✅ {reportSuccess}
                                    </div>
                                )}

                                <button 
                                    type="submit" 
                                    disabled={isReporting || !reportFile || reportSuccess}
                                    className="mt-2 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50 flex justify-center items-center"
                                >
                                    {isReporting ? (
                                        <>AI is Analyzing...</>
                                    ) : (
                                        'Submit to AI Forensics'
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </CivicLayout>
    );
};

export default LiveMap;