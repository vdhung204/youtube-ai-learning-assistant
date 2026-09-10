"""Greedy token-bounded chunks with whole-fragment overlap and source timestamps."""
from hashlib import sha256

from app.transcript.models import TranscriptSegment
from .config import ChunkingConfig
from .models import Chunk
from .token_counter import TokenCounter


def split_segment(segment: TranscriptSegment, limit: int, counter: TokenCounter) -> list[TranscriptSegment]:
    remaining = segment.text
    pieces = []
    while remaining:
        if counter.count_tokens(remaining) <= limit:
            end = len(remaining)
        else:
            # Find a safe character prefix, then prefer a word boundary. Every iteration consumes text.
            low, high = 1, len(remaining)
            end = 0
            while low <= high:
                middle = (low + high) // 2
                if counter.count_tokens(remaining[:middle]) <= limit:
                    end, low = middle, middle + 1
                else:
                    high = middle - 1
            if not end:
                raise ValueError("One character exceeds the token budget")
            boundary = remaining.rfind(" ", 0, end + 1)
            if boundary > 0:
                end = boundary
        text, remaining = remaining[:end].strip(), remaining[end:].lstrip()
        if text:
            # No invented sub-second precision: a fragment inherits its source segment's interval.
            pieces.append(TranscriptSegment(text, segment.start_sec, segment.end_sec, segment.position))
    return pieces


def chunk_transcript(segments: list[TranscriptSegment], video_id: str, language: str,
                     pipeline_version: str, counter: TokenCounter,
                     config: ChunkingConfig = ChunkingConfig()) -> list[Chunk]:
    if not segments:
        raise ValueError("Cannot chunk an empty transcript")
    units = [part for segment in segments for part in split_segment(segment, config.max_tokens, counter)]
    chunks = []
    start = 0
    while start < len(units):
        end = start + 1
        while end < len(units):
            gap = units[end].start_sec - max(s.end_sec for s in units[start:end])
            candidate = " ".join(s.text for s in units[start:end + 1])
            if gap > config.max_gap_sec or counter.count_tokens(candidate) > config.max_tokens:
                break
            end += 1
        group = units[start:end]
        text = " ".join(s.text for s in group)
        timestamp = (group[0].start_sec, max(s.end_sec for s in group))
        identity = repr((video_id, pipeline_version, len(chunks), timestamp, text))
        chunks.append(Chunk(sha256(identity.encode()).hexdigest(), video_id, text,
                            *timestamp, len(chunks), language, pipeline_version))
        if end == len(units):
            break
        next_start = end
        # Never overlap across a long silence or repeat the entire previous chunk.
        if units[end].start_sec - timestamp[1] <= config.max_gap_sec:
            while next_start > start + 1:
                tail = " ".join(s.text for s in units[next_start - 1:end])
                if counter.count_tokens(tail) > config.overlap_tokens:
                    break
                next_start -= 1
        start = next_start
    return chunks
