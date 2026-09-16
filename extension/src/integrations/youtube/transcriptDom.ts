export interface TranscriptDomRow {
  startSec: number;
  text: string;
}

const TRANSCRIPT_SEGMENT_SELECTOR = [
  "ytd-transcript-segment-renderer",
  "ytd-transcript-segment-list-renderer ytd-transcript-segment-renderer",
].join(",");

const TRANSCRIPT_BUTTON_SELECTOR = [
  "ytd-video-description-transcript-section-renderer button",
  "ytd-video-description-transcript-section-renderer [role='button']",
  "button[aria-label*='transcript' i]",
  "button[aria-label*='bản chép lời' i]",
].join(",");

const DESCRIPTION_EXPAND_SELECTOR = [
  "ytd-watch-metadata ytd-text-inline-expander #expand",
  "#description-inline-expander #expand",
  "ytd-watch-metadata tp-yt-paper-button#expand",
].join(",");

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(abortError());
  }
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      window.clearTimeout(timeout);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function parseTranscriptTimestamp(value: string): number | null {
  const parts = value
    .trim()
    .split(":")
    .map((part) => Number(part));
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }
  let seconds = 0;
  for (const part of parts) {
    seconds = seconds * 60 + part;
  }
  return seconds >= 0 ? seconds : null;
}

export function readTranscriptRows(root: ParentNode = document): TranscriptDomRow[] {
  const rows: TranscriptDomRow[] = [];
  const seen = new Set<string>();
  for (const segment of root.querySelectorAll<HTMLElement>(TRANSCRIPT_SEGMENT_SELECTOR)) {
    const timestamp = segment.querySelector<HTMLElement>(
      ".segment-timestamp, [class*='segment-timestamp'], .cue-group-start-offset",
    )?.textContent ?? "";
    const text = segment.querySelector<HTMLElement>(
      ".segment-text, [class*='segment-text'], yt-formatted-string",
    )?.textContent ?? "";
    const startSec = parseTranscriptTimestamp(timestamp);
    const normalizedText = text.normalize("NFC").replace(/\s+/gu, " ").trim();
    const key = `${startSec}:${normalizedText}`;
    if (startSec !== null && normalizedText && !seen.has(key)) {
      seen.add(key);
      rows.push({ startSec, text: normalizedText });
    }
  }
  return rows.sort((left, right) => left.startSec - right.startSec);
}

function findTranscriptButton(): HTMLElement | null {
  return document.querySelector<HTMLElement>(TRANSCRIPT_BUTTON_SELECTOR);
}

async function waitForTranscriptButton(signal: AbortSignal): Promise<HTMLElement | null> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const button = findTranscriptButton();
    if (button) {
      return button;
    }
    await delay(150, signal);
  }
  return null;
}

function transcriptScrollContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    "ytd-transcript-renderer #segments-container, " +
      "ytd-transcript-segment-list-renderer #segments-container, " +
      "ytd-engagement-panel-section-list-renderer[visibility='ENGAGEMENT_PANEL_VISIBILITY_EXPANDED'] #segments-container",
  );
}

/**
 * Lets YouTube open its own transcript panel, then reads the timestamped rows.
 * This is the fallback for caption URLs protected by YouTube's runtime PO token,
 * which can otherwise return HTTP 200 with an empty body.
 */
export async function loadTranscriptRowsFromYouTubeUi(
  signal: AbortSignal,
): Promise<TranscriptDomRow[]> {
  const existing = readTranscriptRows();
  if (existing.length > 0) {
    return existing;
  }

  let button = findTranscriptButton();
  if (!button) {
    document.querySelector<HTMLElement>(DESCRIPTION_EXPAND_SELECTOR)?.click();
    button = await waitForTranscriptButton(signal);
  }
  if (!button) {
    return [];
  }
  button.click();

  const collected = new Map<string, TranscriptDomRow>();
  let stableAttempts = 0;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await delay(150, signal);
    const previousSize = collected.size;
    for (const row of readTranscriptRows()) {
      collected.set(`${row.startSec}:${row.text}`, row);
    }
    const container = transcriptScrollContainer();
    if (container && container.scrollTop + container.clientHeight < container.scrollHeight) {
      container.scrollTop = container.scrollHeight;
    }
    stableAttempts = collected.size === previousSize ? stableAttempts + 1 : 0;
    if (collected.size > 0 && stableAttempts >= 3) {
      break;
    }
  }
  return [...collected.values()].sort((left, right) => left.startSec - right.startSec);
}
