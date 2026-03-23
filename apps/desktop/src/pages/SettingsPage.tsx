import { useState, useCallback } from "react";
import { useSettingsStore } from "@cortex/store";
import type { LlmProvider } from "@cortex/store";
import { useTheme } from "../lib/hooks/useTheme";

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

    // Validate key format
    setTimeout(() => {
      const valid = value.startsWith(prefix) && value.length > prefix.length + 4;
      setTestResult(valid ? "pass" : "fail");
      setTimeout(() => setTestResult("idle"), 3000);
    }, 500);
  };

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-neutral-300">
        {label}
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={visible ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 pr-16 text-sm text-neutral-100 placeholder-neutral-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200"
          >
            {visible ? "Hide" : "Show"}
          </button>
        </div>
        <button
          type="button"
          onClick={handleTest}
          disabled={testResult === "testing"}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-neutral-100 disabled:opacity-50"
        >
          {testResult === "testing" && (
            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {testResult === "pass" && (
            <svg className="h-3.5 w-3.5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {testResult === "fail" && (
            <svg className="h-3.5 w-3.5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
  const borderClass = variant === "danger"
    ? "border-red-900/50 hover:border-red-800/60"
    : "border-neutral-800";

  return (
    <section className={`rounded-xl border bg-neutral-900 p-6 transition-colors ${borderClass}`}>
      <h3
        className={`mb-4 text-lg font-semibold ${
          variant === "danger" ? "text-red-400" : "text-neutral-100"
        }`}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function SectionDivider() {
  return <div className="border-t border-neutral-800/50" />;
}

function LockConfirmation({ onConfirm, onCancel }: Readonly<{ onConfirm: () => void; onCancel: () => void }>) {
  return (
    <div className="mt-3 rounded-lg border border-red-900/50 bg-red-950/20 p-4">
      <p className="mb-3 text-sm text-red-300">
        Are you sure? Unsaved changes will be lost.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-1.5 text-sm text-neutral-300 transition-colors hover:bg-neutral-700"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-500"
        >
          Confirm Lock
        </button>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const vaultPath = useSettingsStore((s) => s.vaultPath);
  const llmProvider = useSettingsStore((s) => s.llmProvider);
  const setLlmProvider = useSettingsStore((s) => s.setLlmProvider);
  const apiKeys = useSettingsStore((s) => s.apiKeys);
  const setApiKey = useSettingsStore((s) => s.setApiKey);
  const autoOrganize = useSettingsStore((s) => s.autoOrganize);
  const setAutoOrganize = useSettingsStore((s) => s.setAutoOrganize);

  const { theme, setTheme } = useTheme();

  const [showLockConfirm, setShowLockConfirm] = useState(false);

  const handleProviderChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setLlmProvider(e.target.value as LlmProvider);
    },
    [setLlmProvider],
  );

  const handleLockVault = () => {
    globalThis.dispatchEvent(new CustomEvent("cortex:lock-vault"));
    setShowLockConfirm(false);
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h2 className="mb-6 text-2xl font-semibold text-neutral-100">
        Settings
      </h2>

      <div className="space-y-6">
        {/* Theme */}
        <SectionCard title="Theme">
          <div className="flex gap-2">
            {(["light", "dark", "system"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition-colors ${
                  theme === t
                    ? "bg-blue-600 text-white"
                    : "border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionDivider />

        {/* Storage Backend */}
        <SectionCard title="Storage Backend">
          <div className="space-y-3">
            <div>
              <label htmlFor="vault-path" className="mb-1 block text-sm font-medium text-neutral-300">
                Vault Path
              </label>
              <span id="vault-path" className="block truncate rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-400">
                {vaultPath ?? "No vault open"}
              </span>
            </div>
          </div>
        </SectionCard>

        <SectionDivider />

        {/* LLM Provider */}
        <SectionCard title="LLM Provider">
          <div>
            <label htmlFor="llm-provider" className="mb-1 block text-sm font-medium text-neutral-300">
              Active Provider
            </label>
            <select
              id="llm-provider"
              value={llmProvider}
              onChange={handleProviderChange}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
              className={`relative mt-0.5 inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                autoOrganize ? "bg-blue-600" : "bg-neutral-700"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  autoOrganize ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
            <div>
              <p className="text-sm font-medium text-neutral-200">
                Enable Auto-Organization Agent
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                When enabled, the agent automatically scans your documents for
                action items (TODOs, deadlines, imperatives) and adds them to
                your global todo list with prioritization. The agent uses your
                selected LLM provider and requires a valid API key.
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionDivider />

        {/* Danger Zone */}
        <SectionCard title="Danger Zone" variant="danger">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-200">Lock Vault</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  Locks the vault and returns to the unlock screen.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-red-800/60 bg-red-950/30 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-900/40 hover:text-red-300"
                onClick={() => setShowLockConfirm((v) => !v)}
              >
                Lock Vault
              </button>
            </div>
            {showLockConfirm && (
              <LockConfirmation
                onConfirm={handleLockVault}
                onCancel={() => setShowLockConfirm(false)}
              />
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
