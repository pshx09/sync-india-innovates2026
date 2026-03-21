import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '../../context/AuthContext';
import {
    Search, Clock, CheckCircle,
    AlertTriangle, MoreVertical, Calendar,
    Shield, ArrowRight, Briefcase,
    Zap, MapPin, Loader2, Send
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const TaskBoard = () => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);

    // ====== FETCH TICKETS FROM POSTGRESQL ======
    useEffect(() => {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';
        const token = localStorage.getItem('token');

        const fetchTickets = async () => {
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (token) headers['Authorization'] = `Bearer ${token}`;

                const res = await fetch(`${API_BASE_URL}/api/reports`, { headers });

                if (res.ok) {
                    const data = await res.json();
                    const reports = data.reports || data || [];
                    if (Array.isArray(reports)) {
                        setTickets(reports);
                    }
                } else {
                    console.error(`[TaskBoard] API error ${res.status}`);
                    toast.error('Failed to load tickets');
                }
            } catch (err) {
                console.error('[TaskBoard] Fetch Error:', err);
                toast.error('Network error loading tickets');
            } finally {
                setLoading(false);
            }
        };

        fetchTickets();
    }, [currentUser?.department]);

    // ====== STATUS UPDATE VIA PATCH ======
    const handleStatusUpdate = async (ticketId, newStatus) => {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';
        const token = localStorage.getItem('token');

        try {
            const res = await fetch(`${API_BASE_URL}/api/tickets/${ticketId}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ status: newStatus })
            });

            if (!res.ok) throw new Error('Update failed');

            // Update local state immediately
            setTickets(prev => prev.map(t =>
                t.id === ticketId ? { ...t, status: newStatus } : t
            ));

            toast.success(`Ticket shifted to ${newStatus}`);
        } catch (error) {
            console.error('[TaskBoard] Status update error:', error);
            toast.error('Failed to update ticket');
        }
    };

    // ====== COLUMN DEFINITIONS WITH CASE-INSENSITIVE MATCHING ======
    const columns = [
        {
            id: 'backlog',
            label: 'Backlog',
            icon: <Briefcase size={16} className="text-orange-500" />,
            color: 'orange',
            filter: (t) => {
                const s = (t.status || '').toLowerCase();
                return s === 'open' || s === 'pending' || s === 'pending address';
            },
            nextStatus: 'In Progress',
            prevStatus: null
        },
        {
            id: 'in_action',
            label: 'In Action',
            icon: <Zap size={16} className="text-blue-500" />,
            color: 'blue',
            filter: (t) => {
                const s = (t.status || '').toLowerCase();
                return s === 'in_progress' || s === 'in progress' || s === 'accepted' || s === 'verified';
            },
            nextStatus: 'Resolved',
            prevStatus: 'Pending'
        },
        {
            id: 'finalized',
            label: 'Finalized',
            icon: <CheckCircle size={16} className="text-green-500" />,
            color: 'green',
            filter: (t) => {
                const s = (t.status || '').toLowerCase();
                return s === 'resolved' || s.startsWith('rejected');
            },
            nextStatus: null,
            prevStatus: 'In Progress'
        }
    ];

    // ====== SEVERITY BADGE COLOR ======
    const getSeverityStyle = (severity) => {
        const s = (severity || '').toLowerCase();
        if (s === 'critical') return 'bg-red-500/10 text-red-600 border-red-200';
        if (s === 'high') return 'bg-red-50 text-red-600 border-red-100';
        if (s === 'medium') return 'bg-orange-50 text-orange-600 border-orange-100';
        return 'bg-blue-50 text-blue-600 border-blue-100';
    };

    // ====== STATUS BADGE COLOR ======
    const getStatusBadge = (status) => {
        const s = (status || '').toLowerCase();
        if (s === 'resolved') return 'bg-green-50 text-green-600 border-green-100';
        if (s.startsWith('rejected')) return 'bg-red-50 text-red-600 border-red-100';
        if (s === 'in_progress' || s === 'in progress' || s === 'accepted') return 'bg-blue-50 text-blue-600 border-blue-100';
        return 'bg-orange-50 text-orange-600 border-orange-100';
    };

    if (loading) {
        return (
            <AdminLayout>
                <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                    <Loader2 size={40} className="text-blue-600 animate-spin" />
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Loading Operational Board...</p>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <div className="space-y-8">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-3">
                            Strategic Ops <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-black text-blue-600 border border-slate-200 dark:border-slate-700">{currentUser?.department}</span>
                        </h1>
                        <p className="text-sm text-slate-500 font-medium">Live ticket pipeline from PostgreSQL — {tickets.length} total tickets</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-4 bg-white dark:bg-slate-800 px-5 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                            {columns.map(col => (
                                <div key={col.id} className="flex items-center gap-2 text-xs font-bold text-slate-500">
                                    {col.icon}
                                    <span className="uppercase tracking-wider">{col.label}</span>
                                    <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-[10px] font-black">
                                        {tickets.filter(col.filter).length}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Task Columns */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {columns.map(column => {
                        const columnTickets = tickets.filter(column.filter);
                        return (
                            <div key={column.id} className="flex flex-col h-full min-h-[600px] bg-slate-50/50 dark:bg-slate-900/50 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 p-6 transition-colors">
                                <div className="flex items-center justify-between mb-8 px-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm border border-slate-100 dark:border-slate-700">
                                            {column.icon}
                                        </div>
                                        <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-widest text-xs">{column.label}</h3>
                                    </div>
                                    <span className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-500 shadow-sm border border-slate-200 dark:border-slate-700">
                                        {columnTickets.length}
                                    </span>
                                </div>

                                <div className="space-y-4 flex-1 overflow-y-auto max-h-[calc(100vh-320px)] pr-1">
                                    {columnTickets.map(ticket => (
                                        <div
                                            key={ticket.id}
                                            className="bg-white dark:bg-slate-800 p-5 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-xl transition-all group relative overflow-hidden cursor-pointer"
                                            onClick={() => navigate(`/admin/incident/${ticket.id}`)}
                                        >
                                            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity z-10" onClick={e => e.stopPropagation()}>
                                                <button className="p-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl">
                                                    <MoreVertical size={14} className="text-slate-400" />
                                                </button>
                                            </div>

                                            {/* Severity + Status Badges */}
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest border ${getSeverityStyle(ticket.severity)}`}>
                                                    {ticket.severity || 'Medium'}
                                                </span>
                                                <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest border ${getStatusBadge(ticket.status)}`}>
                                                    {ticket.status || 'Pending'}
                                                </span>
                                            </div>

                                            {/* Ticket Info */}
                                            <div className="flex items-start gap-3 mb-3">
                                                {ticket.imageUrl ? (
                                                    <img
                                                        src={ticket.imageUrl}
                                                        className="w-10 h-10 rounded-xl object-cover bg-slate-100 shadow-sm shrink-0"
                                                        alt=""
                                                        onError={(e) => { e.target.style.display = 'none'; }}
                                                    />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center shrink-0">
                                                        <AlertTriangle size={16} className="text-slate-400" />
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <h4 className="font-bold text-slate-900 dark:text-white text-sm uppercase leading-tight truncate">
                                                        {ticket.type || ticket.issue_type || 'Unknown Issue'}
                                                    </h4>
                                                    <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.15em]">
                                                        #{ticket.id?.slice(-8)}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Description */}
                                            {ticket.description && (
                                                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-4 line-clamp-2 italic">
                                                    "{ticket.description}"
                                                </p>
                                            )}

                                            {/* Footer */}
                                            <div className="flex items-center justify-between pt-3 border-t border-slate-50 dark:border-slate-700/50" onClick={e => e.stopPropagation()}>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-[9px] font-black text-slate-400">
                                                        {ticket.userName?.charAt(0) || 'U'}
                                                    </div>
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter truncate max-w-[80px]">
                                                        {ticket.userName || 'Citizen'}
                                                    </span>
                                                    <span className="text-[9px] text-slate-300 dark:text-slate-600">•</span>
                                                    <span className="text-[9px] text-slate-400 font-medium">
                                                        {ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString() : '—'}
                                                    </span>
                                                </div>

                                                {/* Column transition arrows */}
                                                <div className="flex gap-1">
                                                    {column.prevStatus && (
                                                        <button
                                                            onClick={() => handleStatusUpdate(ticket.id, column.prevStatus)}
                                                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 transition-colors"
                                                            title={`Move to ${column.prevStatus}`}
                                                        >
                                                            <ArrowRight size={14} className="rotate-180" />
                                                        </button>
                                                    )}
                                                    {column.nextStatus && (
                                                        <button
                                                            onClick={() => handleStatusUpdate(ticket.id, column.nextStatus)}
                                                            className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg text-blue-600 transition-colors"
                                                            title={`Move to ${column.nextStatus}`}
                                                        >
                                                            <ArrowRight size={14} />
                                                        </button>
                                                    )}
                                                    {column.id === 'backlog' && (
                                                        <button
                                                            onClick={() => {
                                                                handleStatusUpdate(ticket.id, 'In Progress');
                                                                navigate('/admin/broadcast', { state: { selectedTicketId: ticket.id, incidentId: ticket.id } });
                                                            }}
                                                            className="p-1.5 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg text-green-600 transition-colors"
                                                            title="Fix & Broadcast"
                                                        >
                                                            <Send size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    {columnTickets.length === 0 && (
                                        <div className="py-12 flex flex-col items-center justify-center opacity-30">
                                            <div className="w-12 h-12 border-2 border-dashed border-slate-400 rounded-2xl flex items-center justify-center mb-2">
                                                <Calendar size={20} className="text-slate-400" />
                                            </div>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">No Tickets</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </AdminLayout>
    );
};

export default TaskBoard;
