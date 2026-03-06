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
    pub is_locked: bool,
    pub created_at: String,
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
    pub created_at: String,
}

#[tauri::command]
pub fn create_folder(
    app_handle: tauri::AppHandle,
    id: String,
    parent_id: Option<String>,
    name: String,
    password: Option<String>,
    parent_folder_key: Option<Vec<u8>>,
) -> Result<(), String> {
    let app_dir = app_handle.path().app_data_dir().unwrap();
    let db_path = app_dir.join("lynqor_notes.sqlite");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let folder_key = generate_folder_key();

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

    let encrypted_name = encrypt_aes_gcm(&folder_key, name.as_bytes());
    let encrypted_folder_key = encrypt_aes_gcm(&kek, &folder_key);

    conn.execute(
        "INSERT INTO folders (id, parent_id, name_encrypted, folder_key_encrypted, is_locked, password_salt) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, parent_id, encrypted_name, encrypted_folder_key, is_locked, salt],
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
    let app_dir = app_handle.path().app_data_dir().unwrap();
    let db_path = app_dir.join("lynqor_notes.sqlite");
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
    let app_dir = app_handle.path().app_data_dir().unwrap();
    let db_path = app_dir.join("lynqor_notes.sqlite");
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
    let app_dir = app_handle.path().app_data_dir().unwrap();
    let db_path = app_dir.join("lynqor_notes.sqlite");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let key_to_use = folder_key.unwrap_or_else(|| vec![0u8; 32]);
    let encrypted_title = encrypt_aes_gcm(&key_to_use, title.as_bytes());
    let encrypted_content = encrypt_aes_gcm(&key_to_use, content.as_bytes());

    conn.execute(
        "UPDATE items SET title_encrypted = ?1, content_encrypted = ?2, image_url = ?3 WHERE id = ?4",
        rusqlite::params![encrypted_title, encrypted_content, image_url, id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn delete_item(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    let app_dir = app_handle.path().app_data_dir().unwrap();
    let db_path = app_dir.join("lynqor_notes.sqlite");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // Delete the image file if it exists
    let image_url: Option<String> = conn
        .query_row(
            "SELECT image_url FROM items WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .unwrap_or(None);

    if let Some(img_path) = image_url {
        let full_path = app_dir.join("images").join(&img_path);
        let _ = std::fs::remove_file(full_path);
    }

    conn.execute("DELETE FROM items WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn save_image(app_handle: tauri::AppHandle, source_path: String) -> Result<String, String> {
    let app_dir = app_handle.path().app_data_dir().unwrap();
    let images_dir = app_dir.join("images");
    std::fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;

    let source = std::path::Path::new(&source_path);
    let ext = source.extension().and_then(|e| e.to_str()).unwrap_or("png");

    let filename = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    let dest = images_dir.join(&filename);

    std::fs::copy(&source_path, &dest).map_err(|e| e.to_string())?;

    // Return just the filename; we'll resolve the full path on read
    Ok(filename)
}

#[tauri::command]
pub fn save_base64_image(
    app_handle: tauri::AppHandle,
    base64_data: String,
) -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};
    use std::io::Write;

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

    let app_dir = app_handle.path().app_data_dir().unwrap();
    let images_dir = app_dir.join("images");

    if !images_dir.exists() {
        std::fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;
    }

    // Default to png for clipboard drops for simplicity, since base64 data URIs often specify,
    // but standard clipboard image paste is usually PNG.
    let filename = format!("{}.png", uuid::Uuid::new_v4());
    let dest = images_dir.join(&filename);

    let mut file = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
    file.write_all(&decoded).map_err(|e| e.to_string())?;

    Ok(filename)
}

#[tauri::command]
pub fn get_image_base64(app_handle: tauri::AppHandle, filename: String) -> Result<String, String> {
    use std::io::Read;
    let app_dir = app_handle.path().app_data_dir().unwrap();
    let full_path = app_dir.join("images").join(&filename);
    if !full_path.exists() {
        return Err("Image not found".to_string());
    }

    let mut file = std::fs::File::open(&full_path).map_err(|e| e.to_string())?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;

    let ext = full_path
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

    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&buffer);
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[tauri::command]
pub fn delete_folder(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    let app_dir = app_handle.path().app_data_dir().unwrap();
    let db_path = app_dir.join("lynqor_notes.sqlite");
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
    let app_dir = app_handle.path().app_data_dir().unwrap();
    let db_path = app_dir.join("lynqor_notes.sqlite");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let query = match parent_id {
        Some(_) => "SELECT id, parent_id, name_encrypted, is_locked, created_at, folder_key_encrypted FROM folders WHERE parent_id = ?1 ORDER BY created_at DESC",
        None => "SELECT id, parent_id, name_encrypted, is_locked, created_at, folder_key_encrypted FROM folders WHERE parent_id IS NULL ORDER BY created_at DESC",
    };

    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;

    let mut rows = match parent_id {
        Some(ref pid) => stmt.query(rusqlite::params![pid]),
        None => stmt.query([]),
    }
    .map_err(|e| e.to_string())?;

    let mut folders = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let id: String = row.get(0).unwrap();
        let pid: Option<String> = row.get(1).unwrap();
        let name_encrypted: Vec<u8> = row.get(2).unwrap();
        let is_locked: bool = row.get(3).unwrap();
        let created_at: String = row.get(4).unwrap_or_else(|_| "".to_string());
        let folder_key_encrypted: Vec<u8> = row.get(5).unwrap();

        let mut decrypted_name = String::from("Locked Folder");
        let mut possible_folder_key = None;

        if !is_locked {
            if let Ok(fk) = decrypt_aes_gcm(&vec![0u8; 32], &folder_key_encrypted) {
                possible_folder_key = Some(fk);
            }
        } else if let Some(parent_key) = &folder_key {
            if let Ok(fk) = decrypt_aes_gcm(parent_key, &folder_key_encrypted) {
                possible_folder_key = Some(fk);
            }
        }

        if let Some(fk) = possible_folder_key {
            if let Ok(decrypted) = decrypt_aes_gcm(&fk, &name_encrypted) {
                decrypted_name =
                    String::from_utf8(decrypted).unwrap_or_else(|_| "Unknown Folder".to_string());
            } else {
                decrypted_name = "Unknown Folder".to_string();
            }
        }

        let name = decrypted_name;

        folders.push(Folder {
            id,
            parent_id: pid,
            name,
            is_locked,
            created_at,
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
    let app_dir = app_handle.path().app_data_dir().unwrap();
    let db_path = app_dir.join("lynqor_notes.sqlite");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let query = match folder_id {
        Some(_) => "SELECT id, item_type, title_encrypted, content_encrypted, created_at, image_url FROM items WHERE folder_id = ?1 ORDER BY created_at DESC",
        None => "SELECT id, item_type, title_encrypted, content_encrypted, created_at, image_url FROM items WHERE folder_id IS NULL ORDER BY created_at DESC",
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
            created_at,
        });
    }

    Ok(items)
}
