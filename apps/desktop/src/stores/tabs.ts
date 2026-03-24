import { create } from "zustand";

export interface Tab {
  id: string;
  path: string | null; // null = new/empty tab
  title: string;
  /** Preview tabs are shown in italics and get replaced when opening another doc. */
  preview: boolean;
  /** True when the document has unsaved changes. */
  dirty: boolean;
}

interface TabStore {
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (path: string, title?: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabTitle: (id: string, title: string) => void;
  updateTabPath: (id: string, path: string) => void;
  /** Pin the tab (no longer a preview). */
  pinTab: (id: string) => void;
  /** Mark a tab as dirty (unsaved changes) or clean. */
  setTabDirty: (id: string, dirty: boolean) => void;
  openNewTab: () => void;
}

let nextTabId = 1;
function generateId(): string {
  return `tab-${nextTabId++}-${Date.now()}`;
}

export const useTabStore = create<TabStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (path: string, title?: string) => {
    const { tabs } = get();
    // If a tab with this path is already open, just activate it.
    const existing = tabs.find((t) => t.path === path);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }

    // If the active tab is an empty "New tab", replace it.
    const activeTab = tabs.find((t) => t.id === get().activeTabId);
    if (activeTab && activeTab.path === null) {
      const updated = tabs.map((t) =>
        t.id === activeTab.id
          ? { ...t, path, title: title ?? pathToTitle(path), preview: true, dirty: false }
          : t,
      );
      set({ tabs: updated });
      return;
    }

    // If the active tab is a preview tab, replace it instead of opening a new one.
    if (activeTab && activeTab.preview) {
      const updated = tabs.map((t) =>
        t.id === activeTab.id
          ? { ...t, path, title: title ?? pathToTitle(path), preview: true, dirty: false }
          : t,
      );
      set({ tabs: updated });
      return;
    }

    const id = generateId();
    const newTab: Tab = { id, path, title: title ?? pathToTitle(path), preview: true, dirty: false };
    set({ tabs: [...tabs, newTab], activeTabId: id });
  },

  closeTab: (id: string) => {
    const { tabs, activeTabId } = get();
    const index = tabs.findIndex((t) => t.id === id);
    if (index === -1) return;

    const newTabs = tabs.filter((t) => t.id !== id);

    if (newTabs.length === 0) {
      set({ tabs: [], activeTabId: null });
      return;
    }

    let newActiveId = activeTabId;
    if (activeTabId === id) {
      const newIndex = Math.min(index, newTabs.length - 1);
      newActiveId = newTabs[newIndex]?.id ?? null;
    }

    set({ tabs: newTabs, activeTabId: newActiveId });
  },

  setActiveTab: (id: string) => {
    set({ activeTabId: id });
  },

  updateTabTitle: (id: string, title: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
    }));
  },

  updateTabPath: (id: string, path: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, path } : t)),
    }));
  },

  pinTab: (id: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, preview: false } : t)),
    }));
  },

  setTabDirty: (id: string, dirty: boolean) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, dirty } : t)),
    }));
  },

  openNewTab: () => {
    const id = generateId();
    const newTab: Tab = { id, path: null, title: "New tab", preview: false, dirty: false };
    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: id,
    }));
  },
}));

function pathToTitle(path: string): string {
  const filename = path.split("/").pop() ?? path;
  return filename.replace(/\.md$/, "");
}
