import { vi } from "vitest";

export const TEST_EXTENSION_ID = "a".repeat(32);
export const TEST_VIDEO_ID = "dQw4w9WgXcQ";

export const TEST_VIDEO_CONTEXT = {
  channel: "Kênh kiểm thử",
  currentTimeSec: 12,
  durationSec: 300,
  language: "vi",
  thumbnailUrl: `https://i.ytimg.com/vi/${TEST_VIDEO_ID}/hqdefault.jpg`,
  title: "Video YouTube đang mở",
  videoId: TEST_VIDEO_ID,
} as const;

export const TEST_TRANSCRIPT = {
  chapters: [
    { startSec: 0, title: "Giới thiệu RAG" },
    { startSec: 42, title: "Kết hợp truy xuất và mô hình ngôn ngữ" },
    { startSec: 56, title: "Retriever chọn ngữ cảnh liên quan" },
  ],
  language: "vi",
  segments: [
    {
      endSec: 55,
      position: 0,
      startSec: 42,
      text: "Retrieval-augmented generation combines retrieval with a language model to ground answers in source context.",
    },
    {
      endSec: 72,
      position: 1,
      startSec: 56,
      text: "A retriever selects relevant passages before the generator writes its response.",
    },
  ],
  videoId: TEST_VIDEO_ID,
} as const;

interface ChromeMockOptions {
  sendMessage?: ReturnType<typeof vi.fn>;
}

interface LearningChromeMockOptions {
  noTranscript?: boolean;
  sendMessage?: ReturnType<typeof vi.fn>;
}

export function createLearningChromeMock(options: LearningChromeMockOptions = {}) {
  const sendMessage = options.sendMessage ?? vi.fn(
    async (_tabId: number, message: { seconds?: number; type: string; videoId?: string }) => {
      if (message.type === "YALA_GET_VIDEO_CONTEXT") {
        return { ok: true, type: "YALA_VIDEO_CONTEXT", video: TEST_VIDEO_CONTEXT };
      }
      if (message.type === "YALA_GET_TRANSCRIPT") {
        if (options.noTranscript) {
          return {
            error: "NO_TRANSCRIPT",
            message: "Video này không có phụ đề.",
            ok: false,
            retryable: false,
            videoId: TEST_VIDEO_ID,
          };
        }
        return { ok: true, transcript: TEST_TRANSCRIPT, type: "YALA_TRANSCRIPT" };
      }
      if (message.type === "YALA_SEEK_TO") {
        return { currentTimeSec: message.seconds ?? 0, ok: true, type: "YALA_SEEKED" };
      }
      throw new Error(`Unsupported content message: ${message.type}`);
    },
  );
  const chromeMock = createChromeMock({ sendMessage });
  chromeMock.tabs.query.mockResolvedValue([
    {
      active: true,
      id: 7,
      url: `https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`,
    },
  ]);
  return chromeMock;
}

export function createChromeMock(options: ChromeMockOptions = {}) {
  return {
    runtime: {
      getManifest: () => ({
        manifest_version: 3,
        name: "YouTube AI Learning Assistant",
        version: "0.1.0",
      }),
      getURL: () => `chrome-extension://${TEST_EXTENSION_ID}/`,
      id: TEST_EXTENSION_ID,
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    tabs: {
      onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
      query: vi.fn().mockResolvedValue([]),
      sendMessage: options.sendMessage ?? vi.fn(),
    },
  };
}

interface LearningFetchMockOptions {
  noContext?: boolean;
  service?: "ready" | "not_ready" | "offline";
}

const retrievedChunks = [
  {
    chunkId: "chunk-1",
    endSec: 55,
    position: 0,
    score: 0.95,
    startSec: 42,
    text: TEST_TRANSCRIPT.segments[0].text,
    videoId: TEST_VIDEO_ID,
  },
  {
    chunkId: "chunk-2",
    endSec: 72,
    position: 1,
    score: 0.9,
    startSec: 56,
    text: TEST_TRANSCRIPT.segments[1].text,
    videoId: TEST_VIDEO_ID,
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function generatedItems(task: "answers" | "flashcards" | "questions") {
  if (task === "answers") {
    return [{
      answer: "RAG kết hợp bước truy xuất với mô hình ngôn ngữ để câu trả lời bám vào nguồn.",
      evidence: "combines retrieval with a language model",
      sourceChunkId: "chunk-1",
      topic: "RAG",
    }];
  }
  if (task === "flashcards") {
    return Array.from({ length: 6 }, (_, index) => ({
      back: `Kết hợp truy xuất với mô hình ngôn ngữ để câu trả lời bám nguồn (${index + 1}).`,
      evidence: "combines retrieval with a language model",
      front: `RAG kết hợp hai bước nào? Thẻ ${index + 1}`,
      sourceChunkId: "chunk-1",
      topic: "RAG",
    }));
  }
  return [
    {
      correctAnswer: 0,
      evidence: "combines retrieval with a language model",
      explanation: "Đây là hai thành phần được nêu trong transcript.",
      options: [
        "Truy xuất và mô hình ngôn ngữ",
        "Chỉ mô hình ngôn ngữ",
        "Chỉ cơ sở dữ liệu quan hệ",
        "Truy xuất và trình biên dịch",
      ],
      question: "RAG kết hợp những thành phần nào?",
      sourceChunkId: "chunk-1",
      topic: "RAG",
    },
    {
      correctAnswer: 1,
      evidence: "selects relevant passages before the generator writes its response",
      explanation: "Retriever chọn đoạn liên quan trước khi generator viết.",
      options: [
        "Sau khi generator viết",
        "Trước khi generator viết",
        "Trong lúc người dùng cấu hình",
        "Sau khi xóa toàn bộ transcript",
      ],
      question: "Retriever chọn các đoạn liên quan vào lúc nào?",
      sourceChunkId: "chunk-2",
      topic: "Retrieval",
    },
    ...Array.from({ length: 4 }, (_, index) => ({
      correctAnswer: 0,
      evidence: "combines retrieval with a language model",
      explanation: "Transcript cho thấy RAG kết hợp truy xuất với mô hình ngôn ngữ. Vì vậy đáp án đầu tiên giữ đủ hai thành phần, còn các phương án khác bỏ sót hoặc thay sai quy trình.",
      options: [
        "Truy xuất và mô hình ngôn ngữ",
        "Chỉ mô hình ngôn ngữ",
        "Chỉ truy xuất dữ liệu",
        "Trình biên dịch và cơ sở dữ liệu",
      ],
      question: `Câu hỏi bổ sung ${index + 3}: Thành phần nào mô tả đúng RAG?`,
      sourceChunkId: "chunk-1",
      topic: "RAG",
    })),
  ];
}

/** Contract-aware fetch double for App integration tests. */
export function createReadyLearningFetchMock(options: LearningFetchMockOptions = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/generate")) {
      const request = JSON.parse(String(init?.body)) as {
        task: "answers" | "flashcards" | "questions";
        requestedCount?: number;
      };
      return jsonResponse({
        data: { items: generatedItems(request.task).slice(0, request.requestedCount ?? Infinity), status: "ok" },
        meta: { requestId: "request-test" },
      });
    }
    if (!url.startsWith("http://127.0.0.1:8765/api/v1")) {
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    }
    if (options.service === "offline") {
      throw new TypeError("Failed to fetch");
    }
    if (url.endsWith("/health")) {
      if (options.service === "not_ready") {
        return jsonResponse({
          embeddingModelReady: false,
          error: {
            code: "SERVICE_NOT_READY",
            details: null,
            message: "Local RAG Service chưa sẵn sàng.",
            retryable: true,
          },
          pipelineVersion: "pipeline-test",
          serviceVersion: "service-test",
          status: "not_ready",
          vectorStoreReady: false,
        }, 503);
      }
      return jsonResponse({
        embeddingModelReady: true,
        pipelineVersion: "pipeline-test",
        serviceVersion: "service-test",
        status: "ready",
        vectorStoreReady: true,
      });
    }
    if (url.endsWith(`/videos/${TEST_VIDEO_ID}/index`)) {
      return jsonResponse({
        cached: true,
        chunkCount: retrievedChunks.length,
        indexStatus: "ready",
        pipelineVersion: "pipeline-test",
        videoId: TEST_VIDEO_ID,
      });
    }
    if (url.endsWith(`/videos/${TEST_VIDEO_ID}/retrieve`)) {
      const request = JSON.parse(String(init?.body)) as {
        purpose: "quiz" | "flashcard" | "review";
      };
      return jsonResponse({
        chunks: options.noContext ? [] : retrievedChunks,
        ...(options.noContext ? { reason: "NO_RELEVANT_CONTEXT" } : {}),
        purpose: request.purpose,
        videoId: TEST_VIDEO_ID,
      });
    }
    if (url.endsWith(`/videos/${TEST_VIDEO_ID}/assessments/quiz`)) {
      const request = JSON.parse(String(init?.body)) as {
        questions: Array<{
          correctAnswer: number;
          questionId: string;
          sourceTimestamp: { chunkId: string; startSec: number; endSec: number };
          topic: string;
        }>;
        userAnswers: Array<{ questionId: string; selectedAnswer: number | null }>;
      };
      const results = request.questions.map((question) => {
        const answer = request.userAnswers.find((item) => item.questionId === question.questionId);
        return {
          correct: answer?.selectedAnswer === question.correctAnswer,
          correctAnswer: question.correctAnswer,
          questionId: question.questionId,
          selectedAnswer: answer?.selectedAnswer ?? null,
        };
      });
      const correctCount = results.filter((item) => item.correct).length;
      return jsonResponse({
        correctCount,
        questionResults: results,
        reviewTimestamps: correctCount === results.length
          ? []
          : [{
              chunkId: request.questions[0]?.sourceTimestamp.chunkId ?? "chunk-1",
              endSec: request.questions[0]?.sourceTimestamp.endSec ?? 55,
              reason: "Ôn lại khái niệm chính.",
              startSec: request.questions[0]?.sourceTimestamp.startSec ?? 42,
              topic: request.questions[0]?.topic ?? "RAG",
            }],
        score: Math.round((correctCount / results.length) * 100),
        strongTopics: correctCount ? ["RAG"] : [],
        totalCount: results.length,
        weakTopics: correctCount === results.length ? [] : ["Retrieval"],
      });
    }
    throw new Error(`Unexpected Local RAG URL in test: ${url}`);
  });
}
