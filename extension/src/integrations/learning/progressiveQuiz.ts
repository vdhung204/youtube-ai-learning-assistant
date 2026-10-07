import { AIContentError, buildQuizRequest, mapQuiz, validateQuiz } from "../../ai-content/index.ts";
import type { Question } from "../../types/api";
import type { CurrentVideo } from "../../types/learning";
import { AiGatewayError } from "../ai-gateway/errors";
import { retrieve } from "../local-service/client";
import type { GenerateContent } from "./types";

export const QUIZ_BATCH_SIZE = 5;
const MAX_QUESTIONS = 2000;
const MAX_AUTO_WAIT_MS = 300_000;
type Status = "idle" | "running" | "waiting" | "paused" | "complete" | "submitted";
export interface QuizSnapshot {
  questions: Question[];
  answers: Record<string, number | undefined>;
  currentIndex: number;
  status: Status;
  message: string;
}
export interface QuizBatch { questions: Question[]; nextPosition?: number }
export type LoadQuizBatch = (afterPosition: number | undefined, signal: AbortSignal) => Promise<QuizBatch>;

export function quizBatchLoader(video: CurrentVideo, generate: GenerateContent): LoadQuizBatch {
  return async (afterPosition, signal) => {
    const result = await retrieve(video.videoId, {
      query: "Nội dung toàn bộ video", purpose: "quiz", maxResults: 6,
      startSec: 0, endSec: video.durationSec,
      ...(afterPosition === undefined ? {} : { afterPosition }),
    }, { signal });
    signal.throwIfAborted();
    if (result.videoId !== video.videoId || result.chunks.some((c, i) =>
      c.videoId !== video.videoId || c.position <= (i ? result.chunks[i - 1].position : afterPosition ?? -1)) ||
      (result.nextPosition !== undefined && (!result.chunks.length ||
        result.nextPosition !== result.chunks.at(-1)?.position))) {
      throw new Error("Không thể đọc tiếp nội dung video. Hãy thử lại.");
    }
    if (!result.chunks.length) return { questions: [] };
    const context = { videoId: video.videoId, durationSec: video.durationSec, chunks: result.chunks };
    const validated = await generate(buildQuizRequest(context, QUIZ_BATCH_SIZE, video.language || "vi"), {
      signal, maxRetries: 0, timeoutMs: 35_000,
      validate: raw => {
        const parsed = validateQuiz(raw, context);
        if (parsed.items.length > QUIZ_BATCH_SIZE) throw new AIContentError("AI_ITEM_COUNT_INVALID");
        return parsed;
      },
    });
    signal.throwIfAborted();
    return { questions: mapQuiz(validated, context), nextPosition: result.nextPosition };
  };
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
const normalize = (text: string) => text.normalize("NFC").toLocaleLowerCase().replace(/[\p{P}\p{Z}\s]+/gu, " ").trim();

// Owned by App, not the quiz view: tab navigation must not restart generation or answers.
// Only successful batches advance the cursor. Cancellation invalidates even providers
// which finish after AbortSignal, so a submitted attempt is immutable.
export class ProgressiveQuizSession {
  private state: QuizSnapshot = { questions: [], answers: {}, currentIndex: 0, status: "idle", message: "" };
  private listeners = new Set<() => void>();
  private cursor?: number;
  private completed = false;
  private notBefore = 0;
  private controller?: AbortController;
  private worker?: Promise<void>;
  private storageKey: string;

  constructor(key: string, private load: LoadQuizBatch) {
    this.storageKey = `yala:quiz-progress:v1:${key}`;
    this.restore();
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;

  private publish(patch: Partial<QuizSnapshot>) {
    this.state = { ...this.state, ...patch };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({ ...this.state,
        cursor: this.cursor, completed: this.completed, notBefore: this.notBefore }));
    } catch { /* A full/disabled cache must not discard in-memory answers. */ }
    this.listeners.forEach(listener => listener());
  }

  private restore() {
    try {
      const cached = JSON.parse(localStorage.getItem(this.storageKey) ?? "null");
      if (!cached || !Array.isArray(cached.questions) || cached.questions.length > MAX_QUESTIONS ||
        typeof cached.completed !== "boolean" || !Number.isFinite(cached.notBefore) ||
        !Number.isInteger(cached.currentIndex) || cached.currentIndex < 0 ||
        cached.currentIndex >= Math.max(1, cached.questions.length) ||
        (cached.cursor !== undefined && (!Number.isInteger(cached.cursor) || cached.cursor < 0))) return;
      const ids = new Set<string>();
      for (const q of cached.questions) {
        if (!q || typeof q.questionId !== "string" || ids.has(q.questionId) ||
          ![q.question, q.explanation, q.topic].every(v => typeof v === "string" && v.length > 0) ||
          !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 10 ||
          !q.options.every((v: unknown) => typeof v === "string") ||
          !Number.isInteger(q.correctAnswer) || q.correctAnswer < 0 || q.correctAnswer >= q.options.length ||
          typeof q.sourceTimestamp?.chunkId !== "string" || !Number.isFinite(q.sourceTimestamp.startSec) ||
          !Number.isFinite(q.sourceTimestamp.endSec)) return;
        ids.add(q.questionId);
      }
      const answers: QuizSnapshot["answers"] = {};
      for (const q of cached.questions as Question[]) {
        const value = cached.answers?.[q.questionId];
        if (Number.isInteger(value) && value >= 0 && value < q.options.length) answers[q.questionId] = value;
      }
      this.cursor = cached.cursor;
      this.completed = cached.completed;
      this.notBefore = cached.notBefore;
      this.state = { questions: cached.questions, answers, currentIndex: cached.currentIndex,
        status: cached.status === "submitted" ? "submitted" : this.completed ? "complete" : "idle", message: "" };
    } catch { /* Ignore invalid cache entries. */ }
  }

  start = (): Promise<void> => {
    if (this.worker) return this.worker;
    if (this.completed || this.state.status === "submitted") return Promise.resolve();
    const controller = new AbortController();
    this.controller = controller;
    const work = this.run(controller.signal).finally(() => {
      if (this.worker === work) this.worker = undefined;
    });
    this.worker = work;
    return work;
  };

  private async run(signal: AbortSignal) {
    let failures = 0;
    while (!signal.aborted && !this.completed) {
      try {
        const delay = this.notBefore - Date.now();
        if (delay > MAX_AUTO_WAIT_MS) {
          this.publish({ status: "paused", message: "AI đang giới hạn lượt gọi. Các câu đã có vẫn được giữ; bạn có thể tiếp tục tạo sau." });
          return;
        }
        if (delay > 0) {
          this.publish({ status: "waiting", message: "Đang chờ AI cho phép tạo tiếp. Bạn vẫn có thể làm các câu đã có." });
          await wait(delay, signal);
        }
        signal.throwIfAborted();
        this.publish({ status: "running", message: "Đang bổ sung câu hỏi cho video…" });
        const batch = await this.load(this.cursor, signal);
        signal.throwIfAborted();
        const seen = new Set(this.state.questions.map(q => normalize(q.question)));
        const additions = batch.questions.filter(q => {
          const key = normalize(q.question);
          if (seen.has(key)) return false;
          seen.add(key); return true;
        }).map((q, i) => ({ ...q, questionId: `${this.storageKey}:q:${this.state.questions.length + i}` }));
        if (this.state.questions.length + additions.length > MAX_QUESTIONS) {
          this.publish({ status: "paused", message: "Bộ quiz đã đạt giới hạn 2.000 câu. Hãy nộp bài với các câu hiện có." });
          return;
        }
        this.cursor = batch.nextPosition;
        this.completed = batch.nextPosition === undefined;
        this.notBefore = 0;
        failures = 0;
        this.publish({ questions: [...this.state.questions, ...additions],
          status: this.completed ? "complete" : "running", message: this.completed ? "Đã tạo xong câu hỏi cho video." : "Đang bổ sung câu hỏi cho video…" });
      } catch (error) {
        if (signal.aborted) return;
        const retryable = error instanceof AiGatewayError &&
          (error.retryable || error.code === "RATE_LIMITED");
        if (retryable) {
          this.notBefore = Date.now() + Math.max(1000, error.retryAfterMs ?? Math.min(30_000, 2000 * 2 ** failures));
        }
        if (!retryable || failures++ >= 2) {
          this.publish({ status: "paused", message: "Tạm dừng tạo câu hỏi. Các câu và đáp án đã có được giữ nguyên. Hãy thử tiếp tục." });
          return;
        }
      }
    }
  }

  stop = () => {
    this.controller?.abort();
    this.worker = undefined;
  };
  select = (questionId: string, answer: number) => {
    const question = this.state.questions.find(q => q.questionId === questionId);
    if (this.state.status !== "submitted" && question && Number.isInteger(answer) && answer >= 0 && answer < question.options.length)
      this.publish({ answers: { ...this.state.answers, [questionId]: answer } });
  };
  move = (index: number) => {
    if (index >= 0 && index < this.state.questions.length) this.publish({ currentIndex: index });
  };
  freeze = () => {
    this.stop();
    this.publish({ status: "submitted", message: "Đã chốt bộ câu hỏi cho lần nộp này." });
    return { questions: [...this.state.questions], userAnswers: this.state.questions.map(q => ({
      questionId: q.questionId, selectedAnswer: this.state.answers[q.questionId] ?? null,
    })) };
  };
  redo = () => {
    this.stop();
    // Review the same frozen question set; do not make new provider calls.
    this.completed = true;
    this.publish({ answers: {}, currentIndex: 0, status: "complete", message: "Đang làm lại bộ câu hỏi đã có." });
  };
}
