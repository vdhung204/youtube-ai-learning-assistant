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
import type { LearningContentLoader, LoadLearningContentOptions } from "../../integrations/learning/types";
import type { Question } from "../../types/api";
import type { Flashcard } from "../../types/learning";
import { learningScopeKey } from "../../integrations/learning/sections";

export function useLearningContentCache(generateContent: GenerateContent) {
  const quizCache = useRef<LearningContentCache<Question>>(new Map());
  const flashcardCache = useRef<LearningContentCache<Flashcard>>(new Map());
  const quizPages = useRef<LearningContentCache<Question>>(new Map());
  const flashcardPages = useRef<LearningContentCache<Flashcard>>(new Map());
  const flashcardProgress = useRef(new Map<string, {
    items: Flashcard[];
    listeners: Set<LoadLearningContentOptions<Flashcard>>;
  }>());
  const generateContentRef = useRef(generateContent);
  generateContentRef.current = generateContent;

  const loadQuiz = useCallback<LearningContentLoader<Question>>((video, options = {}) => (
    loadCachedContent({
      cache: quizCache.current,
      storagePrefix: QUIZ_STORAGE_PREFIX,
      videoId: learningScopeKey(video),
      generate: () => generateQuiz(video, generateContentRef.current, undefined, options.onStage, options.regenerate, quizPages.current),
      regenerate: options.regenerate,
    })
  ), []);

  const loadFlashcards = useCallback<LearningContentLoader<Flashcard>>(async (video, options = {}) => {
    const key = learningScopeKey(video);
    let progress = flashcardProgress.current.get(key);
    if (!progress) {
      progress = { items: [], listeners: new Set() };
      flashcardProgress.current.set(key, progress);
    }
    if (options.regenerate) progress.items = [];
    progress.listeners.add(options);
    if (progress.items.length) options.onItems?.(progress.items);
    const currentProgress = progress;
    try {
      return await loadCachedContent({
      cache: flashcardCache.current,
      storagePrefix: FLASHCARD_STORAGE_PREFIX,
      videoId: key,
      generate: () => generateFlashcards(video, generateContentRef.current, undefined,
        stage => currentProgress.listeners.forEach(listener => listener.onStage?.(stage)),
        options.regenerate, flashcardPages.current, items => {
          currentProgress.items = items;
          currentProgress.listeners.forEach(listener => listener.onItems?.(items));
        }),
      regenerate: options.regenerate,
      });
    } finally {
      currentProgress.listeners.delete(options);
    }
  }, []);

  return { loadFlashcards, loadQuiz };
}
