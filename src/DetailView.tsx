import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open } from "@tauri-apps/plugin-dialog";
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
    Link as LinkIcon,
    QrCode,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ConfirmDeleteModal } from "./components/Modals/ConfirmDeleteModal";

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
    const [item, setItem] = useState<(Item & { folderKey?: number[] | null, rootFolderId?: string | null }) | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState("");
    const [editUrl, setEditUrl] = useState("");
    const [editContent, setEditContent] = useState("");
    const [editImageFilename, setEditImageFilename] = useState("");
    const [copiedUrl, setCopiedUrl] = useState(false);
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showQrExpanded, setShowQrExpanded] = useState(false);

    // Listen for item data from main window
    useEffect(() => {
        const unlisten = listen<Item & { folderKey?: number[] | null, rootFolderId?: string | null }>("show-item", (event) => {
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

    const emitToast = async (message: string, type: 'success' | 'error') => {
        try {
            const { Window } = await import("@tauri-apps/api/window");
            const mainWindow = await Window.getByLabel("main");
            if (mainWindow) await mainWindow.emit("show-toast", { message, type });
        } catch { /* ignore */ }
    };

    const handleUpdate = async () => {
        if (!item) return;
        try {
            await invoke("update_item", {
                id: item.id,
                title: editTitle,
                content: JSON.stringify({ url: editUrl, body: editContent }),
                imageUrl: editImageFilename || null,
                folderKey: item.folderKey,
                rootFolderId: item.rootFolderId || null
            });
            setItem({
                ...item,
                title: editTitle,
                content: JSON.stringify({ url: editUrl, body: editContent }),
                imageUrl: editImageFilename || undefined
            });
            setIsEditing(false);
            const { Window } = await import("@tauri-apps/api/window");
            const mainWindow = await Window.getByLabel("main");
            if (mainWindow) await mainWindow.emit("refresh-data", {});
            await emitToast("Note updated", "success");
        } catch (e) {
            await emitToast("Failed to update: " + e, "error");
        }
    };

    const handleDelete = () => {
        if (!item) return;
        setShowDeleteConfirm(true);
    };

    const executeDelete = async () => {
        if (!item) return;
        try {
            await invoke("delete_item", { id: item.id, rootFolderId: item.rootFolderId || null, folderKey: item.folderKey });
            const { Window } = await import("@tauri-apps/api/window");
            const mainWindow = await Window.getByLabel("main");
            if (mainWindow) {
                await mainWindow.emit("refresh-data", {});
                await mainWindow.emit("show-toast", { message: "Note deleted", type: "success" });
            }
            getCurrentWindow().close();
        } catch (e) {
            await emitToast("Failed to delete: " + e, "error");
            setShowDeleteConfirm(false);
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
                            <div className="bg-white/5 p-3 rounded-2xl border border-white/10 shadow-inner flex items-start gap-3">
                                {/* QR code anchored left inside the box */}
                                <div
                                    onClick={() => setShowQrExpanded(true)}
                                    className="shrink-0 cursor-pointer group"
                                >
                                    <div className="bg-white p-1.5 rounded-lg group-hover:shadow-indigo-500/20 group-hover:scale-105 transition-all">
                                        <QRCodeSVG value={url} size={64} level="M" />
                                    </div>
                                </div>
                                {/* URL text wrapping beside the QR */}
                                <span className="text-emerald-300 break-all text-sm font-medium flex-1 pt-1 leading-relaxed">{url}</span>
                                {/* Action buttons */}
                                <div className="flex gap-1.5 shrink-0 pt-0.5">
                                    <button onClick={() => copyToClipboard(url)} className="bg-white/10 hover:bg-white/20 p-2 rounded-lg text-white/60 hover:text-white transition-all" title="Copy">
                                        {copiedUrl ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                    </button>
                                    <button onClick={() => openLink(url)} className="bg-emerald-500/20 p-2 rounded-lg text-emerald-300 hover:bg-emerald-500 hover:text-white transition-all" title="Open in browser">
                                        <ExternalLink size={14} />
                                    </button>
                                    <button onClick={() => setShowQrExpanded(true)} className="bg-white/10 hover:bg-white/20 p-2 rounded-lg text-white/60 hover:text-white transition-all" title="Expand QR Code">
                                        <QrCode size={14} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Expanded QR Code modal */}
                        {showQrExpanded && url && (
                            <div
                                className="fixed inset-0 z-[100] flex items-center justify-center cursor-pointer"
                                onClick={() => setShowQrExpanded(false)}
                            >
                                <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
                                <div className="relative flex flex-col items-center gap-6" onClick={e => e.stopPropagation()}>
                                    <div className="bg-white p-6 rounded-3xl shadow-2xl">
                                        <QRCodeSVG value={url} size={280} level="H" />
                                    </div>
                                    <p className="text-white/70 text-sm max-w-xs text-center break-all">{url}</p>
                                    <p className="text-white/30 text-xs">Click anywhere to close</p>
                                </div>
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
            <ConfirmDeleteModal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={executeDelete}
                type="note"
                name={item.title}
            />
        </div>
    );
}
