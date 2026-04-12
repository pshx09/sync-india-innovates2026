import React from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import logo from '../../assets/logo.jpeg';

export default function Navbar() {
    const location = useLocation();
    const navigate = useNavigate();

    const handleNavigation = (e, targetId) => {
        e.preventDefault();
        if (location.pathname === '/') {
            document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth' });
        } else {
            navigate(`/#${targetId}`);
        }
    };

    const [isDarkMode, setIsDarkMode] = React.useState(false);
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);

    React.useEffect(() => {
        const dark =
            localStorage.theme === 'dark' ||
            (!('theme' in localStorage) &&
                window.matchMedia('(prefers-color-scheme: dark)').matches);

        document.documentElement.classList.toggle('dark', dark);
        setIsDarkMode(dark);
    }, []);

    const toggleTheme = () => {
        const newMode = !isDarkMode;
        document.documentElement.classList.toggle('dark', newMode);
        localStorage.theme = newMode ? 'dark' : 'light';
        setIsDarkMode(newMode);
    };

    const isDashboard = location.pathname === '/dashboard';
    const isAuthPage = ['/login', '/signup', '/register', '/forgot-password']
        .some(p => location.pathname.startsWith(p));

    return (
        <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#0b1224]/90 dark:bg-slate-950/90 border-b border-white/10">
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between">

                {/* Logo */}
                <Link to="/" className="flex items-center gap-3 z-50">
                    <img
                        src={logo}
                        alt="नगर Alert Hub Logo"
                        className="w-10 h-10 md:w-11 md:h-11 rounded-full object-cover"
                    />
                    <div>
                        <h1 className="font-bold text-base md:text-lg text-white leading-tight">
                            नगर Alert Hub
                        </h1>
                        <span className="text-[10px] md:text-xs text-white/70">
                            Civic Intelligence Platform
                        </span>
                    </div>
                </Link>

                {/* Desktop Nav */}
                {!isDashboard && (
                    <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/80">
                        <Link to="/" className="hover:text-white transition">Home</Link>
                        <a onClick={(e) => handleNavigation(e, 'features')} className="cursor-pointer hover:text-white transition">Features</a>
                        <a onClick={(e) => handleNavigation(e, 'whatsapp')} className="cursor-pointer hover:text-white transition">WhatsApp</a>
                        <a onClick={(e) => handleNavigation(e, 'about')} className="cursor-pointer hover:text-white transition">About</a>
                    </div>
                )}

                {/* Desktop Actions */}
                <div className="hidden md:flex items-center gap-4">
                    {/* Theme Toggle */}
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition"
                        title="Toggle Theme"
                    >
                        {isDarkMode ? '🌞' : '🌙'}
                    </button>

                    {!isDashboard && !isAuthPage && (
                        <Link
                            to="/report"
                            className="px-5 py-2 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold shadow-lg hover:shadow-orange-500/30 transition"
                        >
                            Report Issue
                        </Link>
                    )}

                    {!isDashboard && !isAuthPage && (
                        <Link
                            to="/login"
                            className="px-5 py-2 rounded-lg border border-white/20 text-white hover:bg-white/10 transition"
                        >
                            Login
                        </Link>
                    )}

                    {isDashboard && (
                        <Link
                            to="/"
                            className="px-5 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white transition"
                        >
                            Logout
                        </Link>
                    )}
                </div>

                {/* Mobile Button (Hamburger/Close) */}
                <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="md:hidden p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition z-50"
                >
                    {/* SVG Icon for better look than raw text */}
                    {isMenuOpen ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    ) : (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                    )}
                </button>
            </div>

            {/* 📱 MOBILE MENU (FIXED RESPONSIVENESS) 📱 */}
            {/* Using absolute drop-down instead of fixed inset-0 to avoid CSS blur trap */}
            <div
                className={`md:hidden absolute top-full left-0 w-full bg-[#0b1224] dark:bg-slate-950 shadow-2xl transition-all duration-300 overflow-hidden ${isMenuOpen ? 'max-h-[600px] border-b border-white/10 opacity-100' : 'max-h-0 opacity-0'
                    }`}
            >
                <div className="px-6 py-8 flex flex-col gap-5 text-base font-medium text-white">
                    <Link to="/" onClick={() => setIsMenuOpen(false)} className="hover:text-orange-400">Home</Link>
                    <a onClick={(e) => { handleNavigation(e, 'features'); setIsMenuOpen(false); }} className="cursor-pointer hover:text-orange-400">Features</a>
                    <a onClick={(e) => { handleNavigation(e, 'whatsapp'); setIsMenuOpen(false); }} className="cursor-pointer hover:text-orange-400">WhatsApp</a>
                    <a onClick={(e) => { handleNavigation(e, 'about'); setIsMenuOpen(false); }} className="cursor-pointer hover:text-orange-400">About</a>

                    <div className="h-px bg-white/10 my-2"></div> {/* Divider */}

                    <button
                        onClick={() => { toggleTheme(); setIsMenuOpen(false); }}
                        className="py-3 rounded-xl bg-white/5 border border-white/10 flex justify-center items-center gap-2"
                    >
                        {isDarkMode ? '🌞 Switch to Light Mode' : '🌙 Switch to Dark Mode'}
                    </button>

                    {!isAuthPage && !isDashboard && (
                        <Link
                            to="/report"
                            onClick={() => setIsMenuOpen(false)}
                            className="py-3 mt-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-center font-bold text-white shadow-lg"
                        >
                            Report Issue
                        </Link>
                    )}

                    {!isAuthPage && !isDashboard && (
                        <Link
                            to="/login"
                            onClick={() => setIsMenuOpen(false)}
                            className="py-3 rounded-xl border border-white/20 text-center hover:bg-white/5"
                        >
                            Login
                        </Link>
                    )}
                </div>
            </div>
        </nav>
    );
}