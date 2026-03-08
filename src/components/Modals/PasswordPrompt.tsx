import { Lock } from "lucide-react";

interface PasswordPromptProps {
    isOpen: boolean;
    passwordInput: string;
    setPasswordInput: (val: string) => void;
    onCancel: () => void;
    onSubmit: () => void;
}

export function PasswordPrompt({
    isOpen,
    passwordInput,
    setPasswordInput,
    onCancel,
    onSubmit
}: PasswordPromptProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
            <div className="bg-slate-900/60 border border-white/10 rounded-3xl w-full max-w-sm p-8 shadow-2xl backdrop-blur-2xl">
                <div className="flex flex-col items-center text-center mb-8">
                    <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mb-5 border border-indigo-400/30">
                        <Lock size={28} className="text-indigo-300" />
                    </div>
                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60">Unlock Folder</h2>
                    <p className="text-white/40 text-sm mt-2">Enter your encryption password</p>
                </div>
                <input
                    type="password"
                    autoFocus
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                    placeholder="Password..."
                    className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all mb-6 shadow-inner"
                />
                <div className="flex gap-3">
                    <button onClick={onCancel} className="flex-1 px-4 py-3.5 rounded-2xl border border-white/10 hover:bg-white/5 font-semibold text-white/70">Cancel</button>
                    <button onClick={onSubmit} className="flex-1 px-4 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">Unlock</button>
                </div>
            </div>
        </div>
    );
}
