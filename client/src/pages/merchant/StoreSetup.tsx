import React, { useState } from "react";
import { useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { useAuth, type Store as StoreType } from "../../context/AuthContext";
import { Store, ArrowRight, Upload, X } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../../config/api";

// ---------- helpers ----------

// 把店名转成 URL slug："Bob's Café" -> "bob-s-cafe"
// 规则和 server/controllers/storeController.ts 的 generateSlug 一致（多了去重音和长度上限）
const slugify = (value: string) =>
    value
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "") // 去掉重音符号："Café" -> "Cafe"
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);

// "nordic-ceramics" -> "Nordic Ceramics"（从 ?slug= 预填店名时用）
const slugToTitle = (value: string) => value.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// 后端 storeRoutes 里 GET /me 在 GET /:slug 前面，所以 "me" 不能当 slug
const RESERVED_SLUGS = new Set(["me"]);

// 和 server/middleware/upload.ts 的 limits.fileSize 保持一致
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const CURRENCIES = [
    { code: "USD", symbol: "$" },
    { code: "EUR", symbol: "€" },
    { code: "GBP", symbol: "£" },
    { code: "CAD", symbol: "$" },
    { code: "INR", symbol: "₹" },
];

// 没上传图片时用的默认图
const DEFAULT_LOGO = "/logo_4.svg";
const DEFAULT_BANNER = "/storefront_hero_1.png";

type ImageField = "logo" | "banner";

// axios 报错时优先取后端返回的 message
const getErrorMessage = (err: any, fallback: string): string =>
    err?.response?.data?.message || err?.message || fallback;

// Prisma 的 Decimal 字段（shipping_fee 等）序列化成 JSON 后是字符串，转成 number 再放进 context
const normalizeStore = (raw: any): StoreType => ({
    ...raw,
    shipping_fee: Number(raw.shipping_fee) || 0,
    free_shipping_threshold: Number(raw.free_shipping_threshold) || 0,
});

const inputClass =
    "w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-zhuyue-600 focus:ring-1 focus:ring-zhuyue-600/20 bg-creampink-50/50";
const labelClass = "block text-[11px] font-medium text-slate-700 mb-1.5";

// ---------- component ----------

export const StoreSetup: React.FC = () => {
    const { user, store, setStore, refreshMe, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const initialSlug = slugify(searchParams.get("slug") || "");

    const [name, setName] = useState(initialSlug ? slugToTitle(initialSlug) : "");
    const [slug, setSlug] = useState(initialSlug);
    // 商家手动改过 slug 之后，店名再变也不覆盖它
    const [slugTouched, setSlugTouched] = useState(false);
    const [description, setDescription] = useState("");
    const [currency, setCurrency] = useState("USD");
    const [shippingFee, setShippingFee] = useState("5.00");
    const [freeShippingThreshold, setFreeShippingThreshold] = useState("50.00");
    const [logoUrl, setLogoUrl] = useState("");
    const [bannerUrl, setBannerUrl] = useState("");
    const [uploading, setUploading] = useState<Record<ImageField, boolean>>({ logo: false, banner: false });
    const [submitting, setSubmitting] = useState(false);

    // 所有 hooks 都要在 early return 之前调用
    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white text-slate-400 text-xs font-mono">
                Authenticating...
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/merchant/login" replace />;
    }

    // Admins cannot create stores or become merchants
    if (user.role === "admin") {
        return <Navigate to="/admin" replace />;
    }

    // 一个 merchant 只能有一个 store：已经有了就直接去 dashboard
    if (store) {
        return <Navigate to="/merchant" replace />;
    }

    const currencySymbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? "$";
    const isUploading = uploading.logo || uploading.banner;

    // ---------- handlers ----------

    const handleNameChange = (val: string) => {
        setName(val);
        if (!slugTouched) setSlug(slugify(val));
    };

    const handleSlugChange = (val: string) => {
        // 输入过程中允许末尾的 "-"，提交时再做完整的 slugify
        const cleaned = val.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-{2,}/g, "-");
        setSlug(cleaned);
        // 清空 slug 等于"交还给自动生成"：之后改店名会重新同步；提交时空 slug 会用店名生成
        setSlugTouched(cleaned !== "");
    };

    const setImageUrl = (field: ImageField, url: string) => {
        if (field === "logo") setLogoUrl(url);
        else setBannerUrl(url);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: ImageField) => {
        const input = e.target;
        const file = input.files?.[0];
        if (!file) return;

        // 先在前端拦截，省一次请求
        if (!file.type.startsWith("image/")) {
            toast.error("Please select an image file");
            input.value = "";
            return;
        }
        if (file.size > MAX_IMAGE_SIZE) {
            toast.error("Image must be smaller than 10MB");
            input.value = "";
            return;
        }

        const formData = new FormData();
        formData.append("image", file); // 字段名必须和 upload.single("image") 一致

        setUploading((prev) => ({ ...prev, [field]: true }));
        try {
            // api 默认 Content-Type 是 application/json，这里覆盖成 multipart
            const { data } = await api.post<{ success: boolean; url?: string; message?: string }>(
                "/api/upload/single",
                formData,
                { headers: { "Content-Type": "multipart/form-data" } },
            );
            if (!data.success || !data.url) {
                throw new Error(data.message || "Image upload failed");
            }
            setImageUrl(field, data.url);
            toast.success(`${field === "logo" ? "Logo" : "Banner"} uploaded`);
        } catch (err) {
            toast.error(getErrorMessage(err, "Image upload failed"));
        } finally {
            setUploading((prev) => ({ ...prev, [field]: false }));
            // 清空 input，这样重新选同一张图也能触发 onChange
            input.value = "";
        }
    };

    // 返回错误信息；全部通过返回 null
    const validate = (finalSlug: string): string | null => {
        if (!name.trim()) return "Please enter a store name";
        if (name.trim().length > 255) return "Store name must be 255 characters or fewer";
        if (!finalSlug) return "Please enter a valid store URL slug";
        if (RESERVED_SLUGS.has(finalSlug)) return `"${finalSlug}" is reserved, please choose another slug`;

        const fee = Number(shippingFee);
        const threshold = Number(freeShippingThreshold);
        if (shippingFee !== "" && (!Number.isFinite(fee) || fee < 0)) return "Shipping fee must be 0 or more";
        if (freeShippingThreshold !== "" && (!Number.isFinite(threshold) || threshold < 0)) {
            return "Free shipping threshold must be 0 or more";
        }
        return null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        if (isUploading) {
            toast.error("Please wait for the image upload to finish");
            return;
        }

        const finalSlug = slugify(slug) || slugify(name);
        const error = validate(finalSlug);
        if (error) {
            toast.error(error);
            return;
        }

        setSubmitting(true);
        try {
            // merchant_id 不从前端传：后端从 JWT 里取 req.user.id
            const { data } = await api.post("/api/stores", {
                name: name.trim(),
                slug: finalSlug,
                description: description.trim(),
                currency,
                shipping_fee: shippingFee === "" ? 0 : Number(shippingFee),
                free_shipping_threshold: freeShippingThreshold === "" ? 0 : Number(freeShippingThreshold),
                logo_url: logoUrl.trim() || DEFAULT_LOGO,
                banner_url: bannerUrl.trim() || DEFAULT_BANNER,
                hero_style: "hero1",
                accent_color: "#ff9500",
            });

            if (!data?.success || !data?.store) {
                throw new Error(data?.message || "Failed to create store");
            }

            setStore(normalizeStore(data.store));
            // 后端已经把 role 改成 merchant，刷新一次让 context 里的 user.role 同步
            await refreshMe();
            toast.success("Store created successfully!");
            navigate("/merchant", { replace: true });
        } catch (err: any) {
            const status = err?.response?.status;
            const message = getErrorMessage(err, "Failed to create store");

            // 已经有店了（比如另一个 tab 里刚创建过）：同步状态后去 dashboard
            if (message === "You already have a store") {
                toast.error(message);
                await refreshMe();
                navigate("/merchant", { replace: true });
                return;
            }
            // slug 被占用：让商家改 slug
            if (status === 409) {
                setSlugTouched(true);
                toast.error("This store URL is already taken, please choose another slug");
                return;
            }
            toast.error(message);
        } finally {
            setSubmitting(false);
        }
    };

    // ---------- UI ----------

    const renderImageField = (field: ImageField, label: string, value: string, previewClass: string) => (
        <div>
            <label className={labelClass}>{label}</label>
            <input
                type="url"
                placeholder="https://..."
                value={value}
                onChange={(e) => setImageUrl(field, e.target.value)}
                className={`${inputClass} mb-2`}
            />
            <div className="flex items-center gap-2">
                <label
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-full text-[11px] font-medium text-slate-700 transition ${
                        uploading[field] ? "opacity-60 cursor-wait" : "cursor-pointer"
                    }`}
                >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploading[field] ? "Uploading..." : `Upload ${field === "logo" ? "Logo" : "Banner"}`}</span>
                    <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploading[field]}
                        onChange={(e) => handleFileUpload(e, field)}
                    />
                </label>
                {value && (
                    <button
                        type="button"
                        onClick={() => setImageUrl(field, "")}
                        className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                        <X className="w-3 h-3" />
                        Remove
                    </button>
                )}
            </div>
            {value && (
                <img
                    src={value}
                    alt={`${label} preview`}
                    className={`mt-2.5 border border-slate-200 bg-slate-50 object-cover ${previewClass}`}
                    onError={(e) => (e.currentTarget.style.display = "none")}
                    onLoad={(e) => (e.currentTarget.style.display = "")}
                />
            )}
        </div>
    );

    return (
        <div className="min-h-screen bg-creampink-50/70 flex items-center justify-center p-4 py-12 font-sans">
            <div className="w-full max-w-xl bg-white rounded-3xl sm:rounded-4xl border border-slate-200/80 p-7 sm:p-10">
                <div className="flex items-center gap-3.5 mb-7">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-800 shrink-0">
                        <Store className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-xl text-slate-900">Setup Your Store</h1>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Configure your brand, store URL, and delivery rules to start selling online.
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                    {/* Store Name & Slug */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                            <label className={labelClass}>Store Name *</label>
                            <input
                                type="text"
                                required
                                maxLength={255}
                                placeholder="e.g. Nordic Ceramics"
                                value={name}
                                onChange={(e) => handleNameChange(e.target.value)}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Store URL Slug *</label>
                            <div className="flex items-center border border-slate-200 rounded-xl px-3.5 py-2 bg-creampink-50/50 text-xs focus-within:border-zhuyue-600 focus-within:ring-1 focus-within:ring-zhuyue-600/20">
                                <span className="text-slate-400 font-mono text-[11px]">/store/</span>
                                <input
                                    type="text"
                                    required
                                    maxLength={60}
                                    placeholder="nordic-ceramics"
                                    value={slug}
                                    onChange={(e) => handleSlugChange(e.target.value)}
                                    className="w-full bg-transparent focus:outline-none font-mono text-slate-900 ml-1 text-xs"
                                />
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">Lowercase letters, numbers and dashes.</p>
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className={labelClass}>Store Tagline / Bio</label>
                        <textarea
                            rows={2}
                            maxLength={2000}
                            placeholder="Handcrafted Scandinavian tableware and interior objects."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className={inputClass}
                        />
                    </div>

                    {/* Currency & Shipping */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label className={labelClass}>Currency</label>
                            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
                                {CURRENCIES.map((c) => (
                                    <option key={c.code} value={c.code}>
                                        {c.code} ({c.symbol})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>Shipping Fee ({currencySymbol})</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={shippingFee}
                                onChange={(e) => setShippingFee(e.target.value)}
                                className={`${inputClass} font-mono`}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Free Shipping Over ({currencySymbol})</label>
                            <input
                                type="number"
                                step="1"
                                min="0"
                                value={freeShippingThreshold}
                                onChange={(e) => setFreeShippingThreshold(e.target.value)}
                                className={`${inputClass} font-mono`}
                            />
                        </div>
                    </div>

                    {/* Logo & Banner URLs or Upload */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 border-t border-slate-100 pt-5">
                        {renderImageField("logo", "Store Logo", logoUrl, "w-16 h-16 rounded-full")}
                        {renderImageField("banner", "Hero Banner", bannerUrl, "w-full h-20 rounded-xl")}
                    </div>

                    <button
                        type="submit"
                        disabled={submitting || isUploading}
                        className="w-full py-3 px-5 bg-zhuyue-600 hover:bg-zhuyue-700 text-white text-xs font-medium rounded-full transition shadow-xs shadow-zhuyue-700/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer mt-4"
                    >
                        <span>
                            {submitting ? "Creating Store..." : isUploading ? "Uploading image..." : "Launch Store & Open Dashboard"}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                </form>
            </div>
        </div>
    );
};
