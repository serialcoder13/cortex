// ============================================================
// Tauri IPC commands for vault and document operations.
// These are called from the frontend via `invoke()`.
// ============================================================

use tauri::State;
use serde::Serialize;
use cortex_core::document::{DocumentMeta, SearchResult};
use crate::storage::VaultState;
use crate::storage::{vault, local, search};

// ---- Error wrapper for Tauri serialization ----

#[derive(Debug, Serialize)]
pub struct CommandError {
    message: String,
}

impl From<cortex_core::storage::StorageError> for CommandError {
    fn from(e: cortex_core::storage::StorageError) -> Self {
        CommandError { message: e.to_string() }
    }
}

impl From<String> for CommandError {
    fn from(s: String) -> Self {
        CommandError { message: s }
    }
}

type CmdResult<T> = Result<T, CommandError>;

// ---- Vault commands ----

#[derive(Serialize)]
pub struct CreateVaultResult {
    recovery_key: String,
}

#[tauri::command]
pub fn vault_create(
    path: String,
    password: String,
) -> CmdResult<CreateVaultResult> {
    let recovery_key = vault::create_vault(&path, &password)
        .map_err(CommandError::from)?;
    Ok(CreateVaultResult { recovery_key })
}

#[tauri::command]
pub fn vault_open(
    path: String,
    password: String,
    state: State<'_, VaultState>,
) -> CmdResult<bool> {
    vault::open_vault(&path, &password, &state)
        .map_err(CommandError::from)?;
    Ok(true)
}

#[tauri::command]
pub fn vault_exists(path: String) -> bool {
    vault::vault_exists(&path)
}

#[tauri::command]
pub fn vault_lock(state: State<'_, VaultState>) -> CmdResult<bool> {
    state.lock();
    Ok(true)
}

#[tauri::command]
pub fn vault_is_unlocked(state: State<'_, VaultState>) -> bool {
    state.is_unlocked()
}

#[tauri::command]
pub fn vault_change_password(
    old_password: String,
    new_password: String,
    state: State<'_, VaultState>,
) -> CmdResult<bool> {
    let vault_path = state.vault_path.lock().unwrap().clone()
        .ok_or_else(|| CommandError { message: "Vault not open".into() })?;

    vault::change_vault_password(&vault_path, &old_password, &new_password)
        .map_err(CommandError::from)?;
    Ok(true)
}

// ---- Document commands ----

#[tauri::command]
pub fn storage_read(
    doc_path: String,
    state: State<'_, VaultState>,
) -> CmdResult<String> {
    let vault_path = state.vault_path.lock().unwrap().clone()
        .ok_or_else(|| CommandError { message: "Vault not open".into() })?;
    let master_key = state.master_key.lock().unwrap().clone()
        .ok_or_else(|| CommandError { message: "Vault locked".into() })?;

    local::read_document(&vault_path, &doc_path, &master_key)
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn storage_write(
    doc_path: String,
    content: String,
    state: State<'_, VaultState>,
) -> CmdResult<bool> {
    let vault_path = state.vault_path.lock().unwrap().clone()
        .ok_or_else(|| CommandError { message: "Vault not open".into() })?;
    let master_key = state.master_key.lock().unwrap().clone()
        .ok_or_else(|| CommandError { message: "Vault locked".into() })?;

    local::write_document(&vault_path, &doc_path, &content, &master_key)
        .map_err(CommandError::from)?;

    // Update search index
    let title = local::extract_title_from_frontmatter(&content)
        .unwrap_or_else(|| doc_path.clone());
    let mut index = search::load_index(&vault_path);
    search::update_index(&mut index, &doc_path, &title, &content);
    search::save_index(&vault_path, &index);

    Ok(true)
}

#[tauri::command]
pub fn storage_delete(
    doc_path: String,
    state: State<'_, VaultState>,
) -> CmdResult<bool> {
    let vault_path = state.vault_path.lock().unwrap().clone()
        .ok_or_else(|| CommandError { message: "Vault not open".into() })?;

    local::delete_document(&vault_path, &doc_path)
        .map_err(CommandError::from)?;

    // Remove from search index
    let mut index = search::load_index(&vault_path);
    search::remove_from_index(&mut index, &doc_path);
    search::save_index(&vault_path, &index);

    Ok(true)
}

#[tauri::command]
pub fn storage_list(
    state: State<'_, VaultState>,
) -> CmdResult<Vec<DocumentMeta>> {
    let vault_path = state.vault_path.lock().unwrap().clone()
        .ok_or_else(|| CommandError { message: "Vault not open".into() })?;

    local::list_documents(&vault_path)
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn storage_search(
    query: String,
    state: State<'_, VaultState>,
) -> CmdResult<Vec<SearchResult>> {
    let vault_path = state.vault_path.lock().unwrap().clone()
        .ok_or_else(|| CommandError { message: "Vault not open".into() })?;

    let index = search::load_index(&vault_path);
    Ok(search::search(&index, &query))
}

#[tauri::command]
pub fn storage_create_daily_note(
    state: State<'_, VaultState>,
) -> CmdResult<String> {
    let vault_path = state.vault_path.lock().unwrap().clone()
        .ok_or_else(|| CommandError { message: "Vault not open".into() })?;
    let master_key = state.master_key.lock().unwrap().clone()
        .ok_or_else(|| CommandError { message: "Vault locked".into() })?;

    local::create_daily_note(&vault_path, &master_key)
        .map_err(CommandError::from)
}
