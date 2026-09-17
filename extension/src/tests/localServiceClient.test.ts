import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getHealth,
  indexVideo,
  LOCAL_SERVICE_BASE_URL,
  LocalServiceError,
} from "../integrations/local-service/client";
import type { IndexRequest } from "../types/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Local Service health client", () => {
  it("accepts the backend 503 not-ready health envelope as a valid state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "not_ready",
            serviceVersion: "0.1.0",
            pipelineVersion: "unconfigured",
            vectorStoreReady: false,
            embeddingModelReady: false,
            error: {
              code: "SERVICE_NOT_READY",
              message: "Local RAG Service chưa sẵn sàng.",
              retryable: true,
              details: null,
            },
          }),
          { status: 503 },
        ),
      ),
    );

    await expect(getHealth()).resolves.toMatchObject({ status: "not_ready" });
  });

  it("classifies connection failures as network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(getHealth()).rejects.toMatchObject({
      kind: "network",
    } satisfies Partial<LocalServiceError>);
  });

  it("posts an exact JSON index payload without credentials", async () => {
    const payload: IndexRequest = {
      video: {
        videoId: "dQw4w9WgXcQ",
        title: "Video kiểm thử",
        durationSec: 60,
        language: "vi",
      },
      transcriptSegments: [
        { text: "Nội dung kiểm thử.", startSec: 0, endSec: 10, position: 0 },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          videoId: "dQw4w9WgXcQ",
          indexStatus: "indexing",
          cached: false,
          pipelineVersion: "test-pipeline",
        }),
        { status: 202 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(indexVideo("dQw4w9WgXcQ", payload)).resolves.toMatchObject({
      indexStatus: "indexing",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${LOCAL_SERVICE_BASE_URL}/videos/dQw4w9WgXcQ/index`,
      expect.objectContaining({
        body: JSON.stringify(payload),
        credentials: "omit",
        method: "POST",
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(request.headers);
    expect(headers.has("Authorization")).toBe(false);
    expect(headers.has("Cookie")).toBe(false);
    expect(headers.has("X-API-Key")).toBe(false);
  });

  it("rejects an invalid video ID before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      indexVideo("bad", {
        video: { videoId: "bad", title: "Bad", durationSec: 1, language: "vi" },
        transcriptSegments: [{ text: "x", startSec: 0, endSec: 1, position: 0 }],
      }),
    ).rejects.toMatchObject({ kind: "protocol" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
