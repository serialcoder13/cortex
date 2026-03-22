pub mod local;
pub mod vault;
pub mod search;

use std::sync::Mutex;

/// Holds the decrypted master key and the current vault path in memory
/// for the lifetime of the application session.
///
/// Managed as Tauri application state so that all commands can access it.
pub struct VaultState {
    pub master_key: Mutex<Option<Vec<u8>>>,
    pub vault_path: Mutex<Option<String>>,
}

impl VaultState {
    pub fn new() -> Self {
        VaultState {
            master_key: Mutex::new(None),
            vault_path: Mutex::new(None),
        }
    }

    /// Returns `true` if the vault has been unlocked (master key is present).
    pub fn is_unlocked(&self) -> bool {
        self.master_key.lock().unwrap().is_some()
    }

    /// Clear the master key and vault path, effectively locking the vault.
    pub fn lock(&self) {
        *self.master_key.lock().unwrap() = None;
        *self.vault_path.lock().unwrap() = None;
    }
}
