"""Synthetic in-memory fixtures only. Never loaded by production startup."""
import asyncio
from app.core.errors import ServiceError
from app.core.rag_facade import Readiness


VIDEO_ID = "dQw4w9WgXcQ"
OTHER_VIDEO_ID = "9bZkp7q19f0"


def index_payload(video_id=VIDEO_ID):
    return {"video": {"videoId": video_id, "title": "Synthetic test", "durationSec": 60.0, "language": "vi"},
            "transcriptSegments": [{"text": "Nội dung kiểm thử tổng hợp.", "startSec": 0.0, "endSec": 10.0, "position": 0}]}


def quiz_payload():
    return {"questions": [{"questionId": "q1", "question": "Một cộng một?", "options": ["2", "3"],
                           "correctAnswer": 0, "explanation": "Ví dụ kiểm thử.", "topic": "Số học",
                           "sourceTimestamp": {"startSec": 0.0, "endSec": 10.0, "chunkId": "c1"}}],
            "userAnswers": [{"questionId": "q1", "selectedAnswer": 0}]}


class FakeRag:
    def __init__(self):
        self.videos = {}
        self.calls = []
        self.stopped = False
        self.ready = True
        self.failure = None
        self.delay = 0
        self.cancelled = False
        self.cached = False
        self.startup_failure = False
        self.chunks = []

    async def startup(self, cache_dir):
        if self.startup_failure:
            raise RuntimeError("PRIVATE_STARTUP_SECRET")
        self.stopped = False

    async def shutdown(self):
        self.stopped = True

    async def readiness(self):
        return Readiness("test-pipeline", self.ready, self.ready)

    async def before(self, method, video_id, payload=None):
        self.calls.append((method, video_id, payload))
        if self.failure:
            raise self.failure
        try:
            await asyncio.sleep(self.delay)
        except asyncio.CancelledError:
            self.cancelled = True
            raise

    async def index(self, video_id, payload):
        await self.before("index", video_id, payload)
        self.videos[video_id] = "ready" if self.cached else "indexing"
        result = {"videoId": video_id, "indexStatus": self.videos[video_id], "cached": self.cached,
                  "pipelineVersion": "test-pipeline"}
        if self.cached:
            result["chunkCount"] = 1
        return result

    async def index_status(self, video_id):
        await self.before("index_status", video_id)
        return {"videoId": video_id, "indexStatus": self.videos.get(video_id, "not_indexed"),
                "chunkCount": 1 if video_id in self.videos else 0, "pipelineVersion": "test-pipeline"}

    async def retrieve(self, video_id, payload):
        await self.before("retrieve", video_id, payload)
        return {"videoId": video_id, "purpose": payload["purpose"], "chunks": self.chunks}

    async def assess_quiz(self, video_id, payload):
        await self.before("assess_quiz", video_id, payload)
        return {"score": 100.0, "correctCount": 1, "totalCount": 1,
                "questionResults": [{"questionId": "q1", "correct": True, "correctAnswer": 0, "selectedAnswer": 0}],
                "strongTopics": ["Số học"], "weakTopics": [], "reviewTimestamps": []}

    async def delete_cache(self, video_id):
        await self.before("delete_cache", video_id)
        deleted = self.videos.pop(video_id, None) is not None
        return {"videoId": video_id, "deleted": deleted, "deletedChunkCount": int(deleted)}
