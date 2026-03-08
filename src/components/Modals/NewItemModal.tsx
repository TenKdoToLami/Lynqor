import { FileText, Plus, ImagePlus, Bold, Italic, Heading, Code, Link as LinkIcon } from "lucide-react";

interface NewItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    setTitle: (val: string) => void;
    url: string;
    setUrl: (val: string) => void;
    content: string;
    setContent: (val: string) => void;
    imageFilename: string;
    setImageFilename: (val: string) => void;
    onPickImage: () => void;
    onPasteImage: (e: React.ClipboardEvent) => void;
    onCreate: () => void;
}

export function NewItemModal({
    isOpen,
    onClose,
    title,
    setTitle,
    url,
    setUrl,
    content,
    setContent,
    imageFilename,
    setImageFilename,
    onPickImage,
    onPasteImage,
    onCreate
}: NewItemModalProps) {
    if (!isOpen) return null;

    const insertText = (markup: string) => {
        const txt = document.getElementById('new-item-content') as HTMLTextAreaElement;
        if (!txt) return;
        const start = txt.selectionStart;
        const end = txt.selectionEnd;
        const current = content;

        if (markup.includes('url')) {
            setContent(current.substring(0, start) + "[" + current.substring(start, end) + "](url)" + current.substring(end));
        } else if (markup === '### ') {
            setContent(current.substring(0, start) + "\n" + markup + current.substring(start));
        } else {
            setContent(current.substring(0, start) + markup + current.substring(start, end) + markup + current.substring(end));
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
            <div className="bg-slate-900/60 border border-white/10 rounded-3xl w-full max-w-2xl p-8 shadow-2xl backdrop-blur-2xl">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl border shadow-lg bg-amber-500/20 border-amber-400/30">
                            <FileText size={22} className="text-amber-300" />
                        </div>
                        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60">New Note</h2>
                    </div>
                    <button onClick={onClose} className="text-white/40 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-full">
                        <Plus size={20} className="rotate-45" />
                    </button>
                </div>
                <div className="space-y-4 mb-8">
                    <div>
                        <label className="text-sm font-semibold text-white/60 mb-2 block ml-1">Title</label>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            autoFocus
                            placeholder="Enter title..."
                            className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-3.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-inner"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-emerald-300/80 mb-2 block ml-1">Link URL (Optional)</label>
                        <input
                            type="url"
                            value={url}
                            onChange={e => setUrl(e.target.value)}
                            placeholder="https://"
                            className="w-full bg-black/20 border border-emerald-500/30 rounded-2xl px-5 py-3.5 text-emerald-100 placeholder-emerald-900/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-inner"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-pink-300/80 mb-2 block ml-1">Preview Image (Click & Paste supported)</label>
                        <button
                            type="button"
                            onClick={onPickImage}
                            onPaste={onPasteImage}
                            className="w-full bg-black/20 border border-pink-500/30 rounded-2xl px-5 py-3.5 text-left flex items-center gap-3 hover:bg-black/30 outline-none focus:ring-2 focus:ring-pink-500/50"
                            title="Click to select or paste an image (Ctrl+V)"
                        >
                            <ImagePlus size={18} className="text-pink-400" />
                            <span className={imageFilename ? "text-pink-100" : "text-pink-900/50"}>
                                {imageFilename ? "Image selected ✓ (Paste to replace)" : "Choose or paste an image file..."}
                            </span>
                        </button>
                    </div>
                </div>
                <div>
                    <label className="text-sm font-semibold text-amber-300/80 mb-2 block ml-1 flex justify-between">
                        <span>Content</span>
                        <span className="text-xs font-normal text-white/30">Markdown Supported</span>
                    </label>
                    <div className="bg-black/20 border border-amber-500/30 rounded-2xl overflow-hidden shadow-inner focus-within:ring-2 focus-within:ring-amber-500/50 transition-all">
                        <div className="flex items-center gap-1 bg-black/40 px-3 py-2 border-b border-amber-500/20">
                            <button onClick={() => insertText("**")} className="p-1.5 rounded-lg text-amber-100/60 hover:text-amber-300 hover:bg-amber-500/20 transition-all" title="Bold"><Bold size={16} /></button>
                            <button onClick={() => insertText("*")} className="p-1.5 rounded-lg text-amber-100/60 hover:text-amber-300 hover:bg-amber-500/20 transition-all" title="Italic"><Italic size={16} /></button>
                            <button onClick={() => insertText("### ")} className="p-1.5 rounded-lg text-amber-100/60 hover:text-amber-300 hover:bg-amber-500/20 transition-all" title="Heading"><Heading size={16} /></button>
                            <button onClick={() => insertText("`")} className="p-1.5 rounded-lg text-amber-100/60 hover:text-amber-300 hover:bg-amber-500/20 transition-all" title="Code"><Code size={16} /></button>
                            <button onClick={() => insertText("url")} className="p-1.5 rounded-lg text-amber-100/60 hover:text-amber-300 hover:bg-amber-500/20 transition-all" title="Link"><LinkIcon size={16} /></button>
                        </div>
                        <textarea
                            id="new-item-content"
                            rows={6}
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            onPaste={onPasteImage}
                            placeholder="Type your note here... (Paste images directly!)"
                            className="w-full bg-transparent p-5 text-white placeholder-amber-900/50 focus:outline-none font-mono text-sm resize-none"
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={onClose} className="px-6 py-3.5 rounded-2xl border border-white/10 hover:bg-white/5 font-semibold text-white/70">Cancel</button>
                    <button onClick={onCreate} className="px-6 py-3.5 rounded-2xl text-white font-semibold shadow-lg bg-amber-600 hover:bg-amber-500">Save Item</button>
                </div>
            </div>
        </div>
    );
}
