import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressiveQuizSession, type QuizBatch } from "../integrations/learning/progressiveQuiz";
import { AiGatewayError } from "../integrations/ai-gateway/errors";
import type { Question } from "../types/api";

const question = (n: number): Question => ({ questionId: `original:${n}`, question: `Question ${n}?`,
  options: ["Yes", "No"], correctAnswer: 0, explanation: "Source explanation", topic: "Topic",
  sourceTimestamp: { chunkId: `chunk:${n}`, startSec: n, endSec: n + 1 } });
const page = (start: number, nextPosition?: number): QuizBatch => ({
  questions: Array.from({length: 5}, (_, i) => question(start + i)), nextPosition,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); });

describe("progressive quiz session", () => {
  it("serializes calls, appends stable IDs, deduplicates and preserves current answers", async () => {
    const second = deferred<QuizBatch>();
    const load = vi.fn().mockResolvedValueOnce(page(0, 5)).mockReturnValueOnce(second.promise);
    const session = new ProgressiveQuizSession("video", load);
    const work = session.start();
    expect(session.start()).toBe(work);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    const initial = session.getSnapshot().questions;
    session.select(initial[3].questionId, 1);
    session.move(3);
    second.resolve({questions: [question(0), question(5)]});
    await work;
    expect(session.getSnapshot()).toMatchObject({status: "complete", currentIndex: 3,
      answers: {[initial[3].questionId]: 1}});
    expect(session.getSnapshot().questions).toHaveLength(6);
    expect(session.getSnapshot().questions.slice(0, 5)).toEqual(initial);
    expect(load.mock.calls.map(call => call[0])).toEqual([undefined, 5]);
    await session.start();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("honors Retry-After, retries only the failed page and never shows a countdown", async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValueOnce(page(0, 5))
      .mockRejectedValueOnce(new AiGatewayError("RATE_LIMITED", "Quota", {retryAfterMs: 90_000}))
      .mockResolvedValueOnce(page(5));
    const session = new ProgressiveQuizSession("video", load);
    const work = session.start();
    await vi.advanceTimersByTimeAsync(0);
    const id = session.getSnapshot().questions[0].questionId;
    session.select(id, 1);
    expect(session.getSnapshot().status).toBe("waiting");
    expect(session.getSnapshot().message).not.toMatch(/90|giây|phút/u);
    await vi.advanceTimersByTimeAsync(89_999);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await work;
    expect(load.mock.calls.map(call => call[0])).toEqual([undefined, 5, 5]);
    expect(session.getSnapshot().answers[id]).toBe(1);
    expect(session.getSnapshot().questions).toHaveLength(10);
  });

  it("pauses a daily quota and preserves the earliest retry time across reload/manual retry", async () => {
    const load = vi.fn().mockRejectedValue(new AiGatewayError("RATE_LIMITED", "Quota", {retryAfterMs: 18_643_000}));
    const session = new ProgressiveQuizSession("video", load);
    await session.start();
    expect(session.getSnapshot().status).toBe("paused");
    await session.start();
    await new ProgressiveQuizSession("video", load).start();
    expect(load).toHaveBeenCalledOnce();
  });

  it("bounds retries on repeated transient errors and resumes from the failed cursor", async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValueOnce(page(0, 5))
      .mockRejectedValue(new AiGatewayError("SERVER_ERROR", "Busy", {retryable: true}));
    const session = new ProgressiveQuizSession("video", load);
    const work = session.start();
    await vi.runAllTimersAsync();
    await work;
    expect(load).toHaveBeenCalledTimes(4); // one success + three attempts at next page
    expect(session.getSnapshot().status).toBe("paused");
    load.mockResolvedValueOnce(page(5));
    const retry = session.start();
    await vi.runAllTimersAsync();
    await retry;
    expect(load.mock.calls.map(call => call[0])).toEqual([undefined, 5, 5, 5, 5]);
    expect(session.getSnapshot().questions).toHaveLength(10);
  });

  it("freezes submission and ignores a late provider response even if abort is ignored", async () => {
    const second = deferred<QuizBatch>();
    const load = vi.fn().mockResolvedValueOnce(page(0, 5)).mockReturnValueOnce(second.promise);
    const session = new ProgressiveQuizSession("video", load);
    const work = session.start();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    const payload = session.freeze();
    expect(load.mock.calls[1][1].aborted).toBe(true);
    second.resolve(page(5));
    await work;
    expect(payload.questions).toHaveLength(5);
    expect(session.getSnapshot().questions).toEqual(payload.questions);
    expect(session.getSnapshot().status).toBe("submitted");
    await session.start();
    expect(load).toHaveBeenCalledTimes(2);
    session.redo();
    await session.start();
    expect(load).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot().answers).toEqual({});
  });

  it("restores a successful checkpoint and isolates another video's cancelled worker", async () => {
    const late = deferred<QuizBatch>();
    const load = vi.fn().mockResolvedValueOnce(page(0, 5)).mockReturnValueOnce(late.promise);
    const old = new ProgressiveQuizSession("first-video", load);
    const work = old.start();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    old.move(2);
    old.select(old.getSnapshot().questions[2].questionId, 1);
    old.stop();
    const other = new ProgressiveQuizSession("other-video", vi.fn().mockResolvedValue(page(20)));
    await other.start();
    late.resolve(page(5));
    await work;
    expect(old.getSnapshot().questions).toHaveLength(5);
    expect(other.getSnapshot().questions[0].question).toBe("Question 20?");
    const resume = vi.fn().mockResolvedValue(page(5));
    const restored = new ProgressiveQuizSession("first-video", resume);
    await restored.start();
    expect(resume.mock.calls[0][0]).toBe(5);
    expect(restored.getSnapshot().currentIndex).toBe(2);
    expect(Object.values(restored.getSnapshot().answers)).toEqual([1]);
    expect(restored.getSnapshot().questions).toHaveLength(10);
  });

  it("continues past empty non-teachable batches without fabricating questions", async () => {
    const load = vi.fn().mockResolvedValueOnce({questions: [], nextPosition: 5}).mockResolvedValueOnce(page(5));
    const session = new ProgressiveQuizSession("video", load);
    await session.start();
    expect(session.getSnapshot().questions).toHaveLength(5);
    expect(session.getSnapshot().status).toBe("complete");
  });
});
