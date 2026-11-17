// 和后端 server/controllers/orderController.ts 的 ORDER_TRANSITIONS / PAYMENT_TRANSITIONS 保持一致
// 前端只用来决定下拉框显示哪些选项；真正的检查还是在后端（不合法会返回 409）

export const ORDER_STATUSES = ["placed", "confirmed", "processing", "shipped", "delivered", "cancelled"] as const;
export const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"] as const;

const ORDER_TRANSITIONS: Record<string, readonly string[]> = {
    placed: ["confirmed", "processing", "cancelled"],
    confirmed: ["processing", "shipped", "cancelled"],
    processing: ["shipped", "cancelled"],
    shipped: ["delivered"],
    delivered: [],
    cancelled: [],
};

const PAYMENT_TRANSITIONS: Record<string, readonly string[]> = {
    pending: ["paid", "failed"],
    failed: ["pending", "paid"],
    paid: ["refunded"],
    refunded: [],
};

// 下拉框选项 = 当前状态 + 允许改成的状态（数据库里 null 当作默认值）
export const orderStatusOptions = (current?: string | null): string[] => {
    const now = current || "placed";
    return [now, ...(ORDER_TRANSITIONS[now] ?? [])];
};

export const paymentStatusOptions = (current?: string | null): string[] => {
    const now = current || "pending";
    return [now, ...(PAYMENT_TRANSITIONS[now] ?? [])];
};

// "processing" → "Processing"
export const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
