import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [loading, setLoading] = useState(true);
    // Flag to prevent Firebase from overwriting JWT sessions
    const [isJwtSession, setIsJwtSession] = useState(false);

    // ============================================================
    // JWT LOGIN: Called by Login.jsx and Register.jsx after
    // successful backend authentication. Sets user in context
    // so ProtectedRoute allows access.
    // ============================================================
    const setJwtUser = useCallback((userData, role) => {
        console.log("[AuthContext] setJwtUser called:", userData?.email, "role:", role, "dept:", userData?.department);
        const userObj = {
            id: userData?.id,
            email: userData?.email,
            role: role || userData?.role || 'citizen',
            name: userData?.name || userData?.email,
            department: userData?.department || null,
        };
        setCurrentUser(userObj);
        setUserRole(role || 'citizen');
        setIsJwtSession(true);
        setLoading(false);
    }, []);

    useEffect(() => {
        // STEP 1: Check localStorage for existing JWT session on page load
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                if (payload.exp * 1000 > Date.now()) {
                    console.log("[AuthContext] Restoring JWT session for:", payload.email, "dept:", payload.department);
                    setCurrentUser({
                        id: payload.id,
                        email: payload.email,
                        role: payload.role || 'citizen',
                        name: payload.email,
                        department: payload.department || null,
                    });
                    setUserRole(payload.role || 'citizen');
                    setIsJwtSession(true);
                    setLoading(false);
                    return; // DON'T set up Firebase listener — we have a JWT session
                } else {
                    console.log("[AuthContext] JWT expired, clearing");
                    localStorage.removeItem('token');
                }
            } catch (e) {
                console.warn("[AuthContext] Invalid JWT:", e.message);
                localStorage.removeItem('token');
            }
        } else {
            // clear if no token
            setCurrentUser(null);
            setUserRole(null);
            setLoading(false);
        }
    }, []);

    const login = async (email, password) => {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
        try {
            const response = await axios.post(`${API_URL}/auth/login`, { email, password });
            return response.data;
        } catch (error) {
            console.error("[AuthContext] Login Error:", error);
            throw error.response?.data || error;
        }
    };

    const register = async (userData) => {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
        try {
            const response = await axios.post(`${API_URL}/auth/register`, userData);
            return response.data;
        } catch (error) {
            console.error("[AuthContext] Register Error:", error);
            throw error.response?.data || error;
        }
    };

    const logout = useCallback(() => {
        console.log("[AuthContext] Logging out");
        localStorage.removeItem('token');
        setCurrentUser(null);
        setUserRole(null);
        setIsJwtSession(false);
    }, []);

    const refreshUserProfile = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';
            const res = await fetch(`${API_BASE_URL}/api/auth/profile`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const { user } = await res.json();
                setCurrentUser(prev => ({
                    ...prev,
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    profilePic: user.profilePic,
                    firstName: user.firstName,
                    lastName: user.lastName
                }));
            }
        } catch (error) {
            console.error("[AuthContext] Failed to refresh profile:", error);
        }
    }, []);

    const value = {
        currentUser,
        role: userRole,
        isAuthenticated: !!currentUser,
        login,
        register,
        logout,
        loading,
        setJwtUser,
        refreshUserProfile
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}