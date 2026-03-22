/**
 * Event emitted when a file changes on the filesystem.
 */
export interface FileChangeEvent {
  /** The type of change that occurred */
  kind: "create" | "modify" | "delete" | "rename";
  /** Absolute path to the file that changed */
  path: string;
  /** Timestamp of the change in ISO format */
  timestamp: string;
}

/**
 * Abstraction over platform-specific file/document storage.
 *
 * Implementations can target the browser (IndexedDB/localStorage),
 * Tauri filesystem APIs, or a remote backend.
 */
export interface StorageAdapter {
  /** Read the contents of a file/document by path or key */
  read(path: string): Promise<string | null>;

  /** Write contents to a file/document at the given path or key */
  write(path: string, content: string): Promise<void>;

  /** Delete a file/document by path or key */
  delete(path: string): Promise<void>;

  /** List all file/document paths under the given directory or prefix */
  list(directory?: string): Promise<string[]>;

  /** Full-text search across stored documents */
  search(query: string): Promise<SearchResult[]>;

  /**
   * Watch a path for changes. Returns an unsubscribe function.
   * Not all adapters support watching (e.g., localStorage does not).
   */
  watch?(
    path: string,
    callback: (event: FileChangeEvent) => void,
  ): Promise<() => void>;
}

export interface SearchResult {
  /** Path or key of the matching document */
  path: string;
  /** Matched snippet with context */
  snippet: string;
  /** Relevance score (0-1) */
  score: number;
}

/**
 * Message in an LLM conversation.
 */
export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Options for an LLM completion request.
 */
export interface LlmCompletionOptions {
  /** The model to use (e.g., "gpt-4o", "claude-sonnet-4-20250514") */
  model?: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature (0-2) */
  temperature?: number;
  /** Stop sequences */
  stop?: string[];
}

/**
 * Abstraction over LLM providers (OpenAI, Anthropic, Ollama, etc.).
 */
export interface LlmAdapter {
  /** Send a completion request and return the full response */
  complete(
    messages: LlmMessage[],
    options?: LlmCompletionOptions,
  ): Promise<string>;

  /**
   * Send a completion request and stream the response token by token.
   * Returns an async iterable of string chunks.
   */
  stream(
    messages: LlmMessage[],
    options?: LlmCompletionOptions,
  ): AsyncIterable<string>;
}
