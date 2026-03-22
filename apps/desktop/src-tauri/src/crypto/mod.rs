use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VaultKeys {
    /// Base64-encoded 16-byte salt used for password-based key derivation.
    pub salt: String,
    /// Master key encrypted with the password-derived key (AES-256-GCM), base64-encoded.
    pub encrypted_master_key: String,
    /// Master key encrypted with the recovery key (AES-256-GCM), base64-encoded.
    pub encrypted_master_key_recovery: String,
    /// Base64-encoded 12-byte nonce used when encrypting master key with password-derived key.
    pub master_key_nonce: String,
    /// Base64-encoded 12-byte nonce used when encrypting master key with recovery key.
    pub recovery_key_nonce: String,
}

#[derive(Debug, thiserror::Error)]
pub enum CryptoError {
    #[error("Encryption error: {0}")]
    Encryption(String),
    #[error("Decryption error: wrong password or corrupted data")]
    Decryption,
    #[error("Key derivation error: {0}")]
    KeyDerivation(String),
}

/// Nonce size for AES-256-GCM (96 bits).
const NONCE_SIZE: usize = 12;
/// Salt size for Argon2id key derivation.
const SALT_SIZE: usize = 16;
/// Size of the master key and recovery key in bytes (256 bits).
const KEY_SIZE: usize = 32;

// Argon2id parameters.
const ARGON2_M_COST: u32 = 65536; // 64 MiB
const ARGON2_T_COST: u32 = 3;
const ARGON2_P_COST: u32 = 1;

/// Build an Argon2id hasher with the prescribed cost parameters.
fn build_argon2() -> Result<Argon2<'static>, CryptoError> {
    let params = Params::new(ARGON2_M_COST, ARGON2_T_COST, ARGON2_P_COST, Some(KEY_SIZE))
        .map_err(|e| CryptoError::KeyDerivation(e.to_string()))?;
    Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
}

/// Derive a 256-bit key from `password` and `salt` using Argon2id.
fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; KEY_SIZE], CryptoError> {
    let argon2 = build_argon2()?;
    let mut output = [0u8; KEY_SIZE];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut output)
        .map_err(|e| CryptoError::KeyDerivation(e.to_string()))?;
    Ok(output)
}

/// Generate `n` cryptographically-secure random bytes.
fn random_bytes(n: usize) -> Vec<u8> {
    let mut buf = vec![0u8; n];
    OsRng.fill_bytes(&mut buf);
    buf
}

/// Encrypt `plaintext` with AES-256-GCM using the given 256-bit `key` and 12-byte `nonce`.
fn aes_encrypt(key: &[u8; KEY_SIZE], nonce: &[u8; NONCE_SIZE], plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| CryptoError::Encryption(e.to_string()))?;
    let nonce = Nonce::from_slice(nonce);
    cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| CryptoError::Encryption(e.to_string()))
}

/// Decrypt `ciphertext` with AES-256-GCM using the given 256-bit `key` and 12-byte `nonce`.
fn aes_decrypt(key: &[u8; KEY_SIZE], nonce: &[u8; NONCE_SIZE], ciphertext: &[u8]) -> Result<Vec<u8>, CryptoError> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|_| CryptoError::Decryption)?;
    let nonce = Nonce::from_slice(nonce);
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| CryptoError::Decryption)
}

/// Create a new encrypted vault.
///
/// Generates a random master key and recovery key, encrypts the master key
/// under both the password-derived key and the recovery key, and returns
/// the [`VaultKeys`] metadata together with the base64-encoded recovery key.
pub fn create_vault(password: &str) -> Result<(VaultKeys, String), CryptoError> {
    // 1. Generate random salt (16 bytes).
    let salt = random_bytes(SALT_SIZE);

    // 2. Derive a 256-bit key from password + salt via Argon2id.
    let password_key = derive_key(password, &salt)?;

    // 3. Generate random 32-byte master key.
    let master_key = random_bytes(KEY_SIZE);

    // 4. Generate random 32-byte recovery key.
    let recovery_key = random_bytes(KEY_SIZE);

    // 5. Encrypt master key with password-derived key.
    let master_nonce_bytes: [u8; NONCE_SIZE] = random_bytes(NONCE_SIZE)
        .try_into()
        .expect("nonce is exactly 12 bytes");
    let encrypted_master = aes_encrypt(&password_key, &master_nonce_bytes, &master_key)?;

    // 6. Encrypt master key with recovery key.
    let recovery_key_arr: [u8; KEY_SIZE] = recovery_key
        .clone()
        .try_into()
        .expect("recovery key is exactly 32 bytes");
    let recovery_nonce_bytes: [u8; NONCE_SIZE] = random_bytes(NONCE_SIZE)
        .try_into()
        .expect("nonce is exactly 12 bytes");
    let encrypted_master_recovery = aes_encrypt(&recovery_key_arr, &recovery_nonce_bytes, &master_key)?;

    let vault_keys = VaultKeys {
        salt: BASE64.encode(&salt),
        encrypted_master_key: BASE64.encode(&encrypted_master),
        encrypted_master_key_recovery: BASE64.encode(&encrypted_master_recovery),
        master_key_nonce: BASE64.encode(master_nonce_bytes),
        recovery_key_nonce: BASE64.encode(recovery_nonce_bytes),
    };

    let recovery_key_b64 = BASE64.encode(&recovery_key);

    Ok((vault_keys, recovery_key_b64))
}

/// Unlock the vault using the user's password.
///
/// Derives the encryption key from `password` and the stored salt, then
/// decrypts and returns the 32-byte master key.
pub fn unlock_vault(password: &str, keys: &VaultKeys) -> Result<Vec<u8>, CryptoError> {
    let salt = BASE64
        .decode(&keys.salt)
        .map_err(|e| CryptoError::KeyDerivation(format!("invalid salt: {e}")))?;

    let password_key = derive_key(password, &salt)?;

    let nonce_bytes: [u8; NONCE_SIZE] = BASE64
        .decode(&keys.master_key_nonce)
        .map_err(|e| CryptoError::Encryption(format!("invalid nonce: {e}")))?
        .try_into()
        .map_err(|_| CryptoError::Encryption("nonce must be 12 bytes".into()))?;

    let encrypted = BASE64
        .decode(&keys.encrypted_master_key)
        .map_err(|e| CryptoError::Encryption(format!("invalid ciphertext: {e}")))?;

    aes_decrypt(&password_key, &nonce_bytes, &encrypted)
}

/// Unlock the vault using the base64-encoded recovery key.
///
/// Decodes the recovery key, then uses it to decrypt and return the 32-byte
/// master key.
pub fn unlock_vault_with_recovery(
    recovery_key_b64: &str,
    keys: &VaultKeys,
) -> Result<Vec<u8>, CryptoError> {
    let recovery_key: [u8; KEY_SIZE] = BASE64
        .decode(recovery_key_b64)
        .map_err(|e| CryptoError::Encryption(format!("invalid recovery key: {e}")))?
        .try_into()
        .map_err(|_| CryptoError::Encryption("recovery key must be 32 bytes".into()))?;

    let nonce_bytes: [u8; NONCE_SIZE] = BASE64
        .decode(&keys.recovery_key_nonce)
        .map_err(|e| CryptoError::Encryption(format!("invalid nonce: {e}")))?
        .try_into()
        .map_err(|_| CryptoError::Encryption("nonce must be 12 bytes".into()))?;

    let encrypted = BASE64
        .decode(&keys.encrypted_master_key_recovery)
        .map_err(|e| CryptoError::Encryption(format!("invalid ciphertext: {e}")))?;

    aes_decrypt(&recovery_key, &nonce_bytes, &encrypted)
}

/// Encrypt a file's contents using the 32-byte master key.
///
/// Generates a random 12-byte nonce and returns `nonce || ciphertext || tag`
/// (the AES-GCM ciphertext already includes the 16-byte authentication tag).
pub fn encrypt_file(master_key: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
    let key: [u8; KEY_SIZE] = master_key
        .try_into()
        .map_err(|_| CryptoError::Encryption("master key must be 32 bytes".into()))?;

    let nonce_bytes: [u8; NONCE_SIZE] = random_bytes(NONCE_SIZE)
        .try_into()
        .expect("nonce is exactly 12 bytes");

    let ciphertext = aes_encrypt(&key, &nonce_bytes, plaintext)?;

    // Prepend the nonce so the decryptor can extract it.
    let mut output = Vec::with_capacity(NONCE_SIZE + ciphertext.len());
    output.extend_from_slice(&nonce_bytes);
    output.extend_from_slice(&ciphertext);
    Ok(output)
}

/// Decrypt a file's contents using the 32-byte master key.
///
/// Expects the input to be `nonce (12 bytes) || ciphertext || tag` as
/// produced by [`encrypt_file`].
pub fn decrypt_file(master_key: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, CryptoError> {
    if ciphertext.len() < NONCE_SIZE {
        return Err(CryptoError::Decryption);
    }

    let key: [u8; KEY_SIZE] = master_key
        .try_into()
        .map_err(|_| CryptoError::Encryption("master key must be 32 bytes".into()))?;

    let nonce_bytes: [u8; NONCE_SIZE] = ciphertext[..NONCE_SIZE]
        .try_into()
        .expect("slice is exactly 12 bytes");

    aes_decrypt(&key, &nonce_bytes, &ciphertext[NONCE_SIZE..])
}

/// Change the vault password.
///
/// Decrypts the master key with the old password, generates a new salt,
/// derives a new key from the new password, re-encrypts the master key,
/// and returns updated [`VaultKeys`]. The recovery-key encryption is
/// preserved unchanged.
pub fn change_password(
    old_password: &str,
    new_password: &str,
    keys: &VaultKeys,
) -> Result<VaultKeys, CryptoError> {
    // 1. Unlock master key with old password.
    let master_key = unlock_vault(old_password, keys)?;

    // 2. Generate new salt.
    let new_salt = random_bytes(SALT_SIZE);

    // 3. Derive new key from new password.
    let new_password_key = derive_key(new_password, &new_salt)?;

    // 4. Re-encrypt master key with new password-derived key.
    let new_nonce: [u8; NONCE_SIZE] = random_bytes(NONCE_SIZE)
        .try_into()
        .expect("nonce is exactly 12 bytes");
    let new_encrypted_master = aes_encrypt(&new_password_key, &new_nonce, &master_key)?;

    Ok(VaultKeys {
        salt: BASE64.encode(&new_salt),
        encrypted_master_key: BASE64.encode(&new_encrypted_master),
        master_key_nonce: BASE64.encode(new_nonce),
        // Preserve recovery encryption as-is.
        encrypted_master_key_recovery: keys.encrypted_master_key_recovery.clone(),
        recovery_key_nonce: keys.recovery_key_nonce.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_and_unlock_vault() {
        let password = "correct-horse-battery-staple";
        let (keys, recovery_key) = create_vault(password).unwrap();

        // Unlock with password.
        let master_key = unlock_vault(password, &keys).unwrap();
        assert_eq!(master_key.len(), KEY_SIZE);

        // Unlock with recovery key gives the same master key.
        let master_key_recovery = unlock_vault_with_recovery(&recovery_key, &keys).unwrap();
        assert_eq!(master_key, master_key_recovery);
    }

    #[test]
    fn test_wrong_password_fails() {
        let (keys, _) = create_vault("good-password").unwrap();
        let result = unlock_vault("wrong-password", &keys);
        assert!(result.is_err());
    }

    #[test]
    fn test_file_encrypt_decrypt_roundtrip() {
        let (keys, _) = create_vault("pw").unwrap();
        let master_key = unlock_vault("pw", &keys).unwrap();

        let plaintext = b"Hello, Cortex vault!";
        let encrypted = encrypt_file(&master_key, plaintext).unwrap();

        // Encrypted output must be larger than plaintext (nonce + tag).
        assert!(encrypted.len() > plaintext.len());

        let decrypted = decrypt_file(&master_key, &encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_file_decrypt_with_wrong_key_fails() {
        let (keys, _) = create_vault("pw").unwrap();
        let master_key = unlock_vault("pw", &keys).unwrap();
        let encrypted = encrypt_file(&master_key, b"secret data").unwrap();

        let wrong_key = random_bytes(KEY_SIZE);
        let result = decrypt_file(&wrong_key, &encrypted);
        assert!(result.is_err());
    }

    #[test]
    fn test_change_password() {
        let old_pw = "old-password";
        let new_pw = "new-password";

        let (keys, recovery_key) = create_vault(old_pw).unwrap();
        let original_master = unlock_vault(old_pw, &keys).unwrap();

        let new_keys = change_password(old_pw, new_pw, &keys).unwrap();

        // Old password should no longer work.
        assert!(unlock_vault(old_pw, &new_keys).is_err());

        // New password should work and produce the same master key.
        let new_master = unlock_vault(new_pw, &new_keys).unwrap();
        assert_eq!(original_master, new_master);

        // Recovery key should still work and produce the same master key.
        let recovery_master = unlock_vault_with_recovery(&recovery_key, &new_keys).unwrap();
        assert_eq!(original_master, recovery_master);
    }

    #[test]
    fn test_empty_plaintext() {
        let (keys, _) = create_vault("pw").unwrap();
        let master_key = unlock_vault("pw", &keys).unwrap();

        let encrypted = encrypt_file(&master_key, b"").unwrap();
        let decrypted = decrypt_file(&master_key, &encrypted).unwrap();
        assert_eq!(decrypted, b"");
    }

    #[test]
    fn test_decrypt_file_too_short() {
        let key = random_bytes(KEY_SIZE);
        // Anything shorter than 12 bytes (nonce size) should fail.
        let result = decrypt_file(&key, &[0u8; 5]);
        assert!(result.is_err());
    }
}
