import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { STORE_FAQ } from "../../../assets/assets";

export const StoreFaq = () => {
    const [openIdx, setOpenIdx] = useState<number | null>(null);

    return (
        <section className="mt-16 sm:mt-20 py-20 xl:py-28 max-w-3xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-normal tracking-tight text-slate-900 mb-8">Questions?</h2>

            <div className="divide-y divide-slate-200 border-t border-slate-200">
                {STORE_FAQ.map((faq, idx) => {
                    const isOpen = openIdx === idx;
                    return (
                        <div key={idx} className="py-5 sm:py-6 transition">
                            <button
                                type="button"
                                onClick={() => setOpenIdx(isOpen ? null : idx)}
                                className="w-full text-left flex items-center justify-between gap-6 cursor-pointer group"
                            >
                                <span className="text-base sm:text-lg font-normal text-slate-900 group-hover:text-slate-700 transition">
                                    {faq.q}
                                </span>
                                <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center shrink-0 hover:bg-slate-800 transition">
                                    {isOpen ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                </div>
                            </button>

                            {isOpen && <div className="pt-4 pr-12 text-sm text-slate-600 leading-relaxed max-w-3xl">{faq.a}</div>}
                        </div>
                    );
                })}
            </div>
        </section>
    );
};
