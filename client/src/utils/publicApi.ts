import { api } from "../config/api";

// 顾客端（public）页面共用的读取函数
// 这些 GET 请求 api.ts 会转到 Neon Function：不需要登录，被封（suspended）的店返回 403

// 后端返回的错误 message（例如 "This store is currently suspended..."），没有就用 fallback
export const apiErrorMessage = (err: any, fallback: string): string => err?.response?.data?.message || fallback;

// GET /api/stores/slug/:slug → 店铺信息（hero_style、accent_color、运费等）
export const fetchStoreBySlug = async (slug: string) => {
    const { data } = await api.get(`/api/stores/slug/${encodeURIComponent(slug)}`);
    return data.store;
};

// GET /api/products?storeSlug=... → 这家店所有 active 商品
export const fetchStoreProducts = async (slug: string): Promise<any[]> => {
    const { data } = await api.get(`/api/products?storeSlug=${encodeURIComponent(slug)}`);
    return data.products ?? [];
};

// GET /api/products/:id → 单个商品（带 store_slug / store_status）
export const fetchProductById = async (id: string | number) => {
    const { data } = await api.get(`/api/products/${id}`);
    return data.product;
};
