import type { TranscriptSegment } from "../../types/api";
import type {
  ContentErrorResponse,
  ContentRequest,
  ContentResponse,
  YouTubeChapter,
  YouTubeTranscriptErrorCode,
  YouTubeVideoContext,
} from "../../types/messages";
import { isContentResponse } from "../../types/messages";

export interface ActiveVideoTranscript {
  chapters?: YouTubeChapter[];
  language: string;
  segments: TranscriptSegment[];
  videoId: string;
}

export class YouTubeTranscriptError extends Error {
  constructor(
    readonly code: YouTubeTranscriptErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "YouTubeTranscriptError";
  }
}

export function hasChromeExtensionRuntime(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id && chrome.tabs);
}

async function getActiveTabId(): Promise<number> {
  if (!hasChromeExtensionRuntime()) {
    throw new Error("Chrome Extension runtime không khả dụng.");
  }

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined) {
    throw new Error("Không tìm thấy tab đang hoạt động.");
  }
  return tab.id;
}

async function sendToTab(tabId: number, request: ContentRequest): Promise<ContentResponse> {
  const response: unknown = await chrome.tabs.sendMessage(tabId, request);
  if (!isContentResponse(response)) {
    throw new Error("Content script trả về dữ liệu không hợp lệ.");
  }
  return response;
}

async function sendToActiveTab(request: ContentRequest): Promise<ContentResponse> {
  return sendToTab(await getActiveTabId(), request);
}

function transcriptErrorFromResponse(response: ContentErrorResponse): YouTubeTranscriptError {
  const code: YouTubeTranscriptErrorCode =
    response.error === "INVALID_TIMESTAMP" ? "TRANSCRIPT_UNAVAILABLE" : response.error;
  const fallbackMessages: Record<YouTubeTranscriptErrorCode, string> = {
    INVALID_TRANSCRIPT: "Dữ liệu phụ đề YouTube không hợp lệ.",
    NETWORK_ERROR: "Không thể tải phụ đề từ YouTube.",
    NOT_YOUTUBE: "Tab hiện tại không phải là YouTube.",
    NO_TRANSCRIPT: "Video này không có phụ đề.",
    NO_VIDEO: "Không tìm thấy video YouTube đang phát.",
    STALE_VIDEO: "Video đã thay đổi trong lúc tải phụ đề.",
    TRANSCRIPT_UNAVAILABLE: "Phụ đề YouTube tạm thời không khả dụng.",
  };
  return new YouTubeTranscriptError(
    code,
    response.message || fallbackMessages[code],
    response.retryable ?? !["NOT_YOUTUBE", "NO_VIDEO", "NO_TRANSCRIPT"].includes(code),
  );
}

export async function getActiveVideoContext(): Promise<YouTubeVideoContext> {
  const response = await sendToActiveTab({ type: "YALA_GET_VIDEO_CONTEXT" });
  if (!response.ok || response.type !== "YALA_VIDEO_CONTEXT") {
    throw new Error(
      response.ok
        ? "Không đọc được video hiện tại."
        : response.message || "Hãy mở một video YouTube rồi thử lại.",
    );
  }
  return response.video;
}

export async function getActiveVideoTranscript(): Promise<ActiveVideoTranscript> {
  const tabId = await getActiveTabId();
  const contextResponse = await sendToTab(tabId, { type: "YALA_GET_VIDEO_CONTEXT" });
  if (!contextResponse.ok || contextResponse.type !== "YALA_VIDEO_CONTEXT") {
    if (!contextResponse.ok) {
      throw transcriptErrorFromResponse(contextResponse);
    }
    throw new YouTubeTranscriptError(
      "NO_VIDEO",
      "Không đọc được video YouTube hiện tại.",
      false,
    );
  }

  const expectedVideoId = contextResponse.video.videoId;
  const response = await sendToTab(tabId, {
    type: "YALA_GET_TRANSCRIPT",
    videoId: expectedVideoId,
  });
  if (!response.ok) {
    throw transcriptErrorFromResponse(response);
  }
  if (response.type !== "YALA_TRANSCRIPT") {
    throw new YouTubeTranscriptError(
      "INVALID_TRANSCRIPT",
      "Content script không trả về dữ liệu phụ đề.",
      true,
    );
  }

  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (
    activeTab?.id !== tabId ||
    response.transcript.videoId !== expectedVideoId
  ) {
    throw new YouTubeTranscriptError(
      "STALE_VIDEO",
      "Tab hoặc video đã thay đổi trong lúc tải phụ đề.",
      true,
    );
  }

  return {
    chapters: response.transcript.chapters?.map((chapter) => ({ ...chapter })) ?? [],
    language: response.transcript.language,
    segments: response.transcript.segments.map((segment) => ({ ...segment })),
    videoId: response.transcript.videoId,
  };
}

export async function seekActiveVideo(seconds: number): Promise<number> {
  const response = await sendToActiveTab({ type: "YALA_SEEK_TO", seconds });
  if (!response.ok || response.type !== "YALA_SEEKED") {
    throw new Error(
      response.ok
        ? "Không thể chuyển tới timestamp."
        : response.message || "Không tìm thấy trình phát YouTube.",
    );
  }
  return response.currentTimeSec;
}
