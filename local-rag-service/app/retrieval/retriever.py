from app.core.errors import ServiceError
from app.embedding.embedder import Embedder
from app.vector_store.chroma_store import ChromaStore
from .config import RetrievalConfig
from .context_builder import build_context, build_overview_context
from .deduplicator import deduplicate
from .context_builder import serialize_context


class Retriever:
    def __init__(self, embedder: Embedder, store: ChromaStore,
                 config: RetrievalConfig = RetrievalConfig()):
        self.embedder, self.store, self.config = embedder, store, config

    def _validate_query(self, video_id: str, query: str, max_results: int | None) -> int:
        if not isinstance(query, str) or not query.strip():
            raise ServiceError("QUERY_INVALID")
        if not self.store.active(video_id):
            raise ServiceError("INDEX_NOT_FOUND")
        limit = max_results if max_results is not None else self.config.top_k
        if type(limit) is not int or not 1 <= limit <= 20:
            raise ServiceError("QUERY_INVALID")
        if self.embedder.count_tokens(query) > self.embedder.max_tokens:
            raise ServiceError("QUERY_INVALID")
        return limit

    def search(self, video_id: str, query: str, max_results: int | None = None) -> list[dict]:
        limit = self._validate_query(video_id, query, max_results)
        vector = self.embedder.embed_query(query.strip())
        candidates = self.store.query(video_id, vector, min(100, limit * 4))
        ranked = deduplicate([c for c in candidates if c["score"] >= self.config.threshold], self.config.dedup_overlap)
        return ranked[:limit]

    def retrieve(self, video_id: str, payload: dict) -> dict:
        if payload.get("purpose") not in {"quiz", "flashcard", "review"}:
            raise ServiceError("QUERY_INVALID")
        if payload["purpose"] in {"quiz", "flashcard"}:
            limit = self._validate_query(video_id, payload.get("query"), payload.get("maxResults"))
            source = self.store.get_chunks(video_id)
            if "startSec" in payload:
                start, end = payload["startSec"], payload["endSec"]
                if not 0 <= start < end <= self.store.active(video_id)["durationSec"] + 0.001:
                    raise ServiceError("QUERY_INVALID")
                source = [c for c in source if c["startSec"] < end and c["endSec"] >= start
                          and c["position"] > payload.get("afterPosition", -1)]
                chunks = []
                for chunk in source[:limit]:
                    if len(serialize_context(chunks + [chunk]).encode("utf-8")) > self.config.context_budget:
                        if not chunks:
                            raise ServiceError("RETRIEVAL_FAILED")
                        break
                    chunks.append(chunk)
                return {"videoId": video_id, "purpose": payload["purpose"], "chunks": chunks,
                        "nextPosition": chunks[-1]["position"] if chunks and len(source) > len(chunks) else None,
                        "reason": None if chunks else "NO_RELEVANT_CONTEXT"}
            chunks = build_overview_context(source, limit, self.config.context_budget)
        else:
            ranked = self.search(video_id, payload.get("query"), payload.get("maxResults"))
            chunks, _ = build_context(ranked, self.config.context_budget)
        return {"videoId": video_id, "purpose": payload["purpose"], "chunks": chunks,
                "reason": None if chunks else "NO_RELEVANT_CONTEXT"}
