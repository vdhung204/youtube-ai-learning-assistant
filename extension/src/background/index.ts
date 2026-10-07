const SIDE_PANEL_PATH = "index.html";

export function isYouTubeTabUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "https:" && parsedUrl.hostname === "www.youtube.com";
  } catch {
    return false;
  }
}

async function setSidePanelAvailability(tabId: number, url?: string): Promise<void> {
  let resolvedUrl = url;
  if (resolvedUrl === undefined) {
    try {
      resolvedUrl = (await chrome.tabs.get(tabId)).url;
    } catch {
      // The tab can be closed before this asynchronous update runs.
      return;
    }
  }

  const enabled = isYouTubeTabUrl(resolvedUrl);
  await chrome.sidePanel.setOptions(
    enabled
      ? { enabled: true, path: SIDE_PANEL_PATH, tabId }
      : { enabled: false, tabId },
  );
}

async function configureSidePanels(): Promise<void> {
  // Keep the default disabled and opt in only the individual YouTube tabs below.
  await Promise.all([
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }),
    chrome.sidePanel.setOptions({ enabled: false }),
  ]);
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs.flatMap((tab) =>
      tab.id === undefined ? [] : [setSidePanelAvailability(tab.id, tab.url)],
    ),
  );
}

function runSidePanelConfiguration(): void {
  void configureSidePanels().catch((error: unknown) => {
    console.warn("Could not configure the YouTube side panel.", error);
  });
}

chrome.runtime.onInstalled.addListener(runSidePanelConfiguration);
chrome.runtime.onStartup.addListener(runSidePanelConfiguration);

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void setSidePanelAvailability(tabId).catch(() => undefined);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url === undefined && changeInfo.status === undefined) {
    return;
  }
  void setSidePanelAvailability(tabId, changeInfo.url ?? tab.url).catch(() => undefined);
});

// Service workers are restarted independently of browser startup, so restore per-tab
// availability whenever this worker is loaded as well.
runSidePanelConfiguration();
