"""Deterministic session-only scoring. Missing/null answers count as incorrect."""
from app.core.errors import ServiceError
from app.transcript.normalizer import normalize_text


def score_quiz(questions: list[dict], answers: list[dict]) -> dict:
    if not isinstance(questions, list) or not 1 <= len(questions) <= 100 or not isinstance(answers, list):
        raise ServiceError("QUIZ_INVALID")
    by_id = {}
    for question in questions:
        try:
            identifier, options, correct = question["questionId"], question["options"], question["correctAnswer"]
            if (not isinstance(identifier, str) or not identifier.strip() or identifier in by_id
                    or not isinstance(options, list) or not 2 <= len(options) <= 10
                    or not all(isinstance(o, str) and o.strip() for o in options)
                    or len({normalize_text(o).casefold() for o in options}) != len(options)
                    or type(correct) is not int or not 0 <= correct < len(options)
                    or not normalize_text(question["topic"]) or not normalize_text(question["question"])
                    or not normalize_text(question["explanation"])):
                raise ValueError("Invalid question")
            by_id[identifier] = question
        except (KeyError, TypeError, ValueError):
            raise ServiceError("QUIZ_INVALID") from None
    selected = {}
    for answer in answers:
        try:
            identifier, choice = answer["questionId"], answer.get("selectedAnswer")
            if identifier not in by_id or identifier in selected:
                raise ValueError("Invalid answer reference")
            if choice is not None and (type(choice) is not int or not 0 <= choice < len(by_id[identifier]["options"])):
                raise ValueError("Invalid answer index")
            selected[identifier] = choice
        except (KeyError, TypeError, ValueError):
            raise ServiceError("QUIZ_INVALID") from None
    results = [{"questionId": identifier, "correct": selected.get(identifier) == q["correctAnswer"],
                "correctAnswer": q["correctAnswer"], "selectedAnswer": selected.get(identifier)}
               for identifier, q in by_id.items()]
    correct_count = sum(r["correct"] for r in results)
    return {"score": round(correct_count / len(results) * 100, 2), "correctCount": correct_count,
            "totalCount": len(results), "questionResults": results}
