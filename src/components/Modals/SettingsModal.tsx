
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, X, ExternalLink, Scaling } from 'lucide-react';
import { useSettings } from '../../store/settings';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const { openInNewWindow, setOpenInNewWindow, tileIconSize, setTileIconSize } = useSettings();

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/[0.02]">
                            <div className="flex items-center gap-2 text-indigo-400">
                                <Settings size={20} />
                                <h2 className="text-lg font-semibold text-white tracking-tight">Preferences</h2>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-8 overflow-y-auto">
                            {/* Note Opening Behavior */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-white/80 font-medium">
                                    <ExternalLink size={18} className="text-emerald-400" />
                                    <h3>Reading Notes</h3>
                                </div>
                                <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                                    <label className="flex items-start gap-4 cursor-pointer group">
                                        <div className="relative flex items-center mt-0.5">
                                            <input
                                                type="checkbox"
                                                checked={openInNewWindow}
                                                onChange={(e) => setOpenInNewWindow(e.target.checked)}
                                                className="sr-only"
                                            />
                                            <div className={`w-10 h-6 bg-white/10 rounded-full transition-colors ${openInNewWindow ? 'bg-emerald-500' : ''}`}></div>
                                            <div className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform ${openInNewWindow ? 'translate-x-4' : ''}`}></div>
                                        </div>
                                        <div>
                                            <div className="text-white font-medium mb-1 group-hover:text-emerald-300 transition-colors">Open notes in a new separate window</div>
                                            <div className="text-sm text-white/40 leading-relaxed">
                                                If disabled, notes will open inline on the right side of the main window for a seamless layout.
                                            </div>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            {/* Grid Size */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-white/80 font-medium">
                                        <Scaling size={18} className="text-amber-400" />
                                        <h3>Grid Tile Size</h3>
                                    </div>
                                    <span className="text-xs text-amber-400/80 font-mono bg-amber-400/10 px-2 py-0.5 rounded-md">
                                        {tileIconSize}px
                                    </span>
                                </div>
                                <div className="bg-black/20 rounded-xl p-4 border border-white/5 space-y-4">
                                    <input
                                        type="range"
                                        min="64"
                                        max="256"
                                        step="8"
                                        value={tileIconSize}
                                        onChange={(e) => setTileIconSize(parseInt(e.target.value))}
                                        className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                    />
                                    <div className="flex justify-between text-xs text-white/30 font-medium px-1">
                                        <span>Small</span>
                                        <span>Large</span>
                                    </div>
                                    <div className="text-sm text-white/40 leading-relaxed">
                                        Adjusts the physical size of folder and note icons in the grid layout to fit more or less on screen.
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-white/5 bg-white/[0.02] flex justify-end">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all"
                            >
                                Close
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
