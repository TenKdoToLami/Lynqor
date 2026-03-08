use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::crypto::{
    decrypt_aes_gcm, derive_kek_from_password, derive_kek_from_password_and_salt, encrypt_aes_gcm,
    generate_folder_key,
};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub is_locked: bool,
    pub order_index: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub folder_id: Option<String>,
    pub item_type: String,
    pub title: String,
    pub content: String,
    pub image_url: Option<String>,
    pub order_index: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[tauri::command]
pub fn create_folder(
    app_handle: tauri::AppHandle,
    id: String,
    parent_id: Option<String>,
    name: String,
    description: Option<String>,
    image_url: Option<String>,
    password: Option<String>,
    parent_folder_key: Option<Vec<u8>>,
) -> Result<(), String> {
    let db_path = crate::db::get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let folder_key = generate_folder_key();

    let name_kek = if let Some(parent_key) = &parent_folder_key {
        parent_key.clone()
    } else {
        vec![0u8; 32]
    };

    let (kek, salt, is_locked) = match password {
        Some(pw) => {
            let (kek, salt) = derive_kek_from_password(&pw);
            (kek, Some(salt), true)
        }
        None => {
            if let Some(parent_key) = parent_folder_key {
                (parent_key, None, true)
            } else {
                (vec![0u8; 32], None, false)
            }
        }
    };

    let encrypted_name = encrypt_aes_gcm(&name_kek, name.as_bytes());
    let encrypted_desc = encrypt_aes_gcm(&folder_key, description.unwrap_or_default().as_bytes());
    let encrypted_folder_key = encrypt_aes_gcm(&kek, &folder_key);

    conn.execute(
        "INSERT INTO folders (id, parent_id, name_encrypted, description_encrypted, image_url, folder_key_encrypted, is_locked, password_salt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![id, parent_id, encrypted_name, encrypted_desc, image_url, encrypted_folder_key, is_locked, salt],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn unlock_folder(
    app_handle: tauri::AppHandle,
    folder_id: String,
    password: Option<String>,
    parent_folder_key: Option<Vec<u8>>,
) -> Result<Vec<u8>, String> {
    let db_path = crate::db::get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT folder_key_encrypted, password_salt FROM folders WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(rusqlite::params![folder_id])
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let folder_key_encrypted: Vec<u8> = row.get(0).map_err(|e| e.to_string())?;
        let password_salt: Option<String> = row.get(1).map_err(|e| e.to_string())?;

        let kek = match (password, password_salt) {
            (Some(pw), Some(salt)) => derive_kek_from_password_and_salt(&pw, &salt),
            _ => {
                if let Some(parent_key) = parent_folder_key {
                    parent_key
                } else {
                    vec![0u8; 32]
                }
            }
        };

        decrypt_aes_gcm(&kek, &folder_key_encrypted)
    } else {
        Err("Folder not found".to_string())
    }
}

#[tauri::command]
pub fn create_item(
    app_handle: tauri::AppHandle,
    id: String,
    folder_id: Option<String>,
    item_type: String,
    title: String,
    content: String,
    image_url: Option<String>,
    folder_key: Option<Vec<u8>>,
) -> Result<(), String> {
    let db_path = crate::db::get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let key_to_use = folder_key.unwrap_or_else(|| vec![0u8; 32]);
    let encrypted_title = encrypt_aes_gcm(&key_to_use, title.as_bytes());
    let encrypted_content = encrypt_aes_gcm(&key_to_use, content.as_bytes());
    conn.execute(
        "INSERT INTO items (id, folder_id, item_type, title_encrypted, content_encrypted, image_url) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, folder_id, item_type, encrypted_title, encrypted_content, image_url],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn update_item(
    app_handle: tauri::AppHandle,
    id: String,
    title: String,
    content: String,
    image_url: Option<String>,
    folder_key: Option<Vec<u8>>,
) -> Result<(), String> {
    let db_path = crate::db::get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let key_to_use = folder_key.unwrap_or_else(|| vec![0u8; 32]);
    let encrypted_title = encrypt_aes_gcm(&key_to_use, title.as_bytes());
    let encrypted_content = encrypt_aes_gcm(&key_to_use, content.as_bytes());
    conn.execute(
        "UPDATE items SET title_encrypted = ?1, content_encrypted = ?2, image_url = ?3, updated_at = CURRENT_TIMESTAMP WHERE id = ?4",
        rusqlite::params![encrypted_title, encrypted_content, image_url, id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn delete_item(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    let db_path = crate::db::get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // Delete image from DB (metadata)
    // Note: The actual image blob is in the images table, but item just holds its ID in image_url.
    // We don't necessarily delete the blob here if it's shared, but items in Lynqor usually have unique images.
    // For now we just delete the item.
    // The previous code tried to delete from disk, which is wrong now.

    conn.execute("DELETE FROM items WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn save_image(app_handle: tauri::AppHandle, source_path: String) -> Result<String, String> {
    let app_dir = app_handle.path().app_data_dir().unwrap();
    let db_path = app_dir.join("lynqor_notes.sqlite");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let source = std::path::Path::new(&source_path);
    let ext = source.extension().and_then(|e| e.to_str()).unwrap_or("png");
    let filename = format!("{}.{}", uuid::Uuid::new_v4(), ext);

    let data = std::fs::read(&source_path).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO images (id, data) VALUES (?1, ?2)",
        rusqlite::params![filename, data],
    )
    .map_err(|e| e.to_string())?;

    Ok(filename)
}

#[tauri::command]
pub fn save_base64_image(
    app_handle: tauri::AppHandle,
    base64_data: String,
) -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};

    // The base64_data might have a data URI prefix, e.g., "data:image/png;base64,iVBORw0KGgo..."
    // We need to strip it if it exists.
    let base64_content = if let Some(idx) = base64_data.find(',') {
        &base64_data[idx + 1..]
    } else {
        &base64_data
    };

    let decoded = general_purpose::STANDARD
        .decode(base64_content)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let db_path = crate::db::get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // Default to png for clipboard drops for simplicity
    let filename = format!("{}.png", uuid::Uuid::new_v4());

    conn.execute(
        "INSERT INTO images (id, data) VALUES (?1, ?2)",
        rusqlite::params![filename, decoded],
    )
    .map_err(|e| e.to_string())?;

    Ok(filename)
}

#[tauri::command]
pub fn get_image_base64(app_handle: tauri::AppHandle, filename: String) -> Result<String, String> {
    let db_path = crate::db::get_db_path(&app_handle)?;

    let ext = std::path::Path::new(&filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();

    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        _ => "image/png",
    };

    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // Try finding the image in DB first
    let db_res = (|| -> Result<Vec<u8>, String> {
        let mut stmt = conn
            .prepare("SELECT data FROM images WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let data: Vec<u8> = stmt
            .query_row(rusqlite::params![&filename], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        Ok(data)
    })();

    let buffer = match db_res {
        Ok(data) => data,
        Err(_) => {
            // Fallback to local file system if not correctly migrated or saved
            use std::io::Read;
            let app_dir = app_handle.path().app_data_dir().unwrap();
            let full_path = app_dir.join("images").join(&filename);
            if !full_path.exists() {
                return Err("Image not found in DB or filesystem".to_string());
            }

            let mut file = std::fs::File::open(&full_path).map_err(|e| e.to_string())?;
            let mut buf = Vec::new();
            file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            buf
        }
    };

    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&buffer);
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[tauri::command]
pub fn delete_folder(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    let db_path = crate::db::get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // Delete all items inside this folder
    conn.execute(
        "DELETE FROM items WHERE folder_id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;

    // Delete sub-folders recursively (simple: just delete direct children for now)
    conn.execute(
        "DELETE FROM folders WHERE parent_id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;

    // Delete the folder itself
    conn.execute("DELETE FROM folders WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_folders_by_parent(
    app_handle: tauri::AppHandle,
    parent_id: Option<String>,
    folder_key: Option<Vec<u8>>,
) -> Result<Vec<Folder>, String> {
    let db_path = crate::db::get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let query = match parent_id {
        Some(_) => "SELECT id, parent_id, name_encrypted, description_encrypted, image_url, is_locked, created_at, folder_key_encrypted, order_index, updated_at FROM folders WHERE parent_id = ?1",
        None => "SELECT id, parent_id, name_encrypted, description_encrypted, image_url, is_locked, created_at, folder_key_encrypted, order_index, updated_at FROM folders WHERE parent_id IS NULL",
    };

    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;

    let mut rows = match parent_id {
        Some(ref pid) => stmt.query(rusqlite::params![pid]),
        None => stmt.query([]),
    }
    .map_err(|e| e.to_string())?;

    let default_key = vec![0u8; 32];
    let mut folders = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let id: String = row.get(0).unwrap();
        let pid: Option<String> = row.get(1).unwrap();
        let name_encrypted: Vec<u8> = row.get(2).unwrap();
        let desc_encrypted: Option<Vec<u8>> = row.get(3).unwrap_or(None);
        let image_url: Option<String> = row.get(4).unwrap_or(None);
        let is_locked: bool = row.get(5).unwrap_or(false);
        let created_at: String = row.get(6).unwrap_or_else(|_| "".to_string());
        let folder_key_encrypted: Vec<u8> = row.get(7).unwrap();
        let order_index: f64 = row.get(8).unwrap_or(0.0);
        let updated_at: String = row.get(9).unwrap_or_else(|_| "".to_string());

        let key_to_use = folder_key.as_ref().unwrap_or(&default_key);
        let mut decrypted_name = match decrypt_aes_gcm(key_to_use, &name_encrypted) {
            Ok(decrypted) => {
                String::from_utf8(decrypted).unwrap_or_else(|_| "Locked Folder".to_string())
            }
            Err(_) => {
                // Fallback for folders created under the old logic
                let mut fallback_name = "Locked Folder".to_string();
                if !is_locked {
                    if let Ok(fk) = decrypt_aes_gcm(&vec![0u8; 32], &folder_key_encrypted) {
                        if let Ok(dec) = decrypt_aes_gcm(&fk, &name_encrypted) {
                            fallback_name = String::from_utf8(dec).unwrap_or(fallback_name);
                        }
                    }
                }
                fallback_name
            }
        };

        let mut decrypted_desc = None;
        if let Some(desc_enc) = desc_encrypted {
            if let Ok(dec) = decrypt_aes_gcm(key_to_use, &desc_enc) {
                if let Ok(s) = String::from_utf8(dec) {
                    if !s.is_empty() {
                        decrypted_desc = Some(s);
                    }
                }
            }
        }

        let name = decrypted_name;

        folders.push(Folder {
            id,
            parent_id: pid,
            name,
            description: decrypted_desc,
            image_url,
            is_locked,
            order_index,
            created_at,
            updated_at,
        });
    }

    Ok(folders)
}

#[tauri::command]
pub fn get_items_by_folder(
    app_handle: tauri::AppHandle,
    folder_id: Option<String>,
    folder_key: Option<Vec<u8>>,
) -> Result<Vec<Item>, String> {
    let db_path = crate::db::get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let query = match folder_id {
        Some(_) => "SELECT id, item_type, title_encrypted, content_encrypted, created_at, image_url, order_index, updated_at FROM items WHERE folder_id = ?1",
        None => "SELECT id, item_type, title_encrypted, content_encrypted, created_at, image_url, order_index, updated_at FROM items WHERE folder_id IS NULL",
    };

    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;

    let mut rows = match folder_id {
        Some(ref fid) => stmt.query(rusqlite::params![fid]),
        None => stmt.query([]),
    }
    .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    let default_key = vec![0u8; 32];
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let id: String = row.get(0).unwrap();
        let item_type: String = row.get(1).unwrap();
        let title_encrypted: Vec<u8> = row.get(2).unwrap();
        let content_encrypted: Vec<u8> = row.get(3).unwrap();
        let created_at: String = row.get(4).unwrap_or_else(|_| "".to_string());
        let image_url: Option<String> = row.get(5).unwrap_or(None);
        let order_index: f64 = row.get(6).unwrap_or(0.0);
        let updated_at: String = row.get(7).unwrap_or_else(|_| "".to_string());

        let key_to_use = folder_key.as_ref().unwrap_or(&default_key);

        let title = decrypt_aes_gcm(&key_to_use, &title_encrypted)
            .map(|b| String::from_utf8(b).unwrap_or_default())
            .unwrap_or_else(|_| "Encrypted Item".to_string());

        let content = decrypt_aes_gcm(&key_to_use, &content_encrypted)
            .map(|b| String::from_utf8(b).unwrap_or_default())
            .unwrap_or_else(|_| "Encrypted Content".to_string());

        items.push(Item {
            id,
            folder_id: folder_id.clone(),
            item_type,
            title,
            content,
            image_url,
            order_index,
            created_at,
            updated_at,
        });
    }

    Ok(items)
}

#[tauri::command]
pub fn update_folder_with_key(
    app_handle: tauri::AppHandle,
    id: String,
    name: String,
    description: Option<String>,
    image_url: Option<String>,
    password: Option<String>,
    current_folder_key: Vec<u8>,
    parent_folder_key: Option<Vec<u8>>,
) -> Result<(), String> {
    let db_path = crate::db::get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let name_kek = if let Some(parent_key) = &parent_folder_key {
        parent_key.clone()
    } else {
        vec![0u8; 32]
    };

    let (kek, salt, is_locked) = match password {
        Some(pw) => {
            let (kek, salt) = derive_kek_from_password(&pw);
            (kek, Some(salt), true)
        }
        None => {
            if let Some(parent_key) = parent_folder_key {
                (parent_key, None, true)
            } else {
                (vec![0u8; 32], None, false)
            }
        }
    };

    let encrypted_name = encrypt_aes_gcm(&name_kek, name.as_bytes());
    let encrypted_desc = encrypt_aes_gcm(
        &current_folder_key,
        description.unwrap_or_default().as_bytes(),
    );
    let encrypted_folder_key = encrypt_aes_gcm(&kek, &current_folder_key);

    conn.execute(
        "UPDATE folders SET name_encrypted = ?1, description_encrypted = ?2, image_url = ?3, folder_key_encrypted = ?4, is_locked = ?5, password_salt = ?6, updated_at = CURRENT_TIMESTAMP WHERE id = ?7",
        rusqlite::params![encrypted_name, encrypted_desc, image_url, encrypted_folder_key, is_locked, salt, id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn update_order_index(
    app_handle: tauri::AppHandle,
    id: String,
    item_type: String, // "folder" or "item"
    order_index: f64,
) -> Result<(), String> {
    let db_path = crate::db::get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    if item_type == "folder" {
        conn.execute(
            "UPDATE folders SET order_index = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            rusqlite::params![order_index, id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE items SET order_index = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            rusqlite::params![order_index, id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub id: String,
    pub is_folder: bool,
    pub name: String,
    pub content: Option<String>,
    pub parent_id: Option<String>,
    pub item_type: Option<String>,
    pub image_url: Option<String>,
}

#[tauri::command]
pub fn search_items(
    app_handle: tauri::AppHandle,
    query: String,
    current_folder_id: Option<String>,
    current_folder_key: Vec<u8>,
) -> Result<Vec<SearchResult>, String> {
    let db_path = crate::db::get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    let query_lower = query.to_lowercase();

    // In a fully encrypted app, server-side search of encrypted blobs is impossible without a specialized index.
    // For this simple search implementation, we will ONLY search within the currently fully unlocked folder.
    // We fetch all items in the current folder, decrypt, and match.
    // If the user wants recursive, we would need to know the keys of all subfolders (possible if they share the parent key, but complex if individually passworded).
    // For now, we stick to current_folder_id items and subfolders (1 level deep) that share the same key or [0u8;32].

    let (mut folder_stmt, mut item_stmt) = match current_folder_id {
        Some(_) => (
            conn.prepare("SELECT id, name_encrypted, description_encrypted, image_url, is_locked, folder_key_encrypted FROM folders WHERE parent_id = ?1").map_err(|e| e.to_string())?,
            conn.prepare("SELECT id, item_type, title_encrypted, content_encrypted, image_url FROM items WHERE folder_id = ?1").map_err(|e| e.to_string())?
        ),
        None => (
            conn.prepare("SELECT id, name_encrypted, description_encrypted, image_url, is_locked, folder_key_encrypted FROM folders WHERE parent_id IS NULL").map_err(|e| e.to_string())?,
            conn.prepare("SELECT id, item_type, title_encrypted, content_encrypted, image_url FROM items WHERE folder_id IS NULL").map_err(|e| e.to_string())?
        )
    };

    // Check items in current folder
    let mut item_rows = if let Some(fid) = &current_folder_id {
        item_stmt
            .query(rusqlite::params![fid])
            .map_err(|e| e.to_string())?
    } else {
        item_stmt
            .query(rusqlite::params![])
            .map_err(|e| e.to_string())?
    };
    while let Some(row) = item_rows.next().map_err(|e| e.to_string())? {
        let id: String = row.get(0).unwrap();
        let item_type: String = row.get(1).unwrap();
        let title_enc: Vec<u8> = row.get(2).unwrap();
        let content_enc: Vec<u8> = row.get(3).unwrap();
        let image_url: Option<String> = row.get(4).unwrap_or(None);

        let title = decrypt_aes_gcm(&current_folder_key, &title_enc)
            .map(|b| String::from_utf8(b).unwrap_or_default())
            .unwrap_or_default();

        let content = decrypt_aes_gcm(&current_folder_key, &content_enc)
            .map(|b| String::from_utf8(b).unwrap_or_default())
            .unwrap_or_default();

        if title.to_lowercase().contains(&query_lower)
            || content.to_lowercase().contains(&query_lower)
        {
            results.push(SearchResult {
                id,
                is_folder: false,
                name: title,
                content: Some(content),
                parent_id: current_folder_id.clone(),
                item_type: Some(item_type),
                image_url,
            });
        }
    }

    // Check folders in current folder
    let mut folder_rows = if let Some(fid) = &current_folder_id {
        folder_stmt
            .query(rusqlite::params![fid])
            .map_err(|e| e.to_string())?
    } else {
        folder_stmt
            .query(rusqlite::params![])
            .map_err(|e| e.to_string())?
    };
    while let Some(row) = folder_rows.next().map_err(|e| e.to_string())? {
        let id: String = row.get(0).unwrap();
        let name_enc: Vec<u8> = row.get(1).unwrap();
        let desc_enc: Option<Vec<u8>> = row.get(2).unwrap_or(None);
        let image_url: Option<String> = row.get(3).unwrap_or(None);
        let is_locked: bool = row.get(4).unwrap();
        let folder_key_enc: Vec<u8> = row.get(5).unwrap();

        let mut folder_key_to_use = None;
        if !is_locked {
            if let Ok(fk) = decrypt_aes_gcm(&vec![0u8; 32], &folder_key_enc) {
                folder_key_to_use = Some(fk);
            }
        } else {
            if let Ok(fk) = decrypt_aes_gcm(&current_folder_key, &folder_key_enc) {
                folder_key_to_use = Some(fk);
            }
        }

        if let Some(fk) = folder_key_to_use {
            if let Ok(dec) = decrypt_aes_gcm(&fk, &name_enc) {
                if let Ok(name) = String::from_utf8(dec) {
                    let mut desc_str = String::new();
                    if let Some(de) = desc_enc {
                        if let Ok(d_dec) = decrypt_aes_gcm(&fk, &de) {
                            if let Ok(d_str) = String::from_utf8(d_dec) {
                                desc_str = d_str;
                            }
                        }
                    }

                    if name.to_lowercase().contains(&query_lower)
                        || desc_str.to_lowercase().contains(&query_lower)
                    {
                        results.push(SearchResult {
                            id,
                            is_folder: true,
                            name,
                            content: if desc_str.is_empty() {
                                None
                            } else {
                                Some(desc_str)
                            },
                            parent_id: current_folder_id.clone(),
                            item_type: None,
                            image_url,
                        });
                    }
                }
            }
        }
    }

    Ok(results)
}
