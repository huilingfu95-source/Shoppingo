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
            targetStoreId = Number(storeId);
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
        res.status(500).json({ success: false, message: error? error?.message || "Failed to fetch categories"  });
    }
}
 

export const deleteCategories = async (req: AuthenticatedRequest, res: Response) : Promise<void> => {

    try {
        const store = await getStore(req.user!.id);
        if (!store) {
            res.status(404).json({ success: false, message: "Store not found for the user" });
            return;
        }

        await prisma.categories.deleteMany({
            where: { id: Number(req.params.id), store_id: store.id },
        });
        res.json({ success: true, message: "Category deleted successfully" });

    } catch (error: any) {
        console.error("deleteCategories error:", error);
        res.status(500).json({ success: false, message: error?.message || "Failed to delete categories" });
    }
}