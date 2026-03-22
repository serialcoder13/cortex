use std::collections::HashMap;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use cortex_core::document::SearchResult;

/// On-disk search index stored at `.cortex/index.json`.
#[derive(Debug, Serialize, Deserialize, Default)]
pub struct SearchIndex {
    /// Schema version for forward compatibility.
    pub version: u32,
    /// Map from document path (vault-relative) to its index entry.
    pub documents: HashMap<String, DocIndex>,
}

/// Index entry for a single document.
#[derive(Debug, Serialize, Deserialize)]
pub struct DocIndex {
    /// Document title (extracted from frontmatter or filename).
    pub title: String,
    /// Map from lowercase word to the list of positions (word offsets) where
    /// it appears in the document body.
    pub words: HashMap<String, Vec<usize>>,
    /// ISO-8601 timestamp of when the document was last indexed.
    pub modified: String,
}

/// Tokenize `text` into lowercase alphanumeric words, filtering out very
/// short tokens.
fn tokenize(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_alphanumeric() && c != '\'')
        .map(|w| w.trim_matches('\'').to_lowercase())
        .filter(|w| w.len() >= 2)
        .collect()
}

/// Update (or insert) the index entry for a document.
///
/// `doc_path` is the vault-relative path. `title` and `content` are the
/// plaintext values extracted after decryption.
pub fn update_index(index: &mut SearchIndex, doc_path: &str, title: &str, content: &str) {
    let words = tokenize(content);
    let mut word_positions: HashMap<String, Vec<usize>> = HashMap::new();

    for (pos, word) in words.iter().enumerate() {
        word_positions
            .entry(word.clone())
            .or_default()
            .push(pos);
    }

    let modified = chrono::Utc::now().to_rfc3339();

    index.documents.insert(
        doc_path.to_string(),
        DocIndex {
            title: title.to_string(),
            words: word_positions,
            modified,
        },
    );
}

/// Remove a document from the search index.
pub fn remove_from_index(index: &mut SearchIndex, doc_path: &str) {
    index.documents.remove(doc_path);
}

/// Search the index for documents containing **all** query words.
///
/// Results are scored by the total number of occurrences of query words
/// in each document, sorted by descending score.
pub fn search(index: &SearchIndex, query: &str) -> Vec<SearchResult> {
    let query_words = tokenize(query);
    if query_words.is_empty() {
        return Vec::new();
    }

    let mut results: Vec<SearchResult> = Vec::new();

    for (doc_path, doc_index) in &index.documents {
        let mut total_hits: usize = 0;
        let mut all_matched = true;

        for qw in &query_words {
            match doc_index.words.get(qw) {
                Some(positions) => {
                    total_hits += positions.len();
                }
                None => {
                    all_matched = false;
                    break;
                }
            }
        }

        if !all_matched {
            continue;
        }

        // Build a snippet from the first query word's context.
        let snippet = build_snippet(doc_index, &query_words);

        results.push(SearchResult {
            path: doc_path.clone(),
            title: doc_index.title.clone(),
            snippet,
            score: total_hits as f32,
        });
    }

    // Sort by descending score.
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

    results
}

/// Build a short snippet string indicating where the query words appear.
///
/// Since we only store word positions (not the original text), we produce
/// a summary like "Found 'word' at positions 3, 15, 42".
fn build_snippet(doc_index: &DocIndex, query_words: &[String]) -> String {
    let mut parts: Vec<String> = Vec::new();

    for qw in query_words {
        if let Some(positions) = doc_index.words.get(qw) {
            let pos_str: Vec<String> = positions.iter().take(5).map(|p| p.to_string()).collect();
            let suffix = if positions.len() > 5 {
                format!(" (+{} more)", positions.len() - 5)
            } else {
                String::new()
            };
            parts.push(format!("'{}' at positions {}{}", qw, pos_str.join(", "), suffix));
        }
    }

    if parts.is_empty() {
        String::new()
    } else {
        format!("Found {}", parts.join("; "))
    }
}

/// Load the search index from `.cortex/index.json`.
///
/// Returns a default (empty) index if the file does not exist or cannot
/// be parsed.
pub fn load_index(vault_path: &str) -> SearchIndex {
    let index_path = Path::new(vault_path).join(".cortex/index.json");

    let data = match fs::read_to_string(&index_path) {
        Ok(d) => d,
        Err(_) => return SearchIndex::default(),
    };

    serde_json::from_str(&data).unwrap_or_default()
}

/// Write the search index to `.cortex/index.json`.
pub fn save_index(vault_path: &str, index: &SearchIndex) {
    let index_path = Path::new(vault_path).join(".cortex/index.json");

    // Ensure the directory exists.
    if let Some(parent) = index_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    if let Ok(json) = serde_json::to_string_pretty(index) {
        let _ = fs::write(&index_path, json);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tokenize() {
        let tokens = tokenize("Hello, World! This is a test.");
        assert!(tokens.contains(&"hello".to_string()));
        assert!(tokens.contains(&"world".to_string()));
        assert!(tokens.contains(&"test".to_string()));
        // Single-char words like "a" are filtered out.
        assert!(!tokens.contains(&"a".to_string()));
    }

    #[test]
    fn test_update_and_search() {
        let mut index = SearchIndex::default();

        update_index(
            &mut index,
            "docs/meeting.md",
            "Meeting Notes",
            "We discussed the project timeline and budget allocations for next quarter",
        );

        update_index(
            &mut index,
            "docs/ideas.md",
            "Ideas",
            "Some ideas about the project roadmap and new features",
        );

        // Search for "project" — should match both.
        let results = search(&index, "project");
        assert_eq!(results.len(), 2);

        // Search for "budget" — should match only meeting notes.
        let results = search(&index, "budget");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].path, "docs/meeting.md");

        // Search for "project budget" — should match only meeting notes (both words required).
        let results = search(&index, "project budget");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].path, "docs/meeting.md");
    }

    #[test]
    fn test_remove_from_index() {
        let mut index = SearchIndex::default();
        update_index(&mut index, "docs/temp.md", "Temp", "temporary document");

        assert!(index.documents.contains_key("docs/temp.md"));
        remove_from_index(&mut index, "docs/temp.md");
        assert!(!index.documents.contains_key("docs/temp.md"));
    }

    #[test]
    fn test_empty_query_returns_nothing() {
        let mut index = SearchIndex::default();
        update_index(&mut index, "docs/a.md", "A", "some content here");

        let results = search(&index, "");
        assert!(results.is_empty());
    }

    #[test]
    fn test_load_nonexistent_index() {
        let index = load_index("/nonexistent/path");
        assert!(index.documents.is_empty());
        assert_eq!(index.version, 0);
    }
}
