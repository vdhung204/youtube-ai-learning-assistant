from copy import deepcopy
import unittest

from helpers import VIDEO, quiz
from app.core.errors import ServiceError
from app.assessment.scorer import score_quiz
from app.assessment.topic_analyzer import analyze_topics
from app.retrieval.context_builder import build_context, build_overview_context, serialize_context
from app.chunking.token_counter import Utf8Counter
from app.retrieval.deduplicator import deduplicate


def chunk(identifier="c1", text="Tuple không thay đổi.", start=10, end=20, score=0.9):
    return {"chunkId": identifier, "videoId": VIDEO, "text": text, "startSec": start,
            "endSec": end, "position": 0, "score": score}


class AssessmentTests(unittest.TestCase):
    def test_long_video_quiz_can_score_more_than_100_questions(self):
        from app.transport.models import AssessmentRequest
        template = quiz(chunk())["questions"][0]
        questions = [dict(deepcopy(template), questionId=f"q{i}") for i in range(125)]
        answers = [{"questionId": f"q{i}", "selectedAnswer": 0} for i in range(120)]
        AssessmentRequest.model_validate({"questions": questions, "userAnswers": answers})
        result = score_quiz(questions, answers)
        self.assertEqual(result["totalCount"], 125)
        self.assertEqual(result["correctCount"], 120)
        self.assertEqual(result["score"], 96)

    def test_wrong_missing_null_and_correct_answers(self):
        payload = quiz(chunk())
        for answers, expected in (([], 0), ([{"questionId": "q1", "selectedAnswer": None}], 0),
                                  ([{"questionId": "q1", "selectedAnswer": 0}], 100)):
            actual = score_quiz(payload["questions"], answers)
            self.assertEqual(actual["score"], expected)

    def test_rejects_invalid_answers_and_empty_quiz(self):
        payload = quiz(chunk())
        cases = [[{"questionId": "unknown", "selectedAnswer": 0}],
                 [{"questionId": "q1", "selectedAnswer": True}],
                 [{"questionId": "q1", "selectedAnswer": 2}],
                 [{"questionId": "q1"}, {"questionId": "q1"}]]
        for answers in cases:
            with self.assertRaises(ServiceError):
                score_quiz(payload["questions"], answers)
        with self.assertRaises(ServiceError):
            score_quiz([], [])

    def test_rejects_duplicate_options_and_question_ids(self):
        questions = quiz(chunk())["questions"]
        with self.assertRaises(ServiceError):
            score_quiz(questions * 2, [])
        questions[0]["options"] = ["Có", " có "]
        with self.assertRaises(ServiceError):
            score_quiz(questions, [])

    def test_topic_normalization_and_explainable_threshold(self):
        q1 = quiz(chunk())["questions"][0]
        q2 = deepcopy(q1)
        q2.update(questionId="q2", topic=" tuple  ")
        result = score_quiz([q1, q2], [{"questionId": "q1", "selectedAnswer": 0}])
        self.assertEqual(analyze_topics([q1, q2], result["questionResults"]),
                         {"strongTopics": [], "weakTopics": ["Tuple"]})


class ContextTests(unittest.TestCase):
    def test_overview_covers_video_and_preserves_original_sources(self):
        chunks = [dict(chunk(f"c{i}", f"Knowledge from section {i}.", i * 10, i * 10 + 10), position=i)
                  for i in range(72)]
        selected = build_overview_context(chunks, 6, 6000)
        self.assertEqual(len(selected), 6)
        # One passage from each sixth, rather than six near the outro/title.
        self.assertEqual([c["position"] // 12 for c in selected], list(range(6)))
        self.assertTrue(all(c in chunks for c in selected))

    def test_overview_budget_keeps_coverage_and_deduplicates_text(self):
        chunks = [dict(chunk(f"c{i}", f"Section {i}: " + "knowledge " * 10), position=i)
                  for i in range(24)]
        selected = build_overview_context(chunks, 6, 1000)
        self.assertGreater(len(selected), 1)
        self.assertLess(len(selected), 6)
        self.assertLessEqual(len(serialize_context(selected).encode("utf-8")), 1000)
        self.assertLess(selected[0]["position"], 8)
        self.assertGreater(selected[-1]["position"], 16)
        self.assertEqual(build_overview_context([chunk(), chunk("duplicate")], 6, 6000), [chunk()])
        self.assertEqual(build_overview_context([], 6, 6000), [])

    def test_budget_counts_serialized_metadata_and_unicode(self):
        chunks = [chunk(), chunk("c2", "a" * 10000)]
        selected, rendered = build_context(chunks, 512)
        self.assertEqual([c["chunkId"] for c in selected], ["c1"])
        self.assertLessEqual(Utf8Counter().count_tokens(rendered), 512)

    def test_context_is_chronological_after_relevance_selection(self):
        a, b = chunk(), chunk("c2", "Second", score=1)
        b["position"] = 1
        selected, _ = build_context([b, a], 1000)
        self.assertEqual([c["chunkId"] for c in selected], ["c1", "c2"])

    def test_dedup_keeps_distinct_text_with_identical_source_times(self):
        self.assertEqual(len(deduplicate([chunk(), chunk("c2", "A list is mutable.")])), 2)
        self.assertEqual(len(deduplicate([chunk(), chunk("c2")])), 1)


if __name__ == "__main__":
    unittest.main()
