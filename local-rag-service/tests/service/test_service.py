import asyncio
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from fastapi.testclient import TestClient
from app.core.config import Settings
from app.core.errors import ServiceError
from app.core.main import create_app
from app.transport.middleware import RequestGuard
from fakes import FakeRag, VIDEO_ID, OTHER_VIDEO_ID, index_payload, quiz_payload

ORIGIN = "chrome-extension://" + "a" * 32
BASE = f"/api/v1/videos/{VIDEO_ID}"


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.rag = FakeRag()
        self.app = create_app(Settings(allowed_origins=(ORIGIN,), request_timeout_sec=0.15), self.rag)
        self.client = TestClient(self.app, base_url="http://127.0.0.1", raise_server_exceptions=False)
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)

    def error(self, response, status, code):
        self.assertEqual(response.status_code, status, response.text)
        self.assertEqual(response.json()["error"]["code"], code)
        self.assertIsNone(response.json()["error"]["details"])

    def test_health_ready_and_not_ready(self):
        response = self.client.get("/api/v1/health")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["embeddingModelReady"])
        self.rag.ready = False
        response = self.client.get("/api/v1/health")
        self.error(response, 503, "SERVICE_NOT_READY")
        self.assertFalse(response.json()["vectorStoreReady"])
        self.error(self.client.post(BASE + "/retrieve", json={"query": "x", "purpose": "quiz"}), 503, "SERVICE_NOT_READY")

    def test_default_has_no_fake_readiness(self):
        with TestClient(create_app(), base_url="http://127.0.0.1") as client:
            self.error(client.get("/api/v1/health"), 503, "SERVICE_NOT_READY")

    def test_startup_failure_and_shutdown_are_safe(self):
        facade = FakeRag()
        facade.startup_failure = True
        with self.assertLogs("yala.service") as logs:
            with TestClient(create_app(facade=facade), base_url="http://127.0.0.1") as client:
                response = client.get("/api/v1/health")
                self.error(response, 503, "SERVICE_NOT_READY")
        self.assertTrue(facade.stopped)
        self.assertNotIn("PRIVATE_STARTUP_SECRET", str(logs.output) + response.text)

    def test_index_202_and_cache_200(self):
        response = self.client.post(BASE + "/index", json=index_payload())
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.json()["indexStatus"], "indexing")
        self.assertEqual(self.rag.calls[-1][2], index_payload())
        self.rag.cached = True
        response = self.client.post(BASE + "/index", json=index_payload())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["chunkCount"], 1)

    def test_index_status_all_states(self):
        for status in ("not_indexed", "indexing", "ready", "failed"):
            with self.subTest(status=status):
                self.rag.videos[VIDEO_ID] = status
                response = self.client.get(BASE + "/index-status")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["indexStatus"], status)

    def test_invalid_index_inputs(self):
        self.error(self.client.post(BASE + "/index", json={}), 400, "INVALID_REQUEST")
        self.error(self.client.post(BASE + "/index", json=index_payload(OTHER_VIDEO_ID)), 400, "VIDEO_ID_MISMATCH")
        cases = []
        empty = index_payload()
        empty["transcriptSegments"] = []
        cases.append(empty)
        for key, value in (("text", " "), ("startSec", -1), ("endSec", 61), ("endSec", -1),
                           ("startSec", "0"), ("position", True)):
            payload = index_payload()
            payload["transcriptSegments"][0][key] = value
            cases.append(payload)
        duplicate = index_payload()
        duplicate["transcriptSegments"] *= 2
        cases.append(duplicate)
        for payload in cases:
            with self.subTest(payload=payload):
                self.error(self.client.post(BASE + "/index", json=payload), 400, "TRANSCRIPT_INVALID")
        self.assertEqual(self.rag.calls, [])

    def test_request_size_malformed_json_and_content_type(self):
        self.error(self.client.post(BASE + "/index", content=b"{}", headers={"content-length": "9999999"}), 413, "PAYLOAD_TOO_LARGE")
        self.error(self.client.post(BASE + "/index", content="{", headers={"content-type": "application/json"}), 400, "INVALID_REQUEST")
        self.error(self.client.post(BASE + "/index", content="{}"), 400, "INVALID_REQUEST")
        self.error(self.client.post(BASE + "/index", content="{}", headers={"content-length": "-1"}), 400, "INVALID_REQUEST")

    def test_origin_and_cors(self):
        self.error(self.client.get("/api/v1/health", headers={"Origin": "https://evil.example"}), 403, "ORIGIN_NOT_ALLOWED")
        self.error(self.client.get("/api/v1/health", headers={"Origin": "null"}), 403, "ORIGIN_NOT_ALLOWED")
        response = self.client.get("/api/v1/health", headers={"Origin": ORIGIN})
        self.assertEqual(response.headers["access-control-allow-origin"], ORIGIN)
        response = self.client.options(BASE + "/index", headers={"Origin": ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("access-control-allow-credentials", response.headers)
        self.error(self.client.options(BASE + "/index", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"}), 403, "ORIGIN_NOT_ALLOWED")
        self.error(self.client.options(BASE + "/index", headers={"Origin": ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization"}), 400, "CREDENTIALS_NOT_ALLOWED")

    def test_swagger_same_origin_requests(self):
        docs = self.client.get("/docs")
        self.assertEqual(docs.status_code, 200)
        self.assertIn("SwaggerUIBundle", docs.text)
        for host in ("127.0.0.1:8765", "localhost:8765"):
            headers = {"Host": host, "Origin": "http://" + host}
            self.assertEqual(self.client.post(BASE + "/index", json=index_payload(), headers=headers).status_code, 202)
            self.assertEqual(self.client.delete(BASE + "/cache", headers=headers).status_code, 200)
        for origin in ("http://127.0.0.1:3000", "http://localhost:3000", "https://127.0.0.1:8765"):
            self.error(self.client.post(BASE + "/index", json=index_payload(),
                                       headers={"Host": "127.0.0.1:8765", "Origin": origin}), 403, "ORIGIN_NOT_ALLOWED")

    def test_no_credentials_host_rebinding_or_query_parameters(self):
        self.assertEqual(self.client.get("/api/v1/health").status_code, 200)
        for header in ("Authorization", "Cookie", "X-API-Key"):
            self.error(self.client.get("/api/v1/health", headers={header: "PRIVATE_TOKEN"}), 400, "CREDENTIALS_NOT_ALLOWED")
        self.error(self.client.get("/api/v1/health", headers={"Host": "evil.example"}), 400, "INVALID_REQUEST")
        self.error(self.client.get("/api/v1/health?token=PRIVATE_TOKEN"), 400, "INVALID_REQUEST")
        payload = index_payload()
        payload["oauthToken"] = "PRIVATE_TOKEN"
        response = self.client.post(BASE + "/index", json=payload)
        self.error(response, 400, "INVALID_REQUEST")
        self.assertNotIn("PRIVATE_TOKEN", response.text)

    def test_retrieve_validation_and_empty_context(self):
        response = self.client.post(BASE + "/retrieve", json={"query": "nội dung", "purpose": "quiz", "maxResults": 3})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["reason"], "NO_RELEVANT_CONTEXT")
        self.assertEqual(self.rag.calls[-1][2]["maxResults"], 3)
        self.error(self.client.post(BASE + "/retrieve", json={"query": " ", "purpose": "quiz"}), 400, "QUERY_INVALID")
        for extras in ({"purpose": "chat"}, {"maxResults": 21}, {"maxResults": True}):
            self.error(self.client.post(BASE + "/retrieve", json={"query": "x", "purpose": "quiz", **extras}), 400, "INVALID_REQUEST")

    def test_retrieve_rejects_cross_video_chunks(self):
        self.rag.chunks = [{"chunkId": "c1", "videoId": OTHER_VIDEO_ID, "text": "test", "startSec": 0.0,
                            "endSec": 1.0, "score": 0.9, "position": 0}]
        self.error(self.client.post(BASE + "/retrieve", json={"query": "x", "purpose": "quiz"}), 500, "RETRIEVAL_FAILED")
        self.rag.chunks[0]["videoId"] = VIDEO_ID
        response = self.client.post(BASE + "/retrieve", json={"query": "x", "purpose": "quiz"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["chunks"][0]["startSec"], 0)

    def test_assessment_passes_session_data_to_facade(self):
        response = self.client.post(BASE + "/assessments/quiz", json=quiz_payload())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["score"], 100)
        self.assertEqual(self.rag.calls[-1][2]["userAnswers"], quiz_payload()["userAnswers"])
        payload = quiz_payload()
        payload["userAnswers"] = []
        self.assertEqual(self.client.post(BASE + "/assessments/quiz", json=payload).status_code, 200)
        for answer in ({"questionId": "q1", "selectedAnswer": 9}, {"questionId": "unknown", "selectedAnswer": 0}):
            payload["userAnswers"] = [answer]
            self.error(self.client.post(BASE + "/assessments/quiz", json=payload), 400, "QUIZ_INVALID")
        payload = quiz_payload()
        payload["questions"][0]["correctAnswer"] = 7
        self.error(self.client.post(BASE + "/assessments/quiz", json=payload), 400, "QUIZ_INVALID")

    def test_delete_is_idempotent_and_scoped(self):
        self.rag.videos = {VIDEO_ID: "ready", OTHER_VIDEO_ID: "ready"}
        self.assertTrue(self.client.delete(BASE + "/cache").json()["deleted"])
        self.assertFalse(self.client.delete(BASE + "/cache").json()["deleted"])
        self.assertIn(OTHER_VIDEO_ID, self.rag.videos)

    def test_dependency_errors_never_leak(self):
        self.rag.failure = RuntimeError("PRIVATE_TRANSCRIPT C:/private/token.txt")
        routes = [("POST", "/index", index_payload(), "INDEX_FAILED"),
                  ("POST", "/retrieve", {"query": "x", "purpose": "quiz"}, "RETRIEVAL_FAILED"),
                  ("POST", "/assessments/quiz", quiz_payload(), "ASSESSMENT_FAILED"),
                  ("DELETE", "/cache", None, "CACHE_DELETE_FAILED")]
        with self.assertLogs("yala.service") as logs:
            for method, suffix, payload, code in routes:
                response = self.client.request(method, BASE + suffix, **({"json": payload} if payload else {}))
                self.error(response, 500, code)
                self.assertNotIn("PRIVATE_TRANSCRIPT", response.text)
        self.assertNotIn("PRIVATE_TRANSCRIPT", str(logs.output))
        self.rag.failure = ServiceError("INDEX_NOT_FOUND")
        self.error(self.client.post(BASE + "/retrieve", json={"query": "x", "purpose": "quiz"}), 404, "INDEX_NOT_FOUND")
        self.assertEqual(self.client.get("/api/v1/health").status_code, 200)

    def test_timeout_cancels_facade_task(self):
        self.rag.delay = 1
        self.error(self.client.post(BASE + "/retrieve", json={"query": "x", "purpose": "quiz"}), 504, "REQUEST_TIMEOUT")
        self.assertTrue(self.rag.cancelled)

    def test_invalid_video_route_and_method(self):
        self.error(self.client.delete("/api/v1/videos/bad/cache"), 400, "INVALID_VIDEO_ID")
        self.error(self.client.get("/missing"), 404, "NOT_FOUND")
        self.error(self.client.put("/api/v1/health"), 405, "METHOD_NOT_ALLOWED")
        schema = self.client.get("/openapi.json").json()
        self.assertEqual(len(schema["paths"]), 6)
        for path in schema["paths"].values():
            for operation in path.values():
                self.assertNotIn("422", operation["responses"])
                self.assertIn("400", operation["responses"])

    def test_restart_preserves_existing_cache_file(self):
        cache = self.app.state.settings.cache_dir
        marker = cache / "tv2-synthetic-restart-test.txt"
        self.assertFalse(marker.exists())
        marker.write_text("synthetic cache", encoding="utf-8")
        try:
            for _ in range(2):
                with TestClient(create_app(facade=FakeRag()), base_url="http://127.0.0.1") as client:
                    self.assertEqual(client.get("/api/v1/health").status_code, 200)
                self.assertEqual(marker.read_text(encoding="utf-8"), "synthetic cache")
        finally:
            marker.unlink()


class GuardStreamingTests(unittest.IsolatedAsyncioTestCase):
    async def test_chunked_body_limit_without_content_length(self):
        called, responses = [], []
        async def app(scope, receive, send):
            called.append(True)
        messages = iter([{"type": "http.request", "body": b"1234", "more_body": True},
                         {"type": "http.request", "body": b"5678", "more_body": False}])
        async def receive():
            return next(messages)
        async def send(message):
            responses.append(message)
        await RequestGuard(app, Settings(max_body_bytes=5))(
            {"type": "http", "method": "POST", "headers": [(b"host", b"127.0.0.1"), (b"content-type", b"application/json")]}, receive, send)
        self.assertEqual(responses[0]["status"], 413)
        self.assertFalse(called)

    async def test_client_disconnect_cancels_operation(self):
        rag = FakeRag()
        rag.delay = 10
        app = create_app(Settings(request_timeout_sec=1), rag)
        body = json.dumps({"query": "x", "purpose": "quiz"}).encode()
        sent_body = False
        async def receive():
            nonlocal sent_body
            if not sent_body:
                sent_body = True
                return {"type": "http.request", "body": body}
            while not rag.calls:
                await asyncio.sleep(0.001)
            return {"type": "http.disconnect"}
        async def send(message):
            pass
        scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "POST",
                 "scheme": "http", "path": BASE + "/retrieve", "raw_path": (BASE + "/retrieve").encode(),
                 "query_string": b"", "root_path": "", "server": ("127.0.0.1", 8765), "client": ("127.0.0.1", 12345),
                 "headers": [(b"host", b"127.0.0.1"), (b"content-type", b"application/json")]}
        async with app.router.lifespan_context(app):
            with self.assertRaises(asyncio.CancelledError):
                await app(scope, receive, send)
        self.assertTrue(rag.cancelled)


class ConfigTests(unittest.TestCase):
    def test_rejects_unsafe_settings(self):
        for kwargs in ({"host": "0.0.0.0"}, {"port": 0}, {"data_dir": Path.home()},
                       {"allowed_origins": ("*",)}, {"request_timeout_sec": float("nan")}):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                Settings(**kwargs)


if __name__ == "__main__":
    unittest.main()
