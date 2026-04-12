import React from 'react';

export default function WhatsAppIntegration() {
    // Apni WhatsApp API Link yahan set karein
    const myWhatsAppNumber = "919399600477"; // Example number
    const defaultMessage = encodeURIComponent("Hi Nagar Helper! Show me how this demo works.");
    const whatsappLink = `https://wa.me/${myWhatsAppNumber}?text=${defaultMessage}`;

    return (
        <section
            id="whatsapp"
            className="relative py-24 bg-slate-50 dark:bg-slate-950 transition-colors overflow-hidden"
        >
            {/* Soft background glow */}
            <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[400px] bg-green-300/20 dark:bg-green-900/20 rounded-full blur-3xl"></div>

            <div className="relative max-w-7xl mx-auto px-6">
                <div className="grid lg:grid-cols-2 gap-16 items-center">

                    {/* LEFT CONTENT */}
                    <div>
                        {/* Badge */}
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm font-semibold shadow-sm cursor-default">
                            💬 WhatsApp First Experience
                        </div>

                        {/* Heading */}
                        <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white leading-tight mb-6">
                            Report City Issues
                            <br />
                            <span className="text-green-600 dark:text-green-400">
                                Just Like Chatting.
                            </span>
                        </h2>

                        {/* Subtext */}
                        <p className="text-lg text-slate-600 dark:text-slate-400 max-w-xl mb-10">
                            No apps. No paperwork. Our AI-powered WhatsApp assistant
                            helps you report civic issues in under 30 seconds.
                        </p>

                        {/* Visual Feature List */}
                        <div className="grid sm:grid-cols-2 gap-5 mb-12">
                            {[
                                {
                                    emoji: "📱",
                                    title: "No App Required",
                                    desc: "Works directly on WhatsApp"
                                },
                                {
                                    emoji: "📍",
                                    title: "Location & Photo",
                                    desc: "Share instantly in chat"
                                },
                                {
                                    emoji: "🧠",
                                    title: "AI Verification",
                                    desc: "Smart duplicate detection"
                                },
                                {
                                    emoji: "🔔",
                                    title: "Live Updates",
                                    desc: "Status in your chat window"
                                }
                            ].map((item, i) => (
                                <div
                                    key={i}
                                    className="flex items-start gap-4 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-300 transform hover:-translate-y-1 hover:shadow-md hover:border-green-300 dark:hover:border-green-700 cursor-default"
                                >
                                    <div className="text-2xl">{item.emoji}</div>
                                    <div>
                                        <h4 className="font-bold text-slate-900 dark:text-white">
                                            {item.title}
                                        </h4>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">
                                            {item.desc}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* CTA */}
                        <a
                            href={whatsappLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-gradient-to-r from-[#25D366] to-[#128C7E] text-white font-bold shadow-[0_10px_25px_rgba(37,211,102,0.3)] hover:shadow-[0_15px_35px_rgba(37,211,102,0.5)] transform hover:-translate-y-1 transition-all duration-300"
                        >
                            {/* Custom WhatsApp Icon */}
                            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                            </svg>
                            Try Demo on WhatsApp
                        </a>
                    </div>

                    {/* RIGHT PHONE MOCKUP */}
                    <div className="relative flex justify-center perspective-1000">
                        {/* Background glowing orb behind the phone */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-green-300/40 to-blue-300/40 blur-3xl rounded-full animate-[pulse_4s_ease-in-out_infinite]"></div>

                        {/* Phone Container with Hover Floating Effect */}
                        <div className="relative w-[300px] h-[600px] rounded-[2.5rem] border-[14px] border-slate-900 bg-slate-900 shadow-2xl overflow-hidden transform transition-all duration-700 ease-out hover:-translate-y-4 hover:shadow-[0_25px_50px_rgba(34,197,94,0.25)]">
                            {/* Header */}
                            <div className="absolute top-0 left-0 right-0 h-16 bg-[#075E54] flex items-center px-4 text-white z-10 shadow-md">
                                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center font-bold text-xs">
                                    NH
                                </div>
                                <div className="ml-3">
                                    <div className="text-sm font-semibold">
                                        Nagar Helper
                                    </div>
                                    <div className="text-[10px] opacity-80">
                                        Online
                                    </div>
                                </div>
                            </div>

                            {/* Chat */}
                            <div className="pt-20 px-4 space-y-4 text-[13px] bg-[#ECE5DD] h-full bg-[url('https://i.pinimg.com/originals/8f/ba/cb/8fbacbd464e996966eb9d4a6b7a9c21e.jpg')] bg-cover bg-center bg-blend-soft-light">
                                <div className="max-w-[85%] bg-white p-3 rounded-lg shadow-sm border border-slate-100">
                                    Hello 👋 Welcome to Nagar Alert Hub.
                                    <div className="text-[10px] text-right text-gray-400 mt-1">
                                        10:00 AM
                                    </div>
                                </div>

                                <div className="ml-auto max-w-[85%] bg-[#DCF8C6] p-3 rounded-lg shadow-sm border border-green-100">
                                    There’s a broken streetlight on Main Road.
                                    <div className="text-[10px] text-right text-gray-500 mt-1">
                                        10:01 AM
                                    </div>
                                </div>

                                <div className="max-w-[85%] bg-white p-3 rounded-lg shadow-sm border border-slate-100">
                                    Thanks! Please share a photo or location 📸📍
                                    <div className="text-[10px] text-right text-gray-400 mt-1">
                                        10:01 AM
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </section>
    );
}