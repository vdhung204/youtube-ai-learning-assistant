from math import isfinite

from app.core.errors import ServiceError
from app.retrieval.retriever import Retriever
from app.transcript.normalizer import normalize_text
from .scorer import score_quiz
from .topic_analyzer import analyze_topics


class AssessmentService:
    def __init__(self, retriever: Retriever):
        self.retriever = retriever

    def assess(self, video_id: str, payload: dict) -> dict:
        if not self.retriever.store.active(video_id):
            raise ServiceError("INDEX_NOT_FOUND")
        questions, answers = payload.get("questions"), payload.get("userAnswers", [])
        result = score_quiz(questions, answers)
        sources = {c["chunkId"]: c for c in self.retriever.store.get_chunks(video_id)}
        for question in questions:
            try:
                source = question["sourceTimestamp"]
                chunk = sources[source["chunkId"]]
                start, end = source["startSec"], source["endSec"]
                if (any(isinstance(v, bool) or not isinstance(v, (float, int)) or not isfinite(v) for v in (start, end))
                        or not chunk["startSec"] <= start <= end <= chunk["endSec"]):
                    raise ValueError("Invalid citation")
            except (KeyError, TypeError, ValueError):
                raise ServiceError("QUIZ_INVALID") from None
        result.update(analyze_topics(questions, result["questionResults"], self.retriever.config.strong_topic_ratio))
        wrong_ids = {r["questionId"] for r in result["questionResults"] if not r["correct"]}
        reviews, seen = [], set()
        for question in questions:
            if question["questionId"] not in wrong_ids:
                continue
            topic = normalize_text(question["topic"])
            query = topic + ": " + question["question"]
            if self.retriever.embedder.count_tokens(query) > self.retriever.embedder.max_tokens:
                query = topic
            candidates = []
            if self.retriever.embedder.count_tokens(query) <= self.retriever.embedder.max_tokens:
                candidates = self.retriever.search(video_id, query, 2)
            # Keep the verified original source even when semantic retrieval abstains.
            original = sources[question["sourceTimestamp"]["chunkId"]]
            for chunk in [original] + candidates:
                key = (topic.casefold(), chunk["chunkId"])
                if key in seen:
                    continue
                seen.add(key)
                reviews.append({"topic": topic, "reason": "Ôn lại nội dung liên quan đến câu trả lời sai hoặc bỏ trống.",
                                "chunkId": chunk["chunkId"], "startSec": chunk["startSec"], "endSec": chunk["endSec"]})
        result["reviewTimestamps"] = reviews
        return result
