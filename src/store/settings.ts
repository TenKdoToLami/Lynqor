import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
    openInNewWindow: boolean;
    tileIconSize: number;
    setOpenInNewWindow: (val: boolean) => void;
    setTileIconSize: (val: number) => void;
}

export const useSettings = create<SettingsState>()(
    persist(
        (set) => ({
            openInNewWindow: false,
            tileIconSize: 112, // Default size in pixels

            setOpenInNewWindow: (val) => set({ openInNewWindow: val }),
            setTileIconSize: (val) => set({ tileIconSize: Math.max(64, Math.min(256, val)) })
        }),
        {
            name: 'lynqor-settings',
        }
    )
);
