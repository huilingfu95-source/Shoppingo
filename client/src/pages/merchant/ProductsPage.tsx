import React, { useEffect, useState } from "react";
import { api } from "../../config/api";
import { useAuth } from "../../context/AuthContext";
import { MerchantLayout } from "../../components/MerchantLayout";
import { Plus, Search } from "lucide-react";
import toast from "react-hot-toast";
import { ProductTable, type ProductItem } from "../../components/merchant/products/ProductTable";
import { ProductModal } from "../../components/merchant/products/ProductModal";
import { type VariantGroup } from "../../components/merchant/products/ProductVariantBuilder";

const EMPTY_FORM = {
    name: "",
    desc: "",
    price: "",
    compareAt: "",
    sku: "",
    stock: "10",
    categoryId: "",
    status: "active",
    images: [] as string[],
    imageUrlInput: "",
    variants: [] as VariantGroup[],
};

// merchant 专用 endpoint：store 由 JWT 决定，并且包含 inactive 商品
const fetchMerchantProducts = async (): Promise<ProductItem[] | null> => {
    const { data } = await api.get("/api/products/merchant");
    return data.success ? data.products : null;
};

// storeId 直接用 useAuth 里登录时存好的 store，不用再问一次 /api/stores/me
const fetchCategories = async (storeId: number | string | undefined) => {
    if (!storeId) return null;
    const { data } = await api.get(`/api/categories?storeId=${storeId}`);
    return data.success ? data.categories : null;
};

export const ProductsPage: React.FC = () => {
    const { store } = useAuth();
    const [products, setProducts] = useState<ProductItem[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [newVariantName, setNewVariantName] = useState("");
    const [newVariantOptions, setNewVariantOptions] = useState("");

    const setF = (key: keyof typeof EMPTY_FORM, val: any) => setForm((f) => ({ ...f, [key]: val }));

    const refetchProducts = async () => {
        try {
            const list = await fetchMerchantProducts();
            if (list) setProducts(list);
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to load products");
        }
    };

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const [prodList, catList] = await Promise.all([fetchMerchantProducts(), fetchCategories(store?.id)]);
                if (prodList) setProducts(prodList);
                if (catList) setCategories(catList);
            } catch (err: any) {
                toast.error(err.response?.data?.message || "Failed to load data");
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [store?.id]);

    const openCreateModal = () => {
        setEditingProduct(null);
        setForm({ ...EMPTY_FORM, categoryId: categories[0]?.id?.toString() || "" });
        setIsModalOpen(true);
    };

    const openEditModal = (p: ProductItem) => {
        setEditingProduct(p);
        setForm({
            name: p.name,
            desc: p.description || "",
            price: p.price.toString(),
            compareAt: p.compare_at_price ? p.compare_at_price.toString() : "",
            sku: p.sku || "",
            stock: p.stock.toString(),
            categoryId: p.category_id ? p.category_id.toString() : "",
            status: p.status || "active",
            images: Array.isArray(p.images) ? p.images : [],
            imageUrlInput: "",
            variants: Array.isArray(p.variants) ? p.variants : [],
        });
        setIsModalOpen(true);
    };

    const handleAddImageFromUrl = () => {
        if (!form.imageUrlInput.trim()) return;
        setF("images", [...form.images, form.imageUrlInput.trim()]);
        setF("imageUrlInput", "");
    };

    const handleUploadImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingImage(true);
        try {
            const formData = new FormData();
            formData.append("image", file);   // 字段名必须是 "image"，和 upload.single("image") 对应

            const { data } = await api.post("/api/upload/single", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });

            if (data.success) {
                // 用函数式更新：await 期间 form 可能变了，不能用旧的 form.images
                setForm((f) => ({ ...f, images: [...f.images, data.url] }));
                toast.success("Image uploaded!");
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Image upload failed");
        } finally {
            setUploadingImage(false);
            e.target.value = "";   // 清空 input，同一张图再选一次也能触发 onChange
        }
    };


    const handleAddVariantGroup = () => {
        if (!newVariantName.trim() || !newVariantOptions.trim()) {
            toast.error("Provide variant name and comma-separated options");
            return;
        }
        setF("variants", [
            ...form.variants,
            {
                name: newVariantName.trim(),
                options: newVariantOptions
                    .split(",")
                    .map((o) => o.trim())
                    .filter(Boolean),
            },
        ]);
        setNewVariantName("");
        setNewVariantOptions("");
    };

    const handleAddColorVariantOption = (colorName: string) => {
        const cleanName = colorName.trim();
        if (!cleanName) return;

        const colorGroupIndex = form.variants.findIndex(
            (v) => v.name.toLowerCase() === "color" || v.name.toLowerCase() === "colour"
        );

        if (colorGroupIndex >= 0) {
            const existingGroup = form.variants[colorGroupIndex];
            if (!existingGroup.options.some((o) => o.toLowerCase() === cleanName.toLowerCase())) {
                const updatedGroup = {
                    ...existingGroup,
                    options: [...existingGroup.options, cleanName],
                };
                const updatedVariants = [...form.variants];
                updatedVariants[colorGroupIndex] = updatedGroup;
                setF("variants", updatedVariants);
            }
        } else {
            setF("variants", [
                ...form.variants,
                {
                    name: "Color",
                    options: [cleanName],
                },
            ]);
        }
    };

    const handleSaveProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim() || !form.price) {
            toast.error("Product name and price are required");
            return;
        }

        // 字段名要和后端 productController 里 req.body 解构的名字一致
        const payload = {
            name: form.name.trim(),
            description: form.desc.trim(),
            price: Number(form.price),
            compare_at_price: form.compareAt ? Number(form.compareAt) : null,
            sku: form.sku.trim() || null,
            stock: Number(form.stock) || 0,
            category_id: form.categoryId ? Number(form.categoryId) : null,
            images: form.images,
            variants: form.variants,
            status: form.status,
        };

        try {
            if (editingProduct) {
                await api.put(`/api/products/${editingProduct.id}`, payload);
                toast.success("Product updated!");
            } else {
                await api.post("/api/products", payload);
                toast.success("Product created!");
            }
            setIsModalOpen(false);
            await refetchProducts();
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to save product");
        }
    };

    const handleDeleteProduct = async (id: number) => {
        if (!window.confirm("Are you sure you want to delete this product?")) return;
        try {
            await api.delete(`/api/products/${id}`);
            toast.success("Product deleted");
            await refetchProducts();
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to delete product");
        }
    };

    const filtered = products.filter(
        (p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase()),
    );

    return (
        <MerchantLayout>
            <div className="space-y-7">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h1 className="text-xl sm:text-2xl text-slate-900 mt-10">Product Catalog</h1>
                    <button
                        type="button"
                        onClick={openCreateModal}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-zhuyue-600 hover:bg-zhuyue-700 text-white text-xs font-semibold rounded-full transition cursor-pointer shadow-xs shadow-zhuyue-700/20"
                    >
                        <Plus className="w-3.5 h-3.5" /> Add Product
                    </button>
                </div>

                <div className="bg-white p-3 sm:px-4 rounded-full border border-slate-200/80 flex items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Search products by title or SKU..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 text-xs bg-transparent focus:outline-none placeholder:text-slate-400"
                        />
                    </div>
                    <span className="text-xs text-slate-400 font-mono pr-2">{filtered.length} products</span>
                </div>

                <ProductTable
                    products={filtered}
                    loading={loading}
                    onEdit={openEditModal}
                    onDelete={handleDeleteProduct}
                    onAddProduct={openCreateModal}
                />

                <ProductModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    editingProduct={editingProduct}
                    categories={categories}
                    formName={form.name}
                    onFormNameChange={(v) => setF("name", v)}
                    formDesc={form.desc}
                    onFormDescChange={(v) => setF("desc", v)}
                    formPrice={form.price}
                    onFormPriceChange={(v) => setF("price", v)}
                    formCompareAt={form.compareAt}
                    onFormCompareAtChange={(v) => setF("compareAt", v)}
                    formSku={form.sku}
                    onFormSkuChange={(v) => setF("sku", v)}
                    formStock={form.stock}
                    onFormStockChange={(v) => setF("stock", v)}
                    formCategoryId={form.categoryId}
                    onFormCategoryIdChange={(v) => setF("categoryId", v)}
                    formStatus={form.status}
                    onFormStatusChange={(v) => setF("status", v)}
                    formImages={form.images}
                    formImageUrlInput={form.imageUrlInput}
                    onFormImageUrlInputChange={(v) => setF("imageUrlInput", v)}
                    onAddImageFromUrl={handleAddImageFromUrl}
                    onUploadImageFile={handleUploadImageFile}
                    onRemoveImage={(i) =>
                        setF(
                            "images",
                            form.images.filter((_, idx) => idx !== i),
                        )
                    }
                    onAddTransformedImage={(url) => setF("images", [...form.images, url])}
                    onReplaceImage={(idx, url) =>
                        setF(
                            "images",
                            form.images.map((img, i) => (i === idx ? url : img)),
                        )
                    }
                    onAddColorVariantOption={handleAddColorVariantOption}
                    uploadingImage={uploadingImage}
                    formVariants={form.variants}
                    newVariantName={newVariantName}
                    onNewVariantNameChange={setNewVariantName}
                    newVariantOptions={newVariantOptions}
                    onNewVariantOptionsChange={setNewVariantOptions}
                    onAddVariantGroup={handleAddVariantGroup}
                    onRemoveVariantGroup={(i) =>
                        setF(
                            "variants",
                            form.variants.filter((_, idx) => idx !== i),
                        )
                    }
                    onSaveProduct={handleSaveProduct}
                />
            </div>
        </MerchantLayout>
    );
};




// 给谁用	         干什么
// token	后端	证明「我是谁」，拿数据
// useAuth	前端	显示名字、拦住没登录的人、登出
