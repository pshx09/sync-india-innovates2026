import React from 'react';
import { Camera, Send, MapPin, Check, MessageCircle } from 'lucide-react';
import CivicLayout from './CivicLayout';

const WhatsAppGuide = () => {
    return (
        <CivicLayout>
            <div className="min-h-[calc(100vh-100px)] flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 bg-slate-50 dark:bg-slate-900">
                <div className="max-w-4xl w-full space-y-12">
                    
                    {/* Header */}
                    <div className="text-center mt-10">
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400 rounded-full text-sm font-bold uppercase tracking-wider mb-6 border border-green-200 dark:border-green-800">
                            <MessageCircle size={18} /> Official WhatsApp Bot
                        </div>
                        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-6">
                            Report Issues via <span className="text-[#25D366]">WhatsApp</span>
                        </h1>
                        <p className="text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed">
                            No need to download our app. Report potholes, garbage, or accidents directly through our intelligent Nagar Alert Chatbot.
                        </p>
                    </div>

                    {/* How It Works Steps */}
                    <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 sm:p-12 mb-20 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/5 rounded-full blur-3xl -mr-32 -mt-32"></div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-10 text-center relative z-10">How It Works</h2>
                        
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative z-10">
                            <StepItem 
                                icon={<Send className="text-blue-500" size={32} />} 
                                title="1. Start Chat" 
                                desc="Send 'Hi Nagar Alert' to our official number to initiate the conversation." 
                            />
                            <StepItem 
                                icon={<Camera className="text-purple-500" size={32} />} 
                                title="2. Send Photo" 
                                desc="Take a clear picture of the civic issue and send it in the chat." 
                            />
                            <StepItem 
                                icon={<MapPin className="text-orange-500" size={32} />} 
                                title="3. Share Location" 
                                desc="Use WhatsApp's location sharing to pinpoint the exact area." 
                            />
                            <StepItem 
                                icon={<Check className="text-green-500" size={32} />} 
                                title="4. Get Updates" 
                                desc="Receive instant status updates as authorities resolve your ticket." 
                            />
                        </div>

                        {/* Highly Visible CTA */}
                        <div className="mt-16 flex flex-col items-center relative z-10 pb-8">
                            <a
                                href="https://wa.me/1234567890?text=Hi%20Nagar%20Alert"
                                target="_blank"
                                rel="noreferrer"
                                className="px-10 py-5 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-2xl font-bold text-xl shadow-xl shadow-green-500/30 flex items-center gap-4 transition-all transform hover:-translate-y-1"
                            >
                                <MessageCircle size={28} className="fill-current" /> 
                                Chat on WhatsApp
                            </a>
                            <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">Save our number: <strong>+91 &lt;BOT_PHONE_NUMBER&gt;</strong></p>
                        </div>
                    </div>

                </div>
            </div>
        </CivicLayout>
    );
};

const StepItem = ({ icon, title, desc }) => (
    <div className="flex flex-col items-center text-center space-y-4">
        <div className="w-16 h-16 bg-slate-50 dark:bg-slate-900 rounded-2xl flex items-center justify-center shadow-inner border border-slate-100 dark:border-slate-800">
            {icon}
        </div>
        <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</p>
        </div>
    </div>
);

export default WhatsAppGuide;
