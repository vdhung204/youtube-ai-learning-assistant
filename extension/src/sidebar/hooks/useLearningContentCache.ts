import { useCallback, useRef } from "react";
import {
  generateFlashcards,
  generateQuiz,
  type GenerateContent,
} from "../../integrations/learning/pipeline";
import {
  loadCachedContent,
  type LearningContentCache,
} from "../../integrations/learning/cache";
import {
  FLASHCARD_STORAGE_PREFIX,
  QUIZ_STORAGE_PREFIX,
} from "../../integrations/learning/config";
import type { LearningContentLoader } from "../../integrations/learning/types";
import type { Question } from "../../types/api";
import type { Flashcard } from "../../types/learning";

export function useLearningContentCache(generateContent: GenerateContent) {
  const quizCache = useRef<LearningContentCache<Question>>(new Map());
  const flashcardCache = useRef<LearningContentCache<Flashcard>>(new Map());
  const generateContentRef = useRef(generateContent);
  generateContentRef.current = generateContent;

  const loadQuiz = useCallback<LearningContentLoader<Question>>((video, options = {}) => (
    loadCachedContent({
      cache: quizCache.current,
      storagePrefix: QUIZ_STORAGE_PREFIX,
      videoId: video.videoId,
      generate: () => generateQuiz(video, generateContentRef.current),
      regenerate: options.regenerate,
    })
  ), []);

  const loadFlashcards = useCallback<LearningContentLoader<Flashcard>>((video, options = {}) => (
    loadCachedContent({
      cache: flashcardCache.current,
      storagePrefix: FLASHCARD_STORAGE_PREFIX,
      videoId: video.videoId,
      generate: () => generateFlashcards(video, generateContentRef.current),
      regenerate: options.regenerate,
    })
  ), []);

  return { loadFlashcards, loadQuiz };
}
