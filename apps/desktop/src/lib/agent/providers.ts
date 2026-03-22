import type { LLMProvider } from "./types";

// ---------------------------------------------------------------------------
// DeepSeek
// ---------------------------------------------------------------------------

export class DeepSeekProvider implements LLMProvider {
  readonly name = "deepseek";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async complete(params: {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt },
        ],
        temperature: params.temperature ?? 0.3,
        max_tokens: params.maxTokens ?? 2048,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`DeepSeek API error (${res.status}): ${body}`);
    }

    const json = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    return json.choices[0]?.message?.content ?? "";
  }
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async complete(params: {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt },
        ],
        temperature: params.temperature ?? 0.3,
        max_tokens: params.maxTokens ?? 2048,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${body}`);
    }

    const json = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    return json.choices[0]?.message?.content ?? "";
  }
}

// ---------------------------------------------------------------------------
// Claude (Anthropic)
// ---------------------------------------------------------------------------

export class ClaudeProvider implements LLMProvider {
  readonly name = "anthropic";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async complete(params: {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        system: params.systemPrompt,
        messages: [{ role: "user", content: params.userPrompt }],
        temperature: params.temperature ?? 0.3,
        max_tokens: params.maxTokens ?? 2048,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${body}`);
    }

    const json = (await res.json()) as {
      content: Array<{ type: string; text: string }>;
    };

    const textBlock = json.content.find((b) => b.type === "text");
    return textBlock?.text ?? "";
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createProvider(name: string, apiKey: string): LLMProvider {
  switch (name) {
    case "deepseek":
      return new DeepSeekProvider(apiKey);
    case "openai":
      return new OpenAIProvider(apiKey);
    case "anthropic":
      return new ClaudeProvider(apiKey);
    default:
      throw new Error(`Unknown LLM provider: ${name}`);
  }
}
