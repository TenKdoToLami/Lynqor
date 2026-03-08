import { ChevronRight, Edit2 } from "lucide-react";
import { Folder } from "../types";
import { cn } from "../utils";

interface BreadcrumbsProps {
    currentFolderId: string | null;
    folderPath: Folder[];
    navigateToRoot: () => void;
    navigateToBreadcrumb: (crumb: Folder, idx: number) => void;
    onEditFolder: () => void;
}

export function Breadcrumbs({
    currentFolderId,
    folderPath,
    navigateToRoot,
    navigateToBreadcrumb,
    onEditFolder
}: BreadcrumbsProps) {
    return (
        <div className="flex items-center gap-3 relative z-10 w-full overflow-hidden">
            <button
                onClick={navigateToRoot}
                className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300 hover:opacity-80 transition-opacity drop-shadow-sm shrink-0"
            >
                Lynqor
            </button>

            <div className="flex items-center overflow-x-auto no-scrollbar py-1">
                {folderPath.map((crumb, idx, arr) => (
                    <div key={crumb.id} className="flex items-center gap-2 text-white/50 shrink-0">
                        <ChevronRight size={14} className="text-white/30" />
                        <button
                            onClick={() => navigateToBreadcrumb(crumb, idx)}
                            className={cn(
                                "hover:text-indigo-300 transition-colors font-medium whitespace-nowrap",
                                idx === arr.length - 1 ? "text-white" : "max-w-[120px] truncate"
                            )}
                        >
                            {crumb.name}
                        </button>
                    </div>
                ))}
            </div>

            {currentFolderId && (
                <button
                    onClick={onEditFolder}
                    className="ml-2 p-1.5 rounded-lg text-red-400 bg-red-400/10 hover:bg-red-400/20 hover:text-red-300 transition-all border border-red-400/20 shadow-sm shrink-0"
                    title="Edit current folder"
                >
                    <Edit2 size={14} />
                </button>
            )}
        </div>
    );
}
