import { useState } from "react";

interface VaultSetupProps {
  onCreateVault: (path: string, password: string) => Promise<void>;
  onOpenVault: (path: string, password: string) => Promise<void>;
  error: string | null;
}

export function VaultSetup({ onCreateVault, onOpenVault, error }: VaultSetupProps) {
  const [mode, setMode] = useState<"open" | "create">("open");
  const [path, setPath] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!path || !password) return;

    if (mode === "create" && password !== confirmPassword) {
      return;
    }

    setLoading(true);
    try {
      if (mode === "create") {
        await onCreateVault(path, password);
      } else {
        await onOpenVault(path, password);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-neutral-950">
      <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-8">
        <h1 className="mb-2 text-2xl font-bold text-white">Cortex</h1>
        <p className="mb-6 text-sm text-neutral-400">
          {mode === "open" ? "Open your vault to get started." : "Create a new encrypted vault."}
        </p>

        <div className="mb-6 flex gap-2">
          <button
            type="button"
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              mode === "open" ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-neutral-200"
            }`}
            onClick={() => setMode("open")}
          >
            Open Vault
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              mode === "create" ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-neutral-200"
            }`}
            onClick={() => setMode("create")}
          >
            Create Vault
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-neutral-300">Vault Location</label>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/Users/you/cortex-vault"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-neutral-300">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter vault password"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {mode === "create" && (
            <div>
              <label className="mb-1 block text-sm text-neutral-300">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
              />
              {password && confirmPassword && password !== confirmPassword && (
                <p className="mt-1 text-xs text-red-400">Passwords do not match</p>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading || !path || !password || (mode === "create" && password !== confirmPassword)}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "..." : mode === "create" ? "Create Vault" : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
