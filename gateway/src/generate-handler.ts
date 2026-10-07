import type { SuccessEnvelope } from "./contracts.ts";
import { loadConfig } from "./config.ts";
import { GatewayError } from "./errors.ts";
import { generateWithGemini } from "./gemini.ts";
import {
  assertAllowedOrigin,
  header,
  type NodeRequestLike,
  type NodeResponseLike,
  requestId,
  sendError,
  setCors,
  setNoStore,
} from "./http.ts";
import { parseGenerateRequest } from "./input-validation.ts";
import { enforceRateLimit } from "./rate-limit.ts";
import { readJsonBody } from "./request-body.ts";

export async function generateHandler(
  request: NodeRequestLike,
  response: NodeResponseLike,
): Promise<void> {
  const id = requestId();
  const requestStartedAt = Date.now();
  let outcome = "ok";
  let task: string | undefined;
  setNoStore(response, id);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let onAborted: (() => void) | undefined;
  try {
    const config = loadConfig();
    const origin = header(request, "origin");
    assertAllowedOrigin(origin, config.allowedOrigins);
    setCors(response, origin);

    if (request.method === "OPTIONS") {
      response.status(204).end();
      return;
    }
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST, OPTIONS");
      throw new GatewayError("METHOD_NOT_ALLOWED", 405, false);
    }

    const input = parseGenerateRequest(readJsonBody(request));
    task = input.task;
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort("gateway deadline"), config.geminiTimeoutMs);
    onAborted = () => controller.abort("client disconnected");
    request.on?.("aborted", onAborted);

    const rateLimitStartedAt = Date.now();
    const rateLimit = await enforceRateLimit(request, origin, config.rateLimit, controller.signal);
    console.info("gateway_latency", {
      durationMs: Date.now() - rateLimitStartedAt,
      outcome: "ok",
      requestId: id,
      stage: "rate_limit",
      task,
    });
    if (rateLimit) {
      response.setHeader("X-RateLimit-Limit", rateLimit.limit);
      response.setHeader("X-RateLimit-Remaining", rateLimit.remaining);
      response.setHeader("X-RateLimit-Reset", rateLimit.resetEpochSeconds);
    }
    const geminiStartedAt = Date.now();
    let geminiOutcome: "error" | "ok" = "ok";
    let data: SuccessEnvelope["data"];
    try {
      data = await generateWithGemini(input, config, controller.signal, {
        onMetric: (metric) => {
          console.info("gateway_latency", { ...metric, requestId: id, task });
        },
      });
    } catch (error) {
      geminiOutcome = "error";
      throw error;
    } finally {
      console.info("gateway_latency", {
        durationMs: Date.now() - geminiStartedAt,
        outcome: geminiOutcome,
        requestId: id,
        stage: "gemini_total",
        task,
      });
    }
    const body: SuccessEnvelope = { data, meta: { requestId: id } };
    response.status(200).json(body);
  } catch (error) {
    outcome = error instanceof GatewayError ? error.code : "INTERNAL_ERROR";
    sendError(response, error, id);
  } finally {
    if (request.method === "POST") {
      console.info("gateway_request_completed", {
        durationMs: Date.now() - requestStartedAt,
        outcome,
        requestId: id,
        task,
      });
    }
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    if (onAborted) {
      request.off?.("aborted", onAborted);
    }
  }
}
