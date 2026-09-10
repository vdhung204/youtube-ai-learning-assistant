"""Test-only synthetic encoder. It is NOT a semantic model or production fallback."""
import math
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
VIDEO = "synthetic01"
OTHER_VIDEO = "synthetic02"


class WordCounter:
    def count_tokens(self, text):
        return len(text.split())


class SyntheticEmbedder(WordCounter):
    model_id = "test-only-keyword-v1"
    dimension = 5
    max_tokens = 512

    def __init__(self):
        self.document_calls = 0
        self.fail = False

    def vector(self, text):
        words = text.casefold().split()
        vector = [float(sum(term in w for w in words)) for term in ("list", "tuple", "sql", "class")]
        vector.append(0.0 if any(vector) else 1.0)
        norm = math.sqrt(sum(v * v for v in vector))
        return [v / norm for v in vector]

    def embed_documents(self, texts):
        self.document_calls += 1
        if self.fail:
            raise RuntimeError("SYNTHETIC_PRIVATE_EXCEPTION")
        return [self.vector(t) for t in texts]

    def embed_query(self, text):
        return self.vector(text)


def payload(video_id=VIDEO):
    return {"video": {"videoId": video_id, "title": "Synthetic fixture", "durationSec": 180.0, "language": "vi"},
            "transcriptSegments": [
                {"text": "List có thể thay đổi các phần tử.", "startSec": 10.0, "endSec": 20.0, "position": 0},
                {"text": "Tuple không thể gán lại các phần tử.", "startSec": 120.0, "endSec": 135.0, "position": 1}]}


def quiz(chunk):
    return {"questions": [{"questionId": "q1", "question": "Tuple có gán lại phần tử được không?",
             "options": ["Không", "Có"], "correctAnswer": 0, "explanation": "Tuple không thể gán lại phần tử.",
             "topic": "Tuple", "sourceTimestamp": {k: chunk[k] for k in ("chunkId", "startSec", "endSec")}}],
            "userAnswers": [{"questionId": "q1", "selectedAnswer": 1}]}
