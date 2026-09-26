import { useCallback, useEffect, useState } from "react";
import type { LearningContentLoader } from "../../integrations/learning/types";
import type { CurrentVideo } from "../../types/learning";

type ContentLoadState<T> =
  | { status: "loading" }
  | { status: "ready"; items: T[] }
  | { status: "error"; message: string };

export function useGeneratedContent<T>(
  video: CurrentVideo,
  loadContent: LearningContentLoader<T>,
  resetProgress: () => void,
  fallbackErrorMessage: string,
) {
  const [loadState, setLoadState] = useState<ContentLoadState<T>>({ status: "loading" });
  const [generationRequest, setGenerationRequest] = useState({ regenerate: false, version: 0 });

  useEffect(() => {
    let active = true;
    setLoadState({ status: "loading" });
    resetProgress();
    void loadContent(video, { regenerate: generationRequest.regenerate })
      .then((items) => {
        if (active) {
          setLoadState({ status: "ready", items });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadState({
            status: "error",
            message: error instanceof Error ? error.message : fallbackErrorMessage,
          });
        }
      });
    // Cached requests can finish after a view switch; only UI updates are stopped.
    return () => {
      active = false;
    };
  }, [
    generationRequest.regenerate,
    generationRequest.version,
    loadContent,
    resetProgress,
    fallbackErrorMessage,
    video.channel,
    video.durationSec,
    video.language,
    video.title,
    video.videoId,
  ]);

  const requestContent = useCallback((regenerate: boolean) => {
    setGenerationRequest((request) => ({ regenerate, version: request.version + 1 }));
  }, []);
  const retry = useCallback(() => requestContent(false), [requestContent]);
  const regenerate = useCallback(() => requestContent(true), [requestContent]);

  return { loadState, retry, regenerate };
}
