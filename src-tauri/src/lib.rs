// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod commands;
mod crypto;
mod db;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            db::init_db(app.handle()).expect("Failed to initialize database");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::create_folder,
            commands::unlock_folder,
            commands::create_item,
            commands::update_item,
            commands::delete_item,
            commands::save_image,
            commands::get_image_path,
            commands::delete_folder,
            commands::get_folders_by_parent,
            commands::get_items_by_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
