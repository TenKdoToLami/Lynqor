import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Folder as FolderIcon, Lock } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Folder } from '../types';
import { cn } from '../utils';

interface SidebarProps {
    currentFolderId: string | null;
    onNavigate: (path: Folder[], folderKey: number[] | null, rootLockedId: string | null) => void;
    onRequestUnlock: (folder: Folder, pathSoFar: Folder[], rootLockedId: string | null) => void;
}

export function Sidebar({ currentFolderId, onNavigate, onRequestUnlock }: SidebarProps) {
    const [rootFolders, setRootFolders] = useState<Folder[]>([]);

    useEffect(() => {
        // Load root folders
        invoke<Folder[]>('get_folders_by_parent', {
            parentId: null,
            folderKey: null,
            rootFolderId: null
        }).then(setRootFolders).catch(console.error);
    }, []);

    return (
        <div className="w-64 h-full bg-slate-900/50 backdrop-blur-xl border-r border-white/5 flex flex-col pt-4">
            <div className="px-6 mb-4 flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-indigo-500 flex items-center justify-center">
                    <span className="text-white font-bold text-sm">L</span>
                </div>
                <h1 className="text-lg font-bold text-white tracking-tight">Lynqor</h1>
            </div>

            <div className="flex-1 overflow-y-auto px-2">
                <div className="space-y-0.5">
                    <button
                        onClick={() => onNavigate([], null, null)}
                        className={cn(
                            "w-full flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-default",
                            currentFolderId === null
                                ? "bg-indigo-500/20 text-indigo-300"
                                : "text-white/60 hover:bg-white/5 hover:text-white"
                        )}
                    >
                        <FolderIcon size={16} className={currentFolderId === null ? "text-indigo-400" : "text-amber-400"} />
                        <span>Vault Root</span>
                    </button>

                    {rootFolders.map(folder => (
                        <FolderNode
                            key={folder.id}
                            folder={folder}
                            pathSoFar={[folder]}
                            depth={1}
                            isRootLocked={folder.isLocked}
                            rootLockedId={folder.isLocked ? folder.id : null}
                            parentKey={null}
                            currentFolderId={currentFolderId}
                            onNavigate={onNavigate}
                            onRequestUnlock={onRequestUnlock}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

interface FolderNodeProps {
    folder: Folder;
    pathSoFar: Folder[];
    depth: number;
    isRootLocked: boolean;
    rootLockedId: string | null;
    parentKey: number[] | null;
    currentFolderId: string | null;
    onNavigate: (path: Folder[], folderKey: number[] | null, rootLockedId: string | null) => void;
    onRequestUnlock: (folder: Folder, pathSoFar: Folder[], rootLockedId: string | null) => void;
}

function FolderNode({
    folder,
    pathSoFar,
    depth,
    isRootLocked,
    rootLockedId,
    parentKey,
    currentFolderId,
    onNavigate,
    onRequestUnlock
}: FolderNodeProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [children, setChildren] = useState<Folder[]>([]);


    const isSelected = currentFolderId === folder.id;

    const handleToggleExpand = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isExpanded) {
            setIsExpanded(false);
            return;
        }

        // If it's a locked folder and we don't have the key, we can't expand it directly yet
        if (folder.isLocked && !parentKey) {
            // Must prompt for password first. The grid view handles this well.
            // We'll let `onRequestUnlock` handle it.
            onRequestUnlock(folder, pathSoFar.slice(0, -1), null);
            return;
        }

        try {
            const fetched = await invoke<Folder[]>('get_folders_by_parent', {
                parentId: folder.id,
                folderKey: parentKey,
                rootFolderId: rootLockedId
            });
            setChildren(fetched);
            setIsExpanded(true);
        } catch (err) {
            console.error("Failed to load children", err);
        }
    };

    const handleClick = () => {
        if (folder.isLocked && !parentKey) {
            onRequestUnlock(folder, pathSoFar.slice(0, -1), null);
        } else {
            onNavigate(pathSoFar, parentKey, rootLockedId);
            // Auto-expand on click if not already
            if (!isExpanded) {
                handleToggleExpand({ stopPropagation: () => { } } as React.MouseEvent);
            }
        }
    };

    return (
        <div>
            <div
                className={cn(
                    "w-full flex items-center gap-1.5 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-default group",
                    isSelected
                        ? "bg-indigo-500/20 text-indigo-300"
                        : "text-white/60 hover:bg-white/5 hover:text-white"
                )}
                style={{ paddingLeft: `${depth * 16}px`, paddingRight: '8px' }}
                onClick={handleClick}
            >
                <button
                    onClick={handleToggleExpand}
                    className="p-0.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                {folder.isLocked && !parentKey ? (
                    <Lock size={14} className="text-rose-400 shrink-0" />
                ) : (
                    <FolderIcon size={14} className={isSelected ? "text-indigo-400 shrink-0" : "text-amber-400 shrink-0"} />
                )}

                <span className="truncate">{folder.name}</span>
            </div>

            {isExpanded && children.map(child => (
                <FolderNode
                    key={child.id}
                    folder={child}
                    pathSoFar={[...pathSoFar, child]}
                    depth={depth + 1}
                    isRootLocked={isRootLocked || child.isLocked}
                    rootLockedId={rootLockedId}
                    parentKey={parentKey} // Passing down the same symmetric key for the blob
                    currentFolderId={currentFolderId}
                    onNavigate={onNavigate}
                    onRequestUnlock={onRequestUnlock}
                />
            ))}
        </div>
    );
}
