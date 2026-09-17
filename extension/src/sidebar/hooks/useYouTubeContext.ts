import { useCallback, useEffect, useRef, useState } from "react";
import {
  getActiveVideoContext,
  hasChromeExtensionRuntime,
  seekActiveVideo,
} from "../../integrations/youtube/client";
import type { AppNotice, CurrentVideo } from "../../types/learning";
import { isVideoChangedMessage, isVideoTimeChangedMessage } from "../../types/messages";

export type YouTubeContextState =
  | { status: "idle"; video?: undefined; message: string }
  | { status: "loading"; video?: CurrentVideo; message: string }
  | { status: "ready"; video: CurrentVideo; message: string }
  | { status: "unavailable" | "error"; video?: CurrentVideo; message: string };

const loadingState: YouTubeContextState = {
  status: "loading",
  message: "Đang nhận diện video YouTube…",
};

const idleState: YouTubeContextState = {
  status: "idle",
  message: "Video YouTube sẽ được nhận diện sau khi đăng nhập Google.",
};

export function useYouTubeContext(enabled = true) {
  const [state, setState] = useState<YouTubeContextState>(enabled ? loadingState : idleState);
  const [notice, setNotice] = useState<AppNotice | null>(null);
  const refreshRequestId = useRef(0);
  const activeVideoIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const requestId = ++refreshRequestId.current;
    if (!enabled) {
      activeVideoIdRef.current = null;
      setState(idleState);
      return;
    }
    if (!hasChromeExtensionRuntime()) {
      activeVideoIdRef.current = null;
      setState({
        status: "unavailable",
        message: "Mở Side Panel trên một tab YouTube để nhận diện video.",
      });
      return;
    }

    setState((current) => ({
      status: "loading",
      message: loadingState.message,
      ...(current.video ? { video: current.video } : {}),
    }));

    try {
      const context = await getActiveVideoContext();
      if (requestId !== refreshRequestId.current) {
        return;
      }
      activeVideoIdRef.current = context.videoId;
      setState({
        status: "ready",
        message: "Đã kết nối với video YouTube hiện tại.",
        video: {
          ...context,
          dataSource: "youtube",
          thumbnailLabel: "YOUTUBE",
        },
      });
    } catch (error) {
      if (requestId !== refreshRequestId.current) {
        return;
      }
      activeVideoIdRef.current = null;
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Không đọc được video YouTube hiện tại.",
      });
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
    return () => {
      refreshRequestId.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !hasChromeExtensionRuntime()) {
      return;
    }

    const listener = (message: unknown) => {
      if (isVideoChangedMessage(message)) {
        if (message.videoId !== activeVideoIdRef.current) {
          activeVideoIdRef.current = null;
          setState(loadingState);
        }
        void refresh();
        return;
      }
      if (isVideoTimeChangedMessage(message)) {
        setState((current) =>
          current.status === "ready" && current.video.videoId === message.videoId
            ? {
                ...current,
                video: {
                  ...current.video,
                  currentTimeSec: message.currentTimeSec,
                  durationSec: message.durationSec || current.video.durationSec,
                },
              }
            : current,
        );
      }
    };
    const tabActivatedListener = () => void refresh();
    const tabUpdatedListener = (
      _tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab,
    ) => {
      if (tab.active && changeInfo.status === "complete") {
        void refresh();
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    chrome.tabs.onActivated.addListener(tabActivatedListener);
    chrome.tabs.onUpdated.addListener(tabUpdatedListener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      chrome.tabs.onActivated.removeListener(tabActivatedListener);
      chrome.tabs.onUpdated.removeListener(tabUpdatedListener);
    };
  }, [enabled, refresh]);

  const seekTo = useCallback(async (seconds: number) => {
    const targetVideoId = activeVideoIdRef.current;
    if (!targetVideoId) {
      setNotice({ message: "Không còn video đang hoạt động.", tone: "error" });
      return;
    }
    try {
      const currentTimeSec = await seekActiveVideo(seconds, targetVideoId);
      if (targetVideoId !== activeVideoIdRef.current) {
        return;
      }
      setState((current) =>
        current.status === "ready" && current.video.videoId === targetVideoId
          ? { ...current, video: { ...current.video, currentTimeSec } }
          : current,
      );
      setNotice({
        message: `Đã chuyển video tới ${Math.floor(currentTimeSec)} giây.`,
        tone: "success",
      });
    } catch (error) {
      if (targetVideoId !== activeVideoIdRef.current) {
        return;
      }
      setNotice({
        message:
          error instanceof Error ? error.message : "Không thể chuyển video tới timestamp.",
        tone: "error",
      });
    }
  }, []);

  return {
    dismissNotice: () => setNotice(null),
    notice,
    refresh,
    seekTo,
    state,
  };
}
