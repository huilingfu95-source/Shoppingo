import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";

// find the authenticated merchant's store (store_id never comes from the body)
const getStore = (merchantId: string) =>
    prisma.stores.findFirst({ where: { merchant_id: merchantId }, select: { id: true } });

// parse an ID from params or body: positive safe integer (number or digit string), otherwise null
const parseId = (value: unknown): number | null => {
    const id = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
    return Number.isSafeInteger(id) && id > 0 ? id : null;
};

// allowed product statuses (same set as stores: orders only accept "active" products)
const PRODUCT_STATUSES = ["active", "inactive"] as const;

// money: finite, non-negative number or numeric string, otherwise null
const parseMoney = (value: unknown): number | null => {
    const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : null;
};

// stock: non-negative safe integer (number or digit string), otherwise null
const parseStock = (value: unknown): number | null => {
    const n = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
};

const isStatus = (value: unknown): value is (typeof PRODUCT_STATUSES)[number] =>
    typeof value === "string" && (PRODUCT_STATUSES as readonly string[]).includes(value);

const isOptionalString = (value: unknown) => value === undefined || value === null || typeof value === "string";

// POST: create a product in the authenticated merchant's store
export const createProduct = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const store = await getStore(req.user!.id);
        if (!store) {
            res.status(404).json({ success: false, message: "Store not found for the user" });
            return;
        }

        const {
            name,
            description,
            price,
            compare_at_price,
            sku,
            stock = 0,
            category_id,
            images = [],
            variants = [],
            status = "active",
        } = req.body;

        if (typeof name !== "string" || !name.trim() || price === undefined || price === null) {
            res.status(400).json({ success: false, message: "Product name and price are required" });
            return;
        }

        // optional fields keep their old behavior: falsy compare_at_price / category_id → null
        const priceValue = parseMoney(price);
        const compareValue = compare_at_price ? parseMoney(compare_at_price) : null;
        const categoryValue = category_id ? parseId(category_id) : null;
        const stockValue = parseStock(stock);
        const statusValue = status || "active";

        const error =
            priceValue === null ? "price must be a non-negative number"
            : compare_at_price && compareValue === null ? "compare_at_price must be a non-negative number"
            : category_id && categoryValue === null ? "category_id must be a positive integer"
            : stockValue === null ? "stock must be a non-negative integer"
            : !isOptionalString(description) ? "description must be a string"
            : !isOptionalString(sku) ? "sku must be a string"
            : !isStatus(statusValue) ? `status must be one of: ${PRODUCT_STATUSES.join(", ")}`
            : null;
        if (error) {
            res.status(400).json({ success: false, message: error });
            return;
        }

        const product = await prisma.products.create({
            data: {
                store_id: store.id,
                category_id: categoryValue,
                name: name.trim(),
                description: description || "",
                price: priceValue!,
                compare_at_price: compareValue,
                sku: sku?.trim() || null,
                stock: stockValue!,
                images: Array.isArray(images) ? images : [],
                variants: Array.isArray(variants) ? variants : [],
                status: statusValue,
            },
        });
        res.status(201).json({ success: true, message: "Product created successfully", product });
    } catch (error: any) {
        console.error("createProduct error:", error);
        res.status(500).json({ success: false, message: "Failed to create product" });
    }
};

// PUT: update a product — only the fields sent in body; store_id cannot change
export const updateProduct = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const id = parseId(req.params.id);
        if (id === null) {
            res.status(400).json({ success: false, message: "Product id must be a positive integer" });
            return;
        }

        const store = await getStore(req.user!.id);
        if (!store) {
            res.status(404).json({ success: false, message: "Store not found for the user" });
            return;
        }

        // no defaults here: a field left out of the body must stay unchanged
        const { name, description, price, compare_at_price, sku, stock, category_id, images, variants, status } = req.body;

        const priceValue = price !== undefined ? parseMoney(price) : undefined;
        const compareValue = compare_at_price !== undefined ? (compare_at_price ? parseMoney(compare_at_price) : null) : undefined;
        const stockValue = stock !== undefined ? parseStock(stock) : undefined;
        const categoryValue = category_id !== undefined ? (category_id ? parseId(category_id) : null) : undefined;

        const error =
            name !== undefined && (typeof name !== "string" || !name.trim()) ? "name must be a non-empty string"
            : priceValue === null ? "price must be a non-negative number"
            : compare_at_price && compareValue === null ? "compare_at_price must be a non-negative number"
            : stockValue === null ? "stock must be a non-negative integer"
            : category_id && categoryValue === null ? "category_id must be a positive integer"
            : !isOptionalString(description) ? "description must be a string"
            : !isOptionalString(sku) ? "sku must be a string"
            : status !== undefined && !isStatus(status) ? `status must be one of: ${PRODUCT_STATUSES.join(", ")}`
            : null;
        if (error) {
            res.status(400).json({ success: false, message: error });
            return;
        }

        // store_id in where: a merchant can only update products in their own store
        const { count } = await prisma.products.updateMany({
            where: { id, store_id: store.id },
            data: Object.fromEntries(
                Object.entries({
                    name: typeof name === "string" ? name.trim() : undefined,
                    description,
                    price: priceValue,
                    compare_at_price: compareValue,
                    sku: typeof sku === "string" ? sku.trim() || null : sku,
                    stock: stockValue,
                    category_id: categoryValue,
                    images: images !== undefined ? (Array.isArray(images) ? images : []) : undefined,
                    variants: variants !== undefined ? (Array.isArray(variants) ? variants : []) : undefined,
                    status,
                }).filter(([, v]) => v !== undefined),
            ),
        });
        if (count === 0) {
            res.status(404).json({ success: false, message: "Product not found or access denied" });
            return;
        }

        const updated = await prisma.products.findUnique({ where: { id } });
        res.json({ success: true, message: "Product updated successfully", product: updated });
    } catch (error: any) {
        console.error("updateProduct error:", error);
        res.status(500).json({ success: false, message: "Failed to update product" });
    }
};

// DELETE: hard delete a product from the merchant's store
// orders.items 是 Json snapshot，不引用 products，删除不影响历史订单
export const deleteProduct = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const productId = parseId(req.params.id);
        if (productId === null) {
            res.status(400).json({ success: false, message: "Product id must be a positive integer" });
            return;
        }

        const store = await getStore(req.user!.id);
        if (!store) {
            res.status(404).json({ success: false, message: "Store not found for the user" });
            return;
        }

        // store_id in where: a merchant can only delete products in their own store
        const { count } = await prisma.products.deleteMany({ where: { id: productId, store_id: store.id } });
        if (count === 0) {
            res.status(404).json({ success: false, message: "Product not found or access denied" });
            return;
        }
        res.json({ success: true, message: "Product deleted successfully" });
    } catch (error: any) {
        console.error("deleteProduct error:", error);
        res.status(500).json({ success: false, message: "Failed to delete product" });
    }
};

// PRODUCT CONTROLLER (merchant only, scoped to req.user's store)
// │
// ├── POST: createProduct()
// │   ├── Find merchant's store → 404 if none
// │   ├── name + price required; price/stock/compare_at_price/category_id/status validated → 400
// │   ├── prisma.products.create() with store_id from the store (never from body)
// │   └── Return 201 + new product
// │
// ├── PUT: updateProduct()
// │   ├── parseId → 400; invalid field types/values → 400
// │   ├── only fields sent in body are updated; category_id null removes category
// │   └── prisma.products.updateMany({ id, store_id }) → count 0 → 404
// │
// └── DELETE: deleteProduct()
//     ├── parseId → 400
//     ├── prisma.products.deleteMany({ id, store_id }) → count 0 → 404
//     └── Return success message
