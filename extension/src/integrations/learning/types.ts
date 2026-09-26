import type { PromptRequest } from "../../ai-content/index.ts";
import type { GeminiGenerateOptions } from "../gemini/client";
import type { CurrentVideo } from "../../types/learning";

export type LearningGenerationOptions<T = unknown> = Omit<
  GeminiGenerateOptions<T>,
  "fallbackModels" | "model" | "projectId"
>;

export type GenerateContent = <T = unknown>(
  prompt: PromptRequest,
  options?: LearningGenerationOptions<T>,
) => Promise<T>;

export interface LoadLearningContentOptions {
  regenerate?: boolean;
}

export type LearningContentLoader<T> = (
  video: CurrentVideo,
  options?: LoadLearningContentOptions,
) => Promise<T[]>;
