import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../config/api";
import toast from "react-hot-toast";
import { AdminLayout } from "../../components/AdminLayout";
import { Search, ExternalLink } from "lucide-react";
import { Spinner } from "../../components/common/Spinner";

export const MerchantsManagement: React.FC = () => {
    const [merchants, setMerchants] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        // GET /api/stores/admin/merchants：每个 merchant 带 store（还没开店则为 null）
        api.get("/api/stores/admin/merchants")
            .then(({ data }) => {
                if (!data.success) return;
                // 拍平成表格要用的字段
                setMerchants(
                    data.merchants.map((m: any) => ({
                        ...m,
                        name: m.name || m.email.split("@")[0],
                        store_name: m.store?.name ?? null,
                        store_slug: m.store?.slug ?? null,
                        store_status: m.store ? m.store.status ?? "active" : null,
                        created_at: m.createdAt,
                    })),
                );
            })
            .catch((err) => toast.error(err.response?.data?.message || "Failed to load merchants"))
            .finally(() => setLoading(false));
    }, []);

    const q = search.toLowerCase();
    const filtered = merchants.filter(
        (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || m.store_name?.toLowerCase().includes(q),
    );

    return (
        <AdminLayout>
            <div className="space-y-6">
                <h1 className="text-2xl sm:text-3xl tracking-tight text-slate-900 mt-10">Merchants Directory</h1>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Filter by name, email, or store..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 text-xs bg-creampink-50 border border-slate-200 rounded-full focus:outline-none focus:border-black transition"
                        />
                    </div>
                    <span className="text-xs text-slate-400 font-mono px-2">{filtered.length} merchants</span>
                </div>

                <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 overflow-hidden">
                    {loading ? (
                        <Spinner padded />
                    ) : filtered.length === 0 ? (
                        <p className="p-16 text-center text-xs text-slate-400 font-mono">No merchants found.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-creampink-50/70 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-100">
                                    <tr>
                                        {["Merchant", "Email", "Store", "Status", "Joined"].map((h, i) => (
                                            <th key={h} className={`py-3 ${i === 4 ? "px-5 text-right" : "px-4"}`}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filtered.map((m) => (
                                        <tr key={m.id} className="hover:bg-creampink-50/50 transition">
                                            <td className="py-3.5 px-4 font-medium text-slate-900">{m.name}</td>
                                            <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">{m.email}</td>
                                            <td className="py-3.5 px-4">
                                                {m.store_name ? (
                                                    <Link
                                                        to={`/store/${m.store_slug}`}
                                                        target="_blank"
                                                        className="inline-flex items-center gap-1.5 text-slate-900 hover:underline font-medium"
                                                    >
                                                        {m.store_name} <ExternalLink className="w-3 h-3 text-slate-400" />
                                                    </Link>
                                                ) : (
                                                    <span className="text-slate-400 font-mono text-[11px]">Pending Setup</span>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4">
                                                {m.store_status ? (
                                                    <span
                                                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium uppercase border ${m.store_status === "active" ? "bg-creampink-50 text-zhuyue-700 border-creampink-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}
                                                    >
                                                        {m.store_status}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400 font-mono">—</span>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-5 text-right text-slate-400 font-mono text-[11px]">
                                                {m.created_at ? new Date(m.created_at).toLocaleDateString() : "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
};
