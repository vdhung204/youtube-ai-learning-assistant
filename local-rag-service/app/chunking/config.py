from dataclasses import dataclass
from math import isfinite


@dataclass(frozen=True)
class ChunkingConfig:
    max_tokens: int = 64
    overlap_tokens: int = 8
    max_gap_sec: float = 5.0
    merge_min_chars: int = 24
    merge_gap_sec: float = 1.0

    def __post_init__(self):
        if not 0 <= self.overlap_tokens < self.max_tokens or self.max_tokens < 4:
            raise ValueError("Require 0 <= overlap < max_tokens and max_tokens >= 4")
        if any(not isfinite(v) or v < 0 for v in (self.max_gap_sec, self.merge_gap_sec)):
            raise ValueError("Invalid gap")
        if self.merge_min_chars < 0:
            raise ValueError("Invalid minimum segment size")
