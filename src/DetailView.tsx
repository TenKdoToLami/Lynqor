import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { FileText } from "lucide-react";
import { Item } from "./types";
import { InlineDetailView } from "./components/InlineDetailView";

export default function DetailView() {
    const [item, setItem] = useState<(Item & { folderKey?: number[] | null, rootFolderId?: string | null }) | null>(null);

    // Listen for item data from main window
    useEffect(() => {
        const unlisten = listen<Item & { folderKey?: number[] | null, rootFolderId?: string | null }>("show-item", (event) => {
            setItem(event.payload);
        });

        return () => { unlisten.then(fn => fn()); };
    }, []);

    if (!item) {
        return (
            <div className="min-h-screen bg-slate-950 text-neutral-100 flex items-center justify-center">
                <div className="text-white/30 flex flex-col items-center gap-4">
                    <FileText size={48} className="opacity-30" />
                    <p className="text-lg font-medium">Loading note...</p>
                </div>
            </div>
        );
    }

    return <InlineDetailView item={item} />;
}
