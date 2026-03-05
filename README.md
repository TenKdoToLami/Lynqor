# Lynqor Notes

A secure, fully local, cross-platform encrypted sticky notes and bookmarks application.

## Core Features
- **Local First**: Built with SQLite and Tauri, keeping your data locally on your device.
- **Nested Encrypted Folders**: Folder-level AES-GCM 256 encryption. Subfolders can inherit parent passwords or have their own separate keys.
- **Link Bookmarks & Thumbnails**: Save links with auto-fetched thumbnail previews (thumbnails are also encrypted).
- **Modern UI**: React and Tailwind CSS frontend with a desktop-native feel.

## Development Setup

1. **Install Node.js & Rust** (and Visual Studio C++ Build Tools on Windows).
2. **Install JavaScript dependencies:**
   ```bash
   npm install
   ```
3. **Run the development server:**
   ```bash
   npm run tauri dev
   ```

## Production Build
```bash
npm run tauri build
```
