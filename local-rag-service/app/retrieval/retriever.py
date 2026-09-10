from app.core.errors import ServiceError
from app.embedding.embedder import Embedder
from app.vector_store.chroma_store import ChromaStore
from .config import RetrievalConfig
from .context_builder import build_context
from .deduplicator import deduplicate


class Retriever:
    def __init__(self, embedder: Embedder, store: ChromaStore,
                 config: RetrievalConfig = RetrievalConfig()):
        self.embedder, self.store, self.config = embedder, store, config

    def search(self, video_id: str, query: str, max_results: int | None = None) -> list[dict]:
        if not isinstance(query, str) or not query.strip():
            raise ServiceError("QUERY_INVALID")
        if not self.store.active(video_id):
            raise ServiceError("INDEX_NOT_FOUND")
        limit = max_results if max_results is not None else self.config.top_k
        if type(limit) is not int or not 1 <= limit <= 20:
            raise ServiceError("QUERY_INVALID")
        if self.embedder.count_tokens(query) > self.embedder.max_tokens:
            raise ServiceError("QUERY_INVALID")
        vector = self.embedder.embed_query(query.strip())
        candidates = self.store.query(video_id, vector, min(100, limit * 4))
        ranked = deduplicate([c for c in candidates if c["score"] >= self.config.threshold], self.config.dedup_overlap)
        return ranked[:limit]

    def retrieve(self, video_id: str, payload: dict) -> dict:
        if payload.get("purpose") not in {"quiz", "flashcard", "review"}:
            raise ServiceError("QUERY_INVALID")
        ranked = self.search(video_id, payload.get("query"), payload.get("maxResults"))
        chunks, _ = build_context(ranked, self.config.context_budget)
        return {"videoId": video_id, "purpose": payload["purpose"], "chunks": chunks,
                "reason": None if chunks else "NO_RELEVANT_CONTEXT"}
