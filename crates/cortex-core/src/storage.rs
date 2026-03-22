use async_trait::async_trait;
use tokio::sync::mpsc;

use crate::document::{DocumentMeta, FileChangeEvent, SearchResult};

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("File not found: {0}")]
    NotFound(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Encryption error: {0}")]
    Encryption(String),
    #[error("Serialization error: {0}")]
    Serialization(String),
}

#[async_trait]
pub trait StorageBackend: Send + Sync {
    async fn read(&self, path: &str) -> Result<String, StorageError>;
    async fn write(&self, path: &str, content: &str) -> Result<(), StorageError>;
    async fn delete(&self, path: &str) -> Result<(), StorageError>;
    async fn rename(&self, from: &str, to: &str) -> Result<(), StorageError>;
    async fn list(&self) -> Result<Vec<DocumentMeta>, StorageError>;
    async fn search(&self, query: &str) -> Result<Vec<SearchResult>, StorageError>;
    async fn watch(&self, tx: mpsc::Sender<FileChangeEvent>) -> Result<(), StorageError>;
    async fn is_available(&self) -> bool;
}
