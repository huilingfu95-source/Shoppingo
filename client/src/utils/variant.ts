// 购物车里 variant 存成字符串 "Color: Red / Size: M"（显示方便）
// 后端 /api/orders/checkout 要的是对象 { Color: "Red", Size: "M" }，订单 snapshot 里存的也是对象

// "Color: Red / Size: M" → { Color: "Red", Size: "M" }；空字符串 / undefined → null
export const variantToObject = (variant?: string): Record<string, string> | null => {
    if (!variant?.trim()) return null;
    const obj: Record<string, string> = {};
    for (const part of variant.split(" / ")) {
        const idx = part.indexOf(":");
        if (idx === -1) continue;
        const key = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (key && value) obj[key] = value;
    }
    return Object.keys(obj).length ? obj : null;
};

// 订单里的 variant（对象或字符串）→ "Color: Red / Size: M"，用来显示
export const formatVariant = (variant: unknown): string => {
    if (!variant) return "";
    if (typeof variant === "string") return variant;
    if (typeof variant === "object") {
        return Object.entries(variant as Record<string, unknown>)
            .filter(([key]) => key !== "price")
            .map(([key, value]) => `${key}: ${value}`)
            .join(" / ");
    }
    return "";
};

// 商品的选项组 [{ name, options }] → 每组选第一个，拼成 "Color: Red / Size: M"（快速加入购物车用）
export const defaultVariantLabel = (variants?: Array<{ name: string; options: string[] }>): string | undefined => {
    const parts = (variants ?? []).filter((v) => v?.name && v.options?.length).map((v) => `${v.name}: ${v.options[0]}`);
    return parts.length ? parts.join(" / ") : undefined;
};
