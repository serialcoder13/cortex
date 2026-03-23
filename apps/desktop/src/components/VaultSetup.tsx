import { useState, useMemo } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import logotextSvg from "../assets/logotext.svg";

interface VaultSetupProps {
  onCreateVault: (path: string, password: string) => Promise<void>;
  onOpenVault: (path: string, password: string) => Promise<void>;
  error: string | null;
  recoveryKey?: string | null;
}

type PasswordStrength = "weak" | "fair" | "good" | "strong";

function getPasswordStrength(password: string): PasswordStrength {
  if (!password || password.length < 8) return "weak";

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  if (password.length >= 16 || (hasUpper && hasLower && hasNumber && hasSpecial)) {
    return "strong";
  }
  if (password.length >= 12) return "good";
  return "fair";
}

const STRENGTH_CONFIG: Record<PasswordStrength, { color: string; bg: string; width: string; label: string }> = {
  weak: { color: "text-red-400", bg: "bg-red-500", width: "w-1/4", label: "Weak" },
  fair: { color: "text-orange-400", bg: "bg-orange-500", width: "w-2/4", label: "Fair" },
  good: { color: "text-blue-400", bg: "bg-blue-500", width: "w-3/4", label: "Good" },
  strong: { color: "text-green-400", bg: "bg-green-500", width: "w-full", label: "Strong" },
};

function PasswordStrengthBar({ password }: Readonly<{ password: string }>) {
  const strength = useMemo(() => getPasswordStrength(password), [password]);
  const config = STRENGTH_CONFIG[strength];

  if (!password) return null;

  return (
    <div className="mt-2">
      <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-700">
        <div
          className={`h-full rounded-full transition-all duration-300 ${config.bg} ${config.width}`}
        />
      </div>
      <p className={`mt-1 text-xs ${config.color}`}>{config.label}</p>
    </div>
  );
}

function ClipboardIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function RecoveryKeyDisplay({ recoveryKey }: Readonly<{ recoveryKey: string }>) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: older browsers
      const textarea = document.createElement("textarea");
      textarea.value = recoveryKey;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy"); // deprecated but needed as fallback
      textarea.remove();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="rounded-lg border border-amber-800/50 bg-amber-950/30 p-4">
      <p className="mb-2 text-sm font-medium text-amber-300">Recovery Key</p>
      <p className="mb-2 text-xs text-amber-200/70">
        Save this key somewhere safe. You will need it if you forget your password.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded bg-neutral-800 px-3 py-2 text-xs text-amber-200 font-mono">
          {recoveryKey}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="flex-shrink-0 flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-neutral-100"
        >
          {copied ? (
            <span className="text-green-400">Copied!</span>
          ) : (
            <>
              <ClipboardIcon />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function CortexLogo() {
  return (
    <div className="mb-6 text-center">
      <img
        src={logotextSvg}
        alt="Cortex"
        className="mx-auto mb-2 h-10"
      />
      <p className="text-xs text-neutral-500">Your encrypted second brain</p>
    </div>
  );
}

export function VaultSetup({ onCreateVault, onOpenVault, error, recoveryKey }: Readonly<VaultSetupProps>) {
  const [mode, setMode] = useState<"open" | "create">("open");
  const [path, setPath] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  function getSubmitLabel() {
    if (loading) return "...";
    if (mode === "create") return "Create Vault";
    return "Unlock";
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
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

  const handleBrowse = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select vault location",
      });
      if (selected) {
        setPath(selected);
      }
    } catch {
      // User cancelled or dialog not available
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
      <div className="w-full max-w-md">
        <CortexLogo />

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 sm:p-8">
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
              <label htmlFor="vault-path" className="mb-1 block text-sm text-neutral-300">Vault Location</label>
              <div className="flex gap-2">
                <input
                  id="vault-path"
                  type="text"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="/Users/you/cortex-vault"
                  className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleBrowse}
                  className="flex-shrink-0 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-neutral-100"
                >
                  Browse
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="vault-password" className="mb-1 block text-sm text-neutral-300">Password</label>
              <input
                id="vault-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter vault password"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
              />
              {mode === "create" && <PasswordStrengthBar password={password} />}
            </div>

            {mode === "create" && (
              <div>
                <label htmlFor="vault-confirm-password" className="mb-1 block text-sm text-neutral-300">Confirm Password</label>
                <input
                  id="vault-confirm-password"
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

            {recoveryKey && <RecoveryKeyDisplay recoveryKey={recoveryKey} />}

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading || !path || !password || (mode === "create" && password !== confirmPassword)}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {getSubmitLabel()}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
