export interface GeminiPromptInput {
  systemInstruction: string;
  userContent: string;
  responseSchema: Record<string, unknown>;
}

export type GeminiResponseValidator<T> = (response: unknown) => T;

export type GeminiThinkingLevel = "LOW" | "MEDIUM" | "HIGH";

export interface GeminiGenerateOptions<T = unknown> {
  fallbackModels?: string[];
  maxRetries?: number;
  maxOutputTokens?: number;
  model?: string;
  projectId?: string;
  signal?: AbortSignal;
  temperature?: number;
  thinkingLevel?: GeminiThinkingLevel;
  validate?: GeminiResponseValidator<T>;
}

export interface GeminiModelOptions {
  maxRetries?: number;
  preferredModel?: string;
  projectId?: string;
  signal?: AbortSignal;
}
