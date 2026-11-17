import axios from "axios";

export const NEON_FUNCTIONS_URL = import.meta.env.VITE_NEON_FUNCTIONS_URL || import.meta.env.VITE_PUBLIC_API_URL;

export const api = axios.create({
    baseURL: import.meta.env.VITE_BASE_URL || "http://localhost:3000",
    headers: {
        "Content-Type": "application/json",
    },
});

api.interceptors.request.use((config) => {
    // Route public product & store requests to Neon Functions if URL is configured
    if (NEON_FUNCTIONS_URL && config.url) {
        const isPublicRead =
            (!config.method || config.method.toLowerCase() === "get") &&
            // /api/products/merchant 需要登录、要看 inactive 商品 → 留在 Express
            ((config.url.startsWith("/api/products") && !config.url.startsWith("/api/products/merchant")) ||
                config.url.startsWith("/api/stores/slug/") ||
                config.url.startsWith("/api/stores/public/featured"));

        if (isPublicRead) {
            config.baseURL = NEON_FUNCTIONS_URL;
        }
    }

    const token = localStorage.getItem("shoppingo_token");
    // 调用方自己带了 Authorization（例如 AuthCard 登录时）就不要覆盖
    if (token && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});
