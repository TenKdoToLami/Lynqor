import { useState, useRef, useEffect } from "react";
import { Search, LayoutGrid, List as ListIcon, Plus, Folder as FolderIcon, FileText, ArrowUpDown, X } from "lucide-react";
import { cn } from "../utils";
import { ItemType } from "../types";

type SortOption = 'manual' | 'a-z' | 'z-a' | 'latest_edit' | 'latest_create';

const SORT_LABELS: Record<SortOption, string> = {
    manual: 'Manual Order',
    'a-z': 'A → Z',
    'z-a': 'Z → A',
    latest_edit: 'Last Edited',
    latest_create: 'Date Created',
};

interface ToolbarProps {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    onClearSearch: () => void;
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
    onClearSearch,
    sortBy,
    setSortBy,
    viewMode,
    setViewMode,
    isNewMenuOpen,
    setIsNewMenuOpen,
    onNewFolder,
    onNewNote
}: ToolbarProps) {
    const [isSortOpen, setIsSortOpen] = useState(false);
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);

    const isSearchExpanded = isSearchFocused || searchQuery.length > 0;

    useEffect(() => {
        if (isSearchExpanded && searchRef.current) {
            searchRef.current.focus();
        }
    }, [isSearchExpanded]);

    return (
        <div className="flex items-center justify-end gap-3 relative z-10 w-2/3">
            {/* Search — expands leftward from the toolbar */}
            <div className={cn(
                "relative transition-all duration-300 ease-out",
                isSearchExpanded ? "flex-1 max-w-md" : "w-auto"
            )}>
                {isSearchExpanded ? (
                    <>
                        <input
                            ref={searchRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onBlur={() => setIsSearchFocused(false)}
                            placeholder="Search notes & folders..."
                            className="w-full bg-black/20 border border-white/10 rounded-full pl-10 pr-9 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all shadow-inner"
                        />
                        <Search size={16} className="absolute left-3.5 top-2.5 text-white/40" />
                        {searchQuery && (
                            <button
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={onClearSearch}
                                className="absolute right-3 top-2 p-0.5 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </>
                ) : (
                    <button
                        onClick={() => setIsSearchFocused(true)}
                        className="p-2 rounded-lg bg-black/20 border border-white/10 text-white/50 hover:text-white hover:bg-white/5 transition-all"
                    >
                        <Search size={16} />
                    </button>
                )}
            </div>

            {/* Sort dropdown */}
            <div className="relative">
                <button
                    onClick={() => setIsSortOpen(!isSortOpen)}
                    className={cn(
                        "p-2 rounded-lg transition-all border",
                        isSortOpen
                            ? "bg-white/10 text-white border-white/15 shadow-lg"
                            : "bg-black/20 text-white/50 border-white/10 hover:text-white hover:bg-white/5"
                    )}
                    title={`Sort: ${SORT_LABELS[sortBy]}`}
                >
                    <ArrowUpDown size={16} />
                </button>

                {isSortOpen && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsSortOpen(false)} />
                        <div className="absolute right-0 mt-2 w-48 bg-slate-900/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 py-1 ring-1 ring-black/50">
                            {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([key, label]) => (
                                <button
                                    key={key}
                                    onClick={() => { setSortBy(key); setIsSortOpen(false); }}
                                    className={cn(
                                        "w-full text-left px-4 py-2.5 flex items-center gap-2 text-sm font-medium transition-colors",
                                        sortBy === key
                                            ? "text-indigo-300 bg-indigo-500/10"
                                            : "text-neutral-300 hover:bg-white/10"
                                    )}
                                >
                                    {sortBy === key && <span className="text-indigo-400">✓</span>}
                                    <span className={sortBy === key ? "" : "ml-5"}>{label}</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* View mode toggle */}
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

            {/* New button */}
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
    );
}
