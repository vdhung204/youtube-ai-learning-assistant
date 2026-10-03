import { loadConfig } from "./config.ts";
import { GatewayError } from "./errors.ts";
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

export async function healthHandler(
  request: NodeRequestLike,
  response: NodeResponseLike,
): Promise<void> {
  const id = requestId();
  setNoStore(response, id);
  try {
    const config = loadConfig();
    const origin = header(request, "origin");
    if (origin) {
      assertAllowedOrigin(origin, config.allowedOrigins);
      setCors(response, origin, "GET, OPTIONS");
    }
    if (request.method === "OPTIONS") {
      if (!origin) {
        throw new GatewayError("ORIGIN_FORBIDDEN", 403, false);
      }
      response.status(204).end();
      return;
    }
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET, OPTIONS");
      throw new GatewayError("METHOD_NOT_ALLOWED", 405, false);
    }
    response.status(200).json({ status: "ok", meta: { requestId: id } });
  } catch (error) {
    sendError(response, error, id);
  }
}
