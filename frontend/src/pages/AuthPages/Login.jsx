import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../../components/LandingPages/Navbar';
import Footer from '../../components/LandingPages/Footer';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { Loader2, Mail, ShieldCheck } from 'lucide-react';

export default function Login() {
    const navigate = useNavigate();
    const { googleLogin, setJwtUser } = useAuth();
    const [userType, setUserType] = useState('citizen');
    const [showPassword, setShowPassword] = useState(false);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), password: password.trim(), selectedRole: userType })
            });

            const data = await response.json();
            console.log("Login response:", data);

            if (!response.ok) throw new Error(data.error || "Login Failed");

            // 1. Save JWT
            localStorage.setItem('token', data.token);

            // 2. Update AuthContext IMMEDIATELY
            const role = data.role || data.user?.role || 'citizen';
            setJwtUser(data.user, role);

            toast.success('Login Successful!');

            // 3. Redirect AFTER a tick to let React state propagate
            console.log("Redirecting with role:", role);
            setTimeout(() => {
                if (role === 'admin') {
                    navigate('/admin/dashboard', { replace: true });
                } else {
                    navigate('/civic/dashboard', { replace: true });
                }
            }, 50);

        } catch (error) {
            console.error("Login error:", error);
            toast.error(error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setIsLoading(true);
        try {
            const googleResponse = await googleLogin();
            
            const response = await fetch(`${API_BASE_URL}/api/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: googleResponse.user.email,
                    name: googleResponse.user.displayName,
                    google_id: googleResponse.user.uid
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            localStorage.setItem('token', data.token);
            const role = data.role || data.user?.role || 'citizen';
            setJwtUser(data.user, role);
            
            toast.success('Logged in with Google!');
            setTimeout(() => {
                navigate(role === 'admin' ? '/admin/dashboard' : '/civic/dashboard', { replace: true });
            }, 50);

        } catch (error) {
            toast.error(error.message || "Google Login Failed");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-white dark:bg-[#0f172a] transition-colors duration-300">
            <Navbar />

            <div className="flex-grow flex w-full overflow-hidden">
                {/* Left Side - Visuals */}
                <div className="hidden lg:flex w-1/2 relative flex-col justify-start pt-32 px-12 pb-12 text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-colors">
                    <div className="absolute inset-0 z-0">
                        <img
                            src="https://images.unsplash.com/photo-1486325212027-8081e485255e?q=80&w=2070&auto=format&fit=crop"
                            alt="Cityscape"
                            className="h-full w-full object-cover opacity-20 dark:opacity-40 mix-blend-overlay"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-100/80 via-white/50 to-slate-200/50 dark:from-[#0f172a] dark:via-[#0f172a]/80 dark:to-slate-900/90"></div>
                    </div>

                    <div className="relative z-10 mb-8">
                        <div className="mb-6">
                            <h2 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span>नगर</span>
                                <span className="font-sans">Alert Hub</span>
                            </h2>
                        </div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100/50 dark:bg-white/10 backdrop-blur-md border border-blue-200 dark:border-white/20 text-blue-800 dark:text-white text-xs font-medium mb-6">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                            SECURE OFFICIAL PORTAL
                        </div>
                        <h1 className="text-5xl font-bold leading-tight mb-4 text-slate-900 dark:text-white">
                            Empowering Citizens,<br />
                            <span className="text-blue-600 dark:text-blue-400">Enabling Authorities.</span>
                        </h1>
                        <p className="text-slate-600 dark:text-gray-300 text-lg max-w-md mb-8">
                            Join the network building safer, smarter, and more resilient communities through transparent collaboration.
                        </p>
                    </div>
                </div>

                {/* Right Side - Login Form */}
                <div className="w-full lg:w-1/2 flex flex-col relative px-6 py-12 lg:p-24 justify-center bg-white dark:bg-[#0f172a] transition-colors">
                    <div className="max-w-[440px] w-full mx-auto">
                        <div className="text-center mb-10">
                            <div className="w-16 h-16 bg-blue-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-blue-600/20 dark:shadow-blue-900/20">
                                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                            </div>
                            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2 flex justify-center items-center gap-2">
                                <span>नगर</span>
                                <span>Alert Hub</span>
                            </h2>
                            <p className="text-slate-500 dark:text-gray-400 text-sm">Secure access for citizens & officials</p>
                        </div>

                        {/* Tabs */}
                        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl mb-8 border border-slate-200 dark:border-slate-700/50">
                            <button
                                onClick={() => setUserType('citizen')}
                                className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${userType === 'citizen' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50'}`}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                Citizen Portal
                            </button>
                            <button
                                onClick={() => setUserType('admin')}
                                className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${userType === 'admin' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50'}`}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                Admin/Official
                            </button>
                        </div>

                        {/* Form */}
                        <form className="space-y-6" onSubmit={handleLogin}>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">
                                    {userType === 'citizen' ? 'Email Address' : 'Official ID / Email'}
                                </label>
                                <div className="relative">
                                    <input
                                        type="email"
                                        placeholder={userType === 'citizen' ? "you@example.com" : "official@nagaralert.gov.in"}
                                        className="block w-full pl-10 pr-3 py-3 border border-slate-200 dark:border-slate-700 rounded-lg leading-5 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all sm:text-sm"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Password</label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        placeholder="••••••••"
                                        className="block w-full pl-10 pr-10 py-3 border border-slate-200 dark:border-slate-700 rounded-lg leading-5 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all sm:text-sm"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    />
                                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer text-slate-400 dark:text-gray-500" onClick={() => setShowPassword(!showPassword)}>
                                        {showPassword ? (
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                        ) : (
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                        )}
                                    </div>
                                </div>
                            </div>
                            
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full flex justify-center items-center gap-2 py-4 px-4 border border-transparent rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed group"
                            >
                                {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : ( <>Secure Login <ShieldCheck className="w-4 h-4 ml-1 group-hover:scale-110 transition-transform" /></> )}
                            </button>

                            <div className="relative my-6">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-white dark:bg-[#0f172a] px-2 text-slate-500 font-semibold">Or continue with</span>
                                </div>
                            </div>

                            {/* <button type="button" onClick={handleGoogleLogin} className="w-full flex justify-center items-center border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold py-3.5 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white transition-all">
                                Continue with Google
                            </button> */}
                            <button type="button" disabled title="Coming Soon" className="w-full flex justify-center items-center border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold py-3.5 bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 cursor-not-allowed transition-all">
                                Continue with Google (Coming Soon)
                            </button>
                        </form>

                        <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-700/50 text-center">
                            <p className="text-slate-500 dark:text-gray-400 text-sm">
                                New to Nagar Alert Hub? <Link to="/register" className="text-blue-600 dark:text-blue-400 font-bold hover:underline ml-1">Register Account</Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            <Footer />
        </div>
    );
}