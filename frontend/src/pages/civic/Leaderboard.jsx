import React, { useState, useEffect } from 'react';
import { Trophy, Shield, Award, TrendingUp, Users, Crown, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CivicLayout from './CivicLayout';
import { useAuth } from '../../context/AuthContext';

const Leaderboard = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [filter, setFilter] = useState('All Time');
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [myRank, setMyRank] = useState(null);

    // Fetch Leaderboard from PostgreSQL
    useEffect(() => {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';
        const token = localStorage.getItem('token');

        const fetchLeaderboard = async () => {
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (token) headers['Authorization'] = `Bearer ${token}`;

                const res = await fetch(`${API_BASE_URL}/api/users/leaderboard`, { headers });

                if (res.ok) {
                    const data = await res.json();
                    const leaderboard = data.leaderboard || [];

                    // Mark current user
                    const enriched = leaderboard.map(u => ({
                        ...u,
                        isMe: currentUser?.id === u.id
                    }));
                    setUsers(enriched);

                    // Find my rank
                    const me = enriched.find(u => u.isMe);
                    if (me) setMyRank(me);
                }
            } catch (err) {
                console.error('[Leaderboard] Fetch Error:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchLeaderboard();
    }, [currentUser?.id]);

    if (loading) {
        return (
            <CivicLayout>
                <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                    <Loader2 size={40} className="text-blue-600 animate-spin" />
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Loading Leaderboard...</p>
                </div>
            </CivicLayout>
        );
    }

    return (
        <CivicLayout>
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
                        <div className="p-3 bg-blue-600 dark:bg-blue-500 rounded-lg">
                            <Trophy size={28} className="text-white" />
                        </div>
                        Leaderboard
                    </h1>
                    <p className="text-slate-600 dark:text-slate-400 text-base ml-16">Top civic contributors making real impact — {users.length} active citizens</p>
                </div>

                {/* Filter Tabs */}
                <div className="bg-slate-100 dark:bg-slate-700 p-1.5 rounded-lg flex items-center">
                    {['Weekly', 'Monthly', 'All Time'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors ${filter === f
                                ? 'bg-blue-600 dark:bg-blue-500 text-white'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Top 3 Podium */}
                <div className="bg-white dark:bg-slate-800 rounded-lg p-8 border border-slate-200 dark:border-slate-700 flex flex-col justify-end items-center h-[500px] relative">
                    {/* Champion Header */}
                    <div className="absolute top-8 left-0 right-0 text-center">
                        <div className="flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wider text-sm mb-2">
                            <Crown size={16} />
                            Current Champion
                        </div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-white">
                            {users[0]?.name || 'No Data'}
                        </div>
                    </div>

                    {/* Podium Visual */}
                    <div className="flex items-end gap-4 w-full justify-center">
                        {/* 2nd Place */}
                        <div className="flex flex-col items-center">
                            <div className="w-16 h-16 rounded-full border-4 border-slate-300 dark:border-slate-600 mb-2 relative bg-white dark:bg-slate-700">
                                {users[1] ? (
                                    <img src={users[1].avatar} className="w-full h-full rounded-full object-cover" alt="2nd" />
                                ) : <div className="w-full h-full rounded-full bg-slate-200 dark:bg-slate-600" />}
                                <div className="absolute -bottom-2 inset-x-0 mx-auto w-6 h-6 bg-slate-400 dark:bg-slate-500 rounded-full flex items-center justify-center font-bold text-white text-xs">2</div>
                            </div>
                            <div className="w-20 h-32 bg-slate-200 dark:bg-slate-700 rounded-t-lg flex items-end justify-center pb-2">
                                <span className="font-semibold text-slate-700 dark:text-slate-300">{users[1]?.points || 0}</span>
                            </div>
                        </div>

                        {/* 1st Place */}
                        <div className="flex flex-col items-center">
                            <div className="relative">
                                <div className="absolute -top-8 left-0 right-0 mx-auto flex justify-center">
                                    <Trophy size={24} className="text-blue-600 dark:text-blue-400" fill="currentColor" />
                                </div>
                                <div className="w-20 h-20 rounded-full border-4 border-blue-600 dark:border-blue-500 mb-2 relative bg-white dark:bg-slate-700">
                                    {users[0] ? (
                                        <img src={users[0].avatar} className="w-full h-full rounded-full object-cover" alt="1st" />
                                    ) : <div className="w-full h-full rounded-full bg-slate-200 dark:bg-slate-600" />}
                                    <div className="absolute -bottom-2 inset-x-0 mx-auto w-7 h-7 bg-blue-600 dark:bg-blue-500 rounded-full flex items-center justify-center font-bold text-white text-sm">1</div>
                                </div>
                            </div>
                            <div className="w-24 h-48 bg-blue-100 dark:bg-blue-900/20 rounded-t-lg flex items-end justify-center pb-4 border-2 border-blue-200 dark:border-blue-800">
                                <span className="font-bold text-xl text-blue-600 dark:text-blue-400">{users[0]?.points || 0}</span>
                            </div>
                        </div>

                        {/* 3rd Place */}
                        <div className="flex flex-col items-center">
                            <div className="w-16 h-16 rounded-full border-4 border-slate-300 dark:border-slate-600 mb-2 relative bg-white dark:bg-slate-700">
                                {users[2] ? (
                                    <img src={users[2].avatar} className="w-full h-full rounded-full object-cover" alt="3rd" />
                                ) : <div className="w-full h-full rounded-full bg-slate-200 dark:bg-slate-600" />}
                                <div className="absolute -bottom-2 inset-x-0 mx-auto w-6 h-6 bg-slate-400 dark:bg-slate-500 rounded-full flex items-center justify-center font-bold text-white text-xs">3</div>
                            </div>
                            <div className="w-20 h-24 bg-slate-200 dark:bg-slate-700 rounded-t-lg flex items-end justify-center pb-2">
                                <span className="font-semibold text-slate-600 dark:text-slate-400">{users[2]?.points || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Leaderboard Table */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2">
                                    <Users size={20} className="text-blue-600 dark:text-blue-400" />
                                    Top Contributors
                                </h3>
                                <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Ranked by civic impact points</p>
                            </div>
                            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                                <TrendingUp size={20} />
                                <span className="font-semibold text-sm">{users.length} Active</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-400 font-semibold text-xs uppercase tracking-wider sticky top-0 z-10">
                                <tr>
                                    <th className="px-6 py-4">Rank</th>
                                    <th className="px-6 py-4">Citizen</th>
                                    <th className="px-6 py-4">Level</th>
                                    <th className="px-6 py-4 text-right">Points</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-slate-700 dark:text-slate-300">
                                {users.map((user) => (
                                    <tr key={user.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group ${user.isMe ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                                        <td className="px-6 py-4">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-semibold text-sm ${user.rank <= 3
                                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                                                }`}>
                                                #{user.rank}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <img src={user.avatar} className="w-10 h-10 rounded-full border-2 border-slate-200 dark:border-slate-600 object-cover" alt="" />
                                                <div className="font-semibold text-slate-900 dark:text-white">
                                                    {user.name} {user.isMe && <span className="text-blue-600 dark:text-blue-400 text-xs ml-1">(You)</span>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                                                <Shield size={12} /> Lvl {user.level}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="font-semibold text-slate-900 dark:text-white">
                                                {user.points.toLocaleString()} <span className="text-slate-500 dark:text-slate-500 text-xs">pts</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {users.length === 0 && (
                            <div className="py-16 text-center text-slate-400">
                                <Trophy size={40} className="mx-auto mb-3 opacity-30" />
                                <p className="font-semibold">No contributors yet</p>
                                <p className="text-sm mt-1">Be the first to report an issue!</p>
                            </div>
                        )}
                    </div>

                    {/* Sticky 'Me' Row */}
                    {myRank && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 border-t border-blue-200 dark:border-blue-800 flex items-center justify-between sticky bottom-0 z-10">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center font-bold text-blue-600 dark:text-blue-400">
                                    #{myRank.rank}
                                </div>
                                <div className="flex items-center gap-3">
                                    <img
                                        src={myRank.avatar}
                                        className="w-10 h-10 rounded-full border-2 border-blue-500 object-cover"
                                        alt=""
                                    />
                                    <div className="flex flex-col">
                                        <span className="font-bold text-slate-900 dark:text-white leading-tight">You</span>
                                        <span className="text-xs text-slate-600 dark:text-slate-400 font-semibold">{myRank.name}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="font-bold text-slate-900 dark:text-white text-lg">
                                {myRank.points.toLocaleString()} <span className="text-blue-600 dark:text-blue-400 text-sm">pts</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </CivicLayout>
    );
};

export default Leaderboard;
