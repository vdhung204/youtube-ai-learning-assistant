import asyncio
from copy import deepcopy
from dataclasses import replace
from pathlib import Path
import tempfile
import threading
import subprocess
import sys
from unittest.mock import patch
import unittest

from helpers import VIDEO, OTHER_VIDEO, SyntheticEmbedder, payload, quiz
from app.chunking.config import ChunkingConfig
from app.chunking.models import Chunk
from app.core.errors import ServiceError
from app.retrieval.facade import LocalRagFacade
from app.vector_store.chroma_store import ChromaStore


class PipelineTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temporary = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.cache = Path(self.temporary.name)
        self.embedder = SyntheticEmbedder()
        self.rag = LocalRagFacade(embedder=self.embedder)
        await self.rag.startup(self.cache)

    async def asyncTearDown(self):
        await self.rag.shutdown()
        self.temporary.cleanup()

    async def indexed(self, video_id=VIDEO):
        response = await self.rag.index(video_id, payload(video_id))
        if not response["cached"]:
            await self.rag._jobs[video_id]
        self.assertEqual((await self.rag.index_status(video_id))["indexStatus"], "ready")

    async def test_cache_hit_does_not_embed_again(self):
        await self.indexed()
        calls = self.embedder.document_calls
        result = await self.rag.index(VIDEO, payload())
        self.assertTrue(result["cached"])
        self.assertEqual(self.embedder.document_calls, calls)

    async def test_video_isolation_and_no_context(self):
        await self.indexed()
        await self.indexed(OTHER_VIDEO)
        result = await self.rag.retrieve(VIDEO, {"query": "tuple", "purpose": "quiz"})
        self.assertEqual(len(result["chunks"]), 1)
        self.assertEqual(result["chunks"][0]["startSec"], 120)
        self.assertTrue(all(c["videoId"] == VIDEO for c in result["chunks"]))
        empty = await self.rag.retrieve(VIDEO, {"query": "astronomy", "purpose": "quiz"})
        self.assertEqual(empty["reason"], "NO_RELEVANT_CONTEXT")

    async def test_transcript_change_invalidates_cache_and_removes_old_chunks(self):
        await self.indexed()
        changed = payload()
        changed["transcriptSegments"] = changed["transcriptSegments"][:1]
        response = await self.rag.index(VIDEO, changed)
        self.assertFalse(response["cached"])
        await self.rag._jobs[VIDEO]
        self.assertEqual(len(self.rag.store.get_chunks(VIDEO)), 1)
        self.assertEqual(self.rag.store.collection.count(), 1)

    async def test_failed_reindex_keeps_previous_complete_generation(self):
        await self.indexed()
        before = self.rag.store.get_chunks(VIDEO)
        changed = payload()
        changed["transcriptSegments"][0]["text"] += " extra"
        self.embedder.fail = True
        await self.rag.index(VIDEO, changed)
        await self.rag._jobs[VIDEO]
        self.assertEqual((await self.rag.index_status(VIDEO))["indexStatus"], "failed")
        self.assertEqual(self.rag.store.get_chunks(VIDEO), before)
        self.assertNotIn("SYNTHETIC_PRIVATE_EXCEPTION", (self.cache / f"index-{self.rag.store.name}.json").read_text())

    async def test_restart_reopens_persistent_cache(self):
        await self.indexed()
        await self.rag.shutdown()
        self.rag = LocalRagFacade(embedder=self.embedder)
        await self.rag.startup(self.cache)
        self.assertTrue((await self.rag.index(VIDEO, payload()))["cached"])
        self.assertEqual((await self.rag.index_status(VIDEO))["chunkCount"], 2)

    async def test_different_model_or_pipeline_cannot_reuse_cache(self):
        await self.indexed()
        await self.rag.shutdown()
        self.rag = LocalRagFacade(embedder=self.embedder, chunking=ChunkingConfig(max_tokens=96, overlap_tokens=16))
        await self.rag.startup(self.cache)
        self.assertEqual((await self.rag.index_status(VIDEO))["indexStatus"], "not_indexed")
        await self.rag.delete_cache(VIDEO)
        self.assertTrue(all(c.count() == 0 for c in self.rag.store.client.list_collections()))

    async def test_delete_waits_for_index_and_never_resurrects_video(self):
        await self.rag.index(VIDEO, payload())
        result = await self.rag.delete_cache(VIDEO)
        self.assertTrue(result["deleted"])
        self.assertEqual((await self.rag.index_status(VIDEO))["indexStatus"], "not_indexed")
        self.assertFalse((await self.rag.delete_cache(VIDEO))["deleted"])

    async def test_delete_does_not_touch_another_video(self):
        await self.indexed()
        await self.indexed(OTHER_VIDEO)
        await self.rag.delete_cache(VIDEO)
        self.assertEqual((await self.rag.index_status(OTHER_VIDEO))["indexStatus"], "ready")

    async def test_assessment_grounded_timestamp_and_no_persisted_answers(self):
        await self.indexed()
        chunk = self.rag.store.get_chunks(VIDEO)[1]
        before = (self.cache / f"index-{self.rag.store.name}.json").read_bytes()
        result = await self.rag.assess_quiz(VIDEO, quiz(chunk))
        self.assertEqual(result["score"], 0)
        self.assertEqual(result["weakTopics"], ["Tuple"])
        self.assertEqual(result["reviewTimestamps"][0]["startSec"], 120)
        self.assertEqual(before, (self.cache / f"index-{self.rag.store.name}.json").read_bytes())
        invalid = quiz(chunk)
        invalid["questions"][0]["sourceTimestamp"]["endSec"] = 170
        with self.assertRaises(ServiceError):
            await self.rag.assess_quiz(VIDEO, invalid)

    async def test_missing_index_and_invalid_transcript(self):
        with self.assertRaises(ServiceError) as caught:
            await self.rag.retrieve(VIDEO, {"query": "tuple", "purpose": "quiz"})
        self.assertEqual(caught.exception.code, "INDEX_NOT_FOUND")
        invalid = payload()
        invalid["transcriptSegments"][0]["endSec"] = 1000
        with self.assertRaises(ServiceError):
            await self.rag.index(VIDEO, invalid)

    async def test_second_writer_is_rejected(self):
        from filelock import Timeout
        with self.assertRaises(Timeout):
            ChromaStore(self.cache, self.embedder.model_id, self.rag.pipeline_version, self.embedder.dimension)

    async def test_fresh_process_reads_committed_cache(self):
        await self.indexed()
        version = self.rag.pipeline_version
        await self.rag.shutdown()
        program = (
            "from pathlib import Path; import sys; "
            "from app.vector_store.chroma_store import ChromaStore; "
            "store = ChromaStore(Path(sys.argv[1]), sys.argv[2], sys.argv[3], 5); "
            "assert store.status(sys.argv[4])['chunkCount'] == 2; "
            "assert store.get_chunks(sys.argv[4])[1]['startSec'] == 120; store.close(); print('restart-ok')"
        )
        result = await asyncio.to_thread(subprocess.run, [sys.executable, "-c", program, str(self.cache),
                         self.embedder.model_id, version, VIDEO], cwd=Path(__file__).resolve().parents[2],
                         capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("restart-ok", result.stdout)

    async def test_partial_generation_is_never_visible_and_is_cleaned_on_restart(self):
        await self.indexed()
        before = self.rag.store.get_chunks(VIDEO)
        store = self.rag.store
        chunks = [Chunk(str(i), VIDEO, f"Tuple part {i}", 0, 1, i, "vi", self.rag.pipeline_version) for i in range(130)]
        actual_add = store.collection.add
        calls = 0
        def interrupted_add(**kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError("Simulated disk write failure")
            return actual_add(**kwargs)
        with patch.object(store.collection, "add", side_effect=interrupted_add):
            with self.assertRaises(RuntimeError):
                store.commit(VIDEO, "new", 180, chunks, [[0, 1, 0, 0, 0]] * len(chunks))
        self.assertEqual(store.get_chunks(VIDEO), before)
        await self.rag.shutdown()
        self.rag = LocalRagFacade(embedder=self.embedder)
        await self.rag.startup(self.cache)
        self.assertEqual(self.rag.store.collection.count(), 2)

    async def test_clear_all_preserves_other_chroma_collection(self):
        await self.indexed()
        foreign = self.rag.store.client.create_collection("other-application", embedding_function=None)
        foreign.add(ids=["outside"], documents=["outside"], embeddings=[[1.0, 0.0]])
        self.assertEqual(self.rag.store.clear_all(), 2)
        self.assertEqual(foreign.count(), 1)

    async def test_status_and_duplicate_index_remain_responsive_during_inference(self):
        entered, release = threading.Event(), threading.Event()
        original = self.embedder.embed_documents
        def delayed(texts):
            entered.set()
            if not release.wait(5):
                raise RuntimeError("Test timed out")
            return original(texts)
        self.embedder.embed_documents = delayed
        try:
            await self.rag.index(VIDEO, payload())
            self.assertTrue(await asyncio.to_thread(entered.wait, 2))
            state = await asyncio.wait_for(self.rag.index_status(VIDEO), 0.5)
            self.assertEqual(state["indexStatus"], "indexing")
            repeated = await asyncio.wait_for(self.rag.index(VIDEO, payload()), 0.5)
            self.assertFalse(repeated["cached"])
            different = payload()
            different["transcriptSegments"][0]["text"] += " changed"
            with self.assertRaises(ServiceError):
                await self.rag.index(VIDEO, different)
        finally:
            release.set()
            if VIDEO in self.rag._jobs:
                await self.rag._jobs[VIDEO]


if __name__ == "__main__":
    unittest.main()
