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
