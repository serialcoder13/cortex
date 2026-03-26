import { useState, useCallback, useEffect, useRef } from "react";
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
import { storage } from "./lib/storage";
import { useTabStore } from "./stores/tabs";

const SIDEBAR_VIEWS = new Set<ActivityView>(["calendar", "documents"]);

function readSidebarOpen(): boolean {
  try { return localStorage.getItem("cortex-sidebar-open") !== "false"; } catch { return true; }
}

function readSidebarWidth(): number {
  try { return Number.parseInt(localStorage.getItem("cortex-sidebar-width") ?? "240", 10); } catch { return 240; }
}

function saveSidebarOpen(open: boolean) {
  try { localStorage.setItem("cortex-sidebar-open", String(open)); } catch { /* ignore */ }
}

function saveSidebarWidth(width: number) {
  try { localStorage.setItem("cortex-sidebar-width", String(width)); } catch { /* ignore */ }
}

function App() {
  const vault = useVault();
  useTheme();
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActivityView>("calendar");
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarOpen);
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);

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

  // Cmd+B to toggle sidebar.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setSidebarOpen((prev) => {
          saveSidebarOpen(!prev);
          return !prev;
        });
      }
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleViewChange = useCallback((view: ActivityView) => {
    if (view === activeView && SIDEBAR_VIEWS.has(view)) {
      // Clicking the active sidebar view toggles the sidebar.
      setSidebarOpen((prev) => {
        saveSidebarOpen(!prev);
        return !prev;
      });
    } else {
      setActiveView(view);
      // Opening a sidebar view always reveals the sidebar.
      if (SIDEBAR_VIEWS.has(view)) {
        setSidebarOpen(true);
        saveSidebarOpen(true);
      }
    }
  }, [activeView]);

  const handleWidthChange = useCallback((w: number) => {
    setSidebarWidth(w);
    saveSidebarWidth(w);
  }, []);

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

  const handleOpenWithRecovery = useCallback(
    async (path: string, recoveryKey: string) => {
      return vault.openVaultWithRecovery(path, recoveryKey);
    },
    [vault.openVaultWithRecovery],
  );

  const handleResetPassword = useCallback(
    async (recoveryKeyStr: string, newPassword: string): Promise<string> => {
      const result = await storage.resetPasswordWithRecovery(recoveryKeyStr, newPassword);
      return result.recovery_key;
    },
    [],
  );

  // Only show the loading skeleton on the initial unlock check, not during
  // vault operations (which would unmount VaultSetup and lose its state).
  const initialLoadDone = useRef(false);
  if (!initialLoadDone.current && vault.loading) {
    return <AppLoadingSkeleton />;
  }
  if (!vault.loading) {
    initialLoadDone.current = true;
  }

  if (!vault.isUnlocked) {
    return (
      <>
        <VaultSetup
          onCreateVault={handleCreateVault}
          onOpenVault={handleOpenVault}
          onOpenWithRecovery={handleOpenWithRecovery}
          onResetPassword={handleResetPassword}
          onCompleteRecovery={vault.completeCreation}
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
                onClick={() => { setRecoveryKey(null); vault.completeCreation(); }}
              >
                I have saved my recovery key
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  const showSidebar = SIDEBAR_VIEWS.has(activeView) && sidebarOpen;

  let mainContent: React.ReactNode;
  if (activeView === "settings") {
    mainContent = <SettingsPage onClose={() => setActiveView("calendar")} />;
  } else if (activeTab?.path) {
    mainContent = <DocumentPage key={activeTab.id} path={activeTab.path} />;
  } else {
    mainContent = <EmptyState />;
  }

  return (
    <div className="flex h-screen" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <ActivityBar activeView={activeView} onViewChange={handleViewChange} onCloseVault={vault.lockVault} />
      {showSidebar && <FileTree view={activeView} width={sidebarWidth} onWidthChange={handleWidthChange} />}
      <div className="flex-1 flex flex-col min-w-0">
        {activeView !== "settings" && <TabBar />}
        <div className="flex-1 overflow-hidden">
          {mainContent}
        </div>
      </div>
    </div>
  );
}

export default App;
