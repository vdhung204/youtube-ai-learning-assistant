import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
  it("answers with review retrieval and Gemini, then collapses immediately", async () => {
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

    await user.click(screen.getByRole("button", { name: "Thu nhỏ hội thoại" }));
    expect(screen.queryByRole("button", { name: "Thu nhỏ hội thoại" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Hỏi nhanh AI về video này" })).toBeTruthy();
  });

  it("generates Flashcards from flashcard retrieval and records confidence", async () => {
    const user = userEvent.setup();
    await renderReadyApp();
    await user.click(screen.getByRole("button", { name: "Flashcard" }));

    expect(await screen.findByText("Thẻ 1 / 1")).toBeTruthy();
    expect(requestBodies("/retrieve")).toContainEqual(
      expect.objectContaining({ purpose: "flashcard" }),
    );
    await user.click(screen.getByRole("button", { name: "Lật thẻ" }));
    expect(screen.getByRole("button", { name: "Xem mặt trước" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Đã nhớ" }));
    expect(screen.getByRole("button", { name: "Đã nhớ" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("caches Quiz and Flashcards per video and regenerates only from the add buttons", async () => {
    const user = userEvent.setup();
    await renderReadyApp();

    await user.click(screen.getByRole("button", { name: "Flashcard" }));
    expect(await screen.findByText("Thẻ 1 / 1")).toBeTruthy();
    expect(requestBodies("/retrieve").filter((body) => body.purpose === "flashcard")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Trang chính" }));
    await user.click(screen.getByRole("button", { name: "Flashcard" }));
    expect(await screen.findByText("Thẻ 1 / 1")).toBeTruthy();
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

    await user.click(screen.getByRole("button", { name: "Thêm Quiz mới" }));
    await waitFor(() => {
      expect(requestBodies("/retrieve").filter((body) => body.purpose === "quiz")).toHaveLength(2);
    });
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
    await user.click(screen.getByRole("button", { name: "Nộp bài" }));

    expect(await screen.findByLabelText("Điểm 100 trên 100")).toBeTruthy();
    expect(screen.getByText("Trả lời đúng 2/2 câu trong lần làm hiện tại.")).toBeTruthy();
    const assessments = requestBodies("/assessments/quiz");
    expect(assessments).toHaveLength(1);
    expect(assessments[0]).toMatchObject({
      userAnswers: [
        { questionId: expect.any(String), selectedAnswer: 0 },
        { questionId: expect.any(String), selectedAnswer: 1 },
      ],
    });
  });

  it("never sends the Google OAuth token or credentials to Local RAG", async () => {
    await renderReadyApp();

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes("/videos/dQw4w9WgXcQ/index"),
        ),
      ).toBe(true);
    });
    for (const [input, init] of fetchMock.mock.calls) {
      if (!String(input).startsWith("http://127.0.0.1:8765/")) {
        continue;
      }
      expect(init?.credentials).toBe("omit");
      expect(new Headers(init?.headers).has("Authorization")).toBe(false);
      expect(String(init?.body ?? "")).not.toContain("test-google-access-token");
    }
  });
});
