import { useState, useMemo, useRef, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import logotextSvg from "../assets/logotext.svg";
import { useTheme } from "../lib/hooks/useTheme";

interface VaultSetupProps {
  onCreateVault: (path: string, password: string) => Promise<void>;
  onOpenVault: (path: string, password: string) => Promise<void>;
  onOpenWithRecovery: (path: string, recoveryKey: string) => Promise<boolean>;
  onResetPassword: (recoveryKey: string, newPassword: string) => Promise<string>;
  onCompleteRecovery: () => void;
  error: string | null;
  recoveryKey?: string | null;
  lastVaultPath?: string | null;
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
      <div className="h-1 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--bg-tertiary)" }}>
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
      const textarea = document.createElement("textarea");
      textarea.value = recoveryKey;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="rounded-lg p-4" style={{ backgroundColor: "var(--accent-muted)", border: "1px solid var(--warning)" }}>
      <p className="mb-2 text-sm font-medium" style={{ color: "var(--warning)" }}>Recovery Key</p>
      <p className="mb-2 text-xs" style={{ color: "var(--text-secondary)" }}>
        Save this key somewhere safe. You will need it if you forget your password.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded px-3 py-2 text-xs font-mono" style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--warning)" }}>
          {recoveryKey}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="flex-shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs transition-colors hover:opacity-80"
          style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-secondary)", border: "1px solid var(--border-secondary)" }}
        >
          {copied ? (
            <span style={{ color: "var(--success)" }}>Copied!</span>
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
    <div className="mb-8 text-center">
      <img
        src={logotextSvg}
        alt="Cortex"
        className="mx-auto mb-3 h-20"
      />
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>Your encrypted second brain</p>
    </div>
  );
}

export function VaultSetup({ onCreateVault, onOpenVault, onOpenWithRecovery, onResetPassword, onCompleteRecovery, error, recoveryKey, lastVaultPath }: Readonly<VaultSetupProps>) {
  // Apply theme on vault setup screen
  useTheme();

  const [mode, setMode] = useState<"open" | "create">("open");
  const [useRecovery, setUseRecovery] = useState(false);
  const [path, setPath] = useState(lastVaultPath ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [loading, setLoading] = useState(false);
  // After successful recovery, prompt to set a new password.
  const [recoverySuccess, setRecoverySuccess] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [newRecoveryKey, setNewRecoveryKey] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Auto-focus password field when last vault path is pre-filled
  useEffect(() => {
    if (lastVaultPath && passwordRef.current) {
      passwordRef.current.focus();
    }
  }, [lastVaultPath]);

  function getSubmitLabel() {
    if (loading) return "...";
    if (mode === "create") return "Create Vault";
    if (useRecovery) return "Recover Vault";
    return "Unlock";
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!path) return;

    if (useRecovery) {
      if (!recoveryInput.trim()) return;
      setLoading(true);
      try {
        const ok = await onOpenWithRecovery(path, recoveryInput.trim());
        if (ok) {
          setRecoverySuccess(true);
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password) return;
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

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      setResetError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setResetError("Passwords do not match.");
      return;
    }
    setResetError(null);
    setLoading(true);
    try {
      const key = await onResetPassword(recoveryInput.trim(), newPassword);
      if (key) {
        setNewRecoveryKey(key);
      } else {
        setResetError("Failed to reset password: no recovery key returned.");
      }
    } catch (err) {
      const tauri = err as { message?: string };
      const msg = err instanceof Error ? err.message : tauri?.message ?? "Failed to reset password";
      setResetError(msg);
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
    <>
      {/* Modal dialog shown after successful password reset */}
      {newRecoveryKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.75)" }}>
          <div className="w-full max-w-md rounded-xl p-8" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-secondary)" }}>
            <h2 className="mb-2 text-lg font-bold" style={{ color: "var(--text-primary)" }}>
              Password Reset Successfully
            </h2>
            <p className="mb-4 text-sm" style={{ color: "var(--text-secondary)" }}>
              A new recovery key has been generated. Save it somewhere safe — it will only be shown once. Your old key is no longer valid.
            </p>
            <RecoveryKeyDisplay recoveryKey={newRecoveryKey} />
            <p className="mt-3 text-xs" style={{ color: "var(--danger)" }}>
              Your old recovery key is now invalid. If you lose this key, you cannot recover your vault.
            </p>
            <button
              type="button"
              onClick={onCompleteRecovery}
              className="mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: "var(--accent)" }}
            >
              I have saved my recovery key
            </button>
          </div>
        </div>
      )}

      <div className="flex min-h-screen items-center justify-center p-4" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="w-full max-w-md">
        <CortexLogo />

        <div className="rounded-xl p-5 sm:p-8" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <p className="mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
            {mode === "open" ? "Open your vault to get started." : "Create a new encrypted vault."}
          </p>

          <div className="mb-6 flex gap-2">
            <button
              type="button"
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors`}
              style={{
                backgroundColor: mode === "open" ? "var(--bg-active)" : "transparent",
                color: mode === "open" ? "var(--text-primary)" : "var(--text-tertiary)",
              }}
              onClick={() => setMode("open")}
            >
              Open Vault
            </button>
            <button
              type="button"
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors`}
              style={{
                backgroundColor: mode === "create" ? "var(--bg-active)" : "transparent",
                color: mode === "create" ? "var(--text-primary)" : "var(--text-tertiary)",
              }}
              onClick={() => setMode("create")}
            >
              Create Vault
            </button>
          </div>

          {recoverySuccess ? (
            /* After successful recovery, prompt for a new password */
            <form onSubmit={handleSetNewPassword} className="space-y-4">
              <p className="text-sm" style={{ color: "var(--success)" }}>
                Vault recovered successfully! Set a new password.
              </p>
              <div>
                <label htmlFor="new-pw" className="mb-1 block text-sm" style={{ color: "var(--text-secondary)" }}>New Password</label>
                <input
                  id="new-pw"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-secondary)" }}
                  autoFocus
                />
                <PasswordStrengthBar password={newPassword} />
              </div>
              <div>
                <label htmlFor="confirm-new-pw" className="mb-1 block text-sm" style={{ color: "var(--text-secondary)" }}>Confirm New Password</label>
                <input
                  id="confirm-new-pw"
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Confirm password"
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-secondary)" }}
                />
                {newPassword && confirmNewPassword && newPassword !== confirmNewPassword && (
                  <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>Passwords do not match</p>
                )}
              </div>
              {resetError && <p className="text-sm" style={{ color: "var(--danger)" }}>{resetError}</p>}
              <button
                type="submit"
                disabled={loading || !newPassword || newPassword !== confirmNewPassword}
                className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {loading ? "..." : "Set Password & Continue"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="vault-path" className="mb-1 block text-sm" style={{ color: "var(--text-secondary)" }}>Vault Location</label>
                <div className="flex gap-2">
                  <input
                    id="vault-path"
                    type="text"
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    placeholder="/Users/you/cortex-vault"
                    className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-secondary)" }}
                  />
                  <button
                    type="button"
                    onClick={handleBrowse}
                    className="flex-shrink-0 rounded-lg px-3 py-2 text-sm transition-colors hover:opacity-80"
                    style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-secondary)", border: "1px solid var(--border-secondary)" }}
                  >
                    Browse
                  </button>
                </div>
              </div>

              {mode === "open" && !useRecovery && (
                <div>
                  <label htmlFor="vault-password" className="mb-1 block text-sm" style={{ color: "var(--text-secondary)" }}>Password</label>
                  <input
                    ref={passwordRef}
                    id="vault-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter vault password"
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-secondary)" }}
                  />
                </div>
              )}

              {mode === "open" && useRecovery && (
                <div>
                  <label htmlFor="vault-recovery" className="mb-1 block text-sm" style={{ color: "var(--text-secondary)" }}>Recovery Key</label>
                  <textarea
                    id="vault-recovery"
                    value={recoveryInput}
                    onChange={(e) => setRecoveryInput(e.target.value)}
                    placeholder="Paste your recovery key"
                    rows={3}
                    className="w-full rounded-lg px-3 py-2 text-sm font-mono focus:outline-none resize-none"
                    style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-secondary)" }}
                  />
                </div>
              )}

              {mode === "open" && (
                <button
                  type="button"
                  onClick={() => { setUseRecovery(!useRecovery); setPassword(""); setRecoveryInput(""); }}
                  className="text-xs transition-colors hover:opacity-80"
                  style={{ color: "var(--accent)" }}
                >
                  {useRecovery ? "Use password instead" : "Forgot password? Use recovery key"}
                </button>
              )}

              {mode === "create" && (
                <>
                  <div>
                    <label htmlFor="vault-password" className="mb-1 block text-sm" style={{ color: "var(--text-secondary)" }}>Password</label>
                    <input
                      ref={passwordRef}
                      id="vault-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter vault password"
                      className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                      style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-secondary)" }}
                    />
                    <PasswordStrengthBar password={password} />
                  </div>
                  <div>
                    <label htmlFor="vault-confirm-password" className="mb-1 block text-sm" style={{ color: "var(--text-secondary)" }}>Confirm Password</label>
                    <input
                      id="vault-confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm password"
                      className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                      style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-secondary)" }}
                    />
                    {password && confirmPassword && password !== confirmPassword && (
                      <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>Passwords do not match</p>
                    )}
                  </div>
                </>
              )}

              {recoveryKey && <RecoveryKeyDisplay recoveryKey={recoveryKey} />}

              {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}

              <button
                type="submit"
                disabled={loading || !path || (mode === "open" && !useRecovery && !password) || (mode === "open" && useRecovery && !recoveryInput.trim()) || (mode === "create" && (!password || password !== confirmPassword))}
                className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {getSubmitLabel()}
              </button>
            </form>
          )}
        </div>
      </div>
      </div>
    </>
  );
}
