use rusqlite::{Connection, Result};
use tauri::Manager;

pub fn get_db_path(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    Ok(app_dir.join("lynqor_notes.sqlite"))
}

pub fn init_db(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    let db_path = get_db_path(app_handle)?;

    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            parent_id TEXT,
            name_encrypted BLOB,
            description_encrypted BLOB,
            folder_key_encrypted BLOB,
            is_locked INTEGER DEFAULT 0,
            password_salt TEXT,
            image_url TEXT,
            migrated_to_blob INTEGER DEFAULT 0,
            order_index REAL DEFAULT 0.0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(parent_id) REFERENCES folders(id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            folder_id TEXT,
            item_type TEXT NOT NULL,
            title_encrypted BLOB,
            content_encrypted BLOB,
            image_url TEXT,
            order_index REAL DEFAULT 0.0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(folder_id) REFERENCES folders(id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS images (
            id TEXT PRIMARY KEY,
            data BLOB NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS encrypted_blobs (
            id TEXT PRIMARY KEY,
            data BLOB NOT NULL,
            root_folder_id TEXT,
            FOREIGN KEY(root_folder_id) REFERENCES folders(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Migration: if old DB has NOT NULL on folder_id, recreate the table
    let needs_migration: bool = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='items'",
            [],
            |row| {
                let sql: String = row.get(0)?;
                Ok(sql.contains("folder_id TEXT NOT NULL"))
            },
        )
        .unwrap_or(false);

    if needs_migration {
        conn.execute_batch(
            "BEGIN;
             CREATE TABLE items_new (
                 id TEXT PRIMARY KEY,
                 folder_id TEXT,
                 item_type TEXT NOT NULL,
                 title_encrypted BLOB,
                 content_encrypted BLOB,
                 image_url TEXT,
                 order_index REAL DEFAULT 0.0,
                 created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                 updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                 FOREIGN KEY(folder_id) REFERENCES folders(id)
             );
             INSERT INTO items_new (id, folder_id, item_type, title_encrypted, content_encrypted, created_at)
                 SELECT id, folder_id, item_type, title_encrypted, content_encrypted, created_at FROM items;
             DROP TABLE items;
             ALTER TABLE items_new RENAME TO items;
             COMMIT;"
        ).map_err(|e| e.to_string())?;
    }

    // Migration: add image_url column if missing
    let has_image_url_in_items: bool = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='items'",
            [],
            |row| {
                let sql: String = row.get(0)?;
                Ok(sql.contains("image_url TEXT"))
            },
        )
        .unwrap_or(false);

    if !has_image_url_in_items {
        conn.execute("ALTER TABLE items ADD COLUMN image_url TEXT", [])
            .map_err(|e| e.to_string())?;
    }

    // Migration: add description_encrypted and image_url to folders if missing
    let folders_sql_for_new_cols: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='folders'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_default();

    if !folders_sql_for_new_cols.contains("description_encrypted BLOB") {
        // SQLite ALTER TABLE allows adding columns one by one
        conn.execute(
            "ALTER TABLE folders ADD COLUMN description_encrypted BLOB",
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    // Check for image_url in folders, though it's already in the initial CREATE TABLE,
    // this handles cases where an older DB might not have it.
    if !folders_sql_for_new_cols.contains("image_url TEXT") {
        conn.execute("ALTER TABLE folders ADD COLUMN image_url TEXT", [])
            .map_err(|e| e.to_string())?;
    }

    // Migration: add migrated_to_blob to folders if missing
    if !folders_sql_for_new_cols.contains("migrated_to_blob INTEGER") {
        conn.execute(
            "ALTER TABLE folders ADD COLUMN migrated_to_blob INTEGER DEFAULT 0",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    // Migration: add order_index and updated_at to folders
    let folders_sql: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='folders'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_default();

    if !folders_sql.contains("order_index") {
        conn.execute(
            "ALTER TABLE folders ADD COLUMN order_index REAL DEFAULT 0.0",
            [],
        )
        .ok();
    }
    if !folders_sql.contains("updated_at") {
        conn.execute("ALTER TABLE folders ADD COLUMN updated_at DATETIME", [])
            .map_err(|e| println!("db migration error folders updated_at: {}", e))
            .ok();
    }

    // Migration: add order_index and updated_at to items
    let items_sql: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='items'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_default();

    if !items_sql.contains("order_index") {
        conn.execute(
            "ALTER TABLE items ADD COLUMN order_index REAL DEFAULT 0.0",
            [],
        )
        .ok();
    }
    if !items_sql.contains("updated_at") {
        conn.execute("ALTER TABLE items ADD COLUMN updated_at DATETIME", [])
            .map_err(|e| println!("db migration error items updated_at: {}", e))
            .ok();
    }

    // Migration: load existing files from app_data/images to SQLite DB
    let images_dir = app_dir.join("images");
    if images_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&images_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
                        if let Ok(data) = std::fs::read(&path) {
                            conn.execute(
                                "INSERT OR IGNORE INTO images (id, data) VALUES (?1, ?2)",
                                rusqlite::params![filename, data],
                            )
                            .ok();
                            // Optional: delete file after successful migration
                            // std::fs::remove_file(path).ok();
                        }
                    }
                }
            }
        }
    }

    Ok(conn)
}
