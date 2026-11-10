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

        if (typeof name !== "string" || !name.trim() || price === undefined) {
            res.status(400).json({ success: false, message: "Product name and price are required" });
            return;
        }

        const product = await prisma.products.create({
            data: {
                store_id: store.id,
                category_id: category_id ? Number(category_id) : null,
                name: name.trim(),
                description: description || "",
                price: Number(price),
                compare_at_price: compare_at_price ? Number(compare_at_price) : null,
                sku: sku?.trim() || null,
                stock: Number(stock) || 0,
                images: Array.isArray(images) ? images : [],
                variants: Array.isArray(variants) ? variants : [],
                status: status || "active",
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

        // store_id in where: a merchant can only update products in their own store
        const existing = await prisma.products.findFirst({ where: { id, store_id: store.id }, select: { id: true } });
        if (!existing) {
            res.status(404).json({ success: false, message: "Product not found or access denied" });
            return;
        }

        // no defaults here: a field left out of the body must stay unchanged
        const { name, description, price, compare_at_price, sku, stock, category_id, images, variants, status } = req.body;

        const updated = await prisma.products.update({
            where: { id },
            data: Object.fromEntries(
                Object.entries({
                    name: typeof name === "string" ? name.trim() : undefined,
                    description,
                    price: price !== undefined ? Number(price) : undefined,
                    compare_at_price: compare_at_price !== undefined ? (compare_at_price ? Number(compare_at_price) : null) : undefined,
                    sku,
                    stock: stock !== undefined ? Number(stock) : undefined,
                    category_id: category_id !== undefined ? (category_id ? Number(category_id) : null) : undefined,
                    images: images !== undefined ? (Array.isArray(images) ? images : []) : undefined,
                    variants: variants !== undefined ? (Array.isArray(variants) ? variants : []) : undefined,
                    status,
                }).filter(([, v]) => v !== undefined),
            ),
        });

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
        if (!productId) {
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
// │   ├── name + price required → 400
// │   ├── prisma.products.create() with store_id from the store (never from body)
// │   └── Return 201 + new product
// │
// ├── PUT: updateProduct()
// │   ├── parseId → 400; product not in merchant's store → 404
// │   ├── only fields sent in body are updated; category_id null removes category
// │   └── prisma.products.update()
// │
// └── DELETE: deleteProduct()
//     ├── parseId → 400
//     ├── prisma.products.deleteMany({ id, store_id }) → count 0 → 404
//     └── Return success message
