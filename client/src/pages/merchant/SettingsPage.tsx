import React, { useEffect, useState, useRef } from "react";
import { api } from "../../config/api";
import { useAuth, type Store } from "../../context/AuthContext";
import { MerchantLayout } from "../../components/MerchantLayout";
import toast from "react-hot-toast";
import { StoreBrandingForm } from "../../components/merchant/settings/StoreBrandingForm";
import { StoreShippingForm } from "../../components/merchant/settings/StoreShippingForm";
import { Spinner } from "../../components/common/Spinner";
import { StoreHeroStyleSelector, type HeroStyleType } from "../../components/merchant/settings/StoreHeroStyleSelector";
import { StoreAccentColorSelector } from "../../components/merchant/settings/StoreAccentColorSelector";

export const SettingsPage: React.FC = () => {
    // store 从 useAuth 拿来填表单；保存用 PUT /api/stores/me，后端靠 token 找店
    const { store, setStore } = useAuth();

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [currency, setCurrency] = useState("USD");
    const [logoUrl, setLogoUrl] = useState("");
    const [bannerUrl, setBannerUrl] = useState("");
    const [shippingFee, setShippingFee] = useState("0");
    const [freeShippingThreshold, setFreeShippingThreshold] = useState("0");
    const [heroStyle, setHeroStyle] = useState<HeroStyleType>("hero1");
    const [accentColor, setAccentColor] = useState("#557385");

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadingBanner, setUploadingBanner] = useState(false);

    const accentColorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (accentColorTimeoutRef.current) {
                clearTimeout(accentColorTimeoutRef.current);
            }
        };
    }, []);

    // 只在 store 第一次拿到（或换了一家店）时填表单。
    // 依赖不能写 [store]：保存 hero / 颜色后 setStore 会更新 store，那样会把还没保存的输入框内容冲掉
    useEffect(() => {
        if (!store) {
            setLoading(false);
            return;
        }
        setName(store.name || "");
        setDescription(store.description || "");
        setCurrency(store.currency || "USD");
        setLogoUrl(store.logo_url || "");
        setBannerUrl(store.banner_url || "");
        setShippingFee(store.shipping_fee?.toString() || "0");
        setFreeShippingThreshold(store.free_shipping_threshold?.toString() || "0");
        setHeroStyle((store.hero_style as HeroStyleType) || "hero1");
        setAccentColor(store.accent_color || "#ff9500");
        setLoading(false);
    }, [store?.id]);

    // PUT /api/stores/me：只发要改的字段，成功后把后端返回的 store 放回 useAuth
    const saveSettings = async (fields: Record<string, unknown>, successMessage: string): Promise<boolean> => {
        try {
            const { data } = await api.put("/api/stores/me", fields);
            if (data.success) {
                setStore(data.store as Store);
                toast.success(successMessage);
                return true;
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to update store settings");
        }
        return false;
    };

    // 选完图片 → 上传到 /api/upload/single → 拿到 URL 放进表单（点 Save 才写进 store）
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: "logo" | "banner") => {
        const file = e.target.files?.[0];
        if (!file) return;
        const setUploading = field === "logo" ? setUploadingLogo : setUploadingBanner;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append("image", file);   // 字段名要和 upload.single("image") 对应
            const { data } = await api.post("/api/upload/single", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            if (data.success) {
                if (field === "logo") setLogoUrl(data.url);
                else setBannerUrl(data.url);
                toast.success("Image uploaded! Click Save to apply.");
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Image upload failed");
        } finally {
            setUploading(false);
            e.target.value = "";   // 同一张图再选一次也能触发 onChange
        }
    };

    // hero / 颜色是"点了就存"，单独发一个只含这个字段的 PUT
    const handleHeroStyleChange = async (newStyle: HeroStyleType) => {
        const previous = heroStyle;
        setHeroStyle(newStyle);
        const ok = await saveSettings({ hero_style: newStyle }, "Hero layout saved!");
        if (!ok) setHeroStyle(previous);
    };

    const handleAccentColorChange = (newColor: string) => {
        setAccentColor(newColor);
        // 拖动取色器会连续触发，停 350ms 后才真正保存
        if (accentColorTimeoutRef.current) {
            clearTimeout(accentColorTimeoutRef.current);
        }
        accentColorTimeoutRef.current = setTimeout(() => {
            saveSettings({ accent_color: newColor }, "Accent color saved!");
        }, 350);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            toast.error("Store name is required");
            return;
        }
        setSaving(true);
        await saveSettings(
            {
                name: name.trim(),
                description: description.trim(),
                currency,
                logo_url: logoUrl,
                banner_url: bannerUrl,
                shipping_fee: Number(shippingFee) || 0,
                free_shipping_threshold: Number(freeShippingThreshold) || 0,
                hero_style: heroStyle,
                accent_color: accentColor,
            },
            "Store settings updated successfully!",
        );
        setSaving(false);
    };

    if (loading) {
        return (
            <MerchantLayout>
                <Spinner padded />
            </MerchantLayout>
        );
    }

    if (!store) {
        return (
            <MerchantLayout>
                <p className="mt-10 text-xs text-slate-400 font-mono">No store found for this account.</p>
            </MerchantLayout>
        );
    }

    return (
        <MerchantLayout>
            <div className="space-y-6 max-w-4xl font-sans">
                <h1 className="text-xl sm:text-2xl text-slate-900 mt-10">Store Settings</h1>

                <form onSubmit={handleSave} className="space-y-6">
                    {/* Hero Style Selection */}
                    <div className="p-6 bg-white border border-slate-200/90 rounded-3xl shadow-xs">
                        <StoreHeroStyleSelector value={heroStyle} onChange={handleHeroStyleChange} />
                    </div>

                    {/* Brand Accent Color Selection */}
                    <div className="p-6 bg-white border border-slate-200/90 rounded-3xl shadow-xs">
                        <StoreAccentColorSelector value={accentColor} onChange={handleAccentColorChange} />
                    </div>

                    {/* Branding Info */}
                    <StoreBrandingForm
                        name={name}
                        onNameChange={setName}
                        description={description}
                        onDescriptionChange={setDescription}
                        logoUrl={logoUrl}
                        onLogoUrlChange={setLogoUrl}
                        bannerUrl={bannerUrl}
                        onBannerUrlChange={setBannerUrl}
                        onFileUpload={handleFileUpload}
                        uploadingLogo={uploadingLogo}
                        uploadingBanner={uploadingBanner}
                    />

                    {/* Shipping Configuration */}
                    <StoreShippingForm
                        shippingFee={shippingFee}
                        onShippingFeeChange={setShippingFee}
                        freeShippingThreshold={freeShippingThreshold}
                        onFreeShippingThresholdChange={setFreeShippingThreshold}
                    />

                    <button
                        type="submit"
                        disabled={saving}
                        className="py-3 px-7 text-white bg-zhuyue-600 text-xs font-semibold rounded-full transition disabled:opacity-50 cursor-pointer shadow-xs active:scale-[0.98]"
                    >
                        {saving ? "Saving Changes..." : "Save Store Settings"}
                    </button>
                </form>
            </div>
        </MerchantLayout>
    );
};
