import { Search, LayoutGrid, List as ListIcon, Plus, Folder as FolderIcon, FileText } from "lucide-react";
import { cn } from "../utils";
import { ItemType } from "../types";

type SortOption = 'manual' | 'a-z' | 'z-a' | 'latest_edit' | 'latest_create';

interface ToolbarProps {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    handleSearch: () => void;
    sortBy: SortOption;
    setSortBy: (sort: SortOption) => void;
    viewMode: 'grid' | 'list';
    setViewMode: (mode: 'grid' | 'list') => void;
    isNewMenuOpen: boolean;
    setIsNewMenuOpen: (open: boolean) => void;
    onNewFolder: () => void;
    onNewNote: (type: ItemType) => void;
}

export function Toolbar({
    searchQuery,
    setSearchQuery,
    handleSearch,
    sortBy,
    setSortBy,
    viewMode,
    setViewMode,
    isNewMenuOpen,
    setIsNewMenuOpen,
    onNewFolder,
    onNewNote
}: ToolbarProps) {
    return (
        <>
            <div className="relative z-10 w-1/3 flex justify-center">
                <div className="relative w-full max-w-md">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="Search notes & folders..."
                        className="w-full bg-black/20 border border-white/10 rounded-full pl-10 pr-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all shadow-inner"
                    />
                    <Search size={16} className="absolute left-3.5 top-2.5 text-white/40" />
                </div>
            </div>

            <div className="flex items-center justify-end gap-3 relative z-10 w-1/3">
                <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="bg-black/20 border border-white/10 rounded-lg text-white/70 text-sm px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 appearance-none"
                >
                    <option value="manual">Manual Order</option>
                    <option value="a-z">A to Z</option>
                    <option value="z-a">Z to A</option>
                    <option value="latest_edit">Last Edited</option>
                    <option value="latest_create">Date Created</option>
                </select>

                <div className="flex items-center bg-white/5 rounded-lg p-1 border border-white/5 shadow-inner">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={cn("p-1.5 rounded-md transition-all", viewMode === 'grid' ? "bg-white/10 text-white shadow-lg ring-1 ring-white/10" : "text-white/40 hover:text-white hover:bg-white/5")}
                    >
                        <LayoutGrid size={16} />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={cn("p-1.5 rounded-md transition-all", viewMode === 'list' ? "bg-white/10 text-white shadow-lg ring-1 ring-white/10" : "text-white/40 hover:text-white hover:bg-white/5")}
                    >
                        <ListIcon size={16} />
                    </button>
                </div>

                <div className="relative">
                    <button
                        onClick={() => setIsNewMenuOpen(!isNewMenuOpen)}
                        className="flex items-center gap-2 bg-gradient-to-tr from-indigo-600 to-purple-600 hover:opacity-90 text-white px-5 py-2 rounded-xl font-medium transition-all shadow-lg shadow-indigo-500/25 ring-1 ring-white/20"
                    >
                        <Plus size={18} />
                        <span className="hidden sm:inline tracking-wide text-sm font-semibold">New</span>
                    </button>

                    {isNewMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsNewMenuOpen(false)} />
                            <div className="absolute right-0 mt-3 w-56 bg-slate-900/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 py-1 ring-1 ring-black/50">
                                <button
                                    onClick={() => { onNewFolder(); setIsNewMenuOpen(false); }}
                                    className="w-full text-left px-4 py-3 hover:bg-white/10 flex items-center gap-3 text-neutral-200 font-medium text-sm"
                                >
                                    <FolderIcon size={16} className="text-indigo-400" /> Folder
                                </button>
                                <div className="h-px bg-white/5 my-1 mx-3" />
                                <button
                                    onClick={() => { onNewNote('NOTE'); setIsNewMenuOpen(false); }}
                                    className="w-full text-left px-4 py-3 hover:bg-white/10 flex items-center gap-3 text-neutral-200 font-medium text-sm"
                                >
                                    <FileText size={16} className="text-amber-400" /> Note / Link
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
