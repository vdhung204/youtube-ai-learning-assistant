import { GatewayError, badRequest } from "./errors.ts";
import type { NodeRequestLike } from "./http.ts";
import { header } from "./http.ts";
import { MAX_REQUEST_BODY_BYTES } from "./input-validation.ts";

function assertBodySize(value: string): void {
  if (new TextEncoder().encode(value).byteLength > MAX_REQUEST_BODY_BYTES) {
    throw new GatewayError("PAYLOAD_TOO_LARGE", 413, false);
  }
}

export function readJsonBody(request: NodeRequestLike): unknown {
  const contentType = header(request, "content-type")?.split(";", 1)[0]?.trim().toLocaleLowerCase();
  if (contentType !== "application/json") {
    throw badRequest();
  }
  const declaredLength = header(request, "content-length");
  if (declaredLength !== undefined) {
    const bytes = Number(declaredLength);
    if (!Number.isInteger(bytes) || bytes < 0) {
      throw badRequest();
    }
    if (bytes > MAX_REQUEST_BODY_BYTES) {
      throw new GatewayError("PAYLOAD_TOO_LARGE", 413, false);
    }
  }

  const body = request.body;
  if (typeof body === "string") {
    assertBodySize(body);
    try {
      return JSON.parse(body) as unknown;
    } catch (error) {
      throw badRequest(error);
    }
  }
  if (Buffer.isBuffer(body)) {
    const raw = body.toString("utf8");
    assertBodySize(raw);
    try {
      return JSON.parse(raw) as unknown;
    } catch (error) {
      throw badRequest(error);
    }
  }
  if (body === undefined || body === null) {
    throw badRequest();
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(body);
  } catch (error) {
    throw badRequest(error);
  }
  assertBodySize(serialized);
  return body;
}
