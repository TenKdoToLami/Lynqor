import { Folder as FolderIcon, Lock, Trash2 } from "lucide-react";
import { Folder } from "../types";
import { cn } from "../utils";

interface FolderItemProps {
    folder: Folder;
    viewMode: 'grid' | 'list';
    onClick: () => void;
    onDelete: (e: React.MouseEvent) => void;
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
}

export function FolderItem({
    folder,
    viewMode,
    onClick,
    onDelete,
    draggable,
    onDragStart,
    onDragOver,
    onDrop
}: FolderItemProps) {
    return (
        <div
            draggable={draggable}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onClick={onClick}
            className={cn(
                "cursor-pointer group text-left border border-white/10 bg-white/5 backdrop-blur-md hover:bg-white/10 hover:border-white/20 hover:shadow-xl transition-all duration-300 rounded-2xl overflow-hidden relative",
                viewMode === 'grid' ? "aspect-square p-5 flex flex-col items-center justify-center text-center min-h-0" : "p-4 flex items-center gap-5"
            )}
        >
            <div className={cn("text-indigo-400 relative z-10 pointer-events-none", viewMode === 'grid' ? "mb-4" : "")}>
                <FolderIcon size={viewMode === 'grid' ? 56 : 28} className="fill-indigo-500/20 stroke-[1.5]" />
                {folder.isLocked && (
                    <div className="absolute -bottom-1 -right-1 bg-slate-900 rounded-full p-1.5 shadow-lg border border-white/10">
                        <Lock size={12} className="text-amber-400" />
                    </div>
                )}
            </div>
            <div className="flex-1 min-w-0 z-10 pointer-events-none">
                <h3 className="font-semibold text-white/90 truncate group-hover:text-white">{folder.name}</h3>
                {viewMode === 'list' && <p className="text-xs text-white/40 mt-0.5">Folder</p>}
            </div>
            <button
                onClick={(e) => { e.stopPropagation(); onDelete(e); }}
                className="z-10 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-400 hover:text-red-300 border border-red-400/20 absolute top-2 right-2"
                title="Delete"
            >
                <Trash2 size={14} />
            </button>
        </div>
    );
}
