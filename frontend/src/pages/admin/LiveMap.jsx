import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { mappls } from 'mappls-web-maps';
const mapplsClassObject = new mappls();
import { useAuth } from '../../context/AuthContext';
import { getDatabase, ref, onValue } from 'firebase/database';
import { sanitizeKey } from '../../utils/firebaseUtils';
import { MapPin, Shield, AlertTriangle, Clock, ChevronRight } from 'lucide-react';


// Helper: Haversine distance in meters
const haversineDistance = (coords1, coords2) => {
    function toRad(x) {
        return (x * Math.PI) / 180;
    }

    const R = 6371e3;
    const dLat = toRad(coords2.lat - coords1.lat);
    const dLon = toRad(coords2.lng - coords1.lng);
    const lat1 = toRad(coords1.lat);
    const lat2 = toRad(coords2.lat);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
};

const AdminMap = () => {
    const { currentUser } = useAuth();
    const [incidents, setIncidents] = useState([]);
    const [selectedIncident, setSelectedIncident] = useState(null);
    const [selectedCluster, setSelectedCluster] = useState(null);
    const [center, setCenter] = useState({ lat: 22.5726, lng: 88.3639 });

    const [isLoaded, setIsLoaded] = useState(false);
    const mapRef = useRef(null);
    const markersRef = useRef([]);

    useEffect(() => {
        const loadObject = { map: true };
        mapplsClassObject.initialize(import.meta.env.VITE_MAPPLS_MAP_KEY, loadObject, () => {
            setIsLoaded(true);
        });
    }, []);

    useEffect(() => {
        if (isLoaded && !mapRef.current) {
            const newMap = mapplsClassObject.Map({
                id: "mappls-admin-livemap",
                properties: {
                    center: [center.lat, center.lng],
                    zoom: 13,
                }
            });
            newMap.on("load", () => {
                mapRef.current = newMap;
            });
        }
    }, [isLoaded, center]);

    // ====== DATA FETCHING (JWT API Primary + Firebase Fallback) ======
    useEffect(() => {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';
        const token = localStorage.getItem('token');
        const department = currentUser?.department;

        const fetchFromApi = async () => {
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (token) headers['Authorization'] = `Bearer ${token}`;

                const url = `${API_BASE_URL}/api/reports`;

                const res = await fetch(url, { headers });
                if (res.ok) {
                    const data = await res.json();
                    const reports = data.reports || data || [];
                    if (Array.isArray(reports)) {
                        setIncidents(reports);
                        if (reports.length > 0 && reports[0].location) {
                            setCenter({ lat: reports[0].location.lat, lng: reports[0].location.lng });
                        }
                    }
                }
            } catch (err) {
                console.error("[AdminMap] API Fetch Error:", err);
            }
        };

        fetchFromApi();
    }, [currentUser?.department]);

    // ====== CLUSTERING (must come BEFORE marker useEffect) ======
    const clusters = useMemo(() => {
        const clustered = [];
        const visited = new Set();

        incidents.forEach((incident) => {
            if (visited.has(incident.id)) return;
            if (!incident.location || !incident.location.lat || !incident.location.lng) return;

            const cluster = [incident];
            visited.add(incident.id);

            incidents.forEach((other) => {
                if (visited.has(other.id)) return;
                if (!other.location || !other.location.lat || !other.location.lng) return;

                const dist = haversineDistance(
                    { lat: incident.location.lat, lng: incident.location.lng },
                    { lat: other.location.lat, lng: other.location.lng }
                );

                if (dist <= 300) {
                    cluster.push(other);
                    visited.add(other.id);
                }
            });

            clustered.push(cluster);
        });

        return clustered;
    }, [incidents]);

    // ====== MAP MARKERS (uses clusters — must come AFTER clusters) ======
    useEffect(() => {
        if (!mapRef.current || clusters.length === 0) return;
        
        markersRef.current.forEach(m => {
            if (m && typeof m.remove === 'function') m.remove();
        });
        markersRef.current = [];

        clusters.forEach(cluster => {
            const mainIncident = cluster[0];
            const lat = parseFloat(mainIncident.location?.lat);
            const lng = parseFloat(mainIncident.location?.lng);
            if (isNaN(lat) || isNaN(lng)) return;
            
            let htmlContent = `<div style="background-color: ${(mainIncident.status || 'Pending') === 'Resolved' ? '#22c55e' : '#ef4444'}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`;

            if (cluster.length > 1) {
                htmlContent = `<div style="background-color: #ef4444; color: white; width: 30px; height: 30px; border-radius: 50%; border: 2px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 12px; z-index: 100;">${cluster.length}</div>`;
            }
            
            const marker = mapplsClassObject.Marker({
                map: mapRef.current,
                position: { lat, lng },
                html: htmlContent
            });
            
            markersRef.current.push(marker);
        });
    }, [clusters]);


    if (!isLoaded) return <div className="h-full w-full flex items-center justify-center bg-slate-100 dark:bg-slate-900 animate-pulse rounded-3xl" />;

    return (
        <AdminLayout>
            <div className="h-[calc(100vh-150px)] flex flex-col gap-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Department Live Monitor</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Geospatial view of all reports assigned to your department. High density areas are clustered.
                    </p>
                </div>

                <div className="flex-1 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden relative">
                    <div id="mappls-admin-livemap" style={{ width: '100%', height: '100%' }}></div>

                    {/* Legend */}
                    <div className="absolute top-4 left-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-3 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 z-10">
                        <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Legend</h5>
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Pending</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-red-600 text-[6px] text-white font-bold animate-pulse">!</span>
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">High Density (Alert)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Resolved</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
};

export default AdminMap;
