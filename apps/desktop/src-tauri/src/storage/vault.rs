use std::fs;
use std::path::Path;

use cortex_core::storage::StorageError;

use crate::crypto::{self, VaultKeys};
use super::VaultState;

/// Directory name inside the vault root that holds Cortex metadata.
const CORTEX_DIR: &str = ".cortex";
/// File that stores the vault encryption keys (salt, encrypted master key, etc.).
const KEYS_FILE: &str = "keys.json";

/// Create a new vault at the given `path`.
///
/// This sets up the full folder structure, generates cryptographic keys,
/// and writes `keys.json`. Returns the base64-encoded recovery key that
/// the user must store safely.
pub fn create_vault(path: &str, password: &str) -> Result<String, StorageError> {
    let root = Path::new(path);

    // If the directory already exists, ensure it is empty.
    if root.exists() {
        let has_content = fs::read_dir(root)?
            .next()
            .is_some();
        if has_content {
            return Err(StorageError::NotFound(
                "Folder is not empty. Please choose an empty folder or a new path.".into(),
            ));
        }
    }

    // Create the directory tree.
    let cortex_dir = root.join(CORTEX_DIR);
    fs::create_dir_all(&cortex_dir)?;
    fs::create_dir_all(root.join("dates"))?;
    fs::create_dir_all(root.join("docs"))?;
    fs::create_dir_all(root.join("shared/public"))?;
    fs::create_dir_all(root.join("shared/groups"))?;

    // Generate keys via the crypto module.
    let (vault_keys, recovery_key) = crypto::create_vault(password)
        .map_err(|e| StorageError::Encryption(e.to_string()))?;

    // Write keys.json (NOT encrypted — it contains the encrypted master key + salt).
    let keys_json = serde_json::to_string_pretty(&vault_keys)
        .map_err(|e| StorageError::Serialization(e.to_string()))?;
    fs::write(cortex_dir.join(KEYS_FILE), keys_json)?;

    // Initialize empty metadata files.
    fs::write(cortex_dir.join("index.json"), "{}")?;
    fs::write(cortex_dir.join("graph.json"), "{}")?;
    fs::write(cortex_dir.join("todos.json"), "[]")?;

    Ok(recovery_key)
}

/// Open an existing vault, unlocking it with the given password.
///
/// Reads `keys.json`, derives the password key, decrypts the master key,
/// and stores both the master key and the vault path in `state`.
pub fn open_vault(path: &str, password: &str, state: &VaultState) -> Result<(), StorageError> {
    let keys = read_vault_keys(path)?;

    let master_key = crypto::unlock_vault(password, &keys)
        .map_err(|e| StorageError::Encryption(e.to_string()))?;

    // Store in application state.
    *state.master_key.lock().unwrap() = Some(master_key);
    *state.vault_path.lock().unwrap() = Some(path.to_string());

    Ok(())
}

/// Open an existing vault using a recovery key instead of a password.
pub fn open_vault_with_recovery(
    path: &str,
    recovery_key: &str,
    state: &VaultState,
) -> Result<(), StorageError> {
    let keys = read_vault_keys(path)?;

    let master_key = crypto::unlock_vault_with_recovery(recovery_key, &keys)
        .map_err(|e| StorageError::Encryption(e.to_string()))?;

    *state.master_key.lock().unwrap() = Some(master_key);
    *state.vault_path.lock().unwrap() = Some(path.to_string());

    Ok(())
}

/// Change the vault password.
///
/// Verifies the old password, re-encrypts the master key with the new password,
/// and writes updated keys to disk. The in-memory master key remains unchanged.
pub fn change_vault_password(
    path: &str,
    old_password: &str,
    new_password: &str,
) -> Result<(), StorageError> {
    let keys = read_vault_keys(path)?;

    let new_keys = crypto::change_password(old_password, new_password, &keys)
        .map_err(|e| StorageError::Encryption(e.to_string()))?;

    // Write updated keys.json.
    let keys_json = serde_json::to_string_pretty(&new_keys)
        .map_err(|e| StorageError::Serialization(e.to_string()))?;
    let keys_path = Path::new(path).join(CORTEX_DIR).join(KEYS_FILE);
    fs::write(keys_path, keys_json)?;

    Ok(())
}

/// Reset the vault password using a recovery key. Returns the new recovery key.
pub fn reset_password_with_recovery(
    path: &str,
    recovery_key: &str,
    new_password: &str,
) -> Result<String, StorageError> {
    let keys = read_vault_keys(path)?;

    let (new_keys, new_recovery_key) = crypto::reset_password_with_recovery(recovery_key, new_password, &keys)
        .map_err(|e| StorageError::Encryption(e.to_string()))?;

    let keys_json = serde_json::to_string_pretty(&new_keys)
        .map_err(|e| StorageError::Serialization(e.to_string()))?;
    let keys_path = Path::new(path).join(CORTEX_DIR).join(KEYS_FILE);
    fs::write(keys_path, keys_json)?;

    Ok(new_recovery_key)
}

/// Regenerate the vault recovery key using the current password. Returns the new recovery key.
pub fn regenerate_recovery_key(path: &str, password: &str) -> Result<String, StorageError> {
    let keys = read_vault_keys(path)?;

    let (new_keys, new_recovery_key) = crypto::regenerate_recovery_key(password, &keys)
        .map_err(|e| StorageError::Encryption(e.to_string()))?;

    let keys_json = serde_json::to_string_pretty(&new_keys)
        .map_err(|e| StorageError::Serialization(e.to_string()))?;
    let keys_path = Path::new(path).join(CORTEX_DIR).join(KEYS_FILE);
    fs::write(keys_path, keys_json)?;

    Ok(new_recovery_key)
}

/// Check whether a vault exists at the given path by looking for `.cortex/keys.json`.
pub fn vault_exists(path: &str) -> bool {
    Path::new(path).join(CORTEX_DIR).join(KEYS_FILE).exists()
}

/// Read and deserialize the `VaultKeys` from `.cortex/keys.json`.
fn read_vault_keys(path: &str) -> Result<VaultKeys, StorageError> {
    let keys_path = Path::new(path).join(CORTEX_DIR).join(KEYS_FILE);

    if !keys_path.exists() {
        return Err(StorageError::NotFound(format!(
            "Vault keys not found at {}",
            keys_path.display()
        )));
    }

    let data = fs::read_to_string(&keys_path)?;
    let keys: VaultKeys = serde_json::from_str(&data)
        .map_err(|e| StorageError::Serialization(e.to_string()))?;

    Ok(keys)
}
