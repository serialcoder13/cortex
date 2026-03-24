import { useState, useCallback, useEffect } from "react";
import { ActivityBar, type ActivityView } from "./components/ActivityBar";
import { FileTree } from "./components/FileTree";
import { TabBar } from "./components/TabBar";
import { EmptyState } from "./components/EmptyState";
import { VaultSetup } from "./components/VaultSetup";
import { AppLoadingSkeleton } from "./components/Skeleton";
import { DocumentPage } from "./pages/DocumentPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useVault } from "./lib/hooks/useVault";
import { useTheme } from "./lib/hooks/useTheme";
import { useTabStore } from "./stores/tabs";

function App() {
  const vault = useVault();
  useTheme();
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActivityView>("calendar");

  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  // Cmd+W to close active tab.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault();
        const id = useTabStore.getState().activeTabId;
        if (id) closeTab(id);
      }
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, [closeTab]);

  const handleCreateVault = useCallback(
    async (path: string, password: string) => {
      const key = await vault.createVault(path, password);
      if (key) setRecoveryKey(key);
    },
    [vault.createVault],
  );

  const handleOpenVault = useCallback(
    async (path: string, password: string) => {
      await vault.openVault(path, password);
    },
    [vault.openVault],
  );

  if (vault.loading) {
    return <AppLoadingSkeleton />;
  }

  if (!vault.isUnlocked) {
    return (
      <>
        <VaultSetup
          onCreateVault={handleCreateVault}
          onOpenVault={handleOpenVault}
          error={vault.error}
          lastVaultPath={vault.lastVaultPath}
        />
        {recoveryKey && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
            <div
              className="w-full max-w-md rounded-xl p-8"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-secondary)",
              }}
            >
              <h2 className="mb-2 text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                Save Your Recovery Key
              </h2>
              <p className="mb-4 text-sm" style={{ color: "var(--text-secondary)" }}>
                Write this down and store it safely. You will need it if you forget your password.
              </p>
              <code
                className="mb-4 block break-all rounded-lg p-4 text-sm"
                style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--warning)" }}
              >
                {recoveryKey}
              </code>
              <p className="mb-4 text-xs" style={{ color: "var(--danger)" }}>
                This key will only be shown once. If you lose it, you cannot recover your vault.
              </p>
              <button
                type="button"
                className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white"
                style={{ backgroundColor: "var(--accent)" }}
                onClick={() => setRecoveryKey(null)}
              >
                I have saved my recovery key
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Show sidebar for calendar and documents views.
  const showSidebar = activeView === "calendar" || activeView === "documents";

  return (
    <div className="flex h-screen" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <ActivityBar activeView={activeView} onViewChange={setActiveView} onCloseVault={vault.lockVault} />
      {showSidebar && <FileTree view={activeView} />}
      <div className="flex-1 flex flex-col min-w-0">
        {activeView !== "settings" && <TabBar />}
        <div className="flex-1 overflow-hidden">
          {activeView === "settings" ? (
            <SettingsPage onClose={() => setActiveView("calendar")} />
          ) : activeTab?.path ? (
            <DocumentPage key={activeTab.id} path={activeTab.path} />
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
