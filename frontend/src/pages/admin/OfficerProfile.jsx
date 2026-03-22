import React, { useState, useEffect } from 'react';
import AdminLayout from './AdminLayout';
import { useAuth } from '../../context/AuthContext';
import { Mail, Phone, MapPin, Award, Clock, CheckCircle, Shield, Calendar, Activity, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

const OfficerProfile = () => {
    const { currentUser } = useAuth();
    const [stats, setStats] = useState(null);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';
                const token = localStorage.getItem('token');
                if (!token) { setLoading(false); return; }

                const res = await fetch(`${API_BASE_URL}/api/reports/admin/stats`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (res.ok) {
                    const data = await res.json();
                    setStats(data.stats);
                    setLogs(data.recentLogs || []);
                } else {
                    toast.error("Failed to load official statistics");
                }
            } catch (err) {
                console.error("Profile stats fetch error:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    return (
        <AdminLayout>
            <div className="max-w-7xl mx-auto pb-20 space-y-8">
                {/* Header Profile Card */}
                <div className="bg-white dark:bg-slate-900 rounded-[3rem] p-8 lg:p-12 shadow-sm border border-slate-200 dark:border-slate-800 relative overflow-hidden">
                    <div className="relative z-10 flex flex-col md:flex-row gap-8 items-start md:items-center">
                        <div className="w-32 h-32 lg:w-40 lg:h-40 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-[2.5rem] flex items-center justify-center text-5xl lg:text-6xl font-black text-white shadow-2xl shadow-blue-600/30">
                            {currentUser?.firstName?.charAt(0) || 'O'}
                        </div>
                        <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-3">
                                <span className="px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase tracking-widest rounded-lg border border-blue-100 dark:border-blue-800">
                                    {currentUser?.role || 'Admin'}
                                </span>
                                <span className="px-3 py-1 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-[10px] font-black uppercase tracking-widest rounded-lg border border-green-100 dark:border-green-800 flex items-center gap-1">
                                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> Active Duty
                                </span>
                            </div>
                            <h1 className="text-4xl lg:text-5xl font-black text-slate-900 dark:text-white uppercase leading-none">
                                {currentUser?.firstName || 'Command'} {currentUser?.lastName || 'Official'}
                            </h1>
                            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <Shield size={14} className="text-blue-500" />
                                Department of {currentUser?.department || 'Civil Administration'}
                            </p>
                        </div>
                        <div className="flex flex-col gap-3 w-full md:w-auto">
                            <InfoBadge icon={<Mail size={16} />} label={currentUser?.email || 'N/A'} />
                            <InfoBadge icon={<Phone size={16} />} label={currentUser?.phoneNumber || currentUser?.phone || "No Contact Num"} />
                            <InfoBadge icon={<MapPin size={16} />} label={currentUser?.address || "Location Unavailable"} />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Col - Stats */}
                    <div className="space-y-6">
                        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200 dark:border-slate-800 shadow-sm min-h-[300px] flex flex-col">
                            <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                                <Activity size={20} className="text-indigo-500" /> Performance
                            </h3>
                            {loading ? (
                                <div className="flex flex-1 items-center justify-center text-blue-600"><Loader2 className="animate-spin" size={32} /></div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4">
                                    <StatRow label="Incidents Resolved" value={stats?.resolved || 0} icon={<CheckCircle size={18} />} color="text-green-500" />
                                    <StatRow label="Total Inbound" value={stats?.total || 0} icon={<Clock size={18} />} color="text-blue-500" />
                                    <StatRow label="Pending" value={stats?.pending || 0} icon={<Activity size={18} />} color="text-orange-500" />
                                    <StatRow label="In Progress" value={stats?.inProgress || 0} icon={<Shield size={18} />} color="text-purple-500" />
                                </div>
                            )}
                        </div>

                        {!loading && stats?.resolved > 50 && (
                            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[2.5rem] p-8 text-white shadow-xl shadow-blue-600/20 relative overflow-hidden">
                                <div className="relative z-10">
                                    <Award size={48} className="mb-4 text-yellow-300" />
                                    <h3 className="text-2xl font-black uppercase mb-1">Top Responder</h3>
                                    <p className="text-blue-100 text-sm font-medium mb-6">Recognized for exceptionally rapid ticket resolution rates.</p>
                                    <div className="text-[10px] font-black uppercase tracking-widest bg-white/20 px-3 py-1 rounded-lg inline-block">Active Milestone</div>
                                </div>
                                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                            </div>
                        )}
                    </div>

                    {/* Right Col - Activity Log */}
                    <div className="lg:col-span-2">
                        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200 dark:border-slate-800 shadow-sm h-full flex flex-col">
                            <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-widest mb-8 flex items-center gap-2">
                                <Clock size={20} className="text-slate-400" /> Service Log
                            </h3>

                            {loading ? (
                                <div className="flex flex-1 items-center justify-center text-slate-400"><Loader2 className="animate-spin" size={32} /></div>
                            ) : logs.length === 0 ? (
                                <div className="flex flex-1 items-center justify-center text-slate-400 font-bold uppercase text-sm tracking-widest">
                                    No Recent Logs Found
                                </div>
                            ) : (
                                <div className="space-y-8 relative before:absolute before:left-4 before:top-4 before:bottom-4 before:w-[2px] before:bg-slate-100 dark:before:bg-slate-800">
                                    {logs.map((log, index) => (
                                        <LogItem
                                            key={log.id || index}
                                            title={log.title}
                                            time={log.time}
                                            desc={log.desc}
                                            icon={<CheckCircle size={14} className="text-white" />}
                                            color={log.status === 'Resolved' ? 'bg-green-500' : log.status === 'Pending' ? 'bg-orange-500' : 'bg-blue-500'}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
};

const InfoBadge = ({ icon, label }) => (
    <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 px-4 py-3 rounded-2xl border border-slate-100 dark:border-slate-700/50">
        <div className="text-slate-400">{icon}</div>
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{label}</span>
    </div>
);

const StatRow = ({ label, value, icon, color }) => (
    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
        <div className="flex items-center gap-3">
            <div className={`p-2 bg-white dark:bg-slate-800 rounded-xl shadow-sm ${color}`}>{icon}</div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</span>
        </div>
        <span className="font-black text-xl text-slate-900 dark:text-white">{value}</span>
    </div>
);

const LogItem = ({ title, time, desc, icon, color }) => (
    <div className="relative pl-12 group">
        <div className={`absolute left-0 top-0 w-8 h-8 rounded-full ${color} shadow-lg shadow-blue-500/20 flex items-center justify-center ring-4 ring-white dark:ring-slate-900 z-10`}>
            {icon}
        </div>
        <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                <h4 className="font-bold text-slate-900 dark:text-white truncate pr-4">{title}</h4>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded self-start whitespace-nowrap">{time}</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium line-clamp-2">{desc}</p>
        </div>
    </div>
);

export default OfficerProfile;
