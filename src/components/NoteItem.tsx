import { FileText, ExternalLink } from "lucide-react";
import { Item } from "../types";
import { cn, parseItemContent } from "../utils";

interface NoteItemProps {
    item: Item;
    viewMode: 'grid' | 'list';
    imgSrc: string | null;
    onClick: () => void;
    onOpenLink: (url: string) => void;
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
}

export function NoteItem({
    item,
    viewMode,
    imgSrc,
    onClick,
    onOpenLink,
    draggable,
    onDragStart,
    onDragOver,
    onDrop
}: NoteItemProps) {
    const parsed = parseItemContent(item.content);

    return (
        <div
            draggable={draggable}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onClick={onClick}
            className={cn(
                "cursor-pointer group text-left border border-white/10 bg-white/5 backdrop-blur-md hover:bg-white/10 hover:border-white/20 hover:shadow-xl transition-all duration-300 rounded-2xl overflow-hidden relative",
                viewMode === 'grid' ? "aspect-square flex flex-col min-h-0" : "p-4 flex items-center gap-5"
            )}
        >
            {viewMode === 'grid' && (
                <div className="h-[55%] shrink-0 w-full bg-black/20 border-b border-white/5 flex items-center justify-center overflow-hidden">
                    {imgSrc ? (
                        <img
                            src={imgSrc}
                            alt={item.title}
                            className="w-full h-full object-cover opacity-70 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                        />
                    ) : (
                        <div className="text-white/20 group-hover:text-white/60 transition-colors">
                            <FileText size={40} className="stroke-[1.5]" />
                        </div>
                    )}
                </div>
            )}

            {viewMode === 'list' && (
                <div className="shrink-0">
                    {imgSrc ? (
                        <div className="w-12 h-12 rounded-xl overflow-hidden border border-white/10">
                            <img src={imgSrc} alt={item.title} className="w-full h-full object-cover" />
                        </div>
                    ) : (
                        <div className="text-white/40 bg-white/5 p-3 rounded-xl border border-white/5 shadow-inner">
                            <FileText size={22} className="stroke-[1.5]" />
                        </div>
                    )}
                </div>
            )}

            <div className={cn("flex-1 min-w-0 flex flex-col justify-center text-left", viewMode === 'grid' ? "p-4 overflow-hidden" : "")}>
                <h3 className="font-semibold text-white/90 group-hover:text-white truncate">{item.title}</h3>
                <p className={cn("text-white/40 truncate", viewMode === 'grid' ? "text-xs mt-1.5" : "text-sm mt-0.5")}>
                    {parsed.body}
                </p>
            </div>

            {parsed.url && (
                <button
                    onClick={(e) => { e.stopPropagation(); onOpenLink(parsed.url); }}
                    className={cn(
                        "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20 p-2 rounded-xl transition-all shrink-0 z-10",
                        viewMode === 'grid' ? "absolute top-2 right-2 bg-black/40 backdrop-blur-sm border border-white/10" : ""
                    )}
                    title="Open link"
                >
                    <ExternalLink size={16} />
                </button>
            )}
        </div>
    );
}
