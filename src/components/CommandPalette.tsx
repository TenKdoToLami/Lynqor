import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileText, Folder as FolderIcon, Command } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Folder } from '../types';

interface SearchResultItem {
    id: string;
    isFolder: boolean;
    name: string;
    content?: string;
    parentId?: string;
    itemType?: string;
    imageUrl?: string;
}

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    rootFolders: Folder[]; // Needed to pass folder keys if we search locked folders (though search_vault only searches unlocked folders or currently unlocked blobs)
    currentFolderKey: number[] | null;
    rootLockedFolderId: string | null;
    onSelectResult: (result: SearchResultItem) => void;
}

export function CommandPalette({ isOpen, onClose, currentFolderKey, rootLockedFolderId, onSelectResult }: CommandPaletteProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResultItem[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setResults([]);
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                if (isOpen) onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                const res = await invoke<SearchResultItem[]>('search_vault', {
                    query,
                    folderKey: currentFolderKey,
                    rootFolderId: rootLockedFolderId
                });
                setResults(res);
                setSelectedIndex(0);
            } catch (err) {
                console.error("Search failed:", err);
            }
        }, 200);

        return () => clearTimeout(timer);
    }, [query, currentFolderKey, rootLockedFolderId]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(i => Math.min(i + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (results.length > 0) {
                onSelectResult(results[selectedIndex]);
                onClose();
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="relative w-full max-w-2xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                    >
                        {/* Input Header */}
                        <div className="flex items-center px-4 py-4 border-b border-white/10 bg-white/[0.02]">
                            <Search className="text-white/40 mr-3" size={24} />
                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Search notes, folders, or type a command..."
                                className="flex-1 bg-transparent text-xl text-white placeholder-white/30 focus:outline-none"
                            />
                            <div className="flex items-center gap-1 text-xs text-white/30 font-medium px-2 py-1 bg-white/5 rounded-md ml-3">
                                <Command size={12} />
                                <span>K</span>
                            </div>
                        </div>

                        {/* Results */}
                        {query.trim() && (
                            <div className="max-h-[60vh] overflow-y-auto p-2">
                                {results.length === 0 ? (
                                    <div className="py-12 text-center text-white/40">
                                        No results found for "{query}"
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        {results.map((item, i) => (
                                            <button
                                                key={item.id}
                                                onClick={() => {
                                                    onSelectResult(item);
                                                    onClose();
                                                }}
                                                onMouseEnter={() => setSelectedIndex(i)}
                                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-left ${i === selectedIndex ? 'bg-indigo-500/20 shadow-inner' : 'hover:bg-white/5'
                                                    }`}
                                            >
                                                <div className={`p-2 rounded-lg ${item.isFolder ? 'bg-amber-500/20 text-amber-400' : 'bg-indigo-500/20 text-indigo-400'
                                                    }`}>
                                                    {item.isFolder ? <FolderIcon size={18} /> : <FileText size={18} />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className={`font-semibold truncate ${i === selectedIndex ? 'text-white' : 'text-white/80'}`}>
                                                        {item.name}
                                                    </h4>
                                                    {item.content && (
                                                        <p className="text-xs text-white/40 truncate mt-0.5">{item.content}</p>
                                                    )}
                                                </div>
                                                <div className="text-xs text-white/20 uppercase tracking-wider font-semibold">
                                                    {item.isFolder ? 'Folder' : 'Note'}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Default State (Empty Query) */}
                        {!query.trim() && (
                            <div className="p-4 text-center text-white/30 text-sm">
                                Start typing to search your entire vault securely...
                            </div>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
