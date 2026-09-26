import { GeminiAccessError } from "./errors";
import { DEFAULT_MAX_RETRIES, GEMINI_API_ORIGIN, fetchGemini, makeHeaders, readJsonResponse } from "./transport";
import type { GeminiGenerateOptions, GeminiModelOptions } from "./types";
import { isRecord } from "./validation";

const GEMINI_MODELS_URL = `${GEMINI_API_ORIGIN}/v1beta/models?pageSize=50`;
const MODEL_NAME_PATTERN = /^(?:models\/)?[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const MIN_FLASH_MODEL_VERSION = [3, 6] as const;
const MAX_GENERATION_MODELS = 3;

function supportedModelNames(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body.models)) {
    return [];
  }
  return body.models.flatMap((model) => {
    if (
      !isRecord(model) ||
      typeof model.name !== "string" ||
      !Array.isArray(model.supportedGenerationMethods) ||
      !model.supportedGenerationMethods.includes("generateContent")
    ) {
      return [];
    }
    return [model.name];
  });
}

function isGeneralTextFlashModel(name: string): boolean {
  return (
    /(?:^|-)flash(?:-|$)/iu.test(name) &&
    !/(?:live|tts|image|audio|transcri|computer-use|preview|experimental|exp-|latest)/iu.test(name)
  );
}

function flashModelVersion(name: string): readonly [number, number] | undefined {
  const match = /^models\/gemini-(\d+)\.(\d+)-flash(?:-|$)/iu.exec(name);
  if (!match) {
    return undefined;
  }
  return [Number(match[1]), Number(match[2])];
}

function compareModelVersions(
  left: readonly [number, number],
  right: readonly [number, number],
): number {
  return left[0] - right[0] || left[1] - right[1];
}

function isSupportedFlashModel(name: string): boolean {
  const version = flashModelVersion(name);
  return (
    isGeneralTextFlashModel(name) &&
    version !== undefined &&
    compareModelVersions(version, MIN_FLASH_MODEL_VERSION) >= 0
  );
}

function isFlashModelBelowMinimum(name: string): boolean {
  const version = flashModelVersion(name);
  return (
    isGeneralTextFlashModel(name) &&
    version !== undefined &&
    compareModelVersions(version, MIN_FLASH_MODEL_VERSION) < 0
  );
}

function orderedGenerationModels(models: string[], preferredModel?: string): string[] {
  const preferred = preferredModel ? normalizeModelName(preferredModel) : undefined;
  const unique = [...new Set(models.map(normalizeModelName))];
  if (preferred && (!unique.includes(preferred) || !isSupportedFlashModel(preferred))) {
    return [];
  }
  const flash = unique
    .filter(isSupportedFlashModel)
    .sort((left, right) => compareModelVersions(
      flashModelVersion(right)!,
      flashModelVersion(left)!,
    ));
  const candidates = preferred ? [preferred, ...flash] : flash;
  return candidates.filter(
    (name, index, all) => all.indexOf(name) === index,
  );
}

function normalizeModelName(model: string): string {
  const normalized = model.trim();
  if (!MODEL_NAME_PATTERN.test(normalized)) {
    throw new GeminiAccessError(
      "BAD_REQUEST",
      "Tên model Gemini không hợp lệ.",
      undefined,
      { retryable: false },
    );
  }
  return normalized.startsWith("models/") ? normalized : `models/${normalized}`;
}

/** Resolve a generateContent-capable model with the authenticated Models API. */
export async function resolveGeminiModels(
  token: string,
  options: GeminiModelOptions = {},
): Promise<string[]> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 5) {
    throw new GeminiAccessError(
      "BAD_REQUEST",
      "Cáº¥u hÃ¬nh retry Gemini khÃ´ng há»£p lá»‡.",
      undefined,
      { retryable: false },
    );
  }
  const response = await fetchGemini(
    GEMINI_MODELS_URL,
    {
      credentials: "omit",
      headers: makeHeaders(token, options.projectId),
      method: "GET",
      signal: options.signal,
    },
    maxRetries,
  );
  const models = supportedModelNames(await readJsonResponse(response));
  const orderedModels = orderedGenerationModels(models, options.preferredModel);
  if (options.preferredModel && orderedModels.length === 0) {
    throw new GeminiAccessError(
      "PERMISSION_DENIED",
      "Model Gemini đã cấu hình không khả dụng cho tài khoản này.",
      response.status,
      { retryable: false },
    );
  }
  if (orderedModels.length === 0) {
    throw new GeminiAccessError(
      "PERMISSION_DENIED",
      "Không tìm thấy model Gemini hỗ trợ tạo nội dung cho tài khoản này.",
      response.status,
      { retryable: false },
    );
  }
  return orderedModels;
}

/** Resolve the preferred generateContent model. Kept for callers needing one model only. */
export async function resolveGeminiModel(
  token: string,
  options: GeminiModelOptions = {},
): Promise<string> {
  return (await resolveGeminiModels(token, options))[0];
}

export function generationModels(
  options: Pick<GeminiGenerateOptions, "model" | "fallbackModels">,
): string[] {
  const model = normalizeModelName(options.model ?? "gemini-3.8-flash");
  if (isFlashModelBelowMinimum(model)) {
    throw new GeminiAccessError(
      "BAD_REQUEST",
      "Model Gemini Flash phải từ phiên bản 3.6 trở lên.",
      undefined,
      { retryable: false },
    );
  }
  return [
    model,
    ...(options.fallbackModels ?? [])
      .map(normalizeModelName)
      .filter((name) => !isFlashModelBelowMinimum(name)),
  ]
    .filter((name, index, all) => all.indexOf(name) === index)
    .slice(0, MAX_GENERATION_MODELS);
}
