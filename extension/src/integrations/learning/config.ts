import type { LearningGenerationOptions } from "./types";

export const QUIZ_GENERATION_COUNT = 6;
export const FLASHCARD_GENERATION_COUNT = 6;
export const RETRIEVAL_MAX_RESULTS = 6;

// Bump keys when generation policy changes so an old deck cannot mask the new output.
export const QUIZ_STORAGE_PREFIX = "yala:quiz-cache:v3:";
export const FLASHCARD_STORAGE_PREFIX = "yala:flashcard-cache:v2:";

const SHARED_GENERATION_OPTIONS = {
  maxRetries: 1,
  thinkingLevel: "LOW",
} as const;

export const LEARNING_GENERATION_OPTIONS = {
  quiz: { ...SHARED_GENERATION_OPTIONS, maxOutputTokens: 6_144, temperature: 0.1 },
  flashcard: { ...SHARED_GENERATION_OPTIONS, maxOutputTokens: 2_048, temperature: 0.1 },
  review: { ...SHARED_GENERATION_OPTIONS, maxOutputTokens: 3_072 },
} satisfies Record<string, LearningGenerationOptions>;
