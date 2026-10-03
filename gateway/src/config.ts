import { GatewayError } from "./errors.ts";

export interface RateLimitConfig {
  url: string;
  token: string;
  maxRequests: number;
  windowSeconds: number;
}

export interface GatewayConfig {
  allowedOrigins: ReadonlySet<string>;
  geminiApiKey: string;
  geminiModel: string;
  geminiTimeoutMs: number;
  geminiMaxRetries: number;
  rateLimit?: RateLimitConfig;
}

const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/u;
const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new GatewayError("SERVER_NOT_CONFIGURED", 503, false);
  }
  return value;
}

function integerSetting(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new GatewayError("SERVER_NOT_CONFIGURED", 503, false);
  }
  return value;
}

function rateLimitConfig(env: NodeJS.ProcessEnv): RateLimitConfig | undefined {
  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url && !token) {
    return undefined;
  }
  if (!url || !token) {
    throw new GatewayError("SERVER_NOT_CONFIGURED", 503, false);
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new GatewayError("SERVER_NOT_CONFIGURED", 503, false);
  }
  if (parsed.protocol !== "https:") {
    throw new GatewayError("SERVER_NOT_CONFIGURED", 503, false);
  }
  return {
    url: parsed.toString().replace(/\/$/u, ""),
    token,
    maxRequests: integerSetting(env, "RATE_LIMIT_MAX_REQUESTS", 20, 1, 10_000),
    windowSeconds: integerSetting(env, "RATE_LIMIT_WINDOW_SECONDS", 60, 10, 86_400),
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const origins = required(env, "ALLOWED_EXTENSION_ORIGINS")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0 || origins.some((origin) => !EXTENSION_ORIGIN.test(origin))) {
    throw new GatewayError("SERVER_NOT_CONFIGURED", 503, false);
  }

  const geminiModel = env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";
  if (!MODEL_NAME.test(geminiModel)) {
    throw new GatewayError("SERVER_NOT_CONFIGURED", 503, false);
  }

  const rateLimit = rateLimitConfig(env);
  return {
    allowedOrigins: new Set(origins),
    geminiApiKey: required(env, "GEMINI_API_KEY"),
    geminiModel,
    geminiTimeoutMs: integerSetting(env, "GEMINI_TIMEOUT_MS", 25_000, 1_000, 28_000),
    geminiMaxRetries: integerSetting(env, "GEMINI_MAX_RETRIES", 1, 0, 3),
    ...(rateLimit === undefined ? {} : { rateLimit }),
  };
}
