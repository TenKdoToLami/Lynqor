import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open, ask } from "@tauri-apps/plugin-dialog";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
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
  ImagePlus,
  Bold,
  Italic,
  Heading,
  Code,
  Link as LinkIcon
} from "lucide-react";
import { cn } from "./utils";

function parseItemContent(content: string): { url: string; body: string } {
  try {
    const parsed = JSON.parse(content);
    return { url: parsed.url || "", body: parsed.body || "" };
  } catch {
    return { url: "", body: content };
  }
}

const DETAIL_WIDTH = 650;

export default function App() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentFolderKey, setCurrentFolderKey] = useState<number[] | null>(null);
  const [folderPath, setFolderPath] = useState<Folder[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showNewItemModal, setShowNewItemModal] = useState(false);
  const [passwordPrompt, setPasswordPrompt] = useState<{ isOpen: boolean; targetFolderId: string | null }>({ isOpen: false, targetFolderId: null });
  const [passwordInput, setPasswordInput] = useState("");
  const [newItemType, setNewItemType] = useState<ItemType | null>(null);

  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderEncrypt, setNewFolderEncrypt] = useState(false);
  const [newFolderPassword, setNewFolderPassword] = useState("");
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemUrl, setNewItemUrl] = useState("");
  const [newItemContent, setNewItemContent] = useState("");
  const [newItemImageFilename, setNewItemImageFilename] = useState("");
  const [imagePaths, setImagePaths] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    try {
      const foldersData = await invoke<Folder[]>("get_folders_by_parent", { parentId: currentFolderId, folderKey: currentFolderKey });
      setFolders(foldersData);
      const itemsData = await invoke<Item[]>("get_items_by_folder", { folderId: currentFolderId, folderKey: currentFolderKey });
      setItems(itemsData);
      const paths: Record<string, string> = {};
      for (const item of itemsData) {
        if (item.imageUrl) {
          try {
            const dataUrl = await invoke<string>("get_image_base64", { filename: item.imageUrl });
            paths[item.imageUrl] = dataUrl;
          } catch { /* skip */ }
        }
      }
      setImagePaths(paths);
    } catch (e) { console.error(e); }
  }, [currentFolderId, currentFolderKey]);

  useEffect(() => { loadData(); }, [loadData]);

  // Refresh when detail window edits/deletes
  useEffect(() => {
    const unlisten = listen("refresh-data", () => { loadData(); });
    return () => { unlisten.then(fn => fn()); };
  }, [loadData]);

  // Keep detail window pinned to the right of main when moving/resizing
  useEffect(() => {
    const mainWindow = getCurrentWindow();
    const unlisteners: (() => void)[] = [];

    const syncDetailPosition = async () => {
      try {
        const detail = await WebviewWindow.getByLabel("detail");
        if (!detail) return;
        const pos = await mainWindow.outerPosition();
        const size = await mainWindow.outerSize();
        await detail.setPosition(new PhysicalPosition(pos.x + size.width, pos.y));
        await detail.setSize(new PhysicalSize(DETAIL_WIDTH, size.height));
      } catch { /* detail window might not exist */ }
    };

    mainWindow.onMoved(() => { syncDetailPosition(); }).then(u => unlisteners.push(u));
    mainWindow.onResized(() => { syncDetailPosition(); }).then(u => unlisteners.push(u));

    return () => { unlisteners.forEach(u => u()); };
  }, []);

  const navigateToRoot = () => { setCurrentFolderId(null); setCurrentFolderKey(null); setFolderPath([]); };
  const navigateToBreadcrumb = (crumb: Folder, idx: number) => { setCurrentFolderId(crumb.id); setFolderPath(folderPath.slice(0, idx + 1)); setCurrentFolderKey(null); };
  const navigateUp = () => {
    if (folderPath.length > 1) { const np = folderPath.slice(0, -1); setFolderPath(np); setCurrentFolderId(np[np.length - 1].id); setCurrentFolderKey(null); }
    else navigateToRoot();
  };

  const handleFolderClick = (folder: Folder) => {
    if (folder.isLocked) setPasswordPrompt({ isOpen: true, targetFolderId: folder.id });
    else { setCurrentFolderId(folder.id); setFolderPath([...folderPath, folder]); }
  };

  const submitPassword = async () => {
    if (!passwordPrompt.targetFolderId) return;
    try {
      const tf = folders.find(f => f.id === passwordPrompt.targetFolderId);
      const k = await invoke<number[]>("unlock_folder", { folderId: passwordPrompt.targetFolderId, password: passwordInput, parentFolderKey: currentFolderKey });
      setCurrentFolderId(passwordPrompt.targetFolderId); setCurrentFolderKey(k);
      if (tf) setFolderPath([...folderPath, tf]);
    } catch (e) { alert("Failed to unlock: " + e); }
    finally { setPasswordPrompt({ isOpen: false, targetFolderId: null }); setPasswordInput(""); }
  };

  const handleCreateFolder = async () => {
    try {
      await invoke("create_folder", { id: crypto.randomUUID(), parentId: currentFolderId, name: newFolderName, password: newFolderEncrypt ? (newFolderPassword || undefined) : undefined, parentFolderKey: currentFolderKey });
      setShowNewFolderModal(false); setNewFolderName(""); setNewFolderPassword(""); setNewFolderEncrypt(false); loadData();
    } catch (e) { alert("Failed to create folder: " + e); }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      const confirmed = await ask("Are you sure you want to delete this folder? This will delete all its contents and cannot be undone.", {
        title: "Delete Folder",
        kind: "warning",
      });
      if (confirmed) {
        await invoke("delete_folder", { id: folderId });
        loadData();
      }
    } catch (e) { alert("Failed to delete folder: " + e); }
  };

  const pickImage = async (): Promise<string> => {
    const selected = await open({ multiple: false, filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] }] });
    if (!selected) return "";
    return await invoke<string>("save_image", { sourcePath: selected });
  };

  const handleCreateItem = async () => {
    try {
      await invoke("create_item", { id: crypto.randomUUID(), folderId: currentFolderId, itemType: newItemType, title: newItemTitle, content: JSON.stringify({ url: newItemUrl, body: newItemContent }), imageUrl: newItemImageFilename || null, folderKey: currentFolderKey });
      setShowNewItemModal(false); setNewItemTitle(""); setNewItemUrl(""); setNewItemContent(""); setNewItemImageFilename(""); loadData();
    } catch (e) { alert("Failed to create item: " + e); }
  };

  // Open item in detail window pinned to the right of main
  const openItemDetail = async (item: Item) => {
    try {
      const mainWindow = getCurrentWindow();
      const mainPos = await mainWindow.outerPosition();
      const mainSize = await mainWindow.outerSize();

      const existing = await WebviewWindow.getByLabel("detail");
      if (existing) {
        await existing.emit("show-item", { ...item, folderKey: currentFolderKey });
        await existing.setFocus();
        return;
      }

      const detailWindow = new WebviewWindow("detail", {
        url: "/detail.html",
        title: item.title,
        width: DETAIL_WIDTH,
        height: mainSize.height,
        x: mainPos.x + mainSize.width,
        y: mainPos.y,
        decorations: true,
      });

      detailWindow.once("tauri://created", () => {
        setTimeout(async () => {
          try { await detailWindow.emit("show-item", { ...item, folderKey: currentFolderKey }); }
          catch (e) { console.error("Failed to emit:", e); }
        }, 500);
      });

      detailWindow.once("tauri://error", (e) => { console.error("Detail window error:", e); });
    } catch (e) { console.error("Failed to open detail:", e); }
  };

  const openLink = async (url: string) => { try { await openUrl(url); } catch { window.open(url, '_blank'); } };
  const getImageSrc = (imageUrl: string | undefined) => imageUrl ? (imagePaths[imageUrl] || null) : null;

  return (
    <div className="min-h-screen bg-slate-950 text-neutral-100 flex flex-col font-sans selection:bg-indigo-500/30 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-40 -left-20 w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[120px] mix-blend-screen opacity-60" />
        <div className="absolute top-1/2 -right-40 w-[500px] h-[500px] bg-violet-600/20 rounded-full blur-[120px] mix-blend-screen opacity-50" />
        <div className="absolute -bottom-40 left-1/4 w-[400px] h-[400px] bg-sky-600/20 rounded-full blur-[100px] mix-blend-screen opacity-40" />
      </div>

      <header className="h-16 border-b border-white/5 bg-white/5 backdrop-blur-xl flex items-center justify-between px-6 sticky top-0 z-10 w-full relative shadow-sm">
        <div data-tauri-drag-region className="absolute inset-0 w-full h-full cursor-default" />
        <div className="flex items-center gap-3 relative z-10">
          {currentFolderId && (
            <button onClick={navigateUp} className="p-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg transition-all flex items-center text-neutral-300 hover:text-white"><ArrowLeft size={16} /></button>
          )}
          <button onClick={navigateToRoot} className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300 hover:opacity-80 transition-opacity drop-shadow-sm">Lynqor</button>
          {folderPath.map((crumb, idx, arr) => (
            <div key={crumb.id} className="flex items-center gap-2 text-white/50">
              <ChevronRight size={14} className="text-white/30" />
              <button onClick={() => navigateToBreadcrumb(crumb, idx)} className={cn("hover:text-indigo-300 transition-colors font-medium", idx === arr.length - 1 ? "text-white" : "")}>{crumb.name}</button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 relative z-10">
          <div className="flex items-center bg-white/5 rounded-lg p-1 border border-white/5 shadow-inner">
            <button onClick={() => setViewMode('grid')} className={cn("p-1.5 rounded-md transition-all", viewMode === 'grid' ? "bg-white/10 text-white shadow-lg ring-1 ring-white/10" : "text-white/40 hover:text-white hover:bg-white/5")}><LayoutGrid size={16} /></button>
            <button onClick={() => setViewMode('list')} className={cn("p-1.5 rounded-md transition-all", viewMode === 'list' ? "bg-white/10 text-white shadow-lg ring-1 ring-white/10" : "text-white/40 hover:text-white hover:bg-white/5")}><ListIcon size={16} /></button>
          </div>
          <div className="relative">
            <button onClick={() => setIsNewMenuOpen(!isNewMenuOpen)} className="flex items-center gap-2 bg-gradient-to-tr from-indigo-600 to-purple-600 hover:opacity-90 text-white px-5 py-2 rounded-xl font-medium transition-all shadow-lg shadow-indigo-500/25 ring-1 ring-white/20">
              <Plus size={18} /><span className="hidden sm:inline tracking-wide text-sm font-semibold">New</span>
            </button>
            {isNewMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsNewMenuOpen(false)} />
                <div className="absolute right-0 mt-3 w-56 bg-slate-900/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 py-1 ring-1 ring-black/50">
                  <button onClick={() => { setShowNewFolderModal(true); setIsNewMenuOpen(false); }} className="w-full text-left px-4 py-3 hover:bg-white/10 flex items-center gap-3 text-neutral-200 font-medium text-sm"><FolderIcon size={16} className="text-indigo-400" /> Folder</button>
                  <div className="h-px bg-white/5 my-1 mx-3" />
                  <button onClick={() => { setNewItemType('NOTE'); setShowNewItemModal(true); setIsNewMenuOpen(false); }} className="w-full text-left px-4 py-3 hover:bg-white/10 flex items-center gap-3 text-neutral-200 font-medium text-sm"><FileText size={16} className="text-amber-400" /> Note / Link</button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 p-8 overflow-y-auto relative z-0">
        {folders.length === 0 && items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-white/30 mt-10">
            <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-inner"><FolderIcon size={40} className="opacity-50" /></div>
            <h2 className="text-2xl font-bold text-white/80">This space is empty</h2>
            <p className="mt-2 text-sm text-white/40">Add notes, links, or folders using the New button.</p>
          </div>
        ) : (
          <div className={cn("gap-5", viewMode === 'grid' ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" : "flex flex-col space-y-3 max-w-5xl mx-auto")}>
            {folders.map((folder) => (
              <div key={folder.id} className={cn("group text-left border border-white/10 bg-white/5 backdrop-blur-md hover:bg-white/10 hover:border-white/20 hover:shadow-xl transition-all duration-300 rounded-2xl overflow-hidden relative", viewMode === 'grid' ? "aspect-square p-5 flex flex-col items-center justify-center text-center" : "p-4 flex items-center gap-5")}>
                <button onClick={() => handleFolderClick(folder)} className="absolute inset-0 z-0 cursor-pointer" />
                <div className={cn("text-indigo-400 relative z-10 pointer-events-none", viewMode === 'grid' ? "mb-4" : "")}>
                  <FolderIcon size={viewMode === 'grid' ? 56 : 28} className="fill-indigo-500/20 stroke-[1.5]" />
                  {folder.isLocked && <div className="absolute -bottom-1 -right-1 bg-slate-900 rounded-full p-1.5 shadow-lg border border-white/10"><Lock size={12} className="text-amber-400" /></div>}
                </div>
                <div className="flex-1 min-w-0 z-10 pointer-events-none">
                  <h3 className="font-semibold text-white/90 truncate group-hover:text-white">{folder.name}</h3>
                  {viewMode === 'list' && <p className="text-xs text-white/40 mt-0.5">Folder</p>}
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }} className="z-10 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-400 hover:text-red-300 border border-red-400/20 absolute top-2 right-2" title="Delete"><Trash2 size={14} /></button>
              </div>
            ))}

            {items.map((item) => {
              const parsed = parseItemContent(item.content);
              const imgSrc = getImageSrc(item.imageUrl);
              return (
                <div key={item.id} className={cn("group text-left border border-white/10 bg-white/5 backdrop-blur-md hover:bg-white/10 hover:border-white/20 hover:shadow-xl transition-all duration-300 rounded-2xl overflow-hidden relative", viewMode === 'grid' ? "flex flex-col" : "p-4 flex items-center gap-5")}>
                  {viewMode === 'grid' && (
                    <button onClick={() => openItemDetail(item)} className="h-32 w-full bg-black/20 border-b border-white/5 flex items-center justify-center overflow-hidden cursor-pointer">
                      {imgSrc ? <img src={imgSrc} alt={item.title} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" />
                        : <div className="text-white/20 group-hover:text-white/60 transition-colors"><FileText size={40} className="stroke-[1.5]" /></div>}
                    </button>
                  )}
                  {viewMode === 'list' && (
                    <button onClick={() => openItemDetail(item)} className="shrink-0 cursor-pointer">
                      {imgSrc ? <div className="w-12 h-12 rounded-xl overflow-hidden border border-white/10"><img src={imgSrc} alt={item.title} className="w-full h-full object-cover" /></div>
                        : <div className="text-white/40 bg-white/5 p-3 rounded-xl border border-white/5 shadow-inner"><FileText size={22} className="stroke-[1.5]" /></div>}
                    </button>
                  )}
                  <button onClick={() => openItemDetail(item)} className={cn("flex-1 min-w-0 flex flex-col justify-center cursor-pointer text-left", viewMode === 'grid' ? "p-4" : "")}>
                    <h3 className="font-semibold text-white/90 group-hover:text-white truncate">{item.title}</h3>
                    <p className={cn("text-white/40 truncate", viewMode === 'grid' ? "text-xs mt-1.5" : "text-sm mt-0.5")}>{parsed.body}</p>
                  </button>
                  {parsed.url && (
                    <button onClick={(e) => { e.stopPropagation(); openLink(parsed.url); }} className={cn("text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20 p-2 rounded-xl transition-all shrink-0 z-10", viewMode === 'grid' ? "absolute top-2 right-2 bg-black/40 backdrop-blur-sm border border-white/10" : "")} title="Open link"><ExternalLink size={16} /></button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {passwordPrompt.isOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-900/60 border border-white/10 rounded-3xl w-full max-w-sm p-8 shadow-2xl backdrop-blur-2xl">
            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mb-5 border border-indigo-400/30"><Lock size={28} className="text-indigo-300" /></div>
              <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60">Unlock Folder</h2>
              <p className="text-white/40 text-sm mt-2">Enter your encryption password</p>
            </div>
            <input type="password" autoFocus value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitPassword()} placeholder="Password..." className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all mb-6 shadow-inner" />
            <div className="flex gap-3">
              <button onClick={() => setPasswordPrompt({ isOpen: false, targetFolderId: null })} className="flex-1 px-4 py-3.5 rounded-2xl border border-white/10 hover:bg-white/5 font-semibold text-white/70">Cancel</button>
              <button onClick={submitPassword} className="flex-1 px-4 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">Unlock</button>
            </div>
          </div>
        </div>
      )}

      {showNewFolderModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-900/60 border border-white/10 rounded-3xl w-full max-w-md p-8 shadow-2xl backdrop-blur-2xl">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-500/20 rounded-2xl border border-indigo-400/30"><FolderIcon size={22} className="text-indigo-300 fill-indigo-500/20" /></div>
                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60">New Folder</h2>
              </div>
              <button onClick={() => setShowNewFolderModal(false)} className="text-white/40 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-full"><Plus size={20} className="rotate-45" /></button>
            </div>
            <div className="space-y-6 mb-8">
              <div>
                <label className="text-sm font-semibold text-white/60 mb-2 block ml-1">Folder Name</label>
                <input type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} autoFocus placeholder="e.g. Passwords" className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-inner" />
              </div>
              <div className="p-5 bg-black/20 border border-white/10 rounded-2xl shadow-inner">
                <label className="flex items-start gap-4 cursor-pointer group">
                  <div className="relative flex items-center justify-center mt-1">
                    <input type="checkbox" checked={newFolderEncrypt} onChange={e => setNewFolderEncrypt(e.target.checked)} className="peer appearance-none w-5 h-5 border-2 border-white/30 rounded-md checked:bg-indigo-500 checked:border-indigo-500" />
                    <svg className="absolute w-3 h-3 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <div><span className="text-sm font-semibold text-white/90 block">Encrypt & Lock Folder</span><span className="text-xs text-white/40 mt-1 block">Require a password to access.</span></div>
                </label>
                {newFolderEncrypt && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <label className="text-xs font-semibold text-indigo-300 mb-2 block ml-1 flex items-center gap-1"><Lock size={12} /> Custom Password (Optional)</label>
                    <input type="password" value={newFolderPassword} onChange={e => setNewFolderPassword(e.target.value)} placeholder="Leave blank to use parent's" className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 shadow-inner" />
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowNewFolderModal(false)} className="px-6 py-3.5 rounded-2xl border border-white/10 hover:bg-white/5 font-semibold text-white/70">Cancel</button>
              <button onClick={handleCreateFolder} className="px-6 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">Create Folder</button>
            </div>
          </div>
        </div>
      )}

      {showNewItemModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-900/60 border border-white/10 rounded-3xl w-full max-w-2xl p-8 shadow-2xl backdrop-blur-2xl">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl border shadow-lg bg-amber-500/20 border-amber-400/30"><FileText size={22} className="text-amber-300" /></div>
                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60">New Note</h2>
              </div>
              <button onClick={() => setShowNewItemModal(false)} className="text-white/40 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-full"><Plus size={20} className="rotate-45" /></button>
            </div>
            <div className="space-y-4 mb-8">
              <div>
                <label className="text-sm font-semibold text-white/60 mb-2 block ml-1">Title</label>
                <input type="text" value={newItemTitle} onChange={e => setNewItemTitle(e.target.value)} autoFocus placeholder="Enter title..." className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-3.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-inner" />
              </div>
              <div>
                <label className="text-sm font-semibold text-emerald-300/80 mb-2 block ml-1">Link URL (Optional)</label>
                <input type="url" value={newItemUrl} onChange={e => setNewItemUrl(e.target.value)} placeholder="https://" className="w-full bg-black/20 border border-emerald-500/30 rounded-2xl px-5 py-3.5 text-emerald-100 placeholder-emerald-900/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-inner" />
              </div>
              <div>
                <label className="text-sm font-semibold text-pink-300/80 mb-2 block ml-1">Preview Image (Click & Paste supported)</label>
                <button
                  type="button"
                  onClick={async () => { const f = await pickImage(); if (f) setNewItemImageFilename(f); }}
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
                            setNewItemImageFilename(filename);
                          } catch (err) { alert("Failed to save pasted image: " + err); }
                        };
                        reader.readAsDataURL(file);
                        break;
                      }
                    }
                  }}
                  className="w-full bg-black/20 border border-pink-500/30 rounded-2xl px-5 py-3.5 text-left flex items-center gap-3 hover:bg-black/30 outline-none focus:ring-2 focus:ring-pink-500/50"
                  title="Click to select or paste an image (Ctrl+V)"
                >
                  <ImagePlus size={18} className="text-pink-400" />
                  <span className={newItemImageFilename ? "text-pink-100" : "text-pink-900/50"}>{newItemImageFilename ? "Image selected ✓ (Paste to replace)" : "Choose or paste an image file..."}</span>
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-amber-300/80 mb-2 block ml-1 flex justify-between"><span>Content</span><span className="text-xs font-normal text-white/30">Markdown Supported</span></label>
              <div className="bg-black/20 border border-amber-500/30 rounded-2xl overflow-hidden shadow-inner focus-within:ring-2 focus-within:ring-amber-500/50 transition-all">
                <div className="flex items-center gap-1 bg-black/40 px-3 py-2 border-b border-amber-500/20">
                  <button type="button" onClick={() => {
                    const txt = document.getElementById('new-item-content') as HTMLTextAreaElement;
                    if (!txt) return;
                    const start = txt.selectionStart; const end = txt.selectionEnd;
                    setNewItemContent(prev => prev.substring(0, start) + "**" + prev.substring(start, end) + "**" + prev.substring(end));
                  }} className="p-1.5 rounded-lg text-amber-100/60 hover:text-amber-300 hover:bg-amber-500/20 transition-all" title="Bold"><Bold size={16} /></button>
                  <button type="button" onClick={() => {
                    const txt = document.getElementById('new-item-content') as HTMLTextAreaElement;
                    if (!txt) return;
                    const start = txt.selectionStart; const end = txt.selectionEnd;
                    setNewItemContent(prev => prev.substring(0, start) + "*" + prev.substring(start, end) + "*" + prev.substring(end));
                  }} className="p-1.5 rounded-lg text-amber-100/60 hover:text-amber-300 hover:bg-amber-500/20 transition-all" title="Italic"><Italic size={16} /></button>
                  <button type="button" onClick={() => {
                    const txt = document.getElementById('new-item-content') as HTMLTextAreaElement;
                    if (!txt) return;
                    const start = txt.selectionStart;
                    setNewItemContent(prev => prev.substring(0, start) + "\n### " + prev.substring(start));
                  }} className="p-1.5 rounded-lg text-amber-100/60 hover:text-amber-300 hover:bg-amber-500/20 transition-all" title="Heading"><Heading size={16} /></button>
                  <button type="button" onClick={() => {
                    const txt = document.getElementById('new-item-content') as HTMLTextAreaElement;
                    if (!txt) return;
                    const start = txt.selectionStart; const end = txt.selectionEnd;
                    setNewItemContent(prev => prev.substring(0, start) + "`" + prev.substring(start, end) + "`" + prev.substring(end));
                  }} className="p-1.5 rounded-lg text-amber-100/60 hover:text-amber-300 hover:bg-amber-500/20 transition-all" title="Code"><Code size={16} /></button>
                  <button type="button" onClick={() => {
                    const txt = document.getElementById('new-item-content') as HTMLTextAreaElement;
                    if (!txt) return;
                    const start = txt.selectionStart; const end = txt.selectionEnd;
                    setNewItemContent(prev => prev.substring(0, start) + "[" + prev.substring(start, end) + "](url)" + prev.substring(end));
                  }} className="p-1.5 rounded-lg text-amber-100/60 hover:text-amber-300 hover:bg-amber-500/20 transition-all" title="Link"><LinkIcon size={16} /></button>
                </div>
                <textarea id="new-item-content" rows={6} value={newItemContent} onChange={e => setNewItemContent(e.target.value)}
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
                            const txt = document.getElementById('new-item-content') as HTMLTextAreaElement;
                            const start = txt ? txt.selectionStart : newItemContent.length;
                            setNewItemContent(prev => prev.substring(0, start) + `\n![pasted image](${filename})\n` + prev.substring(start));
                          } catch (err) { alert("Failed to save pasted image: " + err); }
                        };
                        reader.readAsDataURL(file);
                        break;
                      }
                    }
                  }}
                  placeholder="Type your note here... (Paste images directly!)" className="w-full bg-transparent p-5 text-white placeholder-amber-900/50 focus:outline-none font-mono text-sm resize-none" />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowNewItemModal(false)} className="px-6 py-3.5 rounded-2xl border border-white/10 hover:bg-white/5 font-semibold text-white/70">Cancel</button>
            <button onClick={handleCreateItem} className="px-6 py-3.5 rounded-2xl text-white font-semibold shadow-lg bg-amber-600 hover:bg-amber-500">Save Item</button>
          </div>
        </div>
      )}
    </div>
  );
}
