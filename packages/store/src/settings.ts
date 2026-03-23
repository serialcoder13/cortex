import { create } from "zustand";

export type StorageBackend = "local" | "tauri-fs" | "sqlite";

export type LlmProvider = "deepseek" | "openai" | "anthropic" | "ollama" | "custom";

export type Theme = "light" | "dark" | "system";

export interface ApiKeyEntry {
  provider: LlmProvider;
  key: string;
}

export interface SettingsState {
  /** Which storage backend to use */
  storageBackend: StorageBackend;
  /** Which LLM provider to use */
  llmProvider: LlmProvider;
  /** API keys indexed by provider name */
  apiKeys: Record<string, string>;
  /** Whether auto-organization agent is enabled */
  autoOrganize: boolean;
  /** Current theme */
  theme: Theme;
  /** Current vault path */
  vaultPath: string | null;

  /** Update the storage backend */
  setStorageBackend: (backend: StorageBackend) => void;
  /** Update the LLM provider */
  setLlmProvider: (provider: LlmProvider) => void;
  /** Set an API key for a given provider */
  setApiKey: (provider: string, key: string) => void;
  /** Remove an API key for a given provider */
  removeApiKey: (provider: string) => void;
  /** Toggle auto-organization agent */
  setAutoOrganize: (enabled: boolean) => void;
  /** Set the theme */
  setTheme: (theme: Theme) => void;
  /** Set the vault path */
  setVaultPath: (path: string | null) => void;
  /** Reset all settings to defaults */
  resetSettings: () => void;
}

const defaultSettings = {
  storageBackend: "local" as StorageBackend,
  llmProvider: "openai" as LlmProvider,
  apiKeys: {} as Record<string, string>,
  autoOrganize: false,
  theme: "system" as Theme,
  vaultPath: null as string | null,
};

export const useSettingsStore = create<SettingsState>((set) => ({
  ...defaultSettings,

  setStorageBackend: (storageBackend) => set({ storageBackend }),

  setLlmProvider: (llmProvider) => set({ llmProvider }),

  setApiKey: (provider, key) =>
    set((state) => ({
      apiKeys: { ...state.apiKeys, [provider]: key },
    })),

  removeApiKey: (provider) =>
    set((state) => {
      const { [provider]: _, ...rest } = state.apiKeys;
      return { apiKeys: rest };
    }),

  setAutoOrganize: (autoOrganize) => set({ autoOrganize }),

  setTheme: (theme) => set({ theme }),

  setVaultPath: (vaultPath) => set({ vaultPath }),

  resetSettings: () => set(defaultSettings),
}));
