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
