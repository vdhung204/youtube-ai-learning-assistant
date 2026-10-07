import { beforeEach, describe, expect, it, vi } from "vitest";

interface ChromeBackgroundMock {
  runtime: {
    onInstalled: { addListener: ReturnType<typeof vi.fn> };
    onStartup: { addListener: ReturnType<typeof vi.fn> };
  };
  sidePanel: {
    setOptions: ReturnType<typeof vi.fn>;
    setPanelBehavior: ReturnType<typeof vi.fn>;
  };
  tabs: {
    get: ReturnType<typeof vi.fn>;
    onActivated: { addListener: ReturnType<typeof vi.fn> };
    onUpdated: { addListener: ReturnType<typeof vi.fn> };
    query: ReturnType<typeof vi.fn>;
  };
}

function createBackgroundChromeMock(): ChromeBackgroundMock {
  return {
    runtime: {
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
    },
    sidePanel: {
      setOptions: vi.fn().mockResolvedValue(undefined),
      setPanelBehavior: vi.fn().mockResolvedValue(undefined),
    },
    tabs: {
      get: vi.fn(),
      onActivated: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn() },
      query: vi.fn().mockResolvedValue([]),
    },
  };
}

async function flushAsyncListeners(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("background side-panel visibility", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("recognizes only supported YouTube tabs", async () => {
    vi.stubGlobal("chrome", createBackgroundChromeMock());
    const { isYouTubeTabUrl } = await import("../background/index");

    expect(isYouTubeTabUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isYouTubeTabUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(true);
    expect(isYouTubeTabUrl("https://example.com/?next=https://www.youtube.com/")).toBe(false);
    expect(isYouTubeTabUrl("http://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(false);
    expect(isYouTubeTabUrl(undefined)).toBe(false);
  });

  it("enables the panel on YouTube and disables it after switching tabs", async () => {
    const chromeMock = createBackgroundChromeMock();
    vi.stubGlobal("chrome", chromeMock);
    await import("../background/index");

    const activatedListener = chromeMock.tabs.onActivated.addListener.mock.calls[0]?.[0] as
      | ((activeInfo: { tabId: number }) => void)
      | undefined;
    expect(activatedListener).toBeTypeOf("function");

    chromeMock.tabs.get.mockResolvedValueOnce({
      id: 7,
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    activatedListener?.({ tabId: 7 });
    await flushAsyncListeners();
    expect(chromeMock.sidePanel.setOptions).toHaveBeenLastCalledWith({
      enabled: true,
      path: "index.html",
      tabId: 7,
    });

    chromeMock.tabs.get.mockResolvedValueOnce({ id: 8, url: "https://example.com/" });
    activatedListener?.({ tabId: 8 });
    await flushAsyncListeners();
    expect(chromeMock.sidePanel.setOptions).toHaveBeenLastCalledWith({
      enabled: false,
      tabId: 8,
    });
  });

  it("disables the global fallback panel", async () => {
    const chromeMock = createBackgroundChromeMock();
    vi.stubGlobal("chrome", chromeMock);
    await import("../background/index");
    await flushAsyncListeners();

    expect(chromeMock.sidePanel.setOptions).toHaveBeenCalledWith({ enabled: false });
  });

  it("updates visibility when the current tab navigates away from YouTube", async () => {
    const chromeMock = createBackgroundChromeMock();
    vi.stubGlobal("chrome", chromeMock);
    await import("../background/index");

    const updatedListener = chromeMock.tabs.onUpdated.addListener.mock.calls[0]?.[0] as
      | ((
          tabId: number,
          changeInfo: { status?: string; url?: string },
          tab: { url?: string },
        ) => void)
      | undefined;
    expect(updatedListener).toBeTypeOf("function");

    updatedListener?.(
      7,
      { status: "loading", url: "https://news.example.com/" },
      { url: "https://news.example.com/" },
    );
    await flushAsyncListeners();

    expect(chromeMock.sidePanel.setOptions).toHaveBeenLastCalledWith({
      enabled: false,
      tabId: 7,
    });
  });
});
