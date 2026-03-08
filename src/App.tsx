import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open, ask } from "@tauri-apps/plugin-dialog";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { Folder, Item, ItemType } from "./types";
import { ArrowLeft, Search } from "lucide-react";
import { cn } from "./utils";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { Toolbar } from "./components/Toolbar";
import { FolderItem } from "./components/FolderItem";
import { NoteItem } from "./components/NoteItem";
import { PasswordPrompt } from "./components/Modals/PasswordPrompt";
import { NewFolderModal } from "./components/Modals/NewFolderModal";
import { EditFolderModal } from "./components/Modals/EditFolderModal";
import { NewItemModal } from "./components/Modals/NewItemModal";

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
      console.log("Loaded folders:", foldersData);
      console.log("Loaded items:", itemsData);
    } catch (e) { console.error("Data load failed:", e); }
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

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const results = await invoke<SearchResultItem[]>("search_items", {
        query: searchQuery,
        folderKey: currentFolderKey || Array(32).fill(0)
      });
      setSearchResults(results);
    } catch (e) {
      alert("Search failed: " + e);
      setSearchResults(null);
    }
  };

  const getSortedFolders = useCallback(() => {
    let sorted = [...folders];
    if (sortBy === 'a-z') sorted.sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === 'z-a') sorted.sort((a, b) => b.name.localeCompare(a.name));
    if (sortBy === 'latest_edit') sorted.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
    if (sortBy === 'latest_create') sorted.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    if (sortBy === 'manual') sorted.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    return sorted;
  }, [folders, sortBy]);

  const getSortedItems = useCallback(() => {
    let sorted = [...items];
    if (sortBy === 'a-z') sorted.sort((a, b) => a.title.localeCompare(b.title));
    if (sortBy === 'z-a') sorted.sort((a, b) => b.title.localeCompare(a.title));
    if (sortBy === 'latest_edit') sorted.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
    if (sortBy === 'latest_create') sorted.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    if (sortBy === 'manual') sorted.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    return sorted;
  }, [items, sortBy]);

  const handleEditFolder = async () => {
    try {
      if (!currentFolderId) return;
      const currentKey = currentFolderKey || Array(32).fill(0);
      const parentKey = folderPath.length > 1 ? (folderPath[folderPath.length - 2] as any).folderKey : null;

      await invoke("update_folder_with_key", {
        id: currentFolderId,
        name: newFolderName,
        password: newFolderEncrypt ? newFolderPassword : null,
        currentFolderKey: currentKey,
        parentFolderKey: parentKey
      });

      setShowEditFolderModal(false);
      setNewFolderPassword("");
      loadData();

      // Update folder path name if it changed
      setFolderPath(prev => {
        const newPath = [...prev];
        newPath[newPath.length - 1].name = newFolderName;
        return newPath;
      });
    } catch (e) { alert("Failed to edit folder: " + e); }
  };

  const handleDrop = async (e: React.DragEvent, targetId: string, targetType: 'folder' | 'item') => {
    e.preventDefault();
    if (sortBy !== 'manual') return;

    const draggedData = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
    const { id: draggedId, type: draggedType } = draggedData;

    if (!draggedId || draggedId === targetId || draggedType !== targetType) return;

    let list = draggedType === 'folder' ? getSortedFolders() : getSortedItems();
    const targetIdx = list.findIndex(x => x.id === targetId);
    if (targetIdx === -1) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isBefore = viewMode === 'list' ? (e.clientY < rect.top + rect.height / 2) : (e.clientX < rect.left + rect.width / 2);

    let prevIndex = 0;
    let nextIndex = 0;

    if (isBefore) {
      prevIndex = targetIdx > 0 ? (list[targetIdx - 1].orderIndex || 0) : (list[targetIdx].orderIndex || 0) - 1;
      nextIndex = list[targetIdx].orderIndex || 0;
    } else {
      prevIndex = list[targetIdx].orderIndex || 0;
      nextIndex = targetIdx < list.length - 1 ? (list[targetIdx + 1].orderIndex || 0) : (list[targetIdx].orderIndex || 0) + 1;
    }

    const newOrderIndex = (prevIndex + nextIndex) / 2.0;

    try {
      await invoke('update_order_index', { id: draggedId, itemType: draggedType, orderIndex: newOrderIndex });
      loadData();
    } catch (err) { alert("Failed to reorder: " + err); }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-neutral-100 flex flex-col font-sans selection:bg-indigo-500/30 relative overflow-hidden">
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
                  setNewFolderEncrypt(target.isLocked);
                  setShowEditFolderModal(true);
                }}
              />
            </div>

            <Toolbar
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              handleSearch={handleSearch}
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
                    onClick={() => handleFolderClick(res as any)}
                    onDelete={() => { }}
                    draggable={false}
                    onDragStart={() => { }}
                    onDragOver={() => { }}
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
                    onDragStart={() => { }}
                    onDragOver={() => { }}
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
            {getSortedFolders().map(folder => (
              <FolderItem
                key={folder.id}
                folder={folder}
                viewMode={viewMode}
                onClick={() => handleFolderClick(folder)}
                onDelete={() => handleDeleteFolder(folder.id)}
                draggable={sortBy === 'manual'}
                onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ id: folder.id, type: 'folder' }))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, folder.id, 'folder')}
              />
            ))}

            {getSortedItems().map(item => (
              <NoteItem
                key={item.id}
                item={item}
                viewMode={viewMode}
                imgSrc={getImageSrc(item.imageUrl)}
                onClick={() => openItemDetail(item)}
                onOpenLink={openLink}
                draggable={sortBy === 'manual'}
                onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ id: item.id, type: 'item' }))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, item.id, 'item')}
              />
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
        onClose={() => setShowNewFolderModal(false)}
        folderName={newFolderName}
        setFolderName={setNewFolderName}
        encrypt={newFolderEncrypt}
        setEncrypt={setNewFolderEncrypt}
        password={newFolderPassword}
        setPassword={setNewFolderPassword}
        onCreate={handleCreateFolder}
      />

      <EditFolderModal
        isOpen={showEditFolderModal}
        onClose={() => { setShowEditFolderModal(false); setNewFolderPassword(""); }}
        folderName={newFolderName}
        setFolderName={setNewFolderName}
        encrypt={newFolderEncrypt}
        setEncrypt={setNewFolderEncrypt}
        password={newFolderPassword}
        setPassword={setNewFolderPassword}
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
    </div>
  );
}
