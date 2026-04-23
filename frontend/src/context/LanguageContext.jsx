// src/context/LanguageContext.jsx
import React, { createContext, useState, useContext } from 'react';
import { translations } from '../utils/translations';

const LanguageContext = createContext();

// 👇 DHYAN DEIN: Yahan 'export' likha hona bohot zaroori hai
export const LanguageProvider = ({ children }) => {
    // Default language English
    const [lang, setLang] = useState('en');

    // Translation helper function
    const t = (key) => {
        return translations[lang][key] || key;
    };

    const toggleLanguage = () => {
        setLang((prev) => (prev === 'en' ? 'hi' : 'en'));
    };

    return (
        <LanguageContext.Provider value={{ lang, toggleLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

// Custom hook
export const useLanguage = () => useContext(LanguageContext);