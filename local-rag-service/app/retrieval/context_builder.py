import json

from app.chunking.token_counter import TokenCounter, Utf8Counter


def serialize_context(chunks: list[dict]) -> str:
    return json.dumps(chunks, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def build_context(chunks: list[dict], budget: int, counter: TokenCounter | None = None) -> tuple[list[dict], str]:
    counter = counter or Utf8Counter()
    if counter.count_tokens("[]") > budget:
        raise ValueError("Context budget is too small")
    selected = []
    for chunk in sorted(chunks, key=lambda c: (-c["score"], c["position"])):
        candidate = sorted(selected + [chunk], key=lambda c: c["position"])
        if counter.count_tokens(serialize_context(candidate)) <= budget:
            selected = candidate
    return selected, serialize_context(selected)


def build_overview_context(chunks: list[dict], limit: int, budget: int) -> list[dict]:
    """Sample passages across the video for a general quiz/flashcard request.

    Similarity to a generic instruction/title is not a measure of educational
    value: an outro mentioning the title can outrank every substantive passage.
    Keep original source IDs/timestamps so generated items remain assessable.
    """
    unique = {}
    for chunk in sorted(chunks, key=lambda c: c["position"]):
        key = " ".join(chunk["text"].casefold().split())
        if key:
            unique.setdefault(key, chunk)
    passages = list(unique.values())
    # If the budget cannot fit the requested count, resample the whole video
    # at a lower count instead of silently keeping only its beginning.
    for count in range(min(limit, len(passages)), 0, -1):
        sampled = [passages[(2 * i + 1) * len(passages) // (2 * count)] for i in range(count)]
        selected, _ = build_context(sampled, budget)
        if len(selected) == count:
            return selected
    return []
