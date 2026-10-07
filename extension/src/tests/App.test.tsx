import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../sidebar/App";
import "../sidebar/styles.css";
import {
  createLearningChromeMock,
  createReadyLearningFetchMock,
} from "./chromeMock";

let fetchMock: ReturnType<typeof createReadyLearningFetchMock>;

beforeEach(() => {
  localStorage.clear();
  fetchMock = createReadyLearningFetchMock();
  vi.stubGlobal("chrome", createLearningChromeMock());
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderReadyApp() {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Bắt đầu Quiz" }).hasAttribute("disabled")).toBe(false);
  });
}

function requestBodies(pathSuffix: string): Array<Record<string, unknown>> {
  return fetchMock.mock.calls.flatMap(([input, init]) => {
    if (!String(input).endsWith(pathSuffix) || typeof init?.body !== "string") {
      return [];
    }
    return [JSON.parse(init.body) as Record<string, unknown>];
  });
}

describe("real learning flows", () => {
  it("appends the next batch without remounting the question or losing answers, then freezes submission", async () => {
    const original = fetchMock.getMockImplementation()!;
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    let retrievals = 0;
    let generations = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const response = await original(input, init);
      if (String(input).endsWith("/retrieve")) {
        const body = await response.json();
        const offset = retrievals++ * 2;
        body.chunks = body.chunks.map((c: Record<string, unknown>) => ({...c, position: Number(c.position) + offset}));
        return Response.json({...body, nextPosition: offset + 1});
      }
      if (!String(input).endsWith("/api/generate")) return response;
      const page = generations++;
      if (page >= 1) await gate;
      if (page >= 2) return new Promise<Response>(() => {});
      const body = await response.json();
      if (page) body.data.items = body.data.items.map((q: Record<string, unknown>, i: number) => ({...q, question: `Câu đợt hai ${i}?`}));
      return Response.json(body);
    });
    const user = userEvent.setup();
    await renderReadyApp();
    await user.click(screen.getByRole("button", {name: "Bắt đầu Quiz"}));
    await screen.findByText("Câu 1 / 5");
    await user.click(screen.getByText("Truy xuất và mô hình ngôn ngữ"));
    const radio = screen.getAllByRole("radio")[0] as HTMLInputElement;
    const card = screen.getByRole("heading", {name: "RAG kết hợp những thành phần nào?"});
    const scroller = card.closest(".quiz-view")!;
    scroller.scrollTop = 90;
    await act(async () => { release(); });
    await screen.findByText("Câu 1 / 10");
    expect(screen.getAllByRole("radio")[0]).toBe(radio);
    expect(radio.checked).toBe(true);
    expect(screen.getByRole("heading", {name: "RAG kết hợp những thành phần nào?"})).toBe(card);
    expect(scroller.scrollTop).toBe(90);
    expect(requestBodies("/api/generate").every(b => b.requestedCount === 5)).toBe(true);
    await user.click(screen.getByRole("button", {name: "Nộp bài"}));
    await screen.findByLabelText("Điểm 10 trên 100");
    expect((requestBodies("/assessments/quiz")[0].questions as unknown[])).toHaveLength(10);
    const inFlight = fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/api/generate")).at(-1);
    expect(inFlight?.[1]?.signal?.aborted).toBe(true);
  });
  it("requests the whole video and keeps the current question and answer across tab changes", async () => {
    const user = userEvent.setup();
    await renderReadyApp();
    await user.click(screen.getByRole("button", {name: "Bắt đầu Quiz"}));
    await screen.findByText("Câu 1 / 5");
    const first = requestBodies("/retrieve")[0];
    expect(first).toMatchObject({startSec: 0, endSec: 300});
    expect(requestBodies("/api/generate")).toHaveLength(1);
    expect(screen.queryByRole("combobox", {name: /Chọn phần học/u})).toBeNull();
    await user.click(screen.getByRole("button", {name: "Câu tiếp theo"}));
    await user.click(screen.getByText("Trước khi generator viết"));
    await user.click(screen.getByRole("button", {name: "Trang chính"}));
    await user.click(screen.getByRole("button", {name: "Quiz"}));
    await screen.findByText("Câu 2 / 5");
    expect((screen.getAllByRole("radio")[1] as HTMLInputElement).checked).toBe(true);
    expect(requestBodies("/api/generate")).toHaveLength(1);
  });
  it("answers with review retrieval and the AI Gateway, then collapses immediately", async () => {
    const user = userEvent.setup();
    await renderReadyApp();

    await user.type(
      screen.getByPlaceholderText("VD: Khái niệm chính trong video là gì?"),
      "RAG có tác dụng gì?",
    );
    await user.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));

    expect(
      await screen.findByText(/RAG kết hợp bước truy xuất với mô hình ngôn ngữ/u),
    ).toBeTruthy();
    expect(requestBodies("/retrieve")).toContainEqual(
      expect.objectContaining({ purpose: "review", query: "RAG có tác dụng gì?" }),
    );
    expect(requestBodies("/api/generate")).toEqual([
      expect.objectContaining({
        context: expect.objectContaining({ videoId: "dQw4w9WgXcQ" }),
        language: "vi",
        question: "RAG có tác dụng gì?",
        task: "answers",
      }),
    ]);
    expect(requestBodies("/api/generate")[0]).not.toHaveProperty("requestedCount");

    await user.click(screen.getByRole("button", { name: "Thu nhỏ hội thoại" }));
    expect(screen.queryByRole("button", { name: "Thu nhỏ hội thoại" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Hỏi nhanh AI về video này" })).toBeTruthy();
  });

  it("generates Flashcards from flashcard retrieval and records confidence", async () => {
    const user = userEvent.setup();
    await renderReadyApp();
    await user.click(screen.getByRole("button", { name: "Flashcard" }));

    expect(await screen.findByText("Thẻ 1 / 6")).toBeTruthy();
    expect(requestBodies("/retrieve")).toContainEqual(
      expect.objectContaining({ purpose: "flashcard" }),
    );
    await user.click(screen.getByRole("button", { name: "Lật thẻ" }));
    expect(screen.getByRole("button", { name: "Xem mặt trước" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Đã nhớ" }));
    expect(screen.getByRole("button", { name: "Đã nhớ" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("caches Quiz and Flashcards per video and only regenerates Flashcards explicitly", async () => {
    const user = userEvent.setup();
    await renderReadyApp();

    await user.click(screen.getByRole("button", { name: "Flashcard" }));
    expect(await screen.findByText("Thẻ 1 / 6")).toBeTruthy();
    expect(requestBodies("/retrieve").filter((body) => body.purpose === "flashcard")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Trang chính" }));
    await user.click(screen.getByRole("button", { name: "Flashcard" }));
    expect(await screen.findByText("Thẻ 1 / 6")).toBeTruthy();
    expect(requestBodies("/retrieve").filter((body) => body.purpose === "flashcard")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Thêm Flashcards mới" }));
    await waitFor(() => {
      expect(requestBodies("/retrieve").filter((body) => body.purpose === "flashcard")).toHaveLength(2);
    });

    await user.click(screen.getByRole("button", { name: "Quiz" }));
    expect(await screen.findByRole("heading", { name: "RAG kết hợp những thành phần nào?" })).toBeTruthy();
    expect(requestBodies("/retrieve").filter((body) => body.purpose === "quiz")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Trang chính" }));
    await user.click(screen.getByRole("button", { name: "Quiz" }));
    expect(await screen.findByRole("heading", { name: "RAG kết hợp những thành phần nào?" })).toBeTruthy();
    expect(requestBodies("/retrieve").filter((body) => body.purpose === "quiz")).toHaveLength(1);

    expect(screen.queryByRole("button", {name: "Thêm Quiz mới"})).toBeNull();
  });

  it("generates a Quiz, submits answers to assessQuiz, and uses the backend result", async () => {
    const user = userEvent.setup();
    await renderReadyApp();
    await user.click(screen.getByRole("button", { name: "Quiz" }));

    expect(
      await screen.findByRole("heading", { name: "RAG kết hợp những thành phần nào?" }),
    ).toBeTruthy();
    expect(requestBodies("/retrieve")).toContainEqual(expect.objectContaining({ purpose: "quiz" }));

    await user.click(screen.getByText("Truy xuất và mô hình ngôn ngữ"));
    await user.click(screen.getByRole("button", { name: "Câu tiếp theo" }));
    await user.click(screen.getByText("Trước khi generator viết"));
    await user.click(screen.getByRole("button", { name: "Câu tiếp theo" }));
    for (let index = 0; index < 3; index += 1) {
      await user.click(screen.getByText("Truy xuất và mô hình ngôn ngữ"));
      await user.click(screen.getByRole("button", {
        name: index === 2 ? "Nộp bài" : "Câu tiếp theo",
      }));
    }

    expect(await screen.findByLabelText("Điểm 100 trên 100")).toBeTruthy();
    expect(screen.getByText("Trả lời đúng 5/5 câu trong lần làm hiện tại.")).toBeTruthy();
    const assessments = requestBodies("/assessments/quiz");
    expect(assessments).toHaveLength(1);
    expect(assessments[0]).toMatchObject({
      userAnswers: [
        { questionId: expect.any(String), selectedAnswer: 0 },
        { questionId: expect.any(String), selectedAnswer: 1 },
        { questionId: expect.any(String), selectedAnswer: 0 },
        { questionId: expect.any(String), selectedAnswer: 0 },
        { questionId: expect.any(String), selectedAnswer: 0 },
      ],
    });
  });

  it("never sends credentials or provider configuration from the extension", async () => {
    const user = userEvent.setup();
    await renderReadyApp();
    await user.click(screen.getByRole("button", { name: "Quiz" }));
    await screen.findByRole("heading", { name: "RAG kết hợp những thành phần nào?" });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes("/videos/dQw4w9WgXcQ/index"),
        ),
      ).toBe(true);
    });
    for (const [input, init] of fetchMock.mock.calls) {
      const url = String(input);
      if (!url.startsWith("http://127.0.0.1:8765/") && !url.endsWith("/api/generate")) {
        continue;
      }
      expect(init?.credentials).toBe("omit");
      expect(new Headers(init?.headers).has("Authorization")).toBe(false);
      expect(String(init?.body ?? "")).not.toMatch(
        /"(?:apiKey|model|prompt|responseSchema|systemInstruction)"\s*:/iu,
      );
    }
  });
});
