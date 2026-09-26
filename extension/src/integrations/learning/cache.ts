import type { LoadLearningContentOptions } from "./types";

export type LearningContentCache<T> = Map<string, Promise<T[]>>;

interface CachedContentRequest<T> extends LoadLearningContentOptions {
  cache: LearningContentCache<T>;
  storagePrefix: string;
  videoId: string;
  generate: () => Promise<T[]>;
}

function removeStored(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // The in-memory cache remains available.
  }
}

function readStoredArray<T>(key: string): T[] | undefined {
  try {
    const value = localStorage.getItem(key);
    if (!value) {
      return undefined;
    }
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed as T[];
    }
    removeStored(key);
  } catch {
    removeStored(key);
  }
  return undefined;
}

function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The in-memory cache still works when extension storage is unavailable/full.
  }
}

export function loadCachedContent<T>({
  cache,
  storagePrefix,
  videoId,
  generate,
  regenerate = false,
}: CachedContentRequest<T>): Promise<T[]> {
  const storageKey = `${storagePrefix}${videoId}`;
  if (!regenerate) {
    const cachedRequest = cache.get(videoId);
    if (cachedRequest) {
      return cachedRequest;
    }
    const storedContent = readStoredArray<T>(storageKey);
    if (storedContent) {
      const storedRequest = Promise.resolve(storedContent);
      cache.set(videoId, storedRequest);
      return storedRequest;
    }
  }

  const previousRequest = cache.get(videoId);
  const generationRequest = generate().then((value) => {
    writeStored(storageKey, value);
    return value;
  });
  cache.set(videoId, generationRequest);
  void generationRequest.catch(() => {
    // Keep the last good deck after a failed regeneration. This gives the user
    // something usable without spending another request just to recover it.
    if (cache.get(videoId) === generationRequest) {
      if (previousRequest) {
        cache.set(videoId, previousRequest);
      } else {
        cache.delete(videoId);
      }
    }
  });
  return generationRequest;
}
