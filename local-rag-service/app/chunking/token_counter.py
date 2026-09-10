from typing import Protocol


class TokenCounter(Protocol):
    def count_tokens(self, text: str) -> int: ...


class Utf8Counter:
    """Conservative context budget: UTF-8 byte count, NOT an exact Gemini tokenizer."""
    def count_tokens(self, text: str) -> int:
        return len(text.encode("utf-8"))
