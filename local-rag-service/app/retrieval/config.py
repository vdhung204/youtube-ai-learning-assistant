from dataclasses import dataclass
from math import isfinite


@dataclass(frozen=True)
class RetrievalConfig:
    top_k: int = 5
    threshold: float = 0.35
    context_budget: int = 6000
    dedup_overlap: float = 0.8
    strong_topic_ratio: float = 0.7

    def __post_init__(self):
        if not 1 <= self.top_k <= 20 or self.context_budget < 256:
            raise ValueError("Invalid retrieval limits")
        if not isfinite(self.threshold) or not -1 <= self.threshold <= 1:
            raise ValueError("Invalid cosine similarity threshold")
        if not 0 < self.dedup_overlap <= 1 or not 0 <= self.strong_topic_ratio <= 1:
            raise ValueError("Invalid assessment/deduplication threshold")
