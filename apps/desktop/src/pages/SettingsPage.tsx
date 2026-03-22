import { useState, useCallback } from "react";
import { useSettingsStore } from "@cortex/store";
import type { LlmProvider } from "@cortex/store";

const LLM_PROVIDERS: Array<{ value: LlmProvider; label: string }> = [
  { value: "deepseek", label: "DeepSeek" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Claude (Anthropic)" },
];

const API_KEY_FIELDS: Array<{
  provider: string;
  label: string;
  placeholder: string;
}> = [
  {
    provider: "deepseek",
    label: "DeepSeek API Key",
    placeholder: "sk-...",
  },
  {
    provider: "openai",
    label: "OpenAI API Key",
    placeholder: "sk-...",
  },
  {
    provider: "anthropic",
    label: "Anthropic API Key",
    placeholder: "sk-ant-...",
  },
];

function ApiKeyInput({
  label,
  placeholder,
  value,
  onChange,
}: Readonly<{
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}>) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-neutral-300">
        {label}
      </label>
      <div className="relative">
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
    </div>
  );
}

function SectionCard({
  title,
  children,
}: Readonly<{
  title: string;
  children: React.ReactNode;
}>) {
  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
      <h3 className="mb-4 text-lg font-semibold text-neutral-100">{title}</h3>
      {children}
    </section>
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

  const handleProviderChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setLlmProvider(e.target.value as LlmProvider);
    },
    [setLlmProvider],
  );

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h2 className="mb-6 text-2xl font-semibold text-neutral-100">
        Settings
      </h2>

      <div className="space-y-6">
        {/* Storage Backend */}
        <SectionCard title="Storage Backend">
          <div className="space-y-3">
            <div>
              <label htmlFor="vault-path" className="mb-1 block text-sm font-medium text-neutral-300">
                Vault Path
              </label>
              <div className="flex items-center gap-3">
                <span id="vault-path" className="flex-1 truncate rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-400">
                  {vaultPath ?? "No vault open"}
                </span>
                <button
                  type="button"
                  className="rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-neutral-100"
                  onClick={() => {
                    // Vault lock is handled by the useVault hook in App.tsx.
                    // This button dispatches a custom event that the parent can listen for.
                    globalThis.dispatchEvent(new CustomEvent("cortex:lock-vault"));
                  }}
                >
                  Lock Vault
                </button>
              </div>
            </div>
          </div>
        </SectionCard>

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

        {/* API Keys */}
        <SectionCard title="API Keys">
          <div className="space-y-4">
            {API_KEY_FIELDS.map((field) => (
              <ApiKeyInput
                key={field.provider}
                label={field.label}
                placeholder={field.placeholder}
                value={apiKeys[field.provider] ?? ""}
                onChange={(value) => setApiKey(field.provider, value)}
              />
            ))}
          </div>
        </SectionCard>

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
      </div>
    </div>
  );
}
