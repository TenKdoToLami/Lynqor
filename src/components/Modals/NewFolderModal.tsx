import { Folder as FolderIcon, Plus, Lock } from "lucide-react";

interface NewFolderModalProps {
    isOpen: boolean;
    onClose: () => void;
    folderName: string;
    setFolderName: (val: string) => void;
    encrypt: boolean;
    setEncrypt: (val: boolean) => void;
    password: string;
    setPassword: (val: string) => void;
    onCreate: () => void;
}

export function NewFolderModal({
    isOpen,
    onClose,
    folderName,
    setFolderName,
    encrypt,
    setEncrypt,
    password,
    setPassword,
    onCreate
}: NewFolderModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
            <div className="bg-slate-900/60 border border-white/10 rounded-3xl w-full max-w-md p-8 shadow-2xl backdrop-blur-2xl">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-500/20 rounded-2xl border border-indigo-400/30">
                            <FolderIcon size={22} className="text-indigo-300 fill-indigo-500/20" />
                        </div>
                        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60">New Folder</h2>
                    </div>
                    <button onClick={onClose} className="text-white/40 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-full">
                        <Plus size={20} className="rotate-45" />
                    </button>
                </div>
                <div className="space-y-6 mb-8">
                    <div>
                        <label className="text-sm font-semibold text-white/60 mb-2 block ml-1">Folder Name</label>
                        <input
                            type="text"
                            value={folderName}
                            onChange={e => setFolderName(e.target.value)}
                            autoFocus
                            placeholder="e.g. Passwords"
                            className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-inner"
                        />
                    </div>
                    <div className="p-5 bg-black/20 border border-white/10 rounded-2xl shadow-inner">
                        <label className="flex items-start gap-4 cursor-pointer group">
                            <div className="relative flex items-center justify-center mt-1">
                                <input
                                    type="checkbox"
                                    checked={encrypt}
                                    onChange={e => setEncrypt(e.target.checked)}
                                    className="peer appearance-none w-5 h-5 border-2 border-white/30 rounded-md checked:bg-indigo-500 checked:border-indigo-500"
                                />
                                <svg className="absolute w-3 h-3 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <div>
                                <span className="text-sm font-semibold text-white/90 block">Encrypt & Lock Folder</span>
                                <span className="text-xs text-white/40 mt-1 block">Require a password to access.</span>
                            </div>
                        </label>
                        {encrypt && (
                            <div className="mt-4 pt-4 border-t border-white/10">
                                <label className="text-xs font-semibold text-indigo-300 mb-2 block ml-1 flex items-center gap-1">
                                    <Lock size={12} /> Custom Password (Optional)
                                </label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Leave blank to use parent's"
                                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 shadow-inner"
                                />
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-6 py-3.5 rounded-2xl border border-white/10 hover:bg-white/5 font-semibold text-white/70">Cancel</button>
                    <button onClick={onCreate} className="px-6 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">Create Folder</button>
                </div>
            </div>
        </div>
    );
}
