import type { LearningGenerationOptions } from "./types";

// Per provider request, not per chapter/video. A section may need multiple requests.
export const QUIZ_GENERATION_COUNT = 10;
export const FLASHCARD_GENERATION_COUNT = 10;
export const RETRIEVAL_MAX_RESULTS = 6;

// Bump keys when generation policy changes so an old deck cannot mask the new output.
export const QUIZ_STORAGE_PREFIX = "yala:quiz-cache:v4:chapter:";
export const FLASHCARD_STORAGE_PREFIX = "yala:flashcard-cache:v3:chapter:";

const SHARED_GENERATION_OPTIONS = {
  maxRetries: 0,
  timeoutMs: 35_000,
} as const;

export const LEARNING_GENERATION_OPTIONS = {
  quiz: { ...SHARED_GENERATION_OPTIONS },
  flashcard: { ...SHARED_GENERATION_OPTIONS },
  review: { ...SHARED_GENERATION_OPTIONS },
} satisfies Record<string, LearningGenerationOptions>;
