import { create } from "zustand";

export interface Tab {
  id: string;
  path: string | null; // null = new/empty tab
  title: string;
}

interface TabStore {
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (path: string, title?: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabTitle: (id: string, title: string) => void;
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
          ? { ...t, path, title: title ?? pathToTitle(path) }
          : t,
      );
      set({ tabs: updated });
      return;
    }

    const id = generateId();
    const newTab: Tab = { id, path, title: title ?? pathToTitle(path) };
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
      // Activate the next tab, or the previous one if we closed the last tab.
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

  openNewTab: () => {
    const id = generateId();
    const newTab: Tab = { id, path: null, title: "New tab" };
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
