import React from 'react';
import vidBg from '../../assets/vidbg.mp4';

export default function Hero() {
    // Apni WhatsApp API Link yahan set karein
    // Format: 91 aur apka 10 digit number (bina + ya space ke)
    const myWhatsAppNumber = "919399600477"; // Example number
    const defaultMessage = encodeURIComponent("Hi Nagar Alert Hub! I want to report a civic issue in my area.");
    const whatsappLink = `https://wa.me/${myWhatsAppNumber}?text=${defaultMessage}`;

    return (
        <section
            id="home"
            className="relative overflow-hidden transition-colors"
        >
            {/* BACKGROUND VIDEO */}
            <video
                className="absolute inset-0 w-full h-full object-cover"
                autoPlay
                muted
                loop
                playsInline
            >
                <source src={vidBg} type="video/mp4" />
            </video>

            {/* IMAGE FADE OVERLAY (IMPORTANT) */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/80 via-white/70 to-white/70 dark:from-slate-950/90 dark:via-slate-950/85 dark:to-slate-950/95" />

            {/* SOFT COLOR GLOW */}
            <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-blue-300/30 dark:bg-blue-900/20 rounded-full blur-3xl -z-10" />

            {/* CONTENT */}
            <div className="relative z-10 max-w-7xl mx-auto px-6 pt-28 pb-40 text-center">

                {/* Badge - Pulsing effect added */}
                <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white/90 dark:bg-slate-800/90 backdrop-blur border border-slate-200 dark:border-slate-700 shadow-[0_4px_20px_rgba(0,0,0,0.05)] mb-8 transform hover:scale-105 transition duration-300 cursor-default">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-[pulse_1.5s_ease-in-out_infinite]"></span>
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 tracking-wide">
                        National Civic Tech Initiative
                    </span>
                </div>

                {/* Heading - Drop shadow for better readability */}
                <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.1] mb-6 drop-shadow-sm">
                    Empowering Citizens.
                    <br />
                    <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent drop-shadow-md">
                        Transforming Cities.
                    </span>
                </h1>

                {/* Subtext */}
                <p className="text-xl md:text-2xl text-slate-700 dark:text-slate-300 font-medium mb-10 max-w-3xl mx-auto">
                    Real-time civic issue reporting — powered by WhatsApp & AI.
                </p>

                {/* Value Pills - Hover effects added */}
                <div className="flex flex-wrap justify-center gap-6 mb-14 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    <div className="px-5 py-2.5 bg-white/90 dark:bg-slate-800/90 backdrop-blur rounded-full border shadow-sm hover:shadow-md hover:-translate-y-1 transition duration-300">
                        📱 No App Required
                    </div>
                    <div className="px-5 py-2.5 bg-white/90 dark:bg-slate-800/90 backdrop-blur rounded-full border shadow-sm hover:shadow-md hover:-translate-y-1 transition duration-300">
                        ⚡ Report in 30 Seconds
                    </div>
                    <div className="px-5 py-2.5 bg-white/90 dark:bg-slate-800/90 backdrop-blur rounded-full border shadow-sm hover:shadow-md hover:-translate-y-1 transition duration-300">
                        🧠 AI-Verified Alerts
                    </div>
                </div>

                {/* CTA */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
                    {/* THE MAGIC REDIRECT BUTTON */}
                    <a
                        href={whatsappLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-[#25D366] to-[#128C7E] text-white font-bold text-lg shadow-[0_10px_25px_rgba(37,211,102,0.4)] hover:shadow-[0_15px_35px_rgba(37,211,102,0.6)] transform hover:-translate-y-1 transition-all duration-300"
                    >
                        {/* Custom WhatsApp Icon */}
                        <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                        </svg>
                        Try on WhatsApp
                    </a>

                    <a
                        href="#features"
                        className="px-8 py-4 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-900/70 backdrop-blur text-slate-800 dark:text-slate-200 font-bold hover:bg-white dark:hover:bg-slate-800 transform hover:-translate-y-1 transition-all duration-300 shadow-md hover:shadow-lg"
                    >
                        Learn How It Works
                    </a>
                </div>
            </div>
        </section>
    );
}