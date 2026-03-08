use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::crypto::{
    decrypt_aes_gcm, derive_kek_from_password, derive_kek_from_password_and_salt, encrypt_aes_gcm,
    generate_folder_key, pad_to_power_of_2, unpad_from_power_of_2,
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

#[derive(Serialize, Deserialize)]
pub struct VaultData {
    pub folders: Vec<Folder>,
    pub items: Vec<Item>,
}

/// Encrypt a VaultData blob with padding to hide content volume.
fn encrypt_blob(key: &[u8], vault: &VaultData) -> Result<Vec<u8>, String> {
    let json = serde_json::to_vec(vault).map_err(|e| e.to_string())?;
    let padded = pad_to_power_of_2(&json);
    Ok(encrypt_aes_gcm(key, &padded))
}

/// Decrypt a padded VaultData blob.
fn decrypt_blob(key: &[u8], encrypted: &[u8]) -> Result<VaultData, String> {
    let padded = decrypt_aes_gcm(key, encrypted)?;
    let json = unpad_from_power_of_2(&padded)?;
    serde_json::from_slice(&json).map_err(|e| e.to_string())
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
    root_folder_id: Option<String>,
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
            if let Some(parent_key) = &parent_folder_key {
                (parent_key.clone(), None, true)
            } else {
                (vec![0u8; 32], None, false)
            }
        }
    };

    let encrypted_name = encrypt_aes_gcm(&name_kek, name.as_bytes());
    let encrypted_desc = encrypt_aes_gcm(
        &folder_key,
        description.clone().unwrap_or_default().as_bytes(),
    );
    let encrypted_folder_key = encrypt_aes_gcm(&kek, &folder_key);

    let created_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    if let Some(root_id) = root_folder_id {
        // Blob Logic
        let root_key = parent_folder_key.ok_or("Parent folder key required for locked folders")?;

        let mut stmt = conn
            .prepare("SELECT data FROM encrypted_blobs WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let encrypted_blob: Vec<u8> = stmt
            .query_row(rusqlite::params![&root_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        let mut vault_data = decrypt_blob(&root_key, &encrypted_blob)?;

        let new_folder = Folder {
            id,
            parent_id,
            name,
            description,
            image_url,
            is_locked: false, // Items inside a locked blob don't need independent locking
            order_index: 0.0,
            created_at: created_at.clone(),
            updated_at: created_at,
        };

        vault_data.folders.push(new_folder);

        let new_encrypted_blob = encrypt_blob(&root_key, &vault_data)?;

        conn.execute(
            "UPDATE encrypted_blobs SET data = ?1 WHERE id = ?2",
            rusqlite::params![new_encrypted_blob, root_id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        // Standard SQLite Logic
        conn.execute(
            "INSERT INTO folders (id, parent_id, name_encrypted, description_encrypted, image_url, folder_key_encrypted, is_locked, password_salt, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![id, parent_id, encrypted_name, encrypted_desc, image_url, encrypted_folder_key, is_locked, salt, created_at, created_at],
        ).map_err(|e| e.to_string())?;

        // If this is a new root-level locked folder, create an empty encrypted blob
        if is_locked {
            let empty_vault = VaultData {
                folders: vec![],
                items: vec![],
            };
            let encrypted_vault = encrypt_blob(&folder_key, &empty_vault)?;
            conn.execute(
                "INSERT INTO encrypted_blobs (id, data, root_folder_id) VALUES (?1, ?2, ?3)",
                rusqlite::params![id, encrypted_vault, id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

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

        let folder_key = decrypt_aes_gcm(&kek, &folder_key_encrypted)?;

        // Lazy migration: if no blob exists yet for this locked folder, create one
        let blob_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM encrypted_blobs WHERE id = ?1",
                rusqlite::params![folder_id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            > 0;

        if !blob_exists {
            // Migrate existing child folders and items into a new blob
            let mut migrate_folders = Vec::new();
            let mut migrate_items = Vec::new();

            // Collect all child folders (direct children only for now)
            {
                let mut child_stmt = conn.prepare("SELECT id, parent_id, name_encrypted, description_encrypted, image_url, is_locked, order_index, created_at, updated_at FROM folders WHERE parent_id = ?1").map_err(|e| e.to_string())?;
                let mut child_rows = child_stmt
                    .query(rusqlite::params![folder_id])
                    .map_err(|e| e.to_string())?;
                while let Some(crow) = child_rows.next().map_err(|e| e.to_string())? {
                    let cid: String = crow.get(0).unwrap();
                    let cpid: Option<String> = crow.get(1).unwrap();
                    let cname_enc: Vec<u8> = crow.get(2).unwrap();
                    let cdesc_enc: Option<Vec<u8>> = crow.get(3).unwrap_or(None);
                    let cimg: Option<String> = crow.get(4).unwrap_or(None);
                    let clocked: bool = crow.get(5).unwrap_or(false);
                    let corder: f64 = crow.get(6).unwrap_or(0.0);
                    let ccreated: String = crow.get(7).unwrap_or_else(|_| "".to_string());
                    let cupdated: String = crow.get(8).unwrap_or_else(|_| "".to_string());

                    let cname = decrypt_aes_gcm(&folder_key, &cname_enc)
                        .map(|b| String::from_utf8(b).unwrap_or_default())
                        .unwrap_or_default();
                    let cdesc = cdesc_enc
                        .and_then(|d| {
                            decrypt_aes_gcm(&folder_key, &d)
                                .ok()
                                .and_then(|b| String::from_utf8(b).ok())
                        })
                        .filter(|s| !s.is_empty());

                    migrate_folders.push(Folder {
                        id: cid,
                        parent_id: cpid,
                        name: cname,
                        description: cdesc,
                        image_url: cimg,
                        is_locked: clocked,
                        order_index: corder,
                        created_at: ccreated,
                        updated_at: cupdated,
                    });
                }
            }

            // Collect all items in this folder
            {
                let mut item_stmt = conn.prepare("SELECT id, item_type, title_encrypted, content_encrypted, image_url, order_index, created_at, updated_at FROM items WHERE folder_id = ?1").map_err(|e| e.to_string())?;
                let mut item_rows = item_stmt
                    .query(rusqlite::params![folder_id])
                    .map_err(|e| e.to_string())?;
                while let Some(irow) = item_rows.next().map_err(|e| e.to_string())? {
                    let iid: String = irow.get(0).unwrap();
                    let itype: String = irow.get(1).unwrap();
                    let ititle_enc: Vec<u8> = irow.get(2).unwrap();
                    let icontent_enc: Vec<u8> = irow.get(3).unwrap();
                    let iimg: Option<String> = irow.get(4).unwrap_or(None);
                    let iorder: f64 = irow.get(5).unwrap_or(0.0);
                    let icreated: String = irow.get(6).unwrap_or_else(|_| "".to_string());
                    let iupdated: String = irow.get(7).unwrap_or_else(|_| "".to_string());

                    let ititle = decrypt_aes_gcm(&folder_key, &ititle_enc)
                        .map(|b| String::from_utf8(b).unwrap_or_default())
                        .unwrap_or_default();
                    let icontent = decrypt_aes_gcm(&folder_key, &icontent_enc)
                        .map(|b| String::from_utf8(b).unwrap_or_default())
                        .unwrap_or_default();

                    migrate_items.push(Item {
                        id: iid,
                        folder_id: Some(folder_id.clone()),
                        item_type: itype,
                        title: ititle,
                        content: icontent,
                        image_url: iimg,
                        order_index: iorder,
                        created_at: icreated,
                        updated_at: iupdated,
                    });
                }
            }

            let vault_data = VaultData {
                folders: migrate_folders,
                items: migrate_items,
            };
            let encrypted_vault = encrypt_blob(&folder_key, &vault_data)?;

            conn.execute(
                "INSERT INTO encrypted_blobs (id, data, root_folder_id) VALUES (?1, ?2, ?3)",
                rusqlite::params![folder_id, encrypted_vault, folder_id],
            )
            .map_err(|e| e.to_string())?;

            // Delete migrated rows from standard tables
            conn.execute(
                "DELETE FROM items WHERE folder_id = ?1",
                rusqlite::params![folder_id],
            )
            .ok();
            conn.execute(
                "DELETE FROM folders WHERE parent_id = ?1",
                rusqlite::params![folder_id],
            )
            .ok();
        }

        Ok(folder_key)
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
    root_folder_id: Option<String>,
) -> Result<(), String> {
    let db_path = crate::db::get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let key_to_use = folder_key.unwrap_or_else(|| vec![0u8; 32]);
    let encrypted_title = encrypt_aes_gcm(&key_to_use, title.as_bytes());
    let encrypted_content = encrypt_aes_gcm(&key_to_use, content.as_bytes());
    let created_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    if let Some(root_id) = root_folder_id {
        // Blob Logic
        let mut stmt = conn
            .prepare("SELECT data FROM encrypted_blobs WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let encrypted_blob: Vec<u8> = stmt
            .query_row(rusqlite::params![&root_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        let mut vault_data = decrypt_blob(&key_to_use, &encrypted_blob)?;

        let new_item = Item {
            id,
            folder_id,
            item_type,
            title,
            content,
            image_url,
            order_index: 0.0,
            created_at: created_at.clone(),
            updated_at: created_at,
        };

        vault_data.items.push(new_item);

        let new_encrypted_blob = encrypt_blob(&key_to_use, &vault_data)?;

        conn.execute(
            "UPDATE encrypted_blobs SET data = ?1 WHERE id = ?2",
            rusqlite::params![new_encrypted_blob, root_id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        // Standard SQLite Logic
        conn.execute(
            "INSERT INTO items (id, folder_id, item_type, title_encrypted, content_encrypted, image_url, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![id, folder_id, item_type, encrypted_title, encrypted_content, image_url, created_at, created_at],
        ).map_err(|e| e.to_string())?;
    }

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
    root_folder_id: Option<String>,
) -> Result<(), String> {
    let db_path = crate::db::get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let key_to_use = folder_key.unwrap_or_else(|| vec![0u8; 32]);
    let encrypted_title = encrypt_aes_gcm(&key_to_use, title.as_bytes());
    let encrypted_content = encrypt_aes_gcm(&key_to_use, content.as_bytes());
    let updated_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    if let Some(root_id) = root_folder_id {
        let mut stmt = conn
            .prepare("SELECT data FROM encrypted_blobs WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let encrypted_blob: Vec<u8> = stmt
            .query_row(rusqlite::params![&root_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        let mut vault_data = decrypt_blob(&key_to_use, &encrypted_blob)?;

        if let Some(item) = vault_data.items.iter_mut().find(|i| i.id == id) {
            item.title = title;
            item.content = content;
            item.image_url = image_url;
            item.updated_at = updated_at;
        }

        let new_encrypted_blob = encrypt_blob(&key_to_use, &vault_data)?;

        conn.execute(
            "UPDATE encrypted_blobs SET data = ?1 WHERE id = ?2",
            rusqlite::params![new_encrypted_blob, root_id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE items SET title_encrypted = ?1, content_encrypted = ?2, image_url = ?3, updated_at = ?4 WHERE id = ?5",
            rusqlite::params![encrypted_title, encrypted_content, image_url, updated_at, id],
        ).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn delete_item(
    app_handle: tauri::AppHandle,
    id: String,
    root_folder_id: Option<String>,
    folder_key: Option<Vec<u8>>,
) -> Result<(), String> {
    let db_path = crate::db::get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    if let Some(root_id) = root_folder_id {
        let key_to_use = folder_key.ok_or("Folder key required")?;

        let mut stmt = conn
            .prepare("SELECT data FROM encrypted_blobs WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let encrypted_blob: Vec<u8> = stmt
            .query_row(rusqlite::params![&root_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        let mut vault_data = decrypt_blob(&key_to_use, &encrypted_blob)?;

        vault_data.items.retain(|i| i.id != id);

        let new_encrypted_blob = encrypt_blob(&key_to_use, &vault_data)?;

        conn.execute(
            "UPDATE encrypted_blobs SET data = ?1 WHERE id = ?2",
            rusqlite::params![new_encrypted_blob, root_id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute("DELETE FROM items WHERE id = ?1", rusqlite::params![id])
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn save_image(app_handle: tauri::AppHandle, source_path: String) -> Result<String, String> {
    let app_dir = app_handle.path().app_data_dir().unwrap();
    let db_path = app_dir.join("lynqor_notes.sqlite");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let filename = uuid::Uuid::new_v4().to_string();

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

    let filename = uuid::Uuid::new_v4().to_string();

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

    let mime = "image/png";

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
pub fn delete_folder(
    app_handle: tauri::AppHandle,
    id: String,
    root_folder_id: Option<String>,
    parent_folder_key: Option<Vec<u8>>,
) -> Result<(), String> {
    let db_path = crate::db::get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    if let Some(root_id) = root_folder_id {
        // Blob Logic
        let root_key = parent_folder_key.ok_or("Parent folder key required for locked folders")?;

        let mut stmt = conn
            .prepare("SELECT data FROM encrypted_blobs WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let encrypted_blob: Vec<u8> = stmt
            .query_row(rusqlite::params![&root_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        let mut vault_data = decrypt_blob(&root_key, &encrypted_blob)?;

        // Naive recursive delete inside blob:
        // We'll collect all folder IDs to delete starting from `id`
        let mut to_delete_folders = vec![id.clone()];
        let mut added = true;
        while added {
            added = false;
            let mut new_to_delete = Vec::new();
            for f in &vault_data.folders {
                if let Some(pid) = &f.parent_id {
                    if to_delete_folders.contains(pid) && !to_delete_folders.contains(&f.id) {
                        new_to_delete.push(f.id.clone());
                        added = true;
                    }
                }
            }
            to_delete_folders.extend(new_to_delete);
        }

        // Remove the identified folders and any items inside them
        vault_data
            .folders
            .retain(|f| !to_delete_folders.contains(&f.id));
        vault_data.items.retain(|i| match &i.folder_id {
            Some(fid) => !to_delete_folders.contains(fid),
            None => true,
        });

        let new_encrypted_blob = encrypt_blob(&root_key, &vault_data)?;

        conn.execute(
            "UPDATE encrypted_blobs SET data = ?1 WHERE id = ?2",
            rusqlite::params![new_encrypted_blob, root_id],
        )
        .map_err(|e| e.to_string())?;

        // If the folder deleted IS the root folder itself, we also delete the blob row and the main folders row
        if id == root_id {
            conn.execute(
                "DELETE FROM encrypted_blobs WHERE id = ?1",
                rusqlite::params![id],
            )
            .ok();
            conn.execute("DELETE FROM folders WHERE id = ?1", rusqlite::params![id])
                .ok();
        }
    } else {
        // Standard SQLite Logic
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
        let mut stmt = conn
            .prepare("SELECT is_locked FROM folders WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let is_locked: bool = stmt
            .query_row(rusqlite::params![&id], |row| row.get(0))
            .unwrap_or(false);

        conn.execute(
            "DELETE FROM folders WHERE id = ?1",
            rusqlite::params![id.clone()],
        )
        .map_err(|e| e.to_string())?;

        // If it was a locked folder, make sure its blob is also deleted just in case
        if is_locked {
            conn.execute(
                "DELETE FROM encrypted_blobs WHERE id = ?1",
                rusqlite::params![id],
            )
            .ok();
        }
    }

    Ok(())
}

#[tauri::command]
pub fn get_folders_by_parent(
    app_handle: tauri::AppHandle,
    parent_id: Option<String>,
    folder_key: Option<Vec<u8>>,
    root_folder_id: Option<String>,
) -> Result<Vec<Folder>, String> {
    let db_path = crate::db::get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    if let Some(root_id) = root_folder_id {
        let key_to_use = folder_key.ok_or("Folder key required")?;

        let mut stmt = conn
            .prepare("SELECT data FROM encrypted_blobs WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let encrypted_blob: Vec<u8> = stmt
            .query_row(rusqlite::params![&root_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        let vault_data = decrypt_blob(&key_to_use, &encrypted_blob)?;

        let folders: Vec<Folder> = vault_data
            .folders
            .into_iter()
            .filter(|f| f.parent_id == parent_id)
            .collect();
        return Ok(folders);
    }

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
        let decrypted_name = match decrypt_aes_gcm(key_to_use, &name_encrypted) {
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
    root_folder_id: Option<String>,
) -> Result<Vec<Item>, String> {
    let db_path = crate::db::get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let default_key = vec![0u8; 32];
    let key_to_use = folder_key.as_ref().unwrap_or(&default_key);

    if let Some(root_id) = root_folder_id {
        let mut stmt = conn
            .prepare("SELECT data FROM encrypted_blobs WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let encrypted_blob: Vec<u8> = stmt
            .query_row(rusqlite::params![&root_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        let vault_data = decrypt_blob(&key_to_use, &encrypted_blob)?;

        let items: Vec<Item> = vault_data
            .items
            .into_iter()
            .filter(|i| i.folder_id == folder_id)
            .collect();
        return Ok(items);
    }

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
    root_folder_id: Option<String>,
    folder_key: Option<Vec<u8>>,
) -> Result<(), String> {
    let db_path = crate::db::get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    if let Some(root_id) = root_folder_id {
        let key_to_use = folder_key.ok_or("Folder key required")?;

        let mut stmt = conn
            .prepare("SELECT data FROM encrypted_blobs WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let encrypted_blob: Vec<u8> = stmt
            .query_row(rusqlite::params![&root_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        let mut vault_data = decrypt_blob(&key_to_use, &encrypted_blob)?;

        let updated_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

        if item_type == "folder" {
            if let Some(folder) = vault_data.folders.iter_mut().find(|f| f.id == id) {
                folder.order_index = order_index;
                folder.updated_at = updated_at;
            }
        } else {
            if let Some(item) = vault_data.items.iter_mut().find(|i| i.id == id) {
                item.order_index = order_index;
                item.updated_at = updated_at;
            }
        }

        let new_encrypted_blob = encrypt_blob(&key_to_use, &vault_data)?;

        conn.execute(
            "UPDATE encrypted_blobs SET data = ?1 WHERE id = ?2",
            rusqlite::params![new_encrypted_blob, root_id],
        )
        .map_err(|e| e.to_string())?;
    } else {
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
    root_folder_id: Option<String>,
) -> Result<Vec<SearchResult>, String> {
    let db_path = crate::db::get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    let query_lower = query.to_lowercase();

    if let Some(root_id) = root_folder_id {
        // Blob Search
        let mut stmt = conn
            .prepare("SELECT data FROM encrypted_blobs WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let encrypted_blob: Vec<u8> = stmt
            .query_row(rusqlite::params![&root_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        let vault_data = decrypt_blob(&current_folder_key, &encrypted_blob)?;

        for item in vault_data.items {
            if item.title.to_lowercase().contains(&query_lower)
                || item.content.to_lowercase().contains(&query_lower)
            {
                results.push(SearchResult {
                    id: item.id,
                    is_folder: false,
                    name: item.title,
                    content: Some(item.content),
                    parent_id: item.folder_id,
                    item_type: Some(item.item_type),
                    image_url: item.image_url,
                });
            }
        }

        for folder in vault_data.folders {
            let mut desc_str = String::new();
            if let Some(d) = &folder.description {
                desc_str = d.clone();
            }

            if folder.name.to_lowercase().contains(&query_lower)
                || desc_str.to_lowercase().contains(&query_lower)
            {
                results.push(SearchResult {
                    id: folder.id,
                    is_folder: true,
                    name: folder.name,
                    content: if desc_str.is_empty() {
                        None
                    } else {
                        Some(desc_str)
                    },
                    parent_id: folder.parent_id,
                    item_type: None,
                    image_url: folder.image_url,
                });
            }
        }

        return Ok(results);
    }

    // Standard SQLite Search — recursive BFS through all child folders
    let mut folder_queue: Vec<(Option<String>, Vec<u8>)> =
        vec![(current_folder_id.clone(), current_folder_key.clone())];

    while let Some((search_folder_id, search_key)) = folder_queue.pop() {
        // Search items in this folder
        {
            let (q, has_param) = match &search_folder_id {
                Some(_) => ("SELECT id, item_type, title_encrypted, content_encrypted, image_url FROM items WHERE folder_id = ?1", true),
                None => ("SELECT id, item_type, title_encrypted, content_encrypted, image_url FROM items WHERE folder_id IS NULL", false),
            };
            let mut istmt = conn.prepare(q).map_err(|e| e.to_string())?;
            let mut irows = if has_param {
                istmt
                    .query(rusqlite::params![search_folder_id.as_ref().unwrap()])
                    .map_err(|e| e.to_string())?
            } else {
                istmt.query([]).map_err(|e| e.to_string())?
            };
            while let Some(row) = irows.next().map_err(|e| e.to_string())? {
                let id: String = row.get(0).unwrap();
                let item_type: String = row.get(1).unwrap();
                let title_enc: Vec<u8> = row.get(2).unwrap();
                let content_enc: Vec<u8> = row.get(3).unwrap();
                let image_url: Option<String> = row.get(4).unwrap_or(None);

                let title = decrypt_aes_gcm(&search_key, &title_enc)
                    .map(|b| String::from_utf8(b).unwrap_or_default())
                    .unwrap_or_default();
                let content = decrypt_aes_gcm(&search_key, &content_enc)
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
                        parent_id: search_folder_id.clone(),
                        item_type: Some(item_type),
                        image_url,
                    });
                }
            }
        }

        // Search child folders and queue them for recursion
        {
            let (q, has_param) = match &search_folder_id {
                Some(_) => ("SELECT id, name_encrypted, description_encrypted, image_url, is_locked, folder_key_encrypted FROM folders WHERE parent_id = ?1", true),
                None => ("SELECT id, name_encrypted, description_encrypted, image_url, is_locked, folder_key_encrypted FROM folders WHERE parent_id IS NULL", false),
            };
            let mut fstmt = conn.prepare(q).map_err(|e| e.to_string())?;
            let mut frows = if has_param {
                fstmt
                    .query(rusqlite::params![search_folder_id.as_ref().unwrap()])
                    .map_err(|e| e.to_string())?
            } else {
                fstmt.query([]).map_err(|e| e.to_string())?
            };
            while let Some(row) = frows.next().map_err(|e| e.to_string())? {
                let fid: String = row.get(0).unwrap();
                let name_enc: Vec<u8> = row.get(1).unwrap();
                let desc_enc: Option<Vec<u8>> = row.get(2).unwrap_or(None);
                let image_url: Option<String> = row.get(3).unwrap_or(None);
                let is_locked: bool = row.get(4).unwrap();
                let folder_key_enc: Vec<u8> = row.get(5).unwrap();

                // Derive the child folder's key (skip locked folders we can't access)
                let child_key = if !is_locked {
                    decrypt_aes_gcm(&vec![0u8; 32], &folder_key_enc).ok()
                } else {
                    None
                };

                if let Some(ref ck) = child_key {
                    if let Ok(dec) = decrypt_aes_gcm(ck, &name_enc) {
                        if let Ok(name) = String::from_utf8(dec) {
                            let desc_str = desc_enc
                                .and_then(|de| {
                                    decrypt_aes_gcm(ck, &de)
                                        .ok()
                                        .and_then(|b| String::from_utf8(b).ok())
                                })
                                .unwrap_or_default();

                            if name.to_lowercase().contains(&query_lower)
                                || desc_str.to_lowercase().contains(&query_lower)
                            {
                                results.push(SearchResult {
                                    id: fid.clone(),
                                    is_folder: true,
                                    name,
                                    content: if desc_str.is_empty() {
                                        None
                                    } else {
                                        Some(desc_str)
                                    },
                                    parent_id: search_folder_id.clone(),
                                    item_type: None,
                                    image_url,
                                });
                            }

                            // Queue for recursive search
                            folder_queue.push((Some(fid), ck.clone()));
                        }
                    }
                }
            }
        }
    }

    Ok(results)
}
