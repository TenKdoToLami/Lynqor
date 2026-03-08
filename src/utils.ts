import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function parseItemContent(content: string): { url: string; body: string } {
    try {
        const parsed = JSON.parse(content);
        return { url: parsed.url || "", body: parsed.body || "" };
    } catch {
        return { url: "", body: content };
    }
}

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
