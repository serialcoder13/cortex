import { useState, useCallback, useMemo } from "react";
import { useSettingsStore } from "@cortex/store";
import type { LlmProvider, ThemeName, ThemeMode } from "@cortex/store";
import { useTheme } from "../lib/hooks/useTheme";
import { storage } from "../lib/storage";

type PasswordStrength = "weak" | "fair" | "good" | "strong";

function getPasswordStrength(password: string): PasswordStrength {
  if (!password || password.length < 8) return "weak";
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  if (password.length >= 16 || (hasUpper && hasLower && hasNumber && hasSpecial)) return "strong";
  if (password.length >= 12) return "good";
  return "fair";
}

const STRENGTH_CONFIG: Record<PasswordStrength, { color: string; bg: string; width: string; label: string }> = {
  weak: { color: "text-red-400", bg: "bg-red-500", width: "w-1/4", label: "Weak" },
  fair: { color: "text-orange-400", bg: "bg-orange-500", width: "w-2/4", label: "Fair" },
  good: { color: "text-blue-400", bg: "bg-blue-500", width: "w-3/4", label: "Good" },
  strong: { color: "text-green-400", bg: "bg-green-500", width: "w-full", label: "Strong" },
};

function PasswordStrengthMeter({ password }: Readonly<{ password: string }>) {
  const strength = useMemo(() => getPasswordStrength(password), [password]);
  const config = STRENGTH_CONFIG[strength];
  if (!password) return null;
  return (
    <div className="mt-2">
      <div className="h-1 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--bg-tertiary)" }}>
        <div className={`h-full rounded-full transition-all duration-300 ${config.bg} ${config.width}`} />
      </div>
      <p className={`mt-1 text-xs ${config.color}`}>{config.label}</p>
    </div>
  );
}

const LLM_PROVIDERS: Array<{ value: LlmProvider; label: string }> = [
  { value: "deepseek", label: "DeepSeek" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Claude (Anthropic)" },
];

const API_KEY_FIELDS: Array<{
  provider: string;
  label: string;
  placeholder: string;
  prefix: string;
}> = [
  {
    provider: "deepseek",
    label: "DeepSeek API Key",
    placeholder: "sk-...",
    prefix: "sk-",
  },
  {
    provider: "openai",
    label: "OpenAI API Key",
    placeholder: "sk-...",
    prefix: "sk-",
  },
  {
    provider: "anthropic",
    label: "Anthropic API Key",
    placeholder: "sk-ant-...",
    prefix: "sk-ant-",
  },
];

const THEMES: Array<{ value: ThemeName; label: string; description: string }> = [
  { value: "default", label: "Default", description: "Clean neutral palette" },
  { value: "nord", label: "Nord", description: "Arctic, north-bluish" },
  { value: "solarized", label: "Solarized", description: "Precision colors for machines and people" },
  { value: "dracula", label: "Dracula", description: "Dark purple tones" },
  { value: "monokai", label: "Monokai", description: "Warm, vibrant coding classic" },
  { value: "gruvbox", label: "Gruvbox", description: "Retro groove colors" },
  { value: "catppuccin", label: "Catppuccin", description: "Soothing pastel palette" },
  { value: "rose-pine", label: "Rosé Pine", description: "All natural pine, faux rosé" },
];

const MODES: Array<{ value: ThemeMode; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

type TestResult = "idle" | "testing" | "pass" | "fail";

function ApiKeyInput({
  label,
  placeholder,
  value,
  onChange,
  prefix,
}: Readonly<{
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  prefix: string;
}>) {
  const [visible, setVisible] = useState(false);
  const [testResult, setTestResult] = useState<TestResult>("idle");

  const handleTest = () => {
    if (!value.trim()) {
      setTestResult("fail");
      setTimeout(() => setTestResult("idle"), 2000);
      return;
    }

    setTestResult("testing");

    setTimeout(() => {
      const valid = value.startsWith(prefix) && value.length > prefix.length + 4;
      setTestResult(valid ? "pass" : "fail");
      setTimeout(() => setTestResult("idle"), 3000);
    }, 500);
  };

  return (
    <div>
      <label className="mb-1 block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={visible ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg px-3 py-2 pr-16 text-sm focus:outline-none"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-secondary)",
            }}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs"
            style={{ color: "var(--text-tertiary)" }}
          >
            {visible ? "Hide" : "Show"}
          </button>
        </div>
        <button
          type="button"
          onClick={handleTest}
          disabled={testResult === "testing"}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs transition-colors disabled:opacity-50"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-secondary)",
          }}
        >
          {testResult === "testing" && (
            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {testResult === "pass" && (
            <svg className="h-3.5 w-3.5" style={{ color: "var(--success)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {testResult === "fail" && (
            <svg className="h-3.5 w-3.5" style={{ color: "var(--danger)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )}
          <span>
            {testResult === "idle" && "Test"}
            {testResult === "testing" && "Testing..."}
            {testResult === "pass" && "Valid"}
            {testResult === "fail" && "Invalid"}
          </span>
        </button>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  children,
  variant = "default",
}: Readonly<{
  title: string;
  children: React.ReactNode;
  variant?: "default" | "danger";
}>) {
  return (
    <section
      className="rounded-xl p-6 transition-colors"
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: `1px solid ${variant === "danger" ? "var(--danger)" : "var(--border-primary)"}`,
      }}
    >
      <h3
        className="mb-4 text-lg font-semibold"
        style={{ color: variant === "danger" ? "var(--danger)" : "var(--text-primary)" }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function SectionDivider() {
  return <div style={{ borderTop: "1px solid var(--border-primary)" }} />;
}

export function SettingsPage({ onClose }: Readonly<{ onClose?: () => void }>) {
  const vaultPath = useSettingsStore((s) => s.vaultPath);
  const llmProvider = useSettingsStore((s) => s.llmProvider);
  const setLlmProvider = useSettingsStore((s) => s.setLlmProvider);
  const apiKeys = useSettingsStore((s) => s.apiKeys);
  const setApiKey = useSettingsStore((s) => s.setApiKey);
  const autoOrganize = useSettingsStore((s) => s.autoOrganize);
  const setAutoOrganize = useSettingsStore((s) => s.setAutoOrganize);

  const { themeName, themeMode, setThemeName, setThemeMode } = useTheme();

  const handleProviderChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setLlmProvider(e.target.value as LlmProvider);
    },
    [setLlmProvider],
  );

  // ---- Change password state ----
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const handleChangePassword = useCallback(async () => {
    if (!currentPassword || !newPassword) {
      setPasswordStatus({ type: "error", message: "Please fill in all fields." });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordStatus({ type: "error", message: "New password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: "error", message: "New passwords do not match." });
      return;
    }
    setChangingPassword(true);
    setPasswordStatus(null);
    try {
      await storage.changePassword(currentPassword, newPassword);
      setPasswordStatus({ type: "success", message: "Password changed successfully." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPasswordStatus({ type: "error", message: msg || "Failed to change password." });
    } finally {
      setChangingPassword(false);
    }
  }, [currentPassword, newPassword, confirmPassword]);

  return (
    <div className="mx-auto max-w-2xl p-6 overflow-y-auto h-full">
      <div className="flex items-center gap-3 mb-6">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md transition-colors hover:opacity-80"
            style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-tertiary)" }}
            title="Back"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        <h2 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Settings
        </h2>
      </div>

      <div className="space-y-6">
        {/* Theme */}
        <SectionCard title="Theme">
          <div className="space-y-4">
            {/* Theme palette */}
            <div>
              <label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Color Theme</label>
              <div className="grid grid-cols-2 gap-2">
                {THEMES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setThemeName(t.value)}
                    className="rounded-lg px-3 py-2 text-left text-sm transition-colors"
                    style={{
                      backgroundColor: themeName === t.value ? "var(--accent-muted)" : "var(--bg-tertiary)",
                      border: `1px solid ${themeName === t.value ? "var(--accent)" : "var(--border-secondary)"}`,
                      color: "var(--text-primary)",
                    }}
                  >
                    <span className="font-medium">{t.label}</span>
                    <span className="block text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{t.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Appearance mode */}
            <div>
              <label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Appearance</label>
              <div className="flex gap-2">
                {MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setThemeMode(m.value)}
                    className="rounded-lg px-4 py-2 text-sm font-medium capitalize transition-colors"
                    style={{
                      backgroundColor: themeMode === m.value ? "var(--accent)" : "var(--bg-tertiary)",
                      color: themeMode === m.value ? "#ffffff" : "var(--text-secondary)",
                      border: themeMode === m.value ? "none" : "1px solid var(--border-secondary)",
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionDivider />

        {/* Storage Backend */}
        <SectionCard title="Storage Backend">
          <div className="space-y-3">
            <div>
              <label htmlFor="vault-path" className="mb-1 block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                Vault Path
              </label>
              <span
                id="vault-path"
                className="block truncate rounded-lg px-3 py-2 text-sm"
                style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-tertiary)", border: "1px solid var(--border-secondary)" }}
              >
                {vaultPath ?? "No vault open"}
              </span>
            </div>
          </div>
        </SectionCard>

        <SectionDivider />

        {/* LLM Provider */}
        <SectionCard title="LLM Provider">
          <div>
            <label htmlFor="llm-provider" className="mb-1 block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Active Provider
            </label>
            <select
              id="llm-provider"
              value={llmProvider}
              onChange={handleProviderChange}
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-secondary)",
              }}
            >
              {LLM_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </SectionCard>

        <SectionDivider />

        {/* API Keys */}
        <SectionCard title="API Keys">
          <div className="space-y-4">
            {API_KEY_FIELDS.map((field) => (
              <ApiKeyInput
                key={field.provider}
                label={field.label}
                placeholder={field.placeholder}
                prefix={field.prefix}
                value={apiKeys[field.provider] ?? ""}
                onChange={(value) => setApiKey(field.provider, value)}
              />
            ))}
          </div>
        </SectionCard>

        <SectionDivider />

        {/* Auto-Organization */}
        <SectionCard title="Auto-Organization">
          <div className="flex items-start gap-4">
            <button
              type="button"
              role="switch"
              aria-checked={autoOrganize}
              onClick={() => setAutoOrganize(!autoOrganize)}
              className="relative mt-0.5 inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
              style={{ backgroundColor: autoOrganize ? "var(--accent)" : "var(--bg-active)" }}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  autoOrganize ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Enable Auto-Organization Agent
              </p>
              <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                When enabled, the agent automatically scans your documents for
                action items (TODOs, deadlines, imperatives) and adds them to
                your global todo list with prioritization. The agent uses your
                selected LLM provider and requires a valid API key.
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionDivider />

        {/* Change Password */}
        <SectionCard title="Security">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}
                placeholder="Enter current password"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}
                placeholder="At least 8 characters"
              />
              <PasswordStrengthMeter password={newPassword} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}
                placeholder="Re-enter new password"
              />
            </div>
            {passwordStatus && (
              <p className="text-xs" style={{ color: passwordStatus.type === "success" ? "var(--success)" : "var(--danger)" }}>
                {passwordStatus.message}
              </p>
            )}
            <button
              type="button"
              disabled={changingPassword}
              onClick={handleChangePassword}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {changingPassword ? "Changing..." : "Change Password"}
            </button>
          </div>
        </SectionCard>

      </div>
    </div>
  );
}
