"""Validate order before discarding empty/noise segments; never silently sort input."""
from .models import TranscriptSegment
from .normalizer import normalize_text, validate_timing

NOISE = frozenset({"[music]", "[applause]", "[nhạc]", "[âm nhạc]", "[vỗ tay]"})


def process_transcript(segments: list[TranscriptSegment], duration_sec: float) -> list[TranscriptSegment]:
    if not segments:
        raise ValueError("Transcript must not be empty")
    result = []
    previous = None
    for segment in segments:
        validate_timing(segment, duration_sec)
        if previous and (segment.position <= previous.position or segment.start_sec < previous.start_sec):
            raise ValueError("Transcript order is invalid")
        previous = segment
        text = normalize_text(segment.text)
        if text and text.casefold() not in NOISE:
            result.append(TranscriptSegment(text, segment.start_sec, segment.end_sec, segment.position))
    if not result:
        raise ValueError("Transcript contains no usable text")
    return result
