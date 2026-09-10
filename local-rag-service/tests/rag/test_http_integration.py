from pathlib import Path
import tempfile
import time
import unittest

from helpers import VIDEO, OTHER_VIDEO, SyntheticEmbedder, payload, quiz
from fastapi.testclient import TestClient
from app.core.config import Settings, SERVICE_ROOT
from app.core.main import create_app
from app.retrieval.facade import LocalRagFacade


class RealFacadeHttpTests(unittest.TestCase):
    def test_six_routes_with_real_chroma_and_test_only_encoder(self):
        root = SERVICE_ROOT / "data" / "test-runs"
        root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=root, ignore_cleanup_errors=True) as directory:
            facade = LocalRagFacade(embedder=SyntheticEmbedder())
            app = create_app(Settings(data_dir=Path(directory)), facade)
            base = f"/api/v1/videos/{VIDEO}"
            with TestClient(app, base_url="http://127.0.0.1") as client:
                self.assertEqual(client.get("/api/v1/health").status_code, 200)
                first = client.post(base + "/index", json=payload())
                self.assertEqual(first.status_code, 202, first.text)
                for _ in range(100):
                    state = client.get(base + "/index-status")
                    if state.json()["indexStatus"] != "indexing":
                        break
                    time.sleep(0.01)
                self.assertEqual(state.json()["indexStatus"], "ready")
                self.assertEqual(client.post(base + "/index", json=payload()).status_code, 200)
                retrieved = client.post(base + "/retrieve", json={"query": "tuple", "purpose": "quiz"})
                self.assertEqual(retrieved.status_code, 200, retrieved.text)
                chunks = retrieved.json()["chunks"]
                assessment = client.post(base + "/assessments/quiz", json=quiz(chunks[0]))
                self.assertEqual(assessment.status_code, 200, assessment.text)
                self.assertEqual(assessment.json()["score"], 0)
                self.assertEqual(assessment.json()["reviewTimestamps"][0]["startSec"], 120)
                no_index = client.post(f"/api/v1/videos/{OTHER_VIDEO}/retrieve", json={"query": "tuple", "purpose": "quiz"})
                self.assertEqual(no_index.status_code, 404)
                deletion = client.delete(base + "/cache")
                self.assertEqual(deletion.status_code, 200)
                self.assertEqual(client.get(base + "/index-status").json()["indexStatus"], "not_indexed")


if __name__ == "__main__":
    unittest.main()
