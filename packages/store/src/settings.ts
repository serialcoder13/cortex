import { create } from "zustand";
import { persist } from "zustand/middleware";

export type StorageBackend = "local" | "tauri-fs" | "sqlite";

export type LlmProvider = "deepseek" | "openai" | "anthropic" | "ollama" | "custom";

/** Color palette / theme family */
export type ThemeName =
  | "default"
  | "nord"
  | "solarized"
  | "dracula"
  | "monokai"
  | "gruvbox"
  | "catppuccin"
  | "rose-pine";

/** Light/dark/system appearance mode */
export type ThemeMode = "light" | "dark" | "system";

/** @deprecated Use ThemeName + ThemeMode instead */
export type Theme = ThemeMode;

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
  /** Current color theme */
  themeName: ThemeName;
  /** Light / dark / system mode */
  themeMode: ThemeMode;
  /** @deprecated — alias for themeMode, kept for compat */
  theme: ThemeMode;
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
  /** Set the color theme */
  setThemeName: (name: ThemeName) => void;
  /** Set the appearance mode */
  setThemeMode: (mode: ThemeMode) => void;
  /** @deprecated — alias for setThemeMode */
  setTheme: (theme: ThemeMode) => void;
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
  themeName: "default" as ThemeName,
  themeMode: "system" as ThemeMode,
  theme: "system" as ThemeMode,
  vaultPath: null as string | null,
};

export const useSettingsStore = create<SettingsState>()(persist((set) => ({
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

  setThemeName: (themeName) => set({ themeName }),

  setThemeMode: (themeMode) => set({ themeMode, theme: themeMode }),

  setTheme: (theme) => set({ theme, themeMode: theme }),

  setVaultPath: (vaultPath) => set({ vaultPath }),

  resetSettings: () => set(defaultSettings),
}), {
  name: "cortex-settings",
  partialize: (state) => ({
    themeName: state.themeName,
    themeMode: state.themeMode,
    theme: state.themeMode,
    vaultPath: state.vaultPath,
    llmProvider: state.llmProvider,
    apiKeys: state.apiKeys,
    autoOrganize: state.autoOrganize,
  }),
}));
