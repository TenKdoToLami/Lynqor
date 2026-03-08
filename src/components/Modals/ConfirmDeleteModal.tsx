import { useState, useEffect } from "react";
import { Trash2, AlertTriangle } from "lucide-react";

interface ConfirmDeleteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    type: 'note' | 'folder';
    name: string;
    isBusy?: boolean;
}

export function ConfirmDeleteModal({ isOpen, onClose, onConfirm, type, name, isBusy }: ConfirmDeleteModalProps) {
    const [confirmText, setConfirmText] = useState("");

    useEffect(() => {
        if (isOpen) setConfirmText("");
    }, [isOpen]);

    if (!isOpen) return null;

    const isFolder = type === 'folder';
    const canConfirm = isFolder ? confirmText === name : true;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-slate-900/95 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden ring-1 ring-red-500/20">
                <div className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
                            <AlertTriangle size={20} className="text-red-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-white">Delete {isFolder ? 'Folder' : 'Note'}</h3>
                            <p className="text-sm text-white/40">This cannot be undone</p>
                        </div>
                    </div>

                    <p className="text-sm text-white/70 mb-4">
                        {isFolder ? (
                            <>
                                This will permanently delete <span className="font-semibold text-white">"{name}"</span> and{' '}
                                <span className="text-red-300 font-medium">all of its contents</span> including subfolders and notes.
                            </>
                        ) : (
                            <>
                                Are you sure you want to delete <span className="font-semibold text-white">"{name}"</span>?
                            </>
                        )}
                    </p>

                    {isFolder && (
                        <div className="mb-4">
                            <label className="text-xs text-white/50 mb-1.5 block">
                                Type <span className="text-red-300 font-mono font-semibold">{name}</span> to confirm
                            </label>
                            <input
                                type="text"
                                value={confirmText}
                                onChange={(e) => setConfirmText(e.target.value)}
                                placeholder={name}
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-red-500/40 transition-all"
                                autoFocus
                            />
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-3 p-4 pt-0">
                    <button
                        onClick={onClose}
                        disabled={isBusy}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm font-medium hover:bg-white/10 transition-all disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={!canConfirm || isBusy}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-red-600/80 hover:bg-red-600 border border-red-500/30 text-white text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <Trash2 size={14} />
                        {isBusy ? 'Deleting...' : 'Delete'}
                    </button>
                </div>
            </div>
        </div>
    );
}
