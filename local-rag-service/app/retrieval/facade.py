"""TV2 integration: one worker serializes model/Chroma work; HTTP never blocks on inference."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from hashlib import sha256
import json
import os
from pathlib import Path
import re

from app.assessment.assessment_service import AssessmentService
from app.chunking.chunker import chunk_transcript
from app.chunking.config import ChunkingConfig
from app.core.errors import ServiceError
from app.core.rag_facade import Readiness
from app.embedding.config import EmbeddingConfig
from app.embedding.sentence_transformer_embedder import SentenceTransformerEmbedder
from app.transcript.models import TranscriptSegment
from app.transcript.processor import process_transcript
from app.transcript.merger import merge_short_segments
from app.vector_store.chroma_store import ChromaStore
from .config import RetrievalConfig
from .retriever import Retriever

PIPELINE_VERSION = "tv3-v1.0"


class LocalRagFacade:
    def __init__(self, embedder=None, chunking: ChunkingConfig = ChunkingConfig(),
                 retrieval: RetrievalConfig = RetrievalConfig(), embedding: EmbeddingConfig = EmbeddingConfig()):
        self.embedder, self.chunking, self.retrieval_config, self.embedding_config = embedder, chunking, retrieval, embedding
        self.store = None
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="yala-rag")
        self._lock = asyncio.Lock()
        self._jobs: dict[str, asyncio.Task] = {}
        self._fingerprints = {}
        self._ready = False
        self._closing = False
        self._shutdown_task = None
        self.pipeline_version = PIPELINE_VERSION

    async def _run(self, function, *args):
        # Shield synchronous work from coroutine cancellation. Later operations remain serialized.
        future = asyncio.get_running_loop().run_in_executor(self._executor, function, *args)
        try:
            return await asyncio.shield(future)
        except asyncio.CancelledError:
            # Consume later worker errors without suppressing cancellation of the caller.
            future.add_done_callback(lambda f: f.exception() if not f.cancelled() else None)
            raise

    def _startup(self, cache_dir: Path):
        self.embedder = self.embedder or SentenceTransformerEmbedder(cache_dir.parent / "models", self.embedding_config)
        if self.chunking.max_tokens > self.embedder.max_tokens:
            raise ValueError("Chunk budget exceeds model maximum sequence length")
        config_hash = sha256(json.dumps(asdict(self.chunking), sort_keys=True).encode()).hexdigest()[:12]
        self.pipeline_version = PIPELINE_VERSION + "-" + config_hash
        self.store = ChromaStore(cache_dir, self.embedder.model_id, self.pipeline_version, self.embedder.dimension)
        self.retriever = Retriever(self.embedder, self.store, self.retrieval_config)
        self.assessment = AssessmentService(self.retriever)
        self._ready = True

    async def startup(self, cache_dir: Path) -> None:
        await self._run(self._startup, Path(cache_dir))

    async def shutdown(self) -> None:
        self._closing = True
        if self._shutdown_task is None:
            self._shutdown_task = asyncio.create_task(self._finish_shutdown())
        await asyncio.shield(self._shutdown_task)

    async def _finish_shutdown(self) -> None:
        async with self._lock:
            await asyncio.gather(*self._jobs.values(), return_exceptions=True)
            if self.store:
                await self._run(self.store.close)
            self._ready = False
            self._executor.shutdown(wait=False)

    async def readiness(self) -> Readiness:
        return Readiness(self.pipeline_version, self._ready and not self._closing, self._ready and not self._closing)

    def _check(self, video_id: str):
        if not self._ready or self._closing:
            raise ServiceError("SERVICE_NOT_READY")
        if not isinstance(video_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
            raise ServiceError("INVALID_VIDEO_ID")

    def _prepare(self, video_id: str, payload: dict):
        try:
            video = payload["video"]
            if video["videoId"] != video_id:
                raise ServiceError("VIDEO_ID_MISMATCH")
            segments = [TranscriptSegment(s["text"], s["startSec"], s["endSec"], s["position"])
                        for s in payload["transcriptSegments"]]
            normalized = process_transcript(segments, video["durationSec"])
            if not isinstance(video["language"], str) or not video["language"].strip():
                raise ValueError("Invalid language")
            identity = {"segments": [asdict(s) for s in normalized], "duration": video["durationSec"],
                        "language": video["language"], "model": self.embedder.model_id, "pipeline": self.pipeline_version}
            fingerprint = sha256(json.dumps(identity, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()).hexdigest()
            return normalized, dict(video), fingerprint
        except (KeyError, TypeError, ValueError):
            raise ServiceError("TRANSCRIPT_INVALID") from None

    async def index(self, video_id: str, payload: dict) -> dict:
        self._check(video_id)
        async with self._lock:
            self._check(video_id)
            # Pure validation can run while the single model/store worker is indexing.
            normalized, video, fingerprint = await asyncio.to_thread(self._prepare, video_id, payload)
            existing = self._jobs.get(video_id)
            if existing and not existing.done():
                if self._fingerprints[video_id] != fingerprint:
                    raise ServiceError("INVALID_REQUEST")
            elif await self._run(self.store.cache_hit, video_id, fingerprint):
                state = await self._run(self.store.status, video_id)
                return {"videoId": video_id, "indexStatus": "ready", "cached": True,
                        "chunkCount": state["chunkCount"], "pipelineVersion": self.pipeline_version}
            else:
                self._fingerprints[video_id] = fingerprint
                self._jobs[video_id] = asyncio.create_task(self._index_job(video_id, normalized, video, fingerprint))
                self._jobs[video_id].add_done_callback(lambda t: t.exception() if not t.cancelled() else None)
            return {"videoId": video_id, "indexStatus": "indexing", "cached": False,
                    "pipelineVersion": self.pipeline_version}

    def _index_sync(self, video_id, normalized, video, fingerprint):
        self.store.begin(video_id)
        merged = merge_short_segments(normalized, self.chunking.merge_min_chars, self.chunking.merge_gap_sec)
        chunks = chunk_transcript(merged, video_id, video["language"], self.pipeline_version, self.embedder, self.chunking)
        vectors = self.embedder.embed_documents([chunk.text for chunk in chunks])
        self.store.commit(video_id, fingerprint, video["durationSec"], chunks, vectors)

    async def _index_job(self, video_id, normalized, video, fingerprint):
        try:
            await self._run(self._index_sync, video_id, normalized, video, fingerprint)
        except asyncio.CancelledError:
            raise
        except Exception:
            await self._run(self.store.fail, video_id)
        finally:
            self._fingerprints.pop(video_id, None)

    async def index_status(self, video_id: str) -> dict:
        self._check(video_id)
        # Registry commits replace its dict atomically; reading this immutable snapshot does
        # not queue behind long-running inference, so polling remains responsive.
        result = self.store.status(video_id)
        job = self._jobs.get(video_id)
        if job and not job.done():
            result["indexStatus"] = "indexing"
            result.pop("error", None)
        return result

    async def retrieve(self, video_id: str, payload: dict) -> dict:
        self._check(video_id)
        return await self._run(self.retriever.retrieve, video_id, payload)

    async def assess_quiz(self, video_id: str, payload: dict) -> dict:
        self._check(video_id)
        return await self._run(self.assessment.assess, video_id, payload)

    async def delete_cache(self, video_id: str) -> dict:
        self._check(video_id)
        async with self._lock:
            job = self._jobs.get(video_id)
            if job:
                await asyncio.shield(job)
            count = await self._run(self.store.delete_video, video_id)
            self._jobs.pop(video_id, None)
            return {"videoId": video_id, "deleted": count > 0, "deletedChunkCount": count}


def create_facade() -> LocalRagFacade:
    return LocalRagFacade(
        chunking=ChunkingConfig(max_tokens=int(os.getenv("YALA_CHUNK_TOKENS", "64")),
                               overlap_tokens=int(os.getenv("YALA_OVERLAP_TOKENS", "8")),
                               max_gap_sec=float(os.getenv("YALA_CHUNK_MAX_GAP_SEC", "5")),
                               merge_min_chars=int(os.getenv("YALA_MERGE_MIN_CHARS", "24")),
                               merge_gap_sec=float(os.getenv("YALA_MERGE_GAP_SEC", "1"))),
        retrieval=RetrievalConfig(top_k=int(os.getenv("YALA_TOP_K", "5")),
                                  threshold=float(os.getenv("YALA_SIMILARITY_THRESHOLD", "0.35")),
                                  context_budget=int(os.getenv("YALA_CONTEXT_BUDGET", "6000")),
                                  dedup_overlap=float(os.getenv("YALA_DEDUP_OVERLAP", "0.8")),
                                  strong_topic_ratio=float(os.getenv("YALA_STRONG_TOPIC_RATIO", "0.7"))),
        embedding=EmbeddingConfig(model_name=os.getenv("YALA_EMBEDDING_MODEL", EmbeddingConfig().model_name),
                                   revision=os.getenv("YALA_EMBEDDING_REVISION", EmbeddingConfig().revision),
                                   batch_size=int(os.getenv("YALA_EMBEDDING_BATCH_SIZE", "16")),
                                   device=os.getenv("YALA_EMBEDDING_DEVICE", "cpu")))
