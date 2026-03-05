use rusqlite::{Connection, Result};
use tauri::Manager;

pub fn init_db(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    let db_path = app_dir.join("lynqor_notes.sqlite");

    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            parent_id TEXT,
            name_encrypted BLOB,
            folder_key_encrypted BLOB,
            is_locked INTEGER DEFAULT 0,
            password_salt TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(folder_id) REFERENCES folders(id)
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
                Ok(sql.contains("NOT NULL") && sql.contains("folder_id"))
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
                 created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
    let has_image_url: bool = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='items'",
            [],
            |row| {
                let sql: String = row.get(0)?;
                Ok(sql.contains("image_url"))
            },
        )
        .unwrap_or(false);

    if !has_image_url {
        conn.execute("ALTER TABLE items ADD COLUMN image_url TEXT", [])
            .map_err(|e| e.to_string())?;
    }

    Ok(conn)
}
