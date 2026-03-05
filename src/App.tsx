import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open } from "@tauri-apps/plugin-dialog";
import { Folder, Item, ItemType } from "./types";
import {
  Folder as FolderIcon,
  Lock,
  ChevronRight,
  LayoutGrid,
  List as ListIcon,
  FileText,
  Plus,
  ArrowLeft,
  Trash2,
  ExternalLink,
  Pencil,
  Copy,
  Check,
  ImagePlus
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "./utils";

// Helper: parse item content JSON safely
function parseItemContent(content: string): { url: string; body: string } {
  try {
    const parsed = JSON.parse(content);
    return { url: parsed.url || "", body: parsed.body || "" };
  } catch {
    return { url: "", body: content };
  }
}

export default function App() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentFolderKey, setCurrentFolderKey] = useState<number[] | null>(null);
  const [folderPath, setFolderPath] = useState<Folder[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  // Modal States
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showNewItemModal, setShowNewItemModal] = useState(false);
  const [passwordPrompt, setPasswordPrompt] = useState<{ isOpen: boolean; targetFolderId: string | null }>({ isOpen: false, targetFolderId: null });
  const [passwordInput, setPasswordInput] = useState("");
  const [newItemType, setNewItemType] = useState<ItemType | null>(null);

  // Form States
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderEncrypt, setNewFolderEncrypt] = useState(false);
  const [newFolderPassword, setNewFolderPassword] = useState("");

  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemUrl, setNewItemUrl] = useState("");
  const [newItemContent, setNewItemContent] = useState("");
  const [newItemImageFilename, setNewItemImageFilename] = useState("");

  // Edit States
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editImageFilename, setEditImageFilename] = useState("");

  // UI States
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Resolved image paths cache
  const [imagePaths, setImagePaths] = useState<Record<string, string>>({});

  // Load Data
  const loadData = useCallback(async () => {
    try {
      const foldersData = await invoke<Folder[]>("get_folders_by_parent", { parentId: currentFolderId, folderKey: currentFolderKey });
      setFolders(foldersData);

      const itemsData = await invoke<Item[]>("get_items_by_folder", { folderId: currentFolderId, folderKey: currentFolderKey });
      setItems(itemsData);

      // Resolve image paths for items with images
      const paths: Record<string, string> = {};
      for (const item of itemsData) {
        if (item.imageUrl) {
          try {
            const fullPath = await invoke<string>("get_image_path", { filename: item.imageUrl });
            paths[item.imageUrl] = convertFileSrc(fullPath);
          } catch {
            // Image not found, skip
          }
        }
      }
      setImagePaths(paths);
    } catch (e) {
      console.error(e);
    }
  }, [currentFolderId, currentFolderKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Breadcrumbs
  const navigateToRoot = () => {
    setCurrentFolderId(null);
    setCurrentFolderKey(null);
    setFolderPath([]);
  };

  const navigateToBreadcrumb = (crumb: Folder, idx: number) => {
    setCurrentFolderId(crumb.id);
    setFolderPath(folderPath.slice(0, idx + 1));
    setCurrentFolderKey(null);
  };

  const navigateUp = () => {
    if (folderPath.length > 1) {
      const newPath = folderPath.slice(0, -1);
      const parentFolder = newPath[newPath.length - 1];
      setFolderPath(newPath);
      setCurrentFolderId(parentFolder.id);
      setCurrentFolderKey(null);
    } else {
      navigateToRoot();
    }
  };

  const handleFolderClick = (folder: Folder) => {
    if (folder.isLocked) {
      setPasswordPrompt({ isOpen: true, targetFolderId: folder.id });
    } else {
      setCurrentFolderId(folder.id);
      setFolderPath([...folderPath, folder]);
    }
  };

  const submitPassword = async () => {
    if (!passwordPrompt.targetFolderId) return;
    try {
      const targetFolder = folders.find(f => f.id === passwordPrompt.targetFolderId);
      const unlockedKey = await invoke<number[]>("unlock_folder", {
        folderId: passwordPrompt.targetFolderId,
        password: passwordInput,
        parentFolderKey: currentFolderKey
      });
      setCurrentFolderId(passwordPrompt.targetFolderId);
      setCurrentFolderKey(unlockedKey);
      if (targetFolder) setFolderPath([...folderPath, targetFolder]);
    } catch (e) {
      alert("Failed to unlock folder: " + e);
    } finally {
      setPasswordPrompt({ isOpen: false, targetFolderId: null });
      setPasswordInput("");
    }
  };

  const handleCreateFolder = async () => {
    try {
      await invoke("create_folder", {
        id: crypto.randomUUID(),
        parentId: currentFolderId,
        name: newFolderName,
        password: newFolderEncrypt ? (newFolderPassword || undefined) : undefined,
        parentFolderKey: currentFolderKey
      });
      setShowNewFolderModal(false);
      setNewFolderName("");
      setNewFolderPassword("");
      setNewFolderEncrypt(false);
      loadData();
    } catch (e) {
      alert("Failed to create folder: " + e);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await invoke("delete_folder", { id: folderId });
      loadData();
    } catch (e) {
      alert("Failed to delete folder: " + e);
    }
  };

  // Image picker: open file dialog, save to app data, return filename
  const pickImage = async (): Promise<string> => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] }]
    });
    if (!selected) return "";
    const filename = await invoke<string>("save_image", { sourcePath: selected });
    return filename;
  };

  const handleCreateItem = async () => {
    try {
      await invoke("create_item", {
        id: crypto.randomUUID(),
        folderId: currentFolderId,
        itemType: newItemType,
        title: newItemTitle,
        content: JSON.stringify({ url: newItemUrl, body: newItemContent }),
        imageUrl: newItemImageFilename || null,
        folderKey: currentFolderKey
      });
      setShowNewItemModal(false);
      setNewItemTitle("");
      setNewItemUrl("");
      setNewItemContent("");
      setNewItemImageFilename("");
      loadData();
    } catch (e) {
      alert("Failed to create item: " + e);
    }
  };

  const handleUpdateItem = async () => {
    if (!selectedItem) return;
    try {
      await invoke("update_item", {
        id: selectedItem.id,
        title: editTitle,
        content: JSON.stringify({ url: editUrl, body: editContent }),
        imageUrl: editImageFilename || null,
        folderKey: currentFolderKey
      });
      setIsEditing(false);
      setSelectedItem(null);
      loadData();
    } catch (e) {
      alert("Failed to update item: " + e);
    }
  };

  const handleDeleteItem = async () => {
    if (!selectedItem) return;
    try {
      await invoke("delete_item", { id: selectedItem.id });
      setSelectedItem(null);
      loadData();
    } catch (e) {
      alert("Failed to delete item: " + e);
    }
  };

  const startEditing = () => {
    if (!selectedItem) return;
    const parsed = parseItemContent(selectedItem.content);
    setEditTitle(selectedItem.title);
    setEditUrl(parsed.url);
    setEditContent(parsed.body);
    setEditImageFilename(selectedItem.imageUrl || "");
    setIsEditing(true);
  };

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

  const getImageSrc = (imageUrl: string | undefined) => {
    if (!imageUrl) return null;
    return imagePaths[imageUrl] || null;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-neutral-100 flex flex-col font-sans selection:bg-indigo-500/30 relative overflow-hidden">

      {/* Background Ambient Mesh */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-40 -left-20 w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[120px] mix-blend-screen opacity-60" />
        <div className="absolute top-1/2 -right-40 w-[500px] h-[500px] bg-violet-600/20 rounded-full blur-[120px] mix-blend-screen opacity-50" />
        <div className="absolute -bottom-40 left-1/4 w-[400px] h-[400px] bg-sky-600/20 rounded-full blur-[100px] mix-blend-screen opacity-40" />
      </div>

      {/* Header */}
      <header className="h-16 border-b border-white/5 bg-white/5 backdrop-blur-xl flex items-center justify-between px-6 sticky top-0 z-10 w-full relative shadow-sm">
        <div data-tauri-drag-region className="absolute inset-0 w-full h-full cursor-default" />

        <div className="flex items-center gap-3 relative z-10">
          {currentFolderId && (
            <button onClick={navigateUp} className="p-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg transition-all flex items-center text-neutral-300 hover:text-white">
              <ArrowLeft size={16} />
            </button>
          )}

          <button onClick={navigateToRoot} className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300 hover:opacity-80 transition-opacity drop-shadow-sm">
            Lynqor
          </button>

          {folderPath.map((crumb, idx, arr) => (
            <div key={crumb.id} className="flex items-center gap-2 text-white/50">
              <ChevronRight size={14} className="text-white/30" />
              <button
                onClick={() => navigateToBreadcrumb(crumb, idx)}
                className={cn("hover:text-indigo-300 transition-colors font-medium drop-shadow-sm", idx === arr.length - 1 ? "text-white" : "")}
              >
                {crumb.name}
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 relative z-10">
          <div className="flex items-center bg-white/5 rounded-lg p-1 border border-white/5 shadow-inner">
            <button onClick={() => setViewMode('grid')} className={cn("p-1.5 rounded-md transition-all duration-200", viewMode === 'grid' ? "bg-white/10 text-white shadow-lg shadow-black/20 ring-1 ring-white/10" : "text-white/40 hover:text-white hover:bg-white/5")}>
              <LayoutGrid size={16} />
            </button>
            <button onClick={() => setViewMode('list')} className={cn("p-1.5 rounded-md transition-all duration-200", viewMode === 'list' ? "bg-white/10 text-white shadow-lg shadow-black/20 ring-1 ring-white/10" : "text-white/40 hover:text-white hover:bg-white/5")}>
              <ListIcon size={16} />
            </button>
          </div>

          <div className="relative">
            <button onClick={() => setIsNewMenuOpen(!isNewMenuOpen)} className="flex items-center gap-2 bg-gradient-to-tr from-indigo-600 to-purple-600 hover:opacity-90 text-white px-5 py-2 rounded-xl font-medium transition-all shadow-lg shadow-indigo-500/25 ring-1 ring-white/20">
              <Plus size={18} />
              <span className="hidden sm:inline tracking-wide text-sm font-semibold">New</span>
            </button>

            {isNewMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsNewMenuOpen(false)} />
                <div className="absolute right-0 mt-3 w-56 bg-slate-900/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 py-1 ring-1 ring-black/50">
                  <button onClick={() => { setShowNewFolderModal(true); setIsNewMenuOpen(false); }} className="w-full text-left px-4 py-3 hover:bg-white/10 flex items-center gap-3 text-neutral-200 transition-colors font-medium text-sm">
                    <FolderIcon size={16} className="text-indigo-400" /> Folder
                  </button>
                  <div className="h-px bg-white/5 my-1 mx-3" />
                  <button onClick={() => { setNewItemType('NOTE'); setShowNewItemModal(true); setIsNewMenuOpen(false); }} className="w-full text-left px-4 py-3 hover:bg-white/10 flex items-center gap-3 text-neutral-200 transition-colors font-medium text-sm">
                    <FileText size={16} className="text-amber-400" /> Note / Link
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto relative z-0">
        {folders.length === 0 && items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-white/30 mt-10">
            <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-inner">
              <FolderIcon size={40} className="opacity-50" />
            </div>
            <h2 className="text-2xl font-bold text-white/80 tracking-tight">This space is empty</h2>
            <p className="mt-2 text-sm text-white/40">Add notes, links, or nested folders using the New button.</p>
          </div>
        ) : (
          <div className={cn(
            "gap-5",
            viewMode === 'grid'
              ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
              : "flex flex-col space-y-3 max-w-5xl mx-auto"
          )}>
            {/* Folders */}
            {folders.map((folder) => (
              <div
                key={folder.id}
                className={cn(
                  "group text-left border border-white/10 bg-white/5 backdrop-blur-md hover:bg-white/10 hover:border-white/20 hover:shadow-xl hover:shadow-black/20 transition-all duration-300 rounded-2xl overflow-hidden relative",
                  viewMode === 'grid' ? "aspect-square p-5 flex flex-col items-center justify-center text-center" : "p-4 flex items-center gap-5"
                )}
              >
                <button onClick={() => handleFolderClick(folder)} className="absolute inset-0 z-0 cursor-pointer" />
                <div className={cn("text-indigo-400 relative drop-shadow-md z-10 pointer-events-none", viewMode === 'grid' ? "mb-4" : "")}>
                  <FolderIcon size={viewMode === 'grid' ? 56 : 28} className="fill-indigo-500/20 stroke-[1.5]" />
                  {folder.isLocked && (
                    <div className="absolute -bottom-1 -right-1 bg-slate-900 rounded-full p-1.5 shadow-lg shadow-black/50 border border-white/10">
                      <Lock size={12} className="text-amber-400" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 z-10 pointer-events-none">
                  <h3 className="font-semibold text-white/90 truncate group-hover:text-white transition-colors tracking-tight">{folder.name}</h3>
                  {viewMode === 'list' && <p className="text-xs text-white/40 mt-0.5">Folder</p>}
                </div>
                {/* Delete folder button */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
                  className="z-10 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-400 hover:text-red-300 border border-red-400/20 absolute top-2 right-2"
                  title="Delete folder"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            {/* Items */}
            {items.map((item) => {
              const parsed = parseItemContent(item.content);
              const imgSrc = getImageSrc(item.imageUrl);
              return (
                <div
                  key={item.id}
                  className={cn(
                    "group text-left border border-white/10 bg-white/5 backdrop-blur-md hover:bg-white/10 hover:border-white/20 hover:shadow-xl hover:shadow-black/20 transition-all duration-300 rounded-2xl overflow-hidden relative",
                    viewMode === 'grid' ? "flex flex-col" : "p-4 flex items-center gap-5"
                  )}
                >
                  {/* Grid thumbnail */}
                  {viewMode === 'grid' && (
                    <button onClick={() => setSelectedItem(item)} className="h-32 w-full bg-black/20 border-b border-white/5 flex items-center justify-center overflow-hidden relative cursor-pointer">
                      {imgSrc ? (
                        <img src={imgSrc} alt={item.title} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" />
                      ) : (
                        <div className="text-white/20 group-hover:text-white/60 transition-colors">
                          <FileText size={40} className="stroke-[1.5]" />
                        </div>
                      )}
                    </button>
                  )}

                  {/* List thumbnail */}
                  {viewMode === 'list' && (
                    <button onClick={() => setSelectedItem(item)} className="shrink-0 cursor-pointer">
                      {imgSrc ? (
                        <div className="w-12 h-12 rounded-xl overflow-hidden border border-white/10">
                          <img src={imgSrc} alt={item.title} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="text-white/40 bg-white/5 p-3 rounded-xl border border-white/5 shadow-inner">
                          <FileText size={22} className="stroke-[1.5]" />
                        </div>
                      )}
                    </button>
                  )}

                  <button onClick={() => setSelectedItem(item)} className={cn("flex-1 min-w-0 flex flex-col justify-center cursor-pointer text-left", viewMode === 'grid' ? "p-4" : "")}>
                    <h3 className="font-semibold text-white/90 group-hover:text-white truncate transition-colors tracking-tight">{item.title}</h3>
                    <p className={cn("text-white/40 truncate leading-relaxed", viewMode === 'grid' ? "text-xs mt-1.5" : "text-sm mt-0.5")}>{parsed.body}</p>
                  </button>

                  {/* Link icon on card */}
                  {parsed.url && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openLink(parsed.url); }}
                      className={cn(
                        "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20 p-2 rounded-xl transition-all shrink-0 z-10",
                        viewMode === 'grid' ? "absolute top-2 right-2 bg-black/40 backdrop-blur-sm border border-white/10" : ""
                      )}
                      title="Open link"
                    >
                      <ExternalLink size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Password Unlock Modal */}
      {passwordPrompt.isOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-900/60 border border-white/10 rounded-3xl w-full max-w-sm p-8 shadow-2xl shadow-black/50 backdrop-blur-2xl">
            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mb-5 border border-indigo-400/30 shadow-[0_0_30px_rgba(99,102,241,0.3)]">
                <Lock size={28} className="text-indigo-300" />
              </div>
              <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60">Unlock Folder</h2>
              <p className="text-white/40 text-sm mt-2 font-medium">Enter your encryption password</p>
            </div>
            <input type="password" autoFocus value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitPassword()} placeholder="Password..." className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all mb-6 font-medium shadow-inner" />
            <div className="flex gap-3">
              <button onClick={() => setPasswordPrompt({ isOpen: false, targetFolderId: null })} className="flex-1 px-4 py-3.5 rounded-2xl border border-white/10 hover:bg-white/5 font-semibold text-white/70 hover:text-white transition-all">Cancel</button>
              <button onClick={submitPassword} className="flex-1 px-4 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-[0_0_20px_rgba(79,70,229,0.4)]">Unlock</button>
            </div>
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-900/60 border border-white/10 rounded-3xl w-full max-w-md p-8 shadow-2xl shadow-black/50 backdrop-blur-2xl">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-500/20 rounded-2xl border border-indigo-400/30"><FolderIcon size={22} className="text-indigo-300 fill-indigo-500/20" /></div>
                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60">New Folder</h2>
              </div>
              <button onClick={() => setShowNewFolderModal(false)} className="text-white/40 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-full transition-all"><Plus size={20} className="rotate-45" /></button>
            </div>
            <div className="space-y-6 mb-8">
              <div>
                <label className="text-sm font-semibold text-white/60 mb-2 block ml-1">Folder Name</label>
                <input type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} autoFocus placeholder="e.g. Passwords" className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-medium shadow-inner" />
              </div>
              <div className="p-5 bg-black/20 border border-white/10 rounded-2xl shadow-inner">
                <label className="flex items-start gap-4 cursor-pointer group">
                  <div className="relative flex items-center justify-center mt-1">
                    <input type="checkbox" checked={newFolderEncrypt} onChange={e => setNewFolderEncrypt(e.target.checked)} className="peer appearance-none w-5 h-5 border-2 border-white/30 rounded-md checked:bg-indigo-500 checked:border-indigo-500 transition-all" />
                    <svg className="absolute w-3 h-3 text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-white/90 block">Encrypt & Lock Folder</span>
                    <span className="text-xs text-white/40 mt-1 block leading-relaxed">Require a password to access.</span>
                  </div>
                </label>
                {newFolderEncrypt && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <label className="text-xs font-semibold text-indigo-300 mb-2 block ml-1 flex items-center gap-1"><Lock size={12} /> Custom Password (Optional)</label>
                    <input type="password" value={newFolderPassword} onChange={e => setNewFolderPassword(e.target.value)} placeholder="Leave blank to use parent's" className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all shadow-inner" />
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowNewFolderModal(false)} className="px-6 py-3.5 rounded-2xl border border-white/10 hover:bg-white/5 font-semibold text-white/70 hover:text-white transition-all">Cancel</button>
              <button onClick={handleCreateFolder} className="px-6 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-[0_0_20px_rgba(79,70,229,0.4)]">Create Folder</button>
            </div>
          </div>
        </div>
      )}

      {/* New Item Modal */}
      {showNewItemModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-900/60 border border-white/10 rounded-3xl w-full max-w-2xl p-8 shadow-2xl shadow-black/50 backdrop-blur-2xl">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl border shadow-lg bg-amber-500/20 border-amber-400/30 shadow-amber-500/20"><FileText size={22} className="text-amber-300" /></div>
                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60">New Note</h2>
              </div>
              <button onClick={() => setShowNewItemModal(false)} className="text-white/40 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-full transition-all"><Plus size={20} className="rotate-45" /></button>
            </div>

            <div className="space-y-4 mb-8">
              <div>
                <label className="text-sm font-semibold text-white/60 mb-2 block ml-1">Title</label>
                <input type="text" value={newItemTitle} onChange={e => setNewItemTitle(e.target.value)} autoFocus placeholder="Enter title..." className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-3.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-medium shadow-inner" />
              </div>
              <div>
                <label className="text-sm font-semibold text-emerald-300/80 mb-2 block ml-1">Link URL (Optional)</label>
                <input type="url" value={newItemUrl} onChange={e => setNewItemUrl(e.target.value)} placeholder="https://" className="w-full bg-black/20 border border-emerald-500/30 rounded-2xl px-5 py-3.5 text-emerald-100 placeholder-emerald-900/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all shadow-inner" />
              </div>
              <div>
                <label className="text-sm font-semibold text-pink-300/80 mb-2 block ml-1">Preview Image</label>
                <button
                  onClick={async () => {
                    const filename = await pickImage();
                    if (filename) setNewItemImageFilename(filename);
                  }}
                  className="w-full bg-black/20 border border-pink-500/30 rounded-2xl px-5 py-3.5 text-left flex items-center gap-3 hover:bg-black/30 transition-all"
                >
                  <ImagePlus size={18} className="text-pink-400" />
                  <span className={newItemImageFilename ? "text-pink-100" : "text-pink-900/50"}>
                    {newItemImageFilename ? `Image selected ✓` : "Choose an image file..."}
                  </span>
                </button>
              </div>
              <div>
                <label className="text-sm font-semibold text-amber-300/80 mb-2 block ml-1 flex justify-between">
                  <span>Content</span>
                  <span className="text-xs font-normal text-white/30">Markdown Supported</span>
                </label>
                <textarea rows={6} value={newItemContent} onChange={e => setNewItemContent(e.target.value)} placeholder="Type your note here..." className="w-full bg-black/20 border border-amber-500/30 rounded-2xl p-5 text-white placeholder-amber-900/50 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all font-mono text-sm leading-relaxed resize-none shadow-inner" />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setShowNewItemModal(false)} className="px-6 py-3.5 rounded-2xl border border-white/10 hover:bg-white/5 font-semibold text-white/70 hover:text-white transition-all">Cancel</button>
              <button onClick={handleCreateItem} className="px-6 py-3.5 rounded-2xl text-white font-semibold transition-all shadow-lg bg-amber-600 hover:bg-amber-500 shadow-amber-500/20">Save Item</button>
            </div>
          </div>
        </div>
      )}

      {/* Item Details / Edit Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-2xl z-[100] flex items-center justify-center p-4 sm:p-8" onClick={() => { setSelectedItem(null); setIsEditing(false); }}>
          <div className="bg-slate-900/70 border border-white/10 rounded-[2rem] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl shadow-black" onClick={e => e.stopPropagation()}>
            <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-white/5 backdrop-blur-md">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="p-3 rounded-2xl border shadow-lg bg-amber-500/20 border-amber-400/30 shadow-amber-500/20 shrink-0">
                  <FileText size={22} className="text-amber-300" />
                </div>
                {isEditing ? (
                  <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} className="text-2xl font-bold bg-transparent text-white border-b border-white/20 focus:border-indigo-400 focus:outline-none px-1 py-1 flex-1 min-w-0" />
                ) : (
                  <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60 tracking-tight truncate">{selectedItem.title}</h2>
                )}
              </div>
              <div className="flex gap-2 shrink-0 ml-4">
                {!isEditing && (
                  <>
                    {(() => {
                      const { url } = parseItemContent(selectedItem.content);
                      return url ? (
                        <button onClick={() => openLink(url)} className="p-2.5 bg-emerald-500/20 hover:bg-emerald-500/40 border border-emerald-400/30 rounded-xl text-emerald-300 hover:text-emerald-200 transition-all" title="Open link">
                          <ExternalLink size={18} />
                        </button>
                      ) : null;
                    })()}
                    <button onClick={startEditing} className="p-2.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-white transition-all" title="Edit">
                      <Pencil size={18} />
                    </button>
                    <button onClick={handleDeleteItem} className="p-2.5 bg-red-500/20 hover:bg-red-500/40 border border-red-400/30 rounded-xl text-red-400 hover:text-red-300 transition-all" title="Delete">
                      <Trash2 size={18} />
                    </button>
                  </>
                )}
                {isEditing && (
                  <>
                    <button onClick={() => setIsEditing(false)} className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 font-semibold text-sm text-white/70 hover:text-white transition-all">Cancel</button>
                    <button onClick={handleUpdateItem} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all">Save</button>
                  </>
                )}
                <button onClick={() => { setSelectedItem(null); setIsEditing(false); }} className="p-2.5 hover:bg-white/10 rounded-xl text-white/50 hover:text-white transition-all bg-white/5 border border-white/5">
                  <Plus size={20} className="rotate-45" />
                </button>
              </div>
            </div>

            <div className="p-8 overflow-y-auto flex-1">
              {isEditing ? (
                <div className="space-y-4 max-w-3xl mx-auto">
                  <div>
                    <label className="text-sm font-semibold text-emerald-300/80 mb-2 block ml-1">Link URL (Optional)</label>
                    <input type="url" value={editUrl} onChange={e => setEditUrl(e.target.value)} placeholder="https://" className="w-full bg-black/20 border border-emerald-500/30 rounded-2xl px-5 py-3.5 text-emerald-100 placeholder-emerald-900/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all shadow-inner" />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-pink-300/80 mb-2 block ml-1">Preview Image</label>
                    <button
                      onClick={async () => {
                        const filename = await pickImage();
                        if (filename) setEditImageFilename(filename);
                      }}
                      className="w-full bg-black/20 border border-pink-500/30 rounded-2xl px-5 py-3.5 text-left flex items-center gap-3 hover:bg-black/30 transition-all"
                    >
                      <ImagePlus size={18} className="text-pink-400" />
                      <span className={editImageFilename ? "text-pink-100" : "text-pink-900/50"}>
                        {editImageFilename ? `Image: ${editImageFilename}` : "Choose an image file..."}
                      </span>
                    </button>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-amber-300/80 mb-2 block ml-1 flex justify-between">
                      <span>Content</span>
                      <span className="text-xs font-normal text-white/30">Markdown Supported</span>
                    </label>
                    <textarea rows={12} value={editContent} onChange={e => setEditContent(e.target.value)} placeholder="Type your note here..." className="w-full bg-black/20 border border-amber-500/30 rounded-2xl p-5 text-white placeholder-amber-900/50 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all font-mono text-sm leading-relaxed resize-none shadow-inner" />
                  </div>
                </div>
              ) : (
                (() => {
                  const { url, body } = parseItemContent(selectedItem.content);
                  const imgSrc = getImageSrc(selectedItem.imageUrl);
                  return (
                    <div className="space-y-6 max-w-3xl mx-auto py-4">
                      {imgSrc && (
                        <div className="rounded-3xl overflow-hidden border border-white/10 shadow-2xl relative group">
                          <img src={imgSrc} alt="Preview" className="w-full h-80 object-cover group-hover:scale-[1.02] transition-transform duration-700" />
                        </div>
                      )}

                      {url && (
                        <div className="bg-white/5 p-5 rounded-3xl border border-white/10 shadow-inner flex items-center gap-3 group hover:bg-white/10 transition-colors">
                          <span className="text-emerald-300 break-all text-lg font-medium truncate flex-1">{url}</span>
                          <button onClick={() => copyToClipboard(url)} className="bg-white/10 hover:bg-white/20 p-3 rounded-2xl text-white/60 hover:text-white transition-all shrink-0" title="Copy link">
                            {copiedUrl ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
                          </button>
                          <button onClick={() => openLink(url)} className="bg-emerald-500/20 p-3 rounded-2xl text-emerald-300 hover:bg-emerald-500 hover:text-white transition-all shrink-0" title="Open in browser">
                            <ExternalLink size={18} />
                          </button>
                        </div>
                      )}

                      {body && (
                        <div className="prose prose-invert prose-indigo prose-lg mx-auto">
                          <Markdown remarkPlugins={[remarkGfm]}>{body}</Markdown>
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
