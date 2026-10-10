import type { GenerationRequest } from "../../ai-content/index.ts";
import type { AiGatewayGenerateOptions } from "../ai-gateway/client";
import type { CurrentVideo } from "../../types/learning";

export type LearningGenerationOptions<T = unknown> = AiGatewayGenerateOptions<T>;

export type GenerateContent = <T = unknown>(
  request: GenerationRequest,
  options?: LearningGenerationOptions<T>,
) => Promise<T>;

export type LearningLoadStage = "cache" | "generating" | "retrieving";

export interface LoadLearningContentOptions<T = unknown> {
  onStage?: (stage: LearningLoadStage) => void;
  onItems?: (items: T[]) => void;
  regenerate?: boolean;
}

export type LearningContentLoader<T> = (
  video: CurrentVideo,
  options?: LoadLearningContentOptions<T>,
) => Promise<T[]>;
