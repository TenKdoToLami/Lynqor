use rusqlite::Connection;
use tauri::State;
use serde::{Deserialize, Serialize};

use crate::crypto::{derive_kek_from_password_and_salt, derive_kek_from_password, generate_folder_key, encrypt_aes_gcm, decrypt_aes_gcm};

#[derive(Serialize, Deserialize)]
pub struct Folder {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub is_locked: bool,
    pub created_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct Item {
    pub id: String,
    pub folder_id: String,
    pub item_type: String,
    pub title: String,
    pub content: String,
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
                (vec![0u8; 32], None, false) // Unencrypted/Default KEK
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

    let mut stmt = conn.prepare("SELECT folder_key_encrypted, password_salt FROM folders WHERE id = ?1").map_err(|e| e.to_string())?;
    let mut rows = stmt.query(rusqlite::params![folder_id]).map_err(|e| e.to_string())?;

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
