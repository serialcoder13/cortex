export interface LLMProvider {
  name: string;
  complete(params: {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string>;
  isConfigured(): boolean;
}

export interface ActionItem {
  text: string;
  contextSnippet: string;
}

export interface PrioritizedItem {
  id: string;
  text: string;
  priority: "urgent" | "high" | "medium" | "low";
  dueDate: string | null;
  sourceDocument: string;
  completed: boolean;
  createdAt: string;
}
