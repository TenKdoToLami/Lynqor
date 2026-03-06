import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open, ask } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { Item } from "./types";
import {
    FileText,
    ExternalLink,
    Pencil,
    Trash2,
    Copy,
    Check,
    ImagePlus,
    Bold,
    Italic,
    Heading,
    Code,
    Link as LinkIcon
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

function parseItemContent(content: string): { url: string; body: string } {
    try {
        const parsed = JSON.parse(content);
        return { url: parsed.url || "", body: parsed.body || "" };
    } catch {
        return { url: "", body: content };
    }
}

const MarkdownImage = ({ src, alt }: { src?: string, alt?: string }) => {
    const [imgData, setImgData] = useState<string | null>(null);
    useEffect(() => {
        if (!src) return;
        if (src.startsWith('http') || src.startsWith('data:')) {
            setImgData(src);
            return;
        }
        invoke<string>("get_image_base64", { filename: src })
            .then(data => setImgData(data))
            .catch(e => console.error("Failed to load markdown image", e));
    }, [src]);

    if (!imgData) return <span className="text-white/30 italic text-sm">[Loading image...]</span>;
    return <img src={imgData} alt={alt} className="max-w-full rounded-xl border border-white/10 my-4 shadow-lg object-contain bg-black/50" />;
};

export default function DetailView() {
    const [item, setItem] = useState<(Item & { folderKey?: number[] | null }) | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState("");
    const [editUrl, setEditUrl] = useState("");
    const [editContent, setEditContent] = useState("");
    const [editImageFilename, setEditImageFilename] = useState("");
    const [copiedUrl, setCopiedUrl] = useState(false);
    const [imageSrc, setImageSrc] = useState<string | null>(null);

    // Listen for item data from main window
    useEffect(() => {
        const unlisten = listen<Item & { folderKey?: number[] | null }>("show-item", (event) => {
            setItem(event.payload);
            setIsEditing(false);
        });

        return () => { unlisten.then(fn => fn()); };
    }, []);

    // Resolve image path when item changes
    useEffect(() => {
        if (item?.imageUrl) {
            invoke<string>("get_image_base64", { filename: item.imageUrl })
                .then(dataUrl => setImageSrc(dataUrl))
                .catch(() => setImageSrc(null));
        } else {
            setImageSrc(null);
        }
    }, [item?.imageUrl]);

    const openLink = async (url: string) => {
        try { await openUrl(url); } catch { window.open(url, '_blank'); }
    };

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedUrl(true);
            setTimeout(() => setCopiedUrl(false), 2000);
        } catch { /* fallback */ }
    };

    const pickImage = async (): Promise<string> => {
        const selected = await open({
            multiple: false,
            filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] }]
        });
        if (!selected) return "";
        const filename = await invoke<string>("save_image", { sourcePath: selected });
        return filename;
    };

    const startEditing = () => {
        if (!item) return;
        const parsed = parseItemContent(item.content);
        setEditTitle(item.title);
        setEditUrl(parsed.url);
        setEditContent(parsed.body);
        setEditImageFilename(item.imageUrl || "");
        setIsEditing(true);
    };

    const handleUpdate = async () => {
        if (!item) return;
        try {
            await invoke("update_item", {
                id: item.id,
                title: editTitle,
                content: JSON.stringify({ url: editUrl, body: editContent }),
                imageUrl: editImageFilename || null,
                folderKey: item.folderKey
            });
            // Update local state
            setItem({
                ...item,
                title: editTitle,
                content: JSON.stringify({ url: editUrl, body: editContent }),
                imageUrl: editImageFilename || undefined
            });
            setIsEditing(false);
            // Notify main window to refresh
            const { Window } = await import("@tauri-apps/api/window");
            const mainWindow = await Window.getByLabel("main");
            if (mainWindow) await mainWindow.emit("refresh-data", {});
        } catch (e) {
            alert("Failed to update: " + e);
        }
    };

    const handleDelete = async () => {
        if (!item) return;
        try {
            const confirmed = await ask("Are you sure you want to delete this note? This action cannot be undone.", {
                title: "Delete Note",
                kind: "warning",
            });
            if (confirmed) {
                await invoke("delete_item", { id: item.id });
                const { Window } = await import("@tauri-apps/api/window");
                const mainWindow = await Window.getByLabel("main");
                if (mainWindow) await mainWindow.emit("refresh-data", {});
                getCurrentWindow().close();
            }
        } catch (e) {
            alert("Failed to delete: " + e);
        }
    };

    if (!item) {
        return (
            <div className="min-h-screen bg-slate-950 text-neutral-100 flex items-center justify-center">
                <div className="text-white/30 flex flex-col items-center gap-4">
                    <FileText size={48} className="opacity-30" />
                    <p className="text-lg font-medium">Select a note to view</p>
                </div>
            </div>
        );
    }

    const { url, body } = parseItemContent(item.content);

    return (
        <div className="min-h-screen bg-slate-950 text-neutral-100 flex flex-col font-sans selection:bg-indigo-500/30 relative overflow-hidden">
            {/* Background */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute -top-40 -right-20 w-[500px] h-[500px] bg-amber-600/15 rounded-full blur-[120px] mix-blend-screen opacity-50" />
                <div className="absolute -bottom-40 -left-20 w-[400px] h-[400px] bg-indigo-600/15 rounded-full blur-[100px] mix-blend-screen opacity-40" />
            </div>

            {/* Header */}
            <header className="h-14 border-b border-white/5 bg-white/5 backdrop-blur-xl flex items-center justify-between px-6 sticky top-0 z-10 relative shadow-sm">
                <div data-tauri-drag-region className="absolute inset-0 w-full h-full cursor-default" />

                <div className="flex items-center gap-3 relative z-10 flex-1 min-w-0">
                    <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-400/30 shrink-0">
                        <FileText size={18} className="text-amber-300" />
                    </div>
                    {isEditing ? (
                        <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} className="text-lg font-bold bg-transparent text-white border-b border-white/20 focus:border-indigo-400 focus:outline-none px-1 py-1 flex-1 min-w-0" />
                    ) : (
                        <h1 className="text-lg font-bold text-white truncate">{item.title}</h1>
                    )}
                </div>

                <div className="flex gap-2 relative z-10 shrink-0 ml-3">
                    {!isEditing && (
                        <>
                            {url && (
                                <button onClick={() => openLink(url)} className="p-2 bg-emerald-500/20 hover:bg-emerald-500/40 border border-emerald-400/30 rounded-lg text-emerald-300 hover:text-emerald-200 transition-all" title="Open link">
                                    <ExternalLink size={16} />
                                </button>
                            )}
                            <button onClick={startEditing} className="p-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg text-white transition-all" title="Edit">
                                <Pencil size={16} />
                            </button>
                            <button onClick={handleDelete} className="p-2 bg-red-500/20 hover:bg-red-500/40 border border-red-400/30 rounded-lg text-red-400 hover:text-red-300 transition-all" title="Delete">
                                <Trash2 size={16} />
                            </button>
                        </>
                    )}
                    {isEditing && (
                        <>
                            <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 font-semibold text-xs text-white/70 hover:text-white transition-all">Cancel</button>
                            <button onClick={handleUpdate} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all">Save</button>
                        </>
                    )}
                </div>
            </header>

            {/* Content */}
            <main className="flex-1 overflow-y-auto p-6 relative z-0">
                {isEditing ? (
                    <div className="space-y-4 max-w-2xl mx-auto">
                        <div>
                            <label className="text-sm font-semibold text-emerald-300/80 mb-2 block ml-1">Link URL (Optional)</label>
                            <input type="url" value={editUrl} onChange={e => setEditUrl(e.target.value)} placeholder="https://" className="w-full bg-black/20 border border-emerald-500/30 rounded-2xl px-5 py-3 text-emerald-100 placeholder-emerald-900/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all shadow-inner" />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-pink-300/80 mb-2 block ml-1">Preview Image (Click & Paste supported)</label>
                            <button
                                type="button"
                                onClick={async () => { const f = await pickImage(); if (f) setEditImageFilename(f); }}
                                onPaste={async (e) => {
                                    const items = e.clipboardData.items;
                                    for (let i = 0; i < items.length; i++) {
                                        if (items[i].type.indexOf('image') !== -1) {
                                            e.preventDefault();
                                            const file = items[i].getAsFile();
                                            if (!file) continue;
                                            const reader = new FileReader();
                                            reader.onload = async (event) => {
                                                const base64Data = event.target?.result as string;
                                                try {
                                                    const filename = await invoke<string>("save_base64_image", { base64Data });
                                                    setEditImageFilename(filename);
                                                } catch (err) { alert("Failed to save pasted image: " + err); }
                                            };
                                            reader.readAsDataURL(file);
                                            break;
                                        }
                                    }
                                }}
                                className="w-full bg-black/20 border border-pink-500/30 rounded-2xl px-5 py-3 text-left flex items-center gap-3 hover:bg-black/30 transition-all outline-none focus:ring-2 focus:ring-pink-500/50"
                                title="Click to select or paste an image (Ctrl+V)"
                            >
                                <ImagePlus size={18} className="text-pink-400" />
                                <span className={editImageFilename ? "text-pink-100" : "text-pink-900/50"}>
                                    {editImageFilename ? `Image: ${editImageFilename} (Paste to replace)` : "Choose or paste an image file..."}
                                </span>
                            </button>
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-amber-300/80 mb-2 block ml-1 flex justify-between">
                                <span>Content</span>
                                <span className="text-xs font-normal text-white/30">Markdown Supported</span>
                            </label>
                            <div className="bg-black/20 border border-amber-500/30 rounded-2xl overflow-hidden shadow-inner focus-within:ring-2 focus-within:ring-amber-500/50 transition-all">
                                <div className="flex items-center gap-1 bg-black/40 px-3 py-2 border-b border-amber-500/20">
                                    <button type="button" onClick={() => {
                                        const txt = document.getElementById('edit-item-content') as HTMLTextAreaElement;
                                        if (!txt) return;
                                        const start = txt.selectionStart; const end = txt.selectionEnd;
                                        setEditContent(prev => prev.substring(0, start) + "**" + prev.substring(start, end) + "**" + prev.substring(end));
                                    }} className="p-1.5 rounded-lg text-amber-100/60 hover:text-amber-300 hover:bg-amber-500/20 transition-all" title="Bold"><Bold size={16} /></button>
                                    <button type="button" onClick={() => {
                                        const txt = document.getElementById('edit-item-content') as HTMLTextAreaElement;
                                        if (!txt) return;
                                        const start = txt.selectionStart; const end = txt.selectionEnd;
                                        setEditContent(prev => prev.substring(0, start) + "*" + prev.substring(start, end) + "*" + prev.substring(end));
                                    }} className="p-1.5 rounded-lg text-amber-100/60 hover:text-amber-300 hover:bg-amber-500/20 transition-all" title="Italic"><Italic size={16} /></button>
                                    <button type="button" onClick={() => {
                                        const txt = document.getElementById('edit-item-content') as HTMLTextAreaElement;
                                        if (!txt) return;
                                        const start = txt.selectionStart;
                                        setEditContent(prev => prev.substring(0, start) + "\n### " + prev.substring(start));
                                    }} className="p-1.5 rounded-lg text-amber-100/60 hover:text-amber-300 hover:bg-amber-500/20 transition-all" title="Heading"><Heading size={16} /></button>
                                    <button type="button" onClick={() => {
                                        const txt = document.getElementById('edit-item-content') as HTMLTextAreaElement;
                                        if (!txt) return;
                                        const start = txt.selectionStart; const end = txt.selectionEnd;
                                        setEditContent(prev => prev.substring(0, start) + "`" + prev.substring(start, end) + "`" + prev.substring(end));
                                    }} className="p-1.5 rounded-lg text-amber-100/60 hover:text-amber-300 hover:bg-amber-500/20 transition-all" title="Code"><Code size={16} /></button>
                                    <button type="button" onClick={() => {
                                        const txt = document.getElementById('edit-item-content') as HTMLTextAreaElement;
                                        if (!txt) return;
                                        const start = txt.selectionStart; const end = txt.selectionEnd;
                                        setEditContent(prev => prev.substring(0, start) + "[" + prev.substring(start, end) + "](url)" + prev.substring(end));
                                    }} className="p-1.5 rounded-lg text-amber-100/60 hover:text-amber-300 hover:bg-amber-500/20 transition-all" title="Link"><LinkIcon size={16} /></button>
                                </div>
                                <textarea id="edit-item-content" rows={16} value={editContent} onChange={e => setEditContent(e.target.value)}
                                    onPaste={async (e) => {
                                        const items = e.clipboardData.items;
                                        for (let i = 0; i < items.length; i++) {
                                            if (items[i].type.indexOf('image') !== -1) {
                                                e.preventDefault();
                                                const file = items[i].getAsFile();
                                                if (!file) continue;
                                                const reader = new FileReader();
                                                reader.onload = async (event) => {
                                                    const base64Data = event.target?.result as string;
                                                    try {
                                                        const filename = await invoke<string>("save_base64_image", { base64Data });
                                                        const txt = document.getElementById('edit-item-content') as HTMLTextAreaElement;
                                                        const start = txt ? txt.selectionStart : editContent.length;
                                                        setEditContent(prev => prev.substring(0, start) + `\n![pasted image](${filename})\n` + prev.substring(start));
                                                    } catch (err) { alert("Failed to save pasted image: " + err); }
                                                };
                                                reader.readAsDataURL(file);
                                                break;
                                            }
                                        }
                                    }}
                                    placeholder="Type your note here... (Paste images directly!)" className="w-full bg-transparent p-5 text-white placeholder-amber-900/50 focus:outline-none font-mono text-sm leading-relaxed resize-none" />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6 max-w-2xl mx-auto">
                        {imageSrc && (
                            <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                                <img src={imageSrc} alt="Preview" className="w-full max-h-80 object-cover" />
                            </div>
                        )}

                        {url && (
                            <div className="bg-white/5 p-4 rounded-2xl border border-white/10 shadow-inner flex items-center gap-3 hover:bg-white/10 transition-colors">
                                <span className="text-emerald-300 break-all text-sm font-medium truncate flex-1">{url}</span>
                                <button onClick={() => copyToClipboard(url)} className="bg-white/10 hover:bg-white/20 p-2.5 rounded-xl text-white/60 hover:text-white transition-all shrink-0" title="Copy">
                                    {copiedUrl ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                                </button>
                                <button onClick={() => openLink(url)} className="bg-emerald-500/20 p-2.5 rounded-xl text-emerald-300 hover:bg-emerald-500 hover:text-white transition-all shrink-0" title="Open in browser">
                                    <ExternalLink size={16} />
                                </button>
                            </div>
                        )}

                        {body && (
                            <div className="prose prose-invert prose-indigo prose-base mx-auto w-full">
                                <Markdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{ img: MarkdownImage }}
                                >
                                    {body}
                                </Markdown>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
