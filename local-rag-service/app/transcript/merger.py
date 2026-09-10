"""Merge a short segment forward only across a small gap."""
from .models import TranscriptSegment


def merge_short_segments(segments: list[TranscriptSegment], min_chars: int = 24,
                         max_gap_sec: float = 1.0) -> list[TranscriptSegment]:
    if min_chars < 0 or max_gap_sec < 0:
        raise ValueError("Invalid merge configuration")
    result: list[TranscriptSegment] = []
    for segment in segments:
        if (result and len(result[-1].text) < min_chars
                and segment.start_sec - result[-1].end_sec <= max_gap_sec):
            previous = result.pop()
            result.append(TranscriptSegment(previous.text + " " + segment.text,
                          previous.start_sec, max(previous.end_sec, segment.end_sec), previous.position))
        else:
            result.append(segment)
    return result
