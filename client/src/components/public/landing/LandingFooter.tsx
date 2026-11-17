import React from "react";
import { Link } from "react-router-dom";

export const LandingFooter: React.FC = () => {
    return (
        <footer className="bg-creampink-50/60 border-t border-slate-200/80 py-12 text-xs text-slate-600 font-sans">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
                {/* Logo & Philosophy */}
                <Link to="/" className="flex items-center gap-2 text-2xl text-slate-950 font-normal hover:opacity-80 transition">
                    <img src="/logo.svg" alt="logo" className="h-6.5" />
                    <span className="font-serif italic text-xl">Shoppingo</span>
                </Link>

                {/* Navigation Links */}
                <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-500 font-medium">
                    <Link to="#" className="hover:text-slate-950 transition">
                        Platform Admin
                    </Link>
                    <Link to="#" className="hover:text-slate-950 transition">
                        Terms of Service
                    </Link>
                    <Link to="#" className="hover:text-slate-950 transition">
                        Privacy Policy
                    </Link>
                </div>
            </div>
        </footer>
    );
};
