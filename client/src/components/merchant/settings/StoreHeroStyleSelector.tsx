import React from "react";
import { CheckIcon } from "lucide-react";

export type HeroStyleType = "hero1" | "hero2" | "hero3" | "hero4";

interface Props {
    value: string;
    onChange: (style: HeroStyleType) => void;
}

const VALID = ["hero1", "hero2", "hero3", "hero4"];

const OPTIONS = [
    {
        id: "hero1" as HeroStyleType,
        name: "Banner Bottom-Left",
        description: "Full-width background image with dark gradient scrim, bottom-left typography, and clean action button.",
        preview: (
            <div className="w-full h-28 border border-slate-300 rounded-xl relative overflow-hidden flex flex-col justify-end p-2.5 text-left">
                <div className="absolute inset-0 bg-linear-to-tr from-slate-300 via-slate-100 to-slate-300 opacity-90" />
                <div className="absolute inset-0 bg-linear-to-t from-black/60 via-black/50 to-transparent" />
                <div className="relative z-10 space-y-1 text-left w-full">
                    <div className="w-24 h-2.5 bg-white/95 rounded-full" />
                    <div className="w-32 h-1.5 bg-slate-300/80 rounded-full" />
                    <div className="w-14 h-2.5 bg-white rounded-full mt-1.5" />
                </div>
            </div>
        ),
    },
    {
        id: "hero2" as HeroStyleType,
        name: "Editorial Split",
        description: "2-column split layout with brand narrative on left and photography frame on right.",
        preview: (
            <div className="w-full h-28 bg-creampink-50 border border-slate-200 rounded-xl p-3 flex items-center gap-3 overflow-hidden">
                <div className="flex-1 space-y-1.5 text-left">
                    <div className="w-4 h-4 rounded-full bg-slate-300" />
                    <div className="w-16 h-2.5 bg-slate-400 rounded-full" />
                    <div className="w-20 h-1.5 bg-slate-300 rounded-full" />
                    <div className="w-12 h-2.5 bg-slate-400 rounded-full mt-1" />
                </div>
                <div className="w-20 h-20 bg-slate-200 border border-slate-300 rounded-lg shrink-0 flex items-center justify-center text-[8px] font-mono text-slate-400">
                    Image
                </div>
            </div>
        ),
    },
    {
        id: "hero3" as HeroStyleType,
        name: "Immersive Cover",
        description: "Full-width visual banner with dark gradient scrim, high-contrast typography, and floating chip.",
        preview: (
            <div className="w-full h-28 border border-slate-400 rounded-xl flex flex-col items-center justify-center gap-1.5 relative overflow-hidden text-white">
                <div className="absolute inset-0 bg-linear-to-b from-slate-400 via-slate-500 to-slate-400 opacity-80" />
                <div className="flex gap-1">
                    <div className="relative z-10 w-2 h-2 bg-slate-100 rounded-full" />
                    <div className="relative z-10 w-8 h-2 bg-slate-100 rounded-full" />
                </div>
                <div className="relative z-10 w-2/3 h-3 bg-slate-200 rounded-full" />
                <div className="relative z-10 w-4/5 h-1.5 bg-slate-300 rounded-full" />
                <div className="relative z-10 w-16 h-3 bg-slate-200 rounded-full" />
            </div>
        ),
    },
    {
        id: "hero4" as HeroStyleType,
        name: "Boutique Studio",
        description: "Contemporary layout with live feature chips (Free Shipping, COD, Direct) and clean frame.",
        preview: (
            <div className="w-full h-28 bg-creampink-50 border border-slate-200 rounded-xl p-2.5 flex flex-col items-center justify-center space-y-1.5 overflow-hidden">
                <div className="flex gap-1 mb-0.5">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="w-6 h-2 bg-slate-100 border border-slate-300 rounded-full" />
                    ))}
                </div>
                <div className="w-5 h-5 rounded-full bg-slate-400 mt-1" />
                <div className="w-24 h-2.5 bg-slate-300 rounded-full" />
                <div className="w-14 h-2.5 bg-slate-400 rounded-full mt-0.5" />
            </div>
        ),
    },
];

export const StoreHeroStyleSelector: React.FC<Props> = ({ value, onChange }) => {
    const current = (VALID.includes(value) ? value : "hero1") as HeroStyleType;

    return (
        <div className="space-y-6">
            <h1 className="text-base font-medium text-slate-950">Store Hero Layout</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {OPTIONS.map((opt) => {
                    const selected = current === opt.id;
                    return (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => onChange(opt.id)}
                            className={`p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between space-y-3 relative ${selected ? "border-zhuyue-500" : "border-slate-200/90 bg-creampink-50/50 hover:border-slate-300"}`}
                        >
                            {selected && (
                                <div className="absolute top-2.5 right-2.5 bg-zhuyue-600 text-white rounded-full z-10 p-1">
                                    <CheckIcon className="size-3.5" />
                                </div>
                            )}
                            {opt.preview}
                            <div className="space-y-2">
                                <p className="text-[10px] inline-block font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                                    {opt.name}
                                </p>
                                <p className="text-[11px] text-slate-500 leading-snug line-clamp-2">{opt.description}</p>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
