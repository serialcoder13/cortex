import { useState, useCallback } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { VaultSetup } from "./components/VaultSetup";
import { CalendarView } from "./pages/CalendarView";
import { DocumentPage } from "./pages/DocumentPage";
import { DocumentBrowser } from "./pages/DocumentBrowser";
import { SearchPage } from "./pages/SearchPage";
import { TodosPage } from "./pages/TodosPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useVault } from "./lib/hooks/useVault";

function App() {
  const vault = useVault();
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);

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
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950 text-neutral-400">
        Loading...
      </div>
    );
  }

  if (!vault.isUnlocked) {
    return (
      <>
        <VaultSetup
          onCreateVault={handleCreateVault}
          onOpenVault={handleOpenVault}
          error={vault.error}
        />
        {recoveryKey && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
            <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-8">
              <h2 className="mb-2 text-lg font-bold text-white">Save Your Recovery Key</h2>
              <p className="mb-4 text-sm text-neutral-400">
                Write this down and store it safely. You will need it if you forget your password.
              </p>
              <code className="mb-4 block break-all rounded-lg bg-neutral-800 p-4 text-sm text-amber-300">
                {recoveryKey}
              </code>
              <p className="mb-4 text-xs text-red-400">
                This key will only be shown once. If you lose it, you cannot recover your vault.
              </p>
              <button
                type="button"
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500"
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

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-neutral-950 text-neutral-100">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<CalendarView />} />
            <Route path="/doc/*" element={<DocumentPage />} />
            <Route path="/documents" element={<DocumentBrowser />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/todos" element={<TodosPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
