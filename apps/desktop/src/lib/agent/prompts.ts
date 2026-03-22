import type { ActionItem } from "./types";

/**
 * Build a prompt that instructs the LLM to extract action items from markdown
 * content. The response must be valid JSON.
 */
export function buildExtractionPrompt(content: string): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `You are an action-item extraction assistant. Your job is to find every actionable task embedded in a document.

Look for:
- Explicit TODOs (e.g. "TODO:", "- [ ]", "FIXME:")
- Phrases like "need to", "should", "must", "have to", "remember to"
- Imperative statements that imply work (e.g. "Send the report", "Update the config")
- Deadlines and time-sensitive references (e.g. "by Friday", "due March 5")

For each action item, return the exact task text and a short surrounding context snippet (1-2 sentences around the item so the user can locate it in the original document).

You MUST respond with valid JSON only. No markdown fences, no explanation. Use this exact schema:
{
  "items": [
    {
      "text": "concise description of the action item",
      "contextSnippet": "the surrounding sentence(s) from the document"
    }
  ]
}

If there are no action items, return: { "items": [] }`;

  const userPrompt = `Extract all action items from the following document:\n\n${content}`;

  return { systemPrompt, userPrompt };
}

/**
 * Build a prompt that instructs the LLM to assign priority levels and due
 * dates to a list of previously-extracted action items.
 */
export function buildPrioritizationPrompt(
  items: ActionItem[],
  today: string,
): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `You are a task prioritization assistant. Given a list of action items, assign each one:
1. A priority level: "urgent", "high", "medium", or "low"
   - urgent: explicitly time-sensitive, overdue, or blocking other work
   - high: important and should be done soon
   - medium: normal importance, no immediate deadline
   - low: nice-to-have, minor, or long-term
2. A due date (ISO 8601 date string, e.g. "2025-03-15") if one can be inferred from the context, otherwise null.

Today's date is ${today}.

You MUST respond with valid JSON only. No markdown fences, no explanation. Use this exact schema:
{
  "items": [
    {
      "text": "the action item text (unchanged)",
      "priority": "urgent" | "high" | "medium" | "low",
      "dueDate": "YYYY-MM-DD" | null
    }
  ]
}

Return exactly as many items as were provided, in the same order.`;

  const userPrompt = `Prioritize these action items:\n\n${JSON.stringify(items, null, 2)}`;

  return { systemPrompt, userPrompt };
}
