import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open } from "@tauri-apps/plugin-dialog";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { Folder, Item, ItemType } from "./types";
import { ArrowLeft, Search, ImagePlus } from "lucide-react";
import { cn } from "./utils";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { Toolbar } from "./components/Toolbar";
import { FolderItem } from "./components/FolderItem";
import { NoteItem } from "./components/NoteItem";
import { PasswordPrompt } from "./components/Modals/PasswordPrompt";
import { NewFolderModal } from "./components/Modals/NewFolderModal";
import { EditFolderModal } from "./components/Modals/EditFolderModal";
import { NewItemModal } from "./components/Modals/NewItemModal";
import { ConfirmDeleteModal } from "./components/Modals/ConfirmDeleteModal";

type SortOption = 'manual' | 'a-z' | 'z-a' | 'latest_edit' | 'latest_create';

type SearchResultItem = {
  id: string;
  isFolder: boolean;
  name: string;
  content?: string;
  parentId?: string;
  itemType?: string;
  imageUrl?: string;
};

const DETAIL_WIDTH = 650;

export default function App() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentFolderKey, setCurrentFolderKey] = useState<number[] | null>(null);
  const [folderPath, setFolderPath] = useState<Folder[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<SortOption>('manual');

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[] | null>(null);

  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showEditFolderModal, setShowEditFolderModal] = useState(false);
  const [showNewItemModal, setShowNewItemModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; type: 'note' | 'folder'; id: string; name: string }>({ isOpen: false, type: 'folder', id: '', name: '' });
  const [passwordPrompt, setPasswordPrompt] = useState<{ isOpen: boolean; targetFolderId: string | null }>({ isOpen: false, targetFolderId: null });
  const [passwordInput, setPasswordInput] = useState("");
  const [newItemType, setNewItemType] = useState<ItemType | null>(null);

  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDescription, setNewFolderDescription] = useState("");
  const [newFolderImageFilename, setNewFolderImageFilename] = useState("");
  const [newFolderEncrypt, setNewFolderEncrypt] = useState(false);
  const [newFolderPassword, setNewFolderPassword] = useState("");
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemUrl, setNewItemUrl] = useState("");
  const [newItemContent, setNewItemContent] = useState("");
  const [newItemImageFilename, setNewItemImageFilename] = useState("");
  const [imagePaths, setImagePaths] = useState<Record<string, string>>({});
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [dragState, setDragState] = useState<{ dragId: string | null; dragType: 'folder' | 'item' | null; dropTargetId: string | null; dropPosition: 'before' | 'after' | null }>({ dragId: null, dragType: null, dropTargetId: null, dropPosition: null });
  const [isDraggingExternal, setIsDraggingExternal] = useState(false);
  const dragRef = useRef<{ dragId: string | null; dragType: 'folder' | 'item' | null }>({ dragId: null, dragType: null });
  const dragCounter = useRef(0);

  // Auto-dismiss toast after 2.5s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // Auto-lock timeout (5 minutes)
  const AUTO_LOCK_MS = 5 * 60 * 1000;
  const autoLockTimerRef = { current: null as ReturnType<typeof setTimeout> | null };

  // Derive rootLockedFolderId from the folder path
  const rootLockedFolderId = folderPath.find(f => f.isLocked)?.id || null;

  // Reset auto-lock timer on any user activity
  useEffect(() => {
    if (!rootLockedFolderId) return;
    const resetTimer = () => {
      if (autoLockTimerRef.current) clearTimeout(autoLockTimerRef.current);
      autoLockTimerRef.current = setTimeout(() => {
        setCurrentFolderId(null);
        setCurrentFolderKey(null);
        setFolderPath([]);
        alert("Auto-locked due to inactivity.");
      }, AUTO_LOCK_MS);
    };
    resetTimer();
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('click', resetTimer);
    return () => {
      if (autoLockTimerRef.current) clearTimeout(autoLockTimerRef.current);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('click', resetTimer);
    };
  }, [rootLockedFolderId]);

  const loadData = useCallback(async () => {
    try {
      const [foldersData, itemsData] = await Promise.all([
        invoke<Folder[]>("get_folders_by_parent", { parentId: currentFolderId, folderKey: currentFolderKey, rootFolderId: rootLockedFolderId }),
        invoke<Item[]>("get_items_by_folder", { folderId: currentFolderId, folderKey: currentFolderKey, rootFolderId: rootLockedFolderId }),
      ]);
      setFolders(foldersData);
      setItems(itemsData);

      // Collect unique image URLs and fetch in parallel
      const urls = new Set<string>();
      for (const f of foldersData) if (f.imageUrl) urls.add(f.imageUrl);
      for (const i of itemsData) if (i.imageUrl) urls.add(i.imageUrl);

      if (urls.size > 0) {
        const entries = await Promise.all(
          [...urls].map(async (url) => {
            try { return [url, await invoke<string>("get_image_base64", { filename: url })] as const; }
            catch { return null; }
          })
        );
        const paths: Record<string, string> = {};
        for (const e of entries) if (e) paths[e[0]] = e[1];
        setImagePaths(paths);
      } else {
        setImagePaths({});
      }
    } catch (e) { console.error("Data load failed:", e); }
  }, [currentFolderId, currentFolderKey, rootLockedFolderId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Persist window size & position — restore first, then show (window starts hidden)
  useEffect(() => {
    const mainWindow = getCurrentWindow();
    let saveTimer: ReturnType<typeof setTimeout>;
    const save = async () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        try {
          const pos = await mainWindow.outerPosition();
          const size = await mainWindow.outerSize();
          localStorage.setItem('lynqor_window', JSON.stringify({ x: pos.x, y: pos.y, w: size.width, h: size.height }));
        } catch { /* ignore */ }
      }, 500);
    };
    // Restore on mount, then show the window
    (async () => {
      try {
        const saved = localStorage.getItem('lynqor_window');
        if (saved) {
          const { x, y, w, h } = JSON.parse(saved);
          await mainWindow.setSize(new PhysicalSize(w, h));
          await mainWindow.setPosition(new PhysicalPosition(x, y));
        }
      } catch { /* ignore */ }
      // Show window after restoring (it starts hidden via tauri.conf.json)
      try { await mainWindow.show(); } catch { /* ignore */ }
    })();
    const unlisteners: (() => void)[] = [];
    mainWindow.onMoved(() => save()).then(u => unlisteners.push(u));
    mainWindow.onResized(() => save()).then(u => unlisteners.push(u));
    return () => { clearTimeout(saveTimer); unlisteners.forEach(u => u()); };
  }, []);

  // Refresh when detail window edits/deletes
  useEffect(() => {
    const unlisten = listen("refresh-data", () => { loadData(); });
    return () => { unlisten.then(fn => fn()); };
  }, [loadData]);

  // Listen for toast events from detail window
  useEffect(() => {
    const unlisten = listen<{ message: string; type: 'success' | 'error' }>("show-toast", (event) => {
      setToast(event.payload);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

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

  const navigateToRoot = () => {
    if (currentFolderId === null) { loadData(); return; }
    setFolders([]); setItems([]); setImagePaths({});
    setCurrentFolderId(null); setCurrentFolderKey(null); setFolderPath([]);
  };
  const navigateToBreadcrumb = (crumb: Folder, idx: number) => {
    if (currentFolderId === crumb.id) { loadData(); return; }
    setFolders([]); setItems([]); setImagePaths({});
    setCurrentFolderId(crumb.id); setFolderPath(folderPath.slice(0, idx + 1)); setCurrentFolderKey(null);
  };

  const handleFolderClick = (folder: Folder) => {
    if (folder.isLocked) setPasswordPrompt({ isOpen: true, targetFolderId: folder.id });
    else if (currentFolderId === folder.id) { loadData(); }
    else { setFolders([]); setItems([]); setImagePaths({}); setCurrentFolderId(folder.id); setFolderPath([...folderPath, folder]); }
  };

  const submitPassword = async () => {
    if (!passwordPrompt.targetFolderId || isBusy) return;
    setIsBusy(true);
    setLoadingMessage("Decrypting vault…");
    // Let React paint the overlay before the heavy invoke blocks
    await new Promise(r => setTimeout(r, 50));
    try {
      const tf = folders.find(f => f.id === passwordPrompt.targetFolderId);
      const k = await invoke<number[]>("unlock_folder", { folderId: passwordPrompt.targetFolderId, password: passwordInput, parentFolderKey: currentFolderKey });
      setFolders([]); setItems([]); setImagePaths({});
      setCurrentFolderId(passwordPrompt.targetFolderId); setCurrentFolderKey(k);
      if (tf) setFolderPath([...folderPath, tf]);
      setToast({ message: "Vault unlocked", type: 'success' });
    } catch (e) { setToast({ message: "Failed to unlock: " + e, type: 'error' }); }
    finally { setPasswordPrompt({ isOpen: false, targetFolderId: null }); setPasswordInput(""); setLoadingMessage(null); setIsBusy(false); }
  };

  const handleCreateFolder = async () => {
    if (isBusy) return;
    setIsBusy(true);
    if (newFolderEncrypt) { setLoadingMessage("Encrypting new folder…"); await new Promise(r => setTimeout(r, 50)); }
    try {
      await invoke("create_folder", {
        id: crypto.randomUUID(),
        parentId: currentFolderId,
        name: newFolderName,
        description: newFolderDescription || null,
        imageUrl: newFolderImageFilename || null,
        password: newFolderEncrypt ? (newFolderPassword || undefined) : undefined,
        parentFolderKey: currentFolderKey,
        rootFolderId: rootLockedFolderId
      });
      setShowNewFolderModal(false);
      setNewFolderName("");
      setNewFolderDescription("");
      setNewFolderImageFilename("");
      setNewFolderPassword("");
      setNewFolderEncrypt(false);
      loadData();
      setToast({ message: "Folder created", type: 'success' });
    } catch (e) { setToast({ message: "Failed to create folder: " + e, type: 'error' }); }
    finally { setLoadingMessage(null); setIsBusy(false); }
  };

  const handleDeleteFolder = (folderId: string) => {
    if (isBusy) return;
    const folder = folders.find(f => f.id === folderId);
    setDeleteModal({ isOpen: true, type: 'folder', id: folderId, name: folder?.name || '' });
  };

  const executeDelete = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      if (deleteModal.type === 'folder') {
        await invoke("delete_folder", { id: deleteModal.id, rootFolderId: rootLockedFolderId, parentFolderKey: currentFolderKey });
        setToast({ message: "Folder deleted", type: 'success' });
      }
      setDeleteModal({ isOpen: false, type: 'folder', id: '', name: '' });
      loadData();
    } catch (e) { setToast({ message: "Failed to delete: " + e, type: 'error' }); }
    finally { setIsBusy(false); }
  };

  const pickImage = async (): Promise<string> => {
    const selected = await open({ multiple: false, filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] }] });
    if (!selected) return "";
    return await invoke<string>("save_image", { sourcePath: selected });
  };

  const handleCreateItem = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await invoke("create_item", { id: crypto.randomUUID(), folderId: currentFolderId, itemType: newItemType, title: newItemTitle, content: JSON.stringify({ url: newItemUrl, body: newItemContent }), imageUrl: newItemImageFilename || null, folderKey: currentFolderKey, rootFolderId: rootLockedFolderId });
      setShowNewItemModal(false); setNewItemTitle(""); setNewItemUrl(""); setNewItemContent(""); setNewItemImageFilename(""); loadData();
      setToast({ message: "Item created", type: 'success' });
    } catch (e) { setToast({ message: "Failed to create item: " + e, type: 'error' }); }
    finally { setIsBusy(false); }
  };

  // Open item in detail window pinned to the right of main
  const openItemDetail = async (item: Item) => {
    try {
      const mainWindow = getCurrentWindow();
      const mainPos = await mainWindow.outerPosition();
      const mainSize = await mainWindow.outerSize();

      const existing = await WebviewWindow.getByLabel("detail");
      if (existing) {
        await existing.emit("show-item", { ...item, folderKey: currentFolderKey, rootFolderId: rootLockedFolderId });
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
          try { await detailWindow.emit("show-item", { ...item, folderKey: currentFolderKey, rootFolderId: rootLockedFolderId }); }
          catch (e) { console.error("Failed to emit:", e); }
        }, 500);
      });

      detailWindow.once("tauri://error", (e) => { console.error("Detail window error:", e); });
    } catch (e) { console.error("Failed to open detail:", e); }
  };

  const openLink = async (url: string) => { try { await openUrl(url); } catch { window.open(url, '_blank'); } };
  const getImageSrc = (imageUrl: string | undefined) => imageUrl ? (imagePaths[imageUrl] || null) : null;

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const results = await invoke<SearchResultItem[]>("search_items", {
        query: q,
        currentFolderId: currentFolderId,
        currentFolderKey: currentFolderKey || Array(32).fill(0),
        rootFolderId: rootLockedFolderId
      });
      setSearchResults(results);
    } catch (e) {
      setToast({ message: "Search failed: " + e, type: 'error' });
      setSearchResults(null);
    }
  }, [currentFolderId, currentFolderKey, rootLockedFolderId]);

  // Debounced search-as-you-type
  useEffect(() => {
    const timer = setTimeout(() => handleSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, handleSearch]);


  const handleEditFolder = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      if (!currentFolderId) return;
      const currentKey = currentFolderKey || Array(32).fill(0);
      const parentKey = folderPath.length > 1 ? (folderPath[folderPath.length - 2] as any).folderKey : null;

      await invoke("update_folder_with_key", {
        id: currentFolderId,
        name: newFolderName,
        description: newFolderDescription || null,
        imageUrl: newFolderImageFilename || null,
        password: newFolderEncrypt ? newFolderPassword : null,
        currentFolderKey: currentKey,
        parentFolderKey: parentKey
      });

      setShowEditFolderModal(false);
      setNewFolderPassword("");
      setNewFolderDescription("");
      setNewFolderImageFilename("");
      loadData();

      // Update folder path name if it changed
      setFolderPath(prev => {
        const newPath = [...prev];
        newPath[newPath.length - 1].name = newFolderName;
        return newPath;
      });
      setToast({ message: "Folder updated", type: 'success' });
    } catch (e) { setToast({ message: "Failed to edit folder: " + e, type: 'error' }); }
    finally { setIsBusy(false); }
  };

  const onItemDragStart = (e: React.DragEvent, id: string, type: 'folder' | 'item') => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ id, type }));
    // Set ref immediately (synchronous) so dragover handlers can read it
    dragRef.current = { dragId: id, dragType: type };
    setDragState({ dragId: id, dragType: type, dropTargetId: null, dropPosition: null });
  };

  const onItemDragOver = (e: React.DragEvent, targetId: string, _targetType: 'folder' | 'item') => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const { dragId } = dragRef.current;
    if (sortBy !== 'manual' || !dragId || dragId === targetId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pos: 'before' | 'after' = viewMode === 'list'
      ? (e.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
      : (e.clientX < rect.left + rect.width / 2 ? 'before' : 'after');
    setDragState(s => {
      if (s.dropTargetId === targetId && s.dropPosition === pos) return s;
      return { ...s, dropTargetId: targetId, dropPosition: pos };
    });
  };

  const onItemDragLeave = (e: React.DragEvent) => {
    // Only clear if actually leaving the element (not entering a child)
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) return;
    setDragState(s => ({ ...s, dropTargetId: null, dropPosition: null }));
  };

  const onItemDragEnd = () => {
    dragRef.current = { dragId: null, dragType: null };
    setDragState({ dragId: null, dragType: null, dropTargetId: null, dropPosition: null });
  };

  // Unified list for cross-type ordering
  type UnifiedEntry = { id: string; orderIndex: number; kind: 'folder' | 'item'; folder?: Folder; item?: Item };
  const getUnifiedSorted = useCallback((): UnifiedEntry[] => {
    const entries: UnifiedEntry[] = [
      ...folders.map(f => ({ id: f.id, orderIndex: f.orderIndex || 0, kind: 'folder' as const, folder: f })),
      ...items.map(i => ({ id: i.id, orderIndex: i.orderIndex || 0, kind: 'item' as const, item: i })),
    ];
    if (sortBy === 'manual') entries.sort((a, b) => a.orderIndex - b.orderIndex);
    else if (sortBy === 'a-z') entries.sort((a, b) => ((a.folder?.name || a.item?.title || '')).localeCompare(b.folder?.name || b.item?.title || ''));
    else if (sortBy === 'z-a') entries.sort((a, b) => ((b.folder?.name || b.item?.title || '')).localeCompare(a.folder?.name || a.item?.title || ''));
    else if (sortBy === 'latest_edit') entries.sort((a, b) => new Date(b.folder?.updatedAt || b.item?.updatedAt || 0).getTime() - new Date(a.folder?.updatedAt || a.item?.updatedAt || 0).getTime());
    else if (sortBy === 'latest_create') entries.sort((a, b) => new Date(b.folder?.createdAt || b.item?.createdAt || 0).getTime() - new Date(a.folder?.createdAt || a.item?.createdAt || 0).getTime());
    return entries;
  }, [folders, items, sortBy]);

  const handleDrop = async (e: React.DragEvent, targetId: string, _targetType: 'folder' | 'item') => {
    e.preventDefault();
    if (sortBy !== 'manual') { onItemDragEnd(); return; }

    const draggedData = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
    const { id: draggedId, type: draggedType } = draggedData;

    if (!draggedId || draggedId === targetId) { onItemDragEnd(); return; }

    // Use unified list for position calculation
    const list = getUnifiedSorted();
    const targetIdx = list.findIndex(x => x.id === targetId);
    if (targetIdx === -1) { onItemDragEnd(); return; }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isBefore = viewMode === 'list' ? (e.clientY < rect.top + rect.height / 2) : (e.clientX < rect.left + rect.width / 2);

    let prevIndex: number;
    let nextIndex: number;

    if (isBefore) {
      prevIndex = targetIdx > 0 ? list[targetIdx - 1].orderIndex : list[targetIdx].orderIndex - 1;
      nextIndex = list[targetIdx].orderIndex;
    } else {
      prevIndex = list[targetIdx].orderIndex;
      nextIndex = targetIdx < list.length - 1 ? list[targetIdx + 1].orderIndex : list[targetIdx].orderIndex + 1;
    }

    const newOrderIndex = (prevIndex + nextIndex) / 2.0;

    try {
      await invoke('update_order_index', { id: draggedId, itemType: draggedType, orderIndex: newOrderIndex, rootFolderId: rootLockedFolderId, folderKey: currentFolderKey });
      loadData();
      setToast({ message: 'Reordered', type: 'success' });
    } catch (err) { setToast({ message: 'Failed to reorder: ' + err, type: 'error' }); }
    finally { onItemDragEnd(); }
  };

  const handleGlobalDragEnter = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      dragCounter.current++;
      setIsDraggingExternal(true);
    }
  };

  const handleGlobalDragLeave = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      dragCounter.current--;
      if (dragCounter.current === 0) {
        setIsDraggingExternal(false);
      }
    }
  };

  const handleGlobalDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleGlobalDrop = async (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragCounter.current = 0;
    setIsDraggingExternal(false);

    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    if (isBusy) return;
    setIsBusy(true);

    try {
      for (const file of files) {
        const reader = new FileReader();
        const base64Data = await new Promise<string>((resolve, reject) => {
          reader.onload = ev => resolve(ev.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const filename = await invoke<string>("save_base64_image", { base64Data });
        const content = JSON.stringify({ url: "", body: `![${file.name}](${filename})` });

        await invoke("create_item", {
          id: crypto.randomUUID(),
          folderId: currentFolderId,
          itemType: 'NOTE',
          title: file.name.replace(/\.[^/.]+$/, ""), // file name without extension
          content,
          imageUrl: filename,
          folderKey: currentFolderKey,
          rootFolderId: rootLockedFolderId
        });
      }
      loadData();
      setToast({ message: `Imported ${files.length} image(s)`, type: 'success' });
    } catch (err) {
      setToast({ message: "Failed to import image: " + err, type: 'error' });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-slate-950 text-neutral-100 flex flex-col font-sans selection:bg-indigo-500/30 relative overflow-hidden"
      onDragEnter={handleGlobalDragEnter}
      onDragLeave={handleGlobalDragLeave}
      onDragOver={handleGlobalDragOver}
      onDrop={handleGlobalDrop}
    >
      {/* External Drag Overlay */}
      {isDraggingExternal && (
        <div className="absolute inset-0 z-50 bg-indigo-900/40 backdrop-blur-sm border-4 border-indigo-400 border-dashed rounded-xl m-4 flex flex-col items-center justify-center animate-in fade-in duration-200 pointer-events-none">
          <div className="bg-slate-900 rounded-full p-6 shadow-2xl mb-4 text-indigo-400">
            <ImagePlus size={48} />
          </div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Drop image to create note</h2>
          <p className="text-indigo-200/70 mt-2">The image will be encrypted and saved in the current folder</p>
        </div>
      )}

      {/* Loading overlay — pointer-events:none so window stays draggable */}
      {loadingMessage && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(6px)',
        }}>
          <style>{`
            @keyframes lynqor-spin { to { transform: rotate(360deg); } }
            @keyframes lynqor-pulse { 0%,100% { opacity: .6; } 50% { opacity: 1; } }
            @keyframes lynqor-toast-in { from { opacity:0; transform:translateY(16px) scale(.95); } to { opacity:1; transform:translateY(0) scale(1); } }
            @keyframes lynqor-toast-out { from { opacity:1; } to { opacity:0; transform:translateY(-8px); } }
          `}</style>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            border: '3px solid rgba(129, 140, 248, 0.2)',
            borderTopColor: '#818cf8',
            animation: 'lynqor-spin 0.8s linear infinite',
            marginBottom: 20,
          }} />
          <p style={{
            color: '#c7d2fe', fontSize: 16, fontWeight: 500, letterSpacing: '0.02em',
            animation: 'lynqor-pulse 1.5s ease-in-out infinite',
          }}>{loadingMessage}</p>
        </div>
      )}
      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 10000,
          padding: '10px 24px', borderRadius: 12,
          background: toast.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          border: `1px solid ${toast.type === 'success' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
          backdropFilter: 'blur(12px)',
          color: toast.type === 'success' ? '#86efac' : '#fca5a5',
          fontSize: 14, fontWeight: 500, letterSpacing: '0.01em',
          animation: 'lynqor-toast-in 0.3s ease-out',
          boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        }}>
          {toast.type === 'success' ? '✓ ' : '✕ '}{toast.message}
        </div>
      )}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-40 -left-20 w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[120px] mix-blend-screen opacity-60" />
        <div className="absolute top-1/2 -right-40 w-[500px] h-[500px] bg-violet-600/20 rounded-full blur-[120px] mix-blend-screen opacity-50" />
        <div className="absolute -bottom-40 left-1/4 w-[400px] h-[400px] bg-sky-600/20 rounded-full blur-[100px] mix-blend-screen opacity-40" />
      </div>

      <header className="p-6 pb-2 border-b border-white/5 relative z-20">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-6 mb-6">
            <div className="w-1/3">
              <Breadcrumbs
                currentFolderId={currentFolderId}
                folderPath={folderPath}
                navigateToRoot={navigateToRoot}
                navigateToBreadcrumb={navigateToBreadcrumb}
                onEditFolder={() => {
                  const target = folderPath[folderPath.length - 1];
                  setNewFolderName(target.name);
                  setNewFolderDescription(target.description || "");
                  setNewFolderImageFilename(target.imageUrl || "");
                  setNewFolderEncrypt(target.isLocked);
                  setShowEditFolderModal(true);
                }}
              />
            </div>

            <Toolbar
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onClearSearch={() => { setSearchQuery(""); setSearchResults(null); }}
              sortBy={sortBy}
              setSortBy={setSortBy}
              viewMode={viewMode}
              setViewMode={setViewMode}
              isNewMenuOpen={isNewMenuOpen}
              setIsNewMenuOpen={setIsNewMenuOpen}
              onNewFolder={() => setShowNewFolderModal(true)}
              onNewNote={(type) => { setNewItemType(type); setShowNewItemModal(true); }}
            />
          </div>
        </div>
      </header>

      <main className="flex-1 p-8 overflow-y-auto relative z-0">
        {searchResults ? (
          <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                  <Search size={22} className="text-indigo-400" />
                  Search Results
                </h2>
                <p className="text-white/40 text-sm mt-1">Found {searchResults.length} matching items</p>
              </div>
              <button
                onClick={() => setSearchResults(null)}
                className="flex items-center gap-2 text-white/40 hover:text-white transition-colors bg-white/5 px-4 py-2 rounded-xl"
              >
                <ArrowLeft size={16} /> Clear Search
              </button>
            </div>

            <div className={cn("grid gap-6", viewMode === 'grid' ? "grid-cols-[repeat(auto-fill,minmax(200px,1fr))]" : "grid-cols-1")}>
              {searchResults.map((res) => (
                res.isFolder ? (
                  <FolderItem
                    key={res.id}
                    folder={{ id: res.id, name: res.name, isLocked: false, parentId: res.parentId || null, orderIndex: 0, createdAt: "", updatedAt: "" }}
                    viewMode={viewMode}
                    imgSrc={getImageSrc(res.imageUrl)}
                    onClick={() => handleFolderClick(res as any)}
                    onDelete={() => { }}
                    draggable={false}
                    isDragging={false}
                    dropPosition={null}
                    onDragStart={() => { }}
                    onDragOver={() => { }}
                    onDragLeave={(_e) => { }}
                    onDrop={() => { }}
                  />
                ) : (
                  <NoteItem
                    key={res.id}
                    item={{ id: res.id, title: res.name, content: res.content || "", imageUrl: res.imageUrl, folderId: res.parentId || null, itemType: (res.itemType as ItemType) || 'NOTE', orderIndex: 0, createdAt: "", updatedAt: "" }}
                    viewMode={viewMode}
                    imgSrc={getImageSrc(res.imageUrl)}
                    onClick={() => openItemDetail(res as any)}
                    onOpenLink={openLink}
                    draggable={false}
                    isDragging={false}
                    dropPosition={null}
                    onDragStart={() => { }}
                    onDragOver={() => { }}
                    onDragLeave={(_e) => { }}
                    onDrop={() => { }}
                  />
                )
              ))}
            </div>
            {searchResults.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-white/20">
                <Search size={64} className="mb-4 stroke-[1]" />
                <p className="text-xl font-medium">No results found for "{searchQuery}"</p>
              </div>
            )}
          </div>
        ) : (
          <div className={cn("max-w-7xl mx-auto grid gap-6", viewMode === 'grid' ? "grid-cols-[repeat(auto-fill,minmax(200px,1fr))]" : "grid-cols-1")}>
            {getUnifiedSorted().map(entry => (
              entry.kind === 'folder' && entry.folder ? (
                <FolderItem
                  key={entry.id}
                  folder={entry.folder}
                  viewMode={viewMode}
                  imgSrc={getImageSrc(entry.folder.imageUrl)}
                  onClick={() => handleFolderClick(entry.folder!)}
                  onDelete={() => handleDeleteFolder(entry.folder!.id)}
                  draggable={sortBy === 'manual'}
                  isDragging={dragState.dragId === entry.id}
                  dropPosition={dragState.dropTargetId === entry.id ? dragState.dropPosition : null}
                  onDragStart={(e) => onItemDragStart(e, entry.id, 'folder')}
                  onDragOver={(e) => onItemDragOver(e, entry.id, 'folder')}
                  onDragLeave={onItemDragLeave}
                  onDrop={(e) => handleDrop(e, entry.id, 'folder')}
                />
              ) : entry.kind === 'item' && entry.item ? (
                <NoteItem
                  key={entry.id}
                  item={entry.item}
                  viewMode={viewMode}
                  imgSrc={getImageSrc(entry.item.imageUrl)}
                  onClick={() => openItemDetail(entry.item!)}
                  onOpenLink={openLink}
                  draggable={sortBy === 'manual'}
                  isDragging={dragState.dragId === entry.id}
                  dropPosition={dragState.dropTargetId === entry.id ? dragState.dropPosition : null}
                  onDragStart={(e) => onItemDragStart(e, entry.id, 'item')}
                  onDragOver={(e) => onItemDragOver(e, entry.id, 'item')}
                  onDragLeave={onItemDragLeave}
                  onDrop={(e) => handleDrop(e, entry.id, 'item')}
                />
              ) : null
            ))}
          </div>
        )}
      </main>

      <PasswordPrompt
        isOpen={passwordPrompt.isOpen}
        passwordInput={passwordInput}
        setPasswordInput={setPasswordInput}
        onCancel={() => setPasswordPrompt({ isOpen: false, targetFolderId: null })}
        onSubmit={submitPassword}
      />

      <NewFolderModal
        isOpen={showNewFolderModal}
        onClose={() => { setShowNewFolderModal(false); setNewFolderDescription(""); setNewFolderImageFilename(""); }}
        folderName={newFolderName}
        setFolderName={setNewFolderName}
        folderDescription={newFolderDescription}
        setFolderDescription={setNewFolderDescription}
        encrypt={newFolderEncrypt}
        setEncrypt={setNewFolderEncrypt}
        password={newFolderPassword}
        setPassword={setNewFolderPassword}
        imageFilename={newFolderImageFilename}
        onPickImage={async () => { const img = await pickImage(); if (img) setNewFolderImageFilename(img); }}
        onPasteImage={async (e) => {
          const items = e.clipboardData.items;
          for (const item of items) {
            if (item.type.startsWith('image/')) {
              const file = item.getAsFile();
              if (file) {
                const reader = new FileReader();
                reader.onload = async (event) => {
                  const b64 = event.target?.result as string;
                  try {
                    const filename = await invoke<string>("save_base64_image", { base64Data: b64 });
                    setNewFolderImageFilename(filename);
                  } catch (err) { alert("Failed to save pasted image: " + err); }
                };
                reader.readAsDataURL(file);
              }
            }
          }
        }}
        onCreate={handleCreateFolder}
      />

      <EditFolderModal
        isOpen={showEditFolderModal}
        onClose={() => { setShowEditFolderModal(false); setNewFolderPassword(""); setNewFolderDescription(""); setNewFolderImageFilename(""); }}
        folderName={newFolderName}
        setFolderName={setNewFolderName}
        folderDescription={newFolderDescription}
        setFolderDescription={setNewFolderDescription}
        encrypt={newFolderEncrypt}
        setEncrypt={setNewFolderEncrypt}
        password={newFolderPassword}
        setPassword={setNewFolderPassword}
        imageFilename={newFolderImageFilename}
        onPickImage={async () => { const img = await pickImage(); if (img) setNewFolderImageFilename(img); }}
        onPasteImage={async (e) => {
          const items = e.clipboardData.items;
          for (const item of items) {
            if (item.type.startsWith('image/')) {
              const file = item.getAsFile();
              if (file) {
                const reader = new FileReader();
                reader.onload = async (event) => {
                  const b64 = event.target?.result as string;
                  try {
                    const filename = await invoke<string>("save_base64_image", { base64Data: b64 });
                    setNewFolderImageFilename(filename);
                  } catch (err) { alert("Failed to save pasted image: " + err); }
                };
                reader.readAsDataURL(file);
              }
            }
          }
        }}
        onSave={handleEditFolder}
      />

      <NewItemModal
        isOpen={showNewItemModal}
        onClose={() => setShowNewItemModal(false)}
        title={newItemTitle}
        setTitle={setNewItemTitle}
        url={newItemUrl}
        setUrl={setNewItemUrl}
        content={newItemContent}
        setContent={setNewItemContent}
        imageFilename={newItemImageFilename}
        setImageFilename={setNewItemImageFilename}
        onPickImage={async () => { const f = await pickImage(); if (f) setNewItemImageFilename(f); }}
        onPasteImage={async (e) => {
          const items = (e as any).clipboardData.items;
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

                  if ((e.target as any).tagName === 'TEXTAREA' || (e.target as any).id === 'new-item-content') {
                    const txt = document.getElementById('new-item-content') as HTMLTextAreaElement;
                    const start = txt ? txt.selectionStart : newItemContent.length;
                    setNewItemContent(prev => prev.substring(0, start) + `\n![pasted image](${filename})\n` + prev.substring(start));
                  } else {
                    setNewItemImageFilename(filename);
                  }
                } catch (err) { alert("Failed to save pasted image: " + err); }
              };
              reader.readAsDataURL(file);
              break;
            }
          }
        }}
        onCreate={handleCreateItem}
      />

      <ConfirmDeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, type: 'folder', id: '', name: '' })}
        onConfirm={executeDelete}
        type={deleteModal.type}
        name={deleteModal.name}
        isBusy={isBusy}
      />
    </div>
  );
}
