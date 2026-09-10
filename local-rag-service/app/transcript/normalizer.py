from math import isfinite
import unicodedata
from .models import TranscriptSegment

def normalize_text(text: str) -> str:
    if not isinstance(text, str):
        raise ValueError("Segment text must be a string")
    # Preserve accents/punctuation. Replace corrupt/control characters, never guess words.
    text = unicodedata.normalize("NFC", text)
    text = "".join(" " if unicodedata.category(c) in {"Cc", "Cs"} or c == "\ufffd"
                   else c for c in text)
    return " ".join(text.split())


def validate_timing(segment: TranscriptSegment, duration_sec: float) -> None:
    values = (duration_sec, segment.start_sec, segment.end_sec)
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not isfinite(v)
           for v in values):
        raise ValueError("Times must be finite numbers")
    if duration_sec <= 0 or not 0 <= segment.start_sec <= segment.end_sec <= duration_sec:
        raise ValueError("Segment is out of bounds")
    if type(segment.position) is not int or segment.position < 0:
        raise ValueError("Invalid segment position")

def normalize_segment(
        segment: TranscriptSegment,
        duration_sec: float
        ) -> TranscriptSegment:
    validate_timing(segment, duration_sec)

    normalized_text = normalize_text(segment.text)

    if not normalized_text:
        raise ValueError("Segment text must not be empty")
    return TranscriptSegment(
        text=normalized_text,
        start_sec=segment.start_sec,
        end_sec=segment.end_sec,
        position=segment.position
    )

if __name__ == "__main__":
    # Example usage
    segment = TranscriptSegment(text="  Hello,   world!  ", start_sec=0.0, end_sec=5.0, position=1)
    duration = 10.0
    normalized_segment = normalize_segment(segment, duration)
    print(normalized_segment)
