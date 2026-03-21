import React, { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { useAuth } from '../../context/AuthContext';
import { LocateFixed } from 'lucide-react';
import CommandCenterMap from '../../components/CommandCenterMap';

const AdminMap = () => {
    const { currentUser } = useAuth();
    const [incidents, setIncidents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // ====== DATA FETCHING (Unified Endpoint) ======
    useEffect(() => {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';
        const token = localStorage.getItem('token');
        
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
                    }
                }
            } catch (err) {
                console.error("[AdminMap] API Fetch Error:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchFromApi();
    }, [currentUser?.department]);

    return (
        <AdminLayout>
            <div className="h-[calc(100vh-150px)] flex flex-col gap-6 relative">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <LocateFixed className="text-blue-600 dark:text-blue-400" /> GIS Command Center
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Geospatial analysis, intelligent clustering, and live traffic integrations.
                        </p>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex-1 flex items-center justify-center bg-[#1e293b] rounded-3xl animate-pulse">
                        <span className="text-slate-400 font-bold uppercase tracking-widest text-sm">Loading GIS Data...</span>
                    </div>
                ) : (
                    <CommandCenterMap incidents={incidents} />
                )}
            </div>
        </AdminLayout>
    );
};

export default AdminMap;

