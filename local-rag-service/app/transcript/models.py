from dataclasses import dataclass

@dataclass(frozen=True)
class TranscriptSegment:
    """
    Represents a segment of a transcript with its associated metadata.
    """
    text: str
    start_sec: float
    end_sec: float
    position: int
