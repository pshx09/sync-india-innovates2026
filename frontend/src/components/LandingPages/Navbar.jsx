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
        <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#0b1224]/80 dark:bg-slate-950/80 border-b border-white/10">
            <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">

                {/* Logo */}
                <Link to="/" className="flex items-center gap-3">
                    <img
                        src={logo}
                        alt="नगर Alert Hub Logo"
                        className="w-11 h-11 rounded-full object-cover"
                    />
                    <div>
                        <h1 className="font-bold text-lg text-white leading-tight">
                            नगर Alert Hub
                        </h1>
                        <span className="text-xs text-white/70">
                            Civic Intelligence Platform
                        </span>
                    </div>
                </Link>

                {/* Desktop Nav */}
                {!isDashboard && (
                    <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/80">
                        <Link to="/" className="hover:text-white">Home</Link>
                        <a onClick={(e) => handleNavigation(e, 'features')} className="cursor-pointer hover:text-white">Features</a>
                        <a onClick={(e) => handleNavigation(e, 'whatsapp')} className="cursor-pointer hover:text-white">WhatsApp</a>
                        <a onClick={(e) => handleNavigation(e, 'about')} className="cursor-pointer hover:text-white">About</a>
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

                {/* Mobile Button */}
                <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="md:hidden p-2 rounded-lg bg-white/10 text-white"
                >
                    {isMenuOpen ? '✕' : '☰'}
                </button>
            </div>

            {/* Mobile Menu */}
            <div className={`md:hidden fixed inset-0 bg-[#0b1224] text-white transition-transform duration-300 ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="pt-24 px-6 flex flex-col gap-6 text-lg">

                    <Link to="/" onClick={() => setIsMenuOpen(false)}>Home</Link>
                    <a onClick={(e) => { handleNavigation(e, 'features'); setIsMenuOpen(false); }}>Features</a>
                    <a onClick={(e) => { handleNavigation(e, 'whatsapp'); setIsMenuOpen(false); }}>WhatsApp</a>
                    <a onClick={(e) => { handleNavigation(e, 'about'); setIsMenuOpen(false); }}>About</a>

                    <button
                        onClick={toggleTheme}
                        className="mt-6 py-3 rounded-xl bg-white/10"
                    >
                        Switch Theme
                    </button>

                    {!isAuthPage && !isDashboard && (
                        <Link
                            to="/report"
                            onClick={() => setIsMenuOpen(false)}
                            className="py-3 rounded-xl bg-orange-500 text-center font-bold"
                        >
                            Report Issue
                        </Link>
                    )}

                    {!isAuthPage && !isDashboard && (
                        <Link
                            to="/login"
                            onClick={() => setIsMenuOpen(false)}
                            className="py-3 rounded-xl border border-white/20 text-center"
                        >
                            Login
                        </Link>
                    )}
                </div>
            </div>
        </nav>
    );
}