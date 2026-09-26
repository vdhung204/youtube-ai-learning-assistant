import { GeminiAccessError } from "./errors";
import { readJsonResponse } from "./transport";
import { isRecord } from "./validation";

function invalidResponse(message: string, status: number): GeminiAccessError {
  return new GeminiAccessError("INVALID_RESPONSE", message, status, { retryable: true });
}

function firstCandidate(body: unknown, status: number): Record<string, unknown> {
  if (!isRecord(body)) {
    throw invalidResponse("Gemini trả về dữ liệu không hợp lệ.", status);
  }
  const promptFeedback = body.promptFeedback;
  if (
    isRecord(promptFeedback) &&
    typeof promptFeedback.blockReason === "string" &&
    promptFeedback.blockReason !== "BLOCK_REASON_UNSPECIFIED"
  ) {
    throw new GeminiAccessError(
      "CONTENT_BLOCKED",
      "Gemini đã chặn prompt theo chính sách an toàn.",
      status,
      { retryable: false },
    );
  }
  if (!Array.isArray(body.candidates) || body.candidates.length === 0) {
    throw invalidResponse("Gemini không trả về nội dung.", status);
  }

  const candidate = body.candidates[0];
  if (!isRecord(candidate)) {
    throw invalidResponse("Gemini trả về dữ liệu không hợp lệ.", status);
  }
  return candidate;
}

function assertFinishReason(finishReason: unknown, status: number): void {
  if (finishReason === "MAX_TOKENS") {
    throw new GeminiAccessError(
      "OUTPUT_TRUNCATED",
      "Phản hồi Gemini bị cắt do vượt giới hạn độ dài.",
      status,
      { retryable: true },
    );
  }
  if (
    typeof finishReason === "string" &&
    ["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "RECITATION", "SPII"].includes(finishReason)
  ) {
    throw new GeminiAccessError(
      "CONTENT_BLOCKED",
      "Gemini đã chặn nội dung theo chính sách an toàn.",
      status,
      { retryable: false },
    );
  }
}

function candidateText(candidate: Record<string, unknown>, status: number): string {
  const content = candidate.content;
  if (!isRecord(content) || !Array.isArray(content.parts)) {
    throw invalidResponse("Gemini không trả về nội dung JSON.", status);
  }
  const text = content.parts
    .flatMap((part) =>
      isRecord(part) && part.thought !== true && typeof part.text === "string"
        ? [part.text]
        : [],
    )
    .join("")
    .trim();
  if (!text) {
    throw invalidResponse("Gemini không trả về nội dung JSON.", status);
  }
  return text;
}

function parseGeneratedJson(text: string, status: number): unknown {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(text);
  const json = fenced?.[1] ?? text;
  try {
    return JSON.parse(json);
  } catch {
    throw invalidResponse("Gemini trả về JSON không hợp lệ.", status);
  }
}

export async function parseGenerationResponse(response: Response): Promise<unknown> {
  const body = await readJsonResponse(response);
  const candidate = firstCandidate(body, response.status);
  assertFinishReason(candidate.finishReason, response.status);
  return parseGeneratedJson(candidateText(candidate, response.status), response.status);
}
