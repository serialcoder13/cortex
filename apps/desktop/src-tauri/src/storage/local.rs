use std::fs;
use std::path::Path;

use chrono::{TimeZone, Utc};
use walkdir::WalkDir;

use cortex_core::document::DocumentMeta;
use cortex_core::storage::StorageError;

use crate::crypto;

/// Read an encrypted document from the vault, decrypt it, and return the
/// plaintext markdown content.
///
/// `doc_path` is relative to the vault root (e.g. `"dates/2026-03/21.md"`).
pub fn read_document(
    vault_path: &str,
    doc_path: &str,
    master_key: &[u8],
) -> Result<String, StorageError> {
    let full_path = Path::new(vault_path).join(doc_path);

    if !full_path.exists() {
        return Err(StorageError::NotFound(format!(
            "Document not found: {}",
            doc_path
        )));
    }

    let ciphertext = fs::read(&full_path)?;
    let plaintext_bytes = crypto::decrypt_file(master_key, &ciphertext)
        .map_err(|e| StorageError::Encryption(e.to_string()))?;

    String::from_utf8(plaintext_bytes)
        .map_err(|e| StorageError::Serialization(format!("Invalid UTF-8 in document: {}", e)))
}

/// Encrypt content and write it to a document file inside the vault.
///
/// Creates parent directories as needed.
/// `doc_path` is relative to the vault root.
pub fn write_document(
    vault_path: &str,
    doc_path: &str,
    content: &str,
    master_key: &[u8],
) -> Result<(), StorageError> {
    let full_path = Path::new(vault_path).join(doc_path);

    // Ensure the parent directory exists.
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let ciphertext = crypto::encrypt_file(master_key, content.as_bytes())
        .map_err(|e| StorageError::Encryption(e.to_string()))?;

    fs::write(&full_path, ciphertext)?;

    Ok(())
}

/// Delete a document from the vault.
///
/// `doc_path` is relative to the vault root.
pub fn delete_document(vault_path: &str, doc_path: &str) -> Result<(), StorageError> {
    let full_path = Path::new(vault_path).join(doc_path);

    if !full_path.exists() {
        return Err(StorageError::NotFound(format!(
            "Document not found: {}",
            doc_path
        )));
    }

    fs::remove_file(&full_path)?;

    Ok(())
}

/// Walk the `dates/` and `docs/` directories and return metadata for every
/// `.md` file found.
///
/// This does NOT decrypt files — it reads filesystem metadata (size, timestamps)
/// and, where possible, extracts the title from the file path. For a full
/// title extracted from frontmatter, the caller should decrypt the file separately.
pub fn list_documents(vault_path: &str) -> Result<Vec<DocumentMeta>, StorageError> {
    let root = Path::new(vault_path);
    let mut results = Vec::new();

    for subdir in &["dates", "docs"] {
        let dir = root.join(subdir);
        if !dir.exists() {
            continue;
        }

        for entry in WalkDir::new(&dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.file_type().is_file()
                    && e.path()
                        .extension()
                        .map_or(false, |ext| ext == "md")
            })
        {
            let path = entry.path();

            // Build a vault-relative path (e.g. "dates/2026-03/21.md").
            let rel_path = path
                .strip_prefix(root)
                .unwrap_or(path)
                .to_string_lossy()
                .to_string();

            // Derive a title from the filename (without extension).
            let title = path
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| rel_path.clone());

            // Determine the document type from the top-level folder.
            let doc_type = subdir.to_string();

            // Read filesystem metadata for timestamps and size.
            let meta = fs::metadata(path)?;
            let size_bytes = meta.len();

            let modified_at = meta
                .modified()
                .ok()
                .and_then(|t| {
                    let duration = t
                        .duration_since(std::time::UNIX_EPOCH)
                        .ok()?;
                    Utc.timestamp_opt(duration.as_secs() as i64, duration.subsec_nanos())
                        .single()
                })
                .unwrap_or_else(Utc::now);

            let created_at = meta
                .created()
                .ok()
                .and_then(|t| {
                    let duration = t
                        .duration_since(std::time::UNIX_EPOCH)
                        .ok()?;
                    Utc.timestamp_opt(duration.as_secs() as i64, duration.subsec_nanos())
                        .single()
                })
                .unwrap_or(modified_at);

            results.push(DocumentMeta {
                path: rel_path,
                title,
                tags: Vec::new(),
                doc_type,
                created_at,
                modified_at,
                size_bytes,
            });
        }
    }

    Ok(results)
}

/// Create today's daily note if it does not already exist.
///
/// The note is placed at `dates/YYYY-MM/DD.md` with YAML frontmatter
/// containing the title and creation date. Returns the vault-relative path
/// of the note.
pub fn create_daily_note(
    vault_path: &str,
    master_key: &[u8],
) -> Result<String, StorageError> {
    let today = Utc::now();
    let year_month = today.format("%Y-%m").to_string();
    let day = today.format("%d").to_string();

    let rel_path = format!("dates/{}/{}.md", year_month, day);
    let full_path = Path::new(vault_path).join(&rel_path);

    if full_path.exists() {
        // Daily note already exists — just return its path.
        return Ok(rel_path);
    }

    // Ensure the parent directory exists.
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent)?;
    }

    // Build frontmatter + initial content.
    let date_str = today.format("%Y-%m-%d").to_string();
    let display_title = today.format("%B %d, %Y").to_string();
    let content = format!(
        "---\ntitle: {}\ndate: {}\ntags: [daily]\n---\n\n# {}\n\n",
        display_title, date_str, display_title
    );

    let ciphertext = crypto::encrypt_file(master_key, content.as_bytes())
        .map_err(|e| StorageError::Encryption(e.to_string()))?;

    fs::write(&full_path, ciphertext)?;

    Ok(rel_path)
}

/// Parse YAML frontmatter from decrypted markdown content.
///
/// Looks for content delimited by `---` at the start of the file and
/// extracts simple `key: value` pairs. Returns the title if found.
pub fn extract_title_from_frontmatter(content: &str) -> Option<String> {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return None;
    }

    // Find the closing `---`.
    let after_first = &trimmed[3..];
    let end = after_first.find("---")?;
    let frontmatter = &after_first[..end];

    for line in frontmatter.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("title:") {
            let title = rest.trim().trim_matches('"').trim_matches('\'');
            if !title.is_empty() {
                return Some(title.to_string());
            }
        }
    }

    None
}
