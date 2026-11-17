import React, { useEffect, useState } from "react";
import { api } from "../../config/api";
import { useAuth } from "../../context/AuthContext";
import { MerchantLayout } from "../../components/MerchantLayout";
import { Plus, Trash2, FolderTree } from "lucide-react";
import { Spinner } from "../../components/common/Spinner";
import toast from "react-hot-toast";

interface Category {
    id: number;
    name: string;
    slug: string;
    productCount?: number;   // 后端 getCategories 用 _count 算出来的
}

export const CategoriesPage: React.FC = () => {
    // GET 需要 storeId → 从 useAuth 拿；POST / DELETE 后端靠 token 自己找店，不用传
    const { store } = useAuth();
    const [categories, setCategories] = useState<Category[]>([]);
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const fetchCategories = async () => {
        if (!store?.id) {
            setLoading(false);
            return;
        }
        try {
            const { data } = await api.get(`/api/categories?storeId=${store.id}`);
            if (data.success) setCategories(data.categories);
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to load categories");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        fetchCategories();
    }, [store?.id]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        setSubmitting(true);
        try {
            await api.post("/api/categories", { name: name.trim() });
            toast.success("Category created!");
            setName("");
            await fetchCategories();   // 重新拿，productCount / 排序都以后端为准
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to create category");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm("Are you sure? Products in this category will become uncategorized.")) return;
        try {
            await api.delete(`/api/categories/${id}`);
            setCategories((prev) => prev.filter((c) => c.id !== id));
            toast.success("Category deleted");
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to delete category");
        }
    };

    return (
        <MerchantLayout>
            <div className="space-y-7">
                <h1 className="text-xl sm:text-2xl text-slate-900 mt-10">Product Categories</h1>

                <div className="bg-white p-6 rounded-3xl border border-slate-200/80">
                    <h2 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-3">Create Category</h2>
                    <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3 max-w-lg">
                        <input
                            type="text"
                            required
                            placeholder="e.g. Specialty Beans, Drinkware..."
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="flex-1 px-4 py-2.5 text-xs border border-slate-200 rounded-full focus:outline-none focus:border-zhuyue-600 focus:ring-1 focus:ring-zhuyue-600/20 bg-creampink-50/50"
                        />
                        <button
                            type="submit"
                            disabled={submitting || !name.trim()}
                            className="px-5 py-2.5 bg-zhuyue-600 hover:bg-zhuyue-700 text-white text-xs font-semibold rounded-full transition disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                        >
                            <Plus className="w-3.5 h-3.5" /> {submitting ? "Creating..." : "Add Category"}
                        </button>
                    </form>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200/80 overflow-hidden">
                    <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between">
                        <h2 className="font-medium text-slate-900">Catalog Collections</h2>
                        <span className="text-xs text-slate-400 font-mono">{categories.length} total</span>
                    </div>
                    {loading ? (
                        <Spinner padded />
                    ) : categories.length === 0 ? (
                        <p className="p-12 text-center text-xs text-slate-400 font-mono">No categories created yet.</p>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {categories.map((c) => (
                                <div
                                    key={c.id}
                                    className="p-4 sm:px-6 flex items-center justify-between hover:bg-creampink-50/50 transition text-xs"
                                >
                                    <div className="flex items-center gap-3.5">
                                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                                            <FolderTree className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h3 className="font-medium text-slate-900 text-xs sm:text-sm">{c.name}</h3>
                                            <span className="text-[10px] text-slate-400 font-mono">slug: {c.slug}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[11px] font-mono">
                                            {c.productCount ?? 0} products
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(c.id)}
                                            className="p-2 text-slate-400 hover:text-rose-600 rounded-full hover:bg-rose-50 transition cursor-pointer"
                                            title="Delete category"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </MerchantLayout>
    );
};
