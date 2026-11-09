import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { prisma } from '../config/prisma.js';

const getStore = (merchantId: string) => {
    return prisma.stores.findFirst({
        where: { merchant_id: merchantId },
        select: { id: true, name: true, slug: true },
    });
}


// generate slug: "Home & Garden" -> "home-garden"
const generateSlug = (text: string): string =>
    text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

// parse a client-supplied ID: only positive safe integers are valid, otherwise null
const parseId = (value: unknown): number | null => {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
};


export const getCategories = async (req: Request, res: Response) : Promise<void> => {
    try {
        const { storeId, storeSlug } = req.query;
        let targetStoreId: number | null = null;

        if (storeSlug) {
            // Find store by slug
            const store = await prisma.stores.findUnique({ where: { slug: storeSlug as string},select: { id: true } });
            if (!store) {
                res.status(404).json({ success: false, message: "Store not found" });
                return;
            }
            targetStoreId = store.id;
        }else if (storeId) {
            targetStoreId = parseId(storeId);
            if (!targetStoreId) {
                res.status(400).json({ success: false, message: "storeId must be a positive integer" });
                return;
            }
        }

        if(!targetStoreId){
            res.status(400).json({ success: false, message: "storeId or storeSlug is required" });
            return;
        }

        const list = await prisma.categories.findMany({
            where: { store_id: targetStoreId },
            include: {_count: { select: { products: true } } },
            orderBy: { name: 'asc' },
        });

        const categories = list.map(({_count, ...rest}) => ({ ...rest, productCount: _count.products }));
        res.json({ success: true,  categories });
    }catch (error: any) {
        console.error("Error fetching categories:", error);
        res.status(500).json({ success: false, message: "Failed to fetch categories" });
    }
}

//Merchant 登录 → 找到自己的 Store → 创建 Category → Category 属于这个 Store。
export const createCategory = async (req: AuthenticatedRequest, res: Response) : Promise<void> => {
    try {
        const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        const slug = generateSlug(name);
        if (!name || !slug) {
            res.status(400).json({ success: false, message: "Category name is required" });
            return;
        }

        const store = await getStore(req.user!.id);
        if (!store) {
            res.status(404).json({ success: false, message: "Store not found for the user" });
            return;
        }

        const existing = await prisma.categories.findFirst({
            where: { store_id: store.id, slug },
            select: { id: true },
        });
        if (existing) {
            res.status(409).json({ success: false, message: "Category already exists" });
            return;
        }

        const category = await prisma.categories.create({
            data: { name, slug, store_id: store.id },
        });
        res.status(201).json({ success: true, category });

    } catch (error: any) {
        console.error("createCategory error:", error);
        res.status(500).json({ success: false, message: "Failed to create category" });
    }
}
 

export const deleteCategories = async (req: AuthenticatedRequest, res: Response) : Promise<void> => {

    try {
        const categoryId = parseId(req.params.id);
        if (!categoryId) {
            res.status(400).json({ success: false, message: "Category id must be a positive integer" });
            return;
        }

        const store = await getStore(req.user!.id);
        if (!store) {
            res.status(404).json({ success: false, message: "Store not found for the user" });
            return;
        }

        await prisma.categories.deleteMany({
            where: { id: categoryId, store_id: store.id },
        });
        res.json({ success: true, message: "Category deleted successfully" });

    } catch (error: any) {
        console.error("deleteCategories error:", error);
        res.status(500).json({ success: false, message: "Failed to delete categories" });
    }
}

// CATEGORY CONTROLLER
// │
// ├── GET: getCategories()
// │   ├── Receive storeId or storeSlug
// │   ├── Find target store ID
// │   ├── prisma.categories.findMany()
// │   └── Return categories + productCount
// │
// ├── POST: createCategory()
// │   ├── Receive category name
// │   ├── Generate slug and validate
// │   ├── Find authenticated merchant's store
// │   ├── Check for duplicate category
// │   ├── prisma.categories.create()
// │   └── Return 201 + new category
// │
// └── DELETE: deleteCategories()
//     ├── Receive category ID
//     ├── Validate ID using parseId()
//     ├── Find authenticated merchant's store
//     ├── prisma.categories.deleteMany()
//     └── Return success message