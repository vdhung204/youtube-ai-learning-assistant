"""Opt-in actual model checks. The ordinary suite never downloads a model."""
import os
from pathlib import Path
import asyncio
import tempfile
import unittest

from helpers import VIDEO
from app.chunking.chunker import chunk_transcript
from app.chunking.config import ChunkingConfig
from app.embedding.sentence_transformer_embedder import SentenceTransformerEmbedder
from app.retrieval.facade import LocalRagFacade
from app.transcript.models import TranscriptSegment
from helpers import payload


@unittest.skipUnless(os.getenv("YALA_TEST_REAL_MODEL") == "1", "Set YALA_TEST_REAL_MODEL=1 after prepare_model")
class RealEmbeddingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.embedder = SentenceTransformerEmbedder(Path(__file__).resolve().parents[2] / "data" / "models")

    def test_vectors_have_expected_dimension_norm_and_stable_batch_results(self):
        import numpy as np
        texts = ["Tuple không thể gán lại phần tử.", "An INNER JOIN combines matching rows."]
        batch = self.embedder.embed_documents(texts)
        singles = [self.embedder.embed_query(text) for text in texts]
        self.assertEqual(np.array(batch).shape, (2, self.embedder.dimension))
        np.testing.assert_allclose(batch, singles, atol=1e-5)
        np.testing.assert_allclose(np.linalg.norm(batch, axis=1), [1, 1], atol=1e-5)

    def test_real_tokenizer_chunking_covers_long_bilingual_text(self):
        text = ("Đây là nội dung tiếng Việt. Python tuples are immutable. " * 30).strip()
        chunks = chunk_transcript([TranscriptSegment(text, 0, 100, 0)], VIDEO, "vi", "real-test",
                                  self.embedder, ChunkingConfig(max_tokens=64, overlap_tokens=0))
        self.assertEqual(" ".join(c.text for c in chunks), text)
        self.assertTrue(all(self.embedder.count_tokens(c.text) <= 64 for c in chunks))
        self.assertEqual(len(self.embedder.embed_documents([c.text for c in chunks])), len(chunks))

    def test_oversized_input_is_rejected_instead_of_truncated(self):
        with self.assertRaises(ValueError):
            self.embedder.embed_query("Python " * 1000)

    def test_real_model_chroma_and_facade_end_to_end(self):
        async def scenario():
            with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
                facade = LocalRagFacade(embedder=self.embedder)
                await facade.startup(Path(directory))
                try:
                    first = await facade.index(VIDEO, payload())
                    self.assertFalse(first["cached"])
                    await facade._jobs[VIDEO]
                    result = await facade.retrieve(VIDEO, {"query": "Vì sao tuple không đổi?", "purpose": "quiz"})
                    self.assertTrue(result["chunks"])
                    self.assertEqual(result["chunks"][0]["startSec"], 120)
                finally:
                    await facade.shutdown()
        asyncio.run(scenario())


if __name__ == "__main__":
    unittest.main()
