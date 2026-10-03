import type { GatewayConfig } from "../src/config.ts";
import type { GenerateRequest } from "../src/contracts.ts";

export const ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

export const rawQuestionsRequest = {
  task: "questions",
  language: "vi",
  requestedCount: 2,
  context: {
    videoId: "abcdefghijk",
    durationSec: 600,
    chunks: [
      {
        chunkId: "chunk-1",
        videoId: "abcdefghijk",
        text: "Tuple trong Python là bất biến và không thể gán lại phần tử sau khi tạo.",
        startSec: 42,
        endSec: 55,
        position: 1,
        score: 0.92,
      },
    ],
  },
} as const;

export const questionsRequest = rawQuestionsRequest as unknown as GenerateRequest;

export const gatewayConfig: GatewayConfig = {
  allowedOrigins: new Set([ORIGIN]),
  geminiApiKey: "test-secret-key",
  geminiModel: "gemini-3.6-flash",
  geminiTimeoutMs: 25_000,
  geminiMaxRetries: 1,
};

function question(index: number) {
  return {
    question: `Câu hỏi ${index}: Tuple trong Python có đặc điểm gì?`,
    options: ["Bất biến", "Luôn rỗng", "Chỉ chứa số", "Tự đổi kiểu"],
    correctAnswer: 0,
    explanation: "Tuple không thể gán lại phần tử sau khi đã tạo. Vì vậy đáp án bất biến phù hợp trực tiếp với transcript.",
    topic: `Tuple ${index}`,
    sourceChunkId: "chunk-1",
    evidence: "Tuple trong Python là bất biến",
  };
}

export function validProviderOutput() {
  return {
    status: "ok",
    questions: [question(1), question(2)],
  };
}

export function interactionResponse(output: unknown): Response {
  return Response.json({
    status: "completed",
    steps: [
      {
        type: "model_output",
        status: "done",
        content: [{ type: "text", text: JSON.stringify(output) }],
      },
    ],
  });
}
