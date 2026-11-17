import React, { useEffect, useState } from "react";
import { api } from "../../config/api";
import { Navbar } from "../../components/Navbar";
import { LandingHero } from "../../components/public/landing/LandingHero";
import { LandingFeatures } from "../../components/public/landing/LandingFeatures";
import { LandingStoreShowcase } from "../../components/public/landing/LandingStoreShowcase";
import { LandingFaq } from "../../components/public/landing/LandingFaq";
import { LandingCta } from "../../components/public/landing/LandingCta";
import { LandingFooter } from "../../components/public/landing/LandingFooter";

export const LandingPage: React.FC = () => {
    // 只用真实数据：一开始是空的，拿到之前 / 没有店时 LandingStoreShowcase 会直接不显示
    const [stores, setStores] = useState<any[]>([]);

    useEffect(() => {
        // public 接口，不需要登录；api.ts 会把它转到 Neon Function（只返回 active 的店，最多 12 家）
        api.get("/api/stores/public/featured")
            .then(({ data }) => {
                if (data.success) setStores(data.stores);
            })
            .catch((err) => console.error("Failed to load featured stores:", err));
    }, []);

    return (
        <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans">
            <Navbar />
            <LandingHero />
            <LandingFeatures />
            <LandingStoreShowcase stores={stores} />
            <LandingFaq />
            <LandingCta />
            <LandingFooter />
        </div>
    );
};
