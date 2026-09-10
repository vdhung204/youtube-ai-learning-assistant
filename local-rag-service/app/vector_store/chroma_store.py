"""One writer process; staged generations and atomic manifests publish complete indexes."""
from hashlib import sha256
from pathlib import Path
from uuid import uuid4

from app.chunking.models import Chunk
from .index_repository import IndexRepository


class ChromaStore:
    def __init__(self, cache_dir: Path, model_id: str, pipeline_version: str, dimension: int):
        import chromadb
        from chromadb.config import Settings
        from filelock import FileLock

        cache_dir.mkdir(parents=True, exist_ok=True)
        self.lock = FileLock(str(cache_dir / "tv3-writer.lock"))
        self.lock.acquire(timeout=0)
        self.cache_dir, self.model_id = cache_dir, model_id
        self.pipeline_version, self.dimension = pipeline_version, dimension
        identity = f"{model_id}:{pipeline_version}:{dimension}"
        self.name = "yala-chunks-" + sha256(identity.encode()).hexdigest()[:24]
        try:
            self.client = chromadb.PersistentClient(path=str(cache_dir),
                                                   settings=Settings(anonymized_telemetry=False))
            self.collection = self.client.get_or_create_collection(
                self.name, embedding_function=None, configuration={"hnsw": {"space": "cosine"}},
                metadata={"owner": "yala-tv3", "schemaVersion": 1})
            self.registry = IndexRepository(cache_dir / f"index-{self.name}.json")
            for video_id, record in list(self.registry.records.items()):
                if record["status"] == "indexing":
                    self.fail(video_id)  # A previous process died before commit.
            self._remove_orphans()
        except BaseException:
            self.lock.release()
            raise

    def close(self):
        # PersistentClient writes automatically; do not stop Chroma's shared private system.
        self.lock.release()

    def _remove_orphans(self):
        records = self.collection.get(include=["metadatas"])
        orphan_ids = []
        for identifier, metadata in zip(records["ids"], records["metadatas"]):
            active = (self.registry.get(metadata["videoId"]) or {}).get("active")
            if not active or active["generation"] != metadata["generation"]:
                orphan_ids.append(identifier)
        for start in range(0, len(orphan_ids), 128):
            self.collection.delete(ids=orphan_ids[start:start + 128])

    def active(self, video_id: str) -> dict | None:
        return (self.registry.get(video_id) or {}).get("active")

    def begin(self, video_id: str):
        self.registry.put(video_id, {"status": "indexing", "active": self.active(video_id)})

    def fail(self, video_id: str):
        self.registry.put(video_id, {"status": "failed", "active": self.active(video_id)})

    def status(self, video_id: str) -> dict:
        record = self.registry.get(video_id)
        result = {"videoId": video_id, "indexStatus": record["status"] if record else "not_indexed",
                  "chunkCount": (self.active(video_id) or {}).get("chunkCount", 0),
                  "pipelineVersion": self.pipeline_version}
        if record and record["status"] == "failed":
            result["error"] = {"code": "INDEX_FAILED", "message": "Index failed", "retryable": True, "details": None}
        return result

    def _where(self, video_id: str, generation: str) -> dict:
        return {"$and": [{"videoId": video_id}, {"generation": generation}]}

    def cache_hit(self, video_id: str, fingerprint: str) -> bool:
        active = self.active(video_id)
        if not active or active["fingerprint"] != fingerprint:
            return False
        actual = self.collection.get(where=self._where(video_id, active["generation"]), include=[])
        return len(actual["ids"]) == active["chunkCount"]

    def commit(self, video_id: str, fingerprint: str, duration: float,
               chunks: list[Chunk], vectors: list[list[float]]) -> None:
        from math import isfinite
        if not chunks or len(chunks) != len(vectors):
            raise ValueError("Invalid index batch")
        if any(c.video_id != video_id or c.pipeline_version != self.pipeline_version for c in chunks):
            raise ValueError("Cross-video or incompatible batch")
        if any(len(v) != self.dimension or not all(isfinite(x) for x in v) or not any(v) for v in vectors):
            raise ValueError("Invalid vector")
        generation = uuid4().hex
        old = self.active(video_id)
        for start in range(0, len(chunks), 128):
            batch = chunks[start:start + 128]
            self.collection.add(
                ids=[generation + ":" + c.chunk_id for c in batch],
                documents=[c.text for c in batch], embeddings=vectors[start:start + 128],
                metadatas=[{"videoId": c.video_id, "chunkId": c.chunk_id, "position": c.position,
                            "startSec": float(c.start_sec), "endSec": float(c.end_sec), "language": c.language,
                            "embeddingModel": self.model_id, "pipelineVersion": self.pipeline_version,
                            "generation": generation} for c in batch])
        actual = self.collection.get(where=self._where(video_id, generation), include=[])
        if len(actual["ids"]) != len(chunks):
            raise ValueError("Incomplete index write")
        self.registry.put(video_id, {"status": "ready", "active": {
            "generation": generation, "fingerprint": fingerprint, "durationSec": duration,
            "chunkCount": len(chunks)}})
        if old:
            # Publication already succeeded. Cleanup can safely retry at next startup.
            try:
                self.collection.delete(where=self._where(video_id, old["generation"]))
            except Exception:
                pass

    @staticmethod
    def _result(text: str, metadata: dict, score: float) -> dict:
        return {"chunkId": metadata["chunkId"], "videoId": metadata["videoId"], "text": text,
                "startSec": metadata["startSec"], "endSec": metadata["endSec"],
                "position": metadata["position"], "score": score}

    def query(self, video_id: str, vector: list[float], limit: int) -> list[dict]:
        active = self.active(video_id)
        if not active:
            return []
        result = self.collection.query(query_embeddings=[vector],
                    n_results=min(limit, active["chunkCount"]),
                    where=self._where(video_id, active["generation"]),
                    include=["documents", "metadatas", "distances"])
        return [self._result(text, meta, max(-1.0, min(1.0, 1.0 - distance)))
                for text, meta, distance in zip(result["documents"][0], result["metadatas"][0], result["distances"][0])]

    def get_chunks(self, video_id: str) -> list[dict]:
        active = self.active(video_id)
        if not active:
            return []
        result = self.collection.get(where=self._where(video_id, active["generation"]),
                                     include=["documents", "metadatas"])
        return sorted([self._result(text, meta, 1.0) for text, meta in
                      zip(result["documents"], result["metadatas"])], key=lambda c: c["position"])

    def delete_video(self, video_id: str) -> int:
        count = 0
        # Delete this video's cache across prior model/pipeline collections owned by this app.
        for collection in self.client.list_collections():
            if not collection.name.startswith("yala-chunks-") or (collection.metadata or {}).get("owner") != "yala-tv3":
                continue
            count += len(collection.get(where={"videoId": video_id}, include=[])["ids"])
            registry = self.registry if collection.name == self.name else IndexRepository(
                self.cache_dir / f"index-{collection.name}.json")
            registry.put(video_id, None)  # Unpublish first; a crash cannot expose deleted data.
            collection.delete(where={"videoId": video_id})
        return count

    def clear_all(self) -> int:
        video_ids = set()
        for collection in self.client.list_collections():
            if collection.name.startswith("yala-chunks-") and (collection.metadata or {}).get("owner") == "yala-tv3":
                video_ids.update(m["videoId"] for m in collection.get(include=["metadatas"])["metadatas"])
                registry = IndexRepository(self.cache_dir / f"index-{collection.name}.json")
                video_ids.update(registry.records)
        return sum(self.delete_video(video_id) for video_id in video_ids)
