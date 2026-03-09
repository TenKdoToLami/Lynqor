import { Folder as FolderIcon, Lock, Trash2, GripVertical } from "lucide-react";
import { Folder } from "../types";
import { cn } from "../utils";

interface FolderItemProps {
    folder: Folder;
    viewMode: 'grid' | 'list';
    imgSrc?: string | null;
    onClick: () => void;
    onDelete: (e: React.MouseEvent) => void;
    draggable: boolean;
    isDragging: boolean;
    dropPosition: 'before' | 'after' | null;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
}

export function FolderItem({
    folder,
    viewMode,
    imgSrc,
    onClick,
    onDelete,
    draggable,
    isDragging,
    dropPosition,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop
}: FolderItemProps) {
    return (
        <div className="relative">
            {/* Drop indicator — before */}
            {dropPosition === 'before' && (
                <div className={cn(
                    "absolute z-30 bg-indigo-400 rounded-full",
                    viewMode === 'grid' ? "left-0 top-0 bottom-0 w-[3px] -translate-x-[6px]" : "left-0 right-0 top-0 h-[3px] -translate-y-[5px]"
                )} />
            )}

            <div
                draggable={draggable}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={onClick}
                className={cn(
                    "cursor-pointer group text-left border border-white/10 bg-white/5 backdrop-blur-md hover:bg-white/10 hover:border-white/20 hover:shadow-xl transition-all duration-300 rounded-2xl overflow-hidden relative",
                    viewMode === 'grid' ? "aspect-square flex flex-col min-h-0" : "p-4 flex items-center gap-5",
                    isDragging && "opacity-30 scale-95 ring-2 ring-indigo-500/50",
                )}
            >
                {/* Drag handle */}
                {draggable && (
                    <div
                        className={cn(
                            "absolute z-20 text-white/20 hover:text-white/60 transition-opacity cursor-grab active:cursor-grabbing",
                            viewMode === 'grid'
                                ? "top-2 left-2 opacity-0 group-hover:opacity-100"
                                : "left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100"
                        )}
                    >
                        <GripVertical size={16} />
                    </div>
                )}

                {viewMode === 'grid' && (
                    <div className="h-[55%] shrink-0 w-full bg-black/20 border-b border-white/5 flex items-center justify-center overflow-hidden relative">
                        {imgSrc ? (
                            <>
                                <img
                                    src={imgSrc}
                                    alt={folder.name}
                                    className="w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-105 transition-all duration-500 absolute inset-0"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent" />
                                <div className="relative z-10 text-white/90 drop-shadow-md">
                                    <FolderIcon size={48} className="fill-white/20 stroke-[1.5]" />
                                    {folder.isLocked && (
                                        <div className="absolute -bottom-1 -right-1 bg-slate-900/80 backdrop-blur-sm rounded-full p-1 shadow-lg border border-white/20">
                                            <Lock size={10} className="text-amber-400" />
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="text-indigo-400/50 group-hover:text-indigo-400/80 transition-colors relative">
                                <FolderIcon size={56} className="fill-indigo-500/20 stroke-[1.5]" />
                                {folder.isLocked && (
                                    <div className="absolute -bottom-1 -right-1 bg-slate-900 rounded-full p-1.5 shadow-lg border border-white/10">
                                        <Lock size={12} className="text-amber-400" />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {viewMode === 'list' && (
                    <div className="shrink-0">
                        {imgSrc ? (
                            <div className="w-12 h-12 rounded-xl overflow-hidden border border-white/10 relative flex items-center justify-center">
                                <img src={imgSrc} alt={folder.name} className="w-full h-full object-cover absolute inset-0 opacity-50" />
                                <div className="relative z-10 text-white drop-shadow-md">
                                    <FolderIcon size={24} className="fill-white/20 stroke-[1.5]" />
                                    {folder.isLocked && (
                                        <div className="absolute -bottom-1 -right-1 bg-slate-900/80 rounded-full p-0.5">
                                            <Lock size={8} className="text-amber-400" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="text-indigo-400/60 bg-indigo-500/5 p-3 rounded-xl border border-white/5 shadow-inner relative">
                                <FolderIcon size={22} className="fill-indigo-500/20 stroke-[1.5]" />
                                {folder.isLocked && (
                                    <div className="absolute -bottom-1 -right-1 bg-slate-900 rounded-full p-1 shadow-lg border border-white/10">
                                        <Lock size={10} className="text-amber-400" />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <div className={cn("flex-1 min-w-0 flex flex-col justify-center text-left relative z-10", viewMode === 'grid' ? "p-4 overflow-hidden" : "")}>
                    <h3 className="font-semibold text-white/90 group-hover:text-white truncate">{folder.name}</h3>
                    {folder.description ? (
                        <p className={cn("text-white/40 truncate", viewMode === 'grid' ? "text-xs mt-1.5" : "text-sm mt-0.5")}>
                            {folder.description}
                        </p>
                    ) : (
                        viewMode === 'list' && <p className="text-xs text-white/40 mt-0.5">Folder</p>
                    )}
                </div>

                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(e); }}
                    className={cn(
                        "z-20 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-400 hover:text-red-300 border border-red-400/20 absolute",
                        viewMode === 'grid' ? "top-2 right-2" : "right-4"
                    )}
                    title="Delete"
                >
                    <Trash2 size={14} />
                </button>
            </div>

            {/* Drop indicator — after */}
            {dropPosition === 'after' && (
                <div className={cn(
                    "absolute z-30 bg-indigo-400 rounded-full",
                    viewMode === 'grid' ? "right-0 top-0 bottom-0 w-[3px] translate-x-[6px]" : "left-0 right-0 bottom-0 h-[3px] translate-y-[5px]"
                )} />
            )}
        </div>
    );
}
