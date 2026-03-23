mod commands;
mod crypto;
mod storage;

use storage::VaultState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(VaultState::new())
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::storage::vault_create,
            commands::storage::vault_open,
            commands::storage::vault_exists,
            commands::storage::vault_lock,
            commands::storage::vault_is_unlocked,
            commands::storage::storage_read,
            commands::storage::storage_write,
            commands::storage::storage_delete,
            commands::storage::storage_list,
            commands::storage::storage_search,
            commands::storage::storage_create_daily_note,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Cortex");
}
