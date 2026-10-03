import assert from "node:assert/strict";
import test from "node:test";

import { readProviderDiagnostics } from "../src/provider-diagnostics.ts";

const signal = new AbortController().signal;

test("extracts quota limits, reason and full retry delay without logging sensitive fields", async () => {
  const response = Response.json({ error: {
    code: 429,
    status: "RESOURCE_EXHAUSTED",
    message: "You exceeded your current quota, please check your plan and billing details. PRIVATE TRANSCRIPT",
    details: [
      { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{
        quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
        quotaId: "GenerateContentRequestsPerDayPerProjectPerModel-FreeTier",
        quotaValue: "0",
        subject: "projects/private-project",
        description: "PRIVATE TRANSCRIPT",
        quotaDimensions: { model: "gemini-3.6-flash", secret: "API-KEY" },
      }] },
      { "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "QUOTA_EXCEEDED",
        metadata: { consumer: "projects/private-project", key: "API-KEY" } },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "18643s" },
    ],
  } }, { status: 429, headers: { "Retry-After": "18643" } });
  const result = await readProviderDiagnostics(response, signal);
  assert.equal(result.providerCode, "resource_exhausted");
  assert.equal(result.providerReason, "QUOTA_EXCEEDED");
  assert.equal(result.retryAfterSeconds, 18643);
  assert.equal(result.errorBodyState, "parsed");
  assert.equal(result.quotaViolations?.[0]?.limit, "0");
  assert.equal(result.quotaViolations?.[0]?.quotaId, "GenerateContentRequestsPerDayPerProjectPerModel-FreeTier");
  assert.equal(result.quotaViolations?.[0]?.metric,
    "generativelanguage.googleapis.com/generate_content_free_tier_requests");
  assert.deepEqual(result.messageHints, [
    "provider_reports_quota_exceeded", "provider_requests_plan_and_billing_check",
  ]);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|API-KEY|private-project/u);
});

test("extracts details from Interactions message without claiming a daily quota was exhausted", async () => {
  const result = await readProviderDiagnostics(Response.json({ error: {
    code: "too_many_requests",
    message: "You exceeded your current quota, please check your plan and billing details. " +
      "Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-3.6-flash. " +
      "Please retry in 12.2s. https://example.com/?key=PRIVATE SECRET PROMPT",
  } }, { status: 429 }), signal);
  assert.equal(result.providerCode, "too_many_requests");
  assert.equal(result.retryAfterSeconds, 13);
  assert.equal(result.quotaViolations?.[0]?.limit, "0");
  assert.equal(result.messageHints?.includes("daily_limit_mentioned"), false);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|SECRET|PROMPT|example/u);
});

test("omits unknown provider strings rather than copying credentials or input to logs", async () => {
  const result = await readProviderDiagnostics(Response.json({ error: {
    code: "SECRET", message: "PRIVATE PROMPT API-KEY",
    details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "SECRET" }],
  } }, { status: 429 }), signal);
  assert.deepEqual(result, { providerStatus: 429, errorBodyState: "parsed" });
});

test("preserves HTTP status and retry header for invalid and oversized bodies", async () => {
  for (const body of ["not JSON", "x".repeat(17 * 1024)]) {
    const result = await readProviderDiagnostics(new Response(body, {
      status: 429, headers: { "Retry-After": "18643" },
    }), signal);
    assert.deepEqual(result, {
      providerStatus: 429, errorBodyState: "unavailable", retryAfterSeconds: 18643,
    });
  }
});

test("does not hang on an error body that never finishes and respects caller abort", async () => {
  for (const abort of [false, true]) {
    let cancelled = false;
    const controller = new AbortController();
    if (abort) controller.abort();
    const body = new ReadableStream({ cancel() { cancelled = true; } });
    const result = await readProviderDiagnostics(new Response(body, { status: 429 }), controller.signal);
    assert.equal(cancelled, true);
    assert.deepEqual(result, { providerStatus: 429, errorBodyState: "unavailable" });
  }
});
