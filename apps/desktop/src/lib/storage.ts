import { invoke } from "@tauri-apps/api/core";

export interface DocumentMeta {
  path: string;
  title: string;
  tags: string[];
  doc_type: string;
  created_at: string;
  modified_at: string;
  size_bytes: number;
}

export interface SearchResult {
  path: string;
  title: string;
  snippet: string;
  score: number;
}

export const storage = {
  // ---------------------------------------------------------------------------
  // Vault management
  // ---------------------------------------------------------------------------

  /** Create a new encrypted vault at `path`, returning a recovery key. */
  async createVault(
    path: string,
    password: string,
  ): Promise<{ recovery_key: string }> {
    return invoke("vault_create", { path, password });
  },

  /** Open (unlock) an existing vault with the given password. */
  async openVault(path: string, password: string): Promise<boolean> {
    return invoke("vault_open", { path, password });
  },

  /** Check whether a vault database already exists at `path`. */
  async vaultExists(path: string): Promise<boolean> {
    return invoke("vault_exists", { path });
  },

  /** Lock the currently-open vault, wiping the in-memory key. */
  async lockVault(): Promise<boolean> {
    return invoke("vault_lock");
  },

  /** Return `true` if a vault is currently unlocked in the backend. */
  async isUnlocked(): Promise<boolean> {
    return invoke("vault_is_unlocked");
  },

  // ---------------------------------------------------------------------------
  // Document CRUD
  // ---------------------------------------------------------------------------

  /** Read the decrypted content of a document by its vault-relative path. */
  async readDocument(docPath: string): Promise<string> {
    return invoke("storage_read", { docPath });
  },

  /** Write (create or overwrite) a document inside the vault. */
  async writeDocument(docPath: string, content: string): Promise<boolean> {
    return invoke("storage_write", { docPath, content });
  },

  /** Delete a document from the vault. */
  async deleteDocument(docPath: string): Promise<boolean> {
    return invoke("storage_delete", { docPath });
  },

  /** List metadata for every document in the vault. */
  async listDocuments(): Promise<DocumentMeta[]> {
    return invoke("storage_list");
  },

  /** Full-text search across all vault documents. */
  async search(query: string): Promise<SearchResult[]> {
    return invoke("storage_search", { query });
  },

  /** Create today's daily note (or return its path if it already exists). */
  async createDailyNote(): Promise<string> {
    return invoke("storage_create_daily_note");
  },
};
