import type { LLMProvider, ActionItem, PrioritizedItem } from "./types";
import { buildExtractionPrompt, buildPrioritizationPrompt } from "./prompts";

/**
 * Compute Jaccard similarity between two strings based on word sets.
 * Returns a value between 0 and 1.
 */
function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));

  if (setA.size === 0 && setB.size === 0) return 1;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Try to parse a JSON string, stripping any markdown code fences the LLM may
 * have wrapped it in.
 */
function safeParseJSON<T>(raw: string): T | null {
  try {
    // Strip markdown code fences if present
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

export class AgentService {
  private provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  setProvider(provider: LLMProvider): void {
    this.provider = provider;
  }

  /**
   * Full analysis pipeline:
   * 1. Extract action items from the markdown content
   * 2. Deduplicate against existing todo texts
   * 3. Prioritize the remaining items
   * 4. Return enriched PrioritizedItem[]
   */
  async analyze(
    markdown: string,
    sourceDocument: string,
    existingTodoTexts: string[] = [],
  ): Promise<PrioritizedItem[]> {
    // Step 1: Extract action items
    const extractionPrompt = buildExtractionPrompt(markdown);
    const extractionRaw = await this.provider.complete({
      systemPrompt: extractionPrompt.systemPrompt,
      userPrompt: extractionPrompt.userPrompt,
      temperature: 0.2,
    });

    const extracted = safeParseJSON<{ items: ActionItem[] }>(extractionRaw);
    if (!extracted?.items || extracted.items.length === 0) {
      return [];
    }

    // Step 2: Deduplicate against existing todos (Jaccard > 0.8 = duplicate)
    const uniqueItems = extracted.items.filter((item) => {
      return !existingTodoTexts.some(
        (existing) => jaccardSimilarity(item.text, existing) > 0.8,
      );
    });

    if (uniqueItems.length === 0) {
      return [];
    }

    // Step 3: Prioritize
    const today = new Date().toISOString().split("T")[0]!;
    const prioPrompt = buildPrioritizationPrompt(uniqueItems, today);
    const prioRaw = await this.provider.complete({
      systemPrompt: prioPrompt.systemPrompt,
      userPrompt: prioPrompt.userPrompt,
      temperature: 0.2,
    });

    const prioritized = safeParseJSON<{
      items: Array<{
        text: string;
        priority: "urgent" | "high" | "medium" | "low";
        dueDate: string | null;
      }>;
    }>(prioRaw);

    if (!prioritized?.items) {
      // Fallback: return items with medium priority if prioritization fails
      return uniqueItems.map((item) => ({
        id: crypto.randomUUID(),
        text: item.text,
        priority: "medium" as const,
        dueDate: null,
        sourceDocument,
        completed: false,
        createdAt: new Date().toISOString(),
      }));
    }

    // Step 4: Merge extraction + prioritization results
    return prioritized.items.map((item) => ({
      id: crypto.randomUUID(),
      text: item.text,
      priority: item.priority,
      dueDate: item.dueDate,
      sourceDocument,
      completed: false,
      createdAt: new Date().toISOString(),
    }));
  }
}
