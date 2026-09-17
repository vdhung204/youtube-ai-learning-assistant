import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../sidebar/App";
import {
  createAuthenticatedFetchMock,
  createChromeMock,
  createLearningChromeMock,
  createReadyLearningFetchMock,
  TEST_GOOGLE_SCOPE,
} from "./chromeMock";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Chrome integration states", () => {
  it("indexes the detected video and sends timestamp seeks to its YouTube tab", async () => {
    const chromeMock = createLearningChromeMock();
    vi.stubGlobal("chrome", chromeMock);
    vi.stubGlobal("fetch", createReadyLearningFetchMock());

    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText("Video YouTube đang mở")).toBeTruthy();
    await user.click(
      await screen.findByRole("button", { name: /Mở video tại 00:42/u }),
    );

    await waitFor(() => {
      expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(7, {
        seconds: 42,
        type: "YALA_SEEK_TO",
        videoId: "dQw4w9WgXcQ",
      });
    });
    expect(await screen.findByText("Đã chuyển video tới 42 giây.")).toBeTruthy();
  });

  it("shows a terminal no-transcript state and does not call index or Gemini", async () => {
    const chromeMock = createLearningChromeMock({ noTranscript: true });
    const fetchMock = createReadyLearningFetchMock();
    vi.stubGlobal("chrome", chromeMock);
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Video không có phụ đề" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bắt đầu Quiz" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Mở Flashcards" }).hasAttribute("disabled")).toBe(true);
    expect(
      screen.queryByRole("region", { name: "Mốc kiến thức theo Timestamp" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Thử lại" })).toBeNull();
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes("/index")),
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes(":generateContent")),
    ).toBe(false);
  });

  it("distinguishes an offline Local RAG Service and never requests transcript", async () => {
    const chromeMock = createLearningChromeMock();
    vi.stubGlobal("chrome", chromeMock);
    vi.stubGlobal("fetch", createReadyLearningFetchMock({ service: "offline" }));

    render(<App />);

    expect(await screen.findByText(/Không kết nối được Local Service/u)).toBeTruthy();
    expect(
      await screen.findByRole("heading", { name: "Local RAG Service chưa sẵn sàng" }),
    ).toBeTruthy();
    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ type: "YALA_GET_TRANSCRIPT" }),
    );
  });

  it("shows an explicit retry state when retrieval has no relevant context", async () => {
    vi.stubGlobal("chrome", createLearningChromeMock());
    vi.stubGlobal("fetch", createReadyLearningFetchMock({ noContext: true }));
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Bắt đầu Quiz" }).hasAttribute("disabled")).toBe(false);
    });
    await user.click(screen.getByRole("button", { name: "Quiz" }));

    expect(await screen.findByRole("heading", { name: "Không thể tạo Quiz" })).toBeTruthy();
    expect(screen.getByText("Không tìm thấy đoạn transcript liên quan.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy();
  });

  it("only opens interactive OAuth after a user click and can sign out", async () => {
    const getAuthToken = vi.fn(
      async ({ interactive }: chrome.identity.TokenDetails): Promise<chrome.identity.GetAuthTokenResult> => {
        if (!interactive) {
          throw new Error("No cached grant");
        }
        return { grantedScopes: [TEST_GOOGLE_SCOPE], token: "interactive-token" };
      },
    );
    const chromeMock = createChromeMock({ getAuthToken });
    const fetchMock = createAuthenticatedFetchMock();
    vi.stubGlobal("chrome", chromeMock);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Đăng nhập bằng Google" })).toBeTruthy();
    expect(getAuthToken).toHaveBeenCalledWith({ interactive: false });
    expect(getAuthToken).not.toHaveBeenCalledWith({ interactive: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(chromeMock.tabs.query).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Đăng nhập bằng Google" }));
    expect(await screen.findByRole("button", { name: "Quiz" })).toBeTruthy();
    expect(getAuthToken).toHaveBeenCalledWith({ interactive: true });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).startsWith("http://127.0.0.1:8765/")),
      ).toBe(true);
    });
    const localRequest = fetchMock.mock.calls.find(([url]) =>
      String(url).startsWith("http://127.0.0.1:8765/"),
    );
    expect(localRequest?.[1]).toMatchObject({ credentials: "omit" });
    expect(new Headers(localRequest?.[1]?.headers).has("Authorization")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Tài khoản learner" }));
    await user.click(screen.getByRole("menuitem", { name: "Đăng xuất khỏi tiện ích" }));

    expect(await screen.findByText("Bạn đã đăng xuất khỏi tiện ích.")).toBeTruthy();
    expect(chromeMock.identity.removeCachedAuthToken).toHaveBeenCalledWith({
      token: "interactive-token",
    });
    expect(chromeMock.identity.clearAllCachedAuthTokens).toHaveBeenCalledTimes(1);
  });
});
