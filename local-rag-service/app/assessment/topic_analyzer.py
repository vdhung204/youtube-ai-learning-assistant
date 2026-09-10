from app.transcript.normalizer import normalize_text


def analyze_topics(questions: list[dict], results: list[dict], strong_ratio: float = 0.7) -> dict:
    correctness = {r["questionId"]: r["correct"] for r in results}
    topics = {}
    for question in questions:
        label = normalize_text(question["topic"])
        data = topics.setdefault(label.casefold(), {"label": label, "correct": 0, "total": 0})
        data["total"] += 1
        data["correct"] += correctness[question["questionId"]]
    return {"strongTopics": [t["label"] for t in topics.values() if t["correct"] / t["total"] >= strong_ratio],
            "weakTopics": [t["label"] for t in topics.values() if t["correct"] / t["total"] < strong_ratio]}
