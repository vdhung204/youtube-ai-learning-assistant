const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

export function isValidVideoId(value: string): boolean {
  return VIDEO_ID_PATTERN.test(value);
}

export function parseYouTubeVideoId(input: string): string | null {
  try {
    const url = new URL(input);
    if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) {
      return null;
    }

    const candidate =
      url.hostname.toLowerCase() === "youtu.be"
        ? url.pathname.split("/").filter(Boolean)[0]
        : url.pathname === "/watch"
          ? url.searchParams.get("v")
          : ["shorts", "embed", "live"].includes(url.pathname.split("/")[1] ?? "")
            ? url.pathname.split("/")[2]
            : null;

    return candidate && isValidVideoId(candidate) ? candidate : null;
  } catch {
    return null;
  }
}
