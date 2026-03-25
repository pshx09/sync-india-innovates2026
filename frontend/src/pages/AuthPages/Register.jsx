import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../../components/LandingPages/Navbar';
import Footer from '../../components/LandingPages/Footer';
import { Loader2, ShieldCheck, Mail, ArrowRight, Lock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

export default function Register() {
    const [userType, setUserType] = useState('citizen');
    const [formData, setFormData] = useState({
        firstName: '', lastName: '', mobile: '', email: '', password: '', confirmPassword: '', department: ''
    });
    const [address, setAddress] = useState('');
    const [city, setCity] = useState('');
    const [locationLoading, setLocationLoading] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});

    // TWO-STEP SIGNUP STATE
    const [otpStep, setOtpStep] = useState(false);
    const [otp, setOtp] = useState('');

    // 🚀 RESEND OTP STATE
    const [timer, setTimer] = useState(60);
    const [canResend, setCanResend] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);

    const navigate = useNavigate();
    const { setJwtUser } = useAuth();
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

    // 🚀 TIMER LOGIC
    useEffect(() => {
        let interval;
        if (otpStep && timer > 0) {
            interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
        } else if (timer === 0) {
            setCanResend(true);
        }
        return () => clearInterval(interval);
    }, [timer, otpStep]);

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const validateForm = () => {
        let errs = {};
        if (!formData.firstName) errs.firstName = "Required";
        if (!formData.email) errs.email = "Required";
        if (formData.password.length < 6) errs.password = "Min 6 chars";
        if (formData.password !== formData.confirmPassword) errs.confirmPassword = "Mismatch";
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    // STEP 1: Signup Request
    const handleSignupRequest = async (e) => {
        e.preventDefault();
        if (!validateForm()) return;

        setLoading(true);
        try {
            const payload = {
                name: `${formData.firstName} ${formData.lastName}`.trim(),
                phone: formData.mobile,
                email: formData.email,
                password: formData.password,
                role: userType,
                department: userType === 'admin' ? formData.department : null,
                address: userType === 'citizen' ? address : null,
                city: userType === 'citizen' ? city : null
            };

            const response = await fetch(`${API_BASE_URL}/api/auth/signup-request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (!response.ok) {
                console.error("Signup Request Error Response:", data);
                throw new Error(data.error || "Request failed");
            }

            setOtpStep(true);
            setTimer(60); // Reset timer when OTP screen opens
            setCanResend(false);
            toast.success("Verification code sent to your email!");

        } catch (error) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    // STEP 2: Signup Verify
    const handleSignupVerify = async (e) => {
        e.preventDefault();
        if (otp.length !== 6) return toast.error("Enter 6-digit code");

        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/signup-verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: formData.email, otp })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Verification failed");

            localStorage.setItem('token', data.token);

            const role = data.user?.role || userType;
            setJwtUser(data.user, role);

            toast.success("Account created successfully!");
            setTimeout(() => {
                navigate(role === 'admin' ? '/admin/dashboard' : '/civic/dashboard', { replace: true });
            }, 50);

        } catch (error) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    // 🚀 STEP 3: Resend OTP Handler
    const handleResendOTP = async () => {
        try {
            setResendLoading(true);
            const response = await fetch(`${API_BASE_URL}/api/auth/resend-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: formData.email })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Failed to resend");

            toast.success("New OTP sent to your email!");
            setTimer(60);
            setCanResend(false);
            setOtp('');
        } catch (error) {
            toast.error(error.message);
        } finally {
            setResendLoading(false);
        }
    };

    const handleLocation = () => {
        if (!navigator.geolocation) { toast.error('Geolocation not supported'); return; }
        setLocationLoading(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`)
                    .then(r => r.json()).then(d => { setAddress(d.display_name); setLocationLoading(false); })
                    .catch(() => setLocationLoading(false));
            },
            () => { toast.error('Location access denied'); setLocationLoading(false); }
        );
    };

    return (
        <div className="min-h-screen flex flex-col bg-white dark:bg-[#0f172a] transition-colors duration-300">
            <Navbar />
            <div className="flex-grow flex w-full overflow-hidden">
                {/* Visuals Left Side */}
                <div className="hidden lg:flex w-1/2 relative flex-col justify-start pt-32 px-12 pb-12 text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-colors">
                    <div className="absolute inset-0 z-0">
                        <img src="https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?q=80&w=2144&auto=format&fit=crop" className="h-full w-full object-cover opacity-20 dark:opacity-40 mix-blend-overlay" alt="city" />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-100/80 via-white/50 to-slate-200/50 dark:from-[#0f172a] dark:via-[#0f172a]/80 dark:to-slate-900/90"></div>
                    </div>
                    <div className="relative z-10 mb-8">
                        <h2 className="text-3xl font-bold mb-6 flex items-center gap-2"><span>नगर</span><span className="font-sans">Alert Hub</span></h2>
                        <h1 className="text-5xl font-bold leading-tight mb-4 text-slate-900 dark:text-white">Join the Movement<br /><span className="text-blue-600 dark:text-blue-400">For Better Cities.</span></h1>
                        <p className="text-slate-600 dark:text-gray-300 text-lg max-w-md">Sign up today to help your local administration build a cleaner city.</p>
                    </div>
                </div>

                {/* Signup Form Right Side */}
                <div className="w-full lg:w-1/2 flex flex-col relative px-6 py-12 lg:p-24 justify-center bg-white dark:bg-[#0f172a] h-full overflow-y-auto transition-colors">
                    <div className="max-w-[440px] w-full mx-auto mt-10 lg:mt-0">

                        {!otpStep ? (
                            <>
                                <div className="text-center mb-8">
                                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-1 flex justify-center items-center gap-2"><span>नगर</span><span>Alert Hub</span></h2>
                                    <p className="text-slate-500 dark:text-gray-400 text-sm">Join as a {userType === 'citizen' ? 'Citizen' : 'Official'}</p>
                                </div>

                                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl mb-8 border border-slate-200 dark:border-slate-700/50">
                                    {['citizen', 'admin'].map(type => (
                                        <button key={type} onClick={() => setUserType(type)} className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${userType === type ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'}`}>
                                            {type === 'citizen' ? 'Citizen Portal' : 'Admin/Official'}
                                        </button>
                                    ))}
                                </div>

                                <form className="space-y-4" onSubmit={handleSignupRequest}>
                                    <div className="flex gap-4">
                                        <div className="w-1/2 space-y-2">
                                            <label className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">First Name</label>
                                            <input type="text" name="firstName" value={formData.firstName} onChange={handleInputChange} className={`block w-full px-4 py-3 border ${errors.firstName ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'} rounded-lg bg-slate-50 dark:bg-slate-800/50 dark:text-white focus:ring-2 focus:ring-blue-500/50 outline-none`} />
                                        </div>
                                        <div className="w-1/2 space-y-2">
                                            <label className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Last Name</label>
                                            <input type="text" name="lastName" value={formData.lastName} onChange={handleInputChange} className="block w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50 dark:text-white focus:ring-2 focus:ring-blue-500/50 outline-none" />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Email Address</label>
                                        <input type="email" name="email" value={formData.email} onChange={handleInputChange} className="block w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50 dark:text-white focus:ring-2 focus:ring-blue-500/50 outline-none" />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Mobile Number</label>
                                        <input type="text" name="mobile" value={formData.mobile} onChange={handleInputChange} placeholder="+91 00000 00000" className="block w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50 dark:text-white focus:ring-2 focus:ring-blue-500/50 outline-none" />
                                    </div>

                                    {userType === 'citizen' ? (
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-end"><label className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Address</label><button type="button" onClick={handleLocation} disabled={locationLoading} className="text-xs text-blue-600 font-medium">{locationLoading ? "Locating..." : "Use Current Location"}</button></div>
                                            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Full Address with City, State" className="block w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50 dark:text-white" />
                                            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="mt-2 block w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50 dark:text-white" />
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Department</label>
                                            <select name="department" value={formData.department} onChange={handleInputChange} className="block w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50 dark:text-white">
                                                <option value="">Select Department</option>
                                                <option value="Police">Police</option>
                                                <option value="Traffic">Traffic</option>
                                                <option value="Fire & Safety">Fire & Safety</option>
                                                <option value="Municipal/Waste">Municipal/Waste</option>
                                                <option value="Public Works">Public Works</option>
                                            </select>
                                        </div>
                                    )}

                                    <div className="flex gap-4">
                                        <div className="w-1/2 space-y-2"><label className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Password</label><input type="password" name="password" value={formData.password} onChange={handleInputChange} className="block w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50 dark:text-white" /></div>
                                        <div className="w-1/2 space-y-2"><label className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Confirm</label><input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleInputChange} className="block w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50 dark:text-white" /></div>
                                    </div>

                                    <button type="submit" disabled={loading} className="w-full mt-4 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all flex justify-center items-center gap-2 shadow-lg shadow-blue-500/20 group">
                                        {loading ? <Loader2 className="animate-spin" /> : (
                                            <>
                                                <span>Sign Up Now</span>
                                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                            </>
                                        )}
                                    </button>
                                </form>

                                <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-700/50 text-center"><p className="text-slate-500 dark:text-gray-400 text-sm">Already a member? <Link to="/login" className="text-blue-600 dark:text-blue-400 font-semibold ml-1">Login</Link></p></div>
                            </>
                        ) : (
                            /* OTP STEP RENDERING */
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 transition-all">
                                <div className="text-center mb-10">
                                    <div className="w-20 h-20 bg-blue-100 dark:bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-blue-200 dark:border-blue-500/20 shadow-inner">
                                        <Mail className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">Email Verification</h2>
                                    <p className="text-slate-500 dark:text-gray-400 text-sm leading-relaxed px-4">
                                        A 6-digit verification code has been sent to <br />
                                        <span className="font-bold text-slate-800 dark:text-slate-200">{formData.email}</span>
                                    </p>
                                </div>

                                <form className="space-y-8" onSubmit={handleSignupVerify}>
                                    <div className="flex justify-center flex-col items-center gap-4">
                                        <label className="text-xs font-bold text-slate-400 dark:text-gray-500 uppercase tracking-widest">Enter Verification Code</label>
                                        <input
                                            type="text"
                                            maxLength={6}
                                            value={otp}
                                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                                            placeholder="000 000"
                                            className="w-full max-w-[280px] bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-200 dark:border-slate-800 text-center text-4xl font-bold tracking-[0.4em] py-5 rounded-2xl text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none transition-all placeholder:text-slate-200 dark:placeholder:slate-800 shadow-lg"
                                        />
                                    </div>

                                    <div className="space-y-4 pt-4">
                                        <button type="submit" disabled={loading || otp.length < 6} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 transition-all flex justify-center items-center gap-2 group disabled:opacity-50">
                                            {loading ? <Loader2 className="animate-spin" /> : (
                                                <>
                                                    <span>Verify & Complete Signup</span>
                                                    <ShieldCheck className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                                </>
                                            )}
                                        </button>

                                        {/* 🚀 RESEND OTP UI BLOCK */}
                                        <div className="text-center pt-2">
                                            {canResend ? (
                                                <button
                                                    type="button"
                                                    onClick={handleResendOTP}
                                                    disabled={resendLoading}
                                                    className="text-sm font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50 transition-colors"
                                                >
                                                    {resendLoading ? "Sending..." : "Resend OTP"}
                                                </button>
                                            ) : (
                                                <p className="text-sm text-slate-500 dark:text-gray-400">
                                                    Didn't receive code? Resend in <span className="font-bold text-red-500">{timer}s</span>
                                                </p>
                                            )}
                                        </div>

                                        <div className="text-center pt-2">
                                            <button
                                                type="button"
                                                onClick={() => setOtpStep(false)}
                                                className="text-sm font-medium text-slate-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center justify-center gap-2 mx-auto"
                                            >
                                                <Lock className="w-3.5 h-3.5" />
                                                Edit details or change email
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        )}

                    </div>
                </div>
            </div>
            <Footer />
        </div>
    );
}