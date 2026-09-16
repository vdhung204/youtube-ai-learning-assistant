import { describe, expect, it } from "vitest";
import { scoreQuiz } from "../features/quiz/scoreQuiz";
import { quizQuestions } from "../sidebar/data/mockData";

describe("scoreQuiz", () => {
  it("scores selected and unanswered questions without persisting a history", () => {
    const questions = quizQuestions.slice(0, 2);
    const result = scoreQuiz(questions, {
      [questions[0].questionId]: questions[0].correctAnswer,
    });

    expect(result.score).toBe(50);
    expect(result.correctCount).toBe(1);
    expect(result.totalCount).toBe(2);
    expect(result.questionResults[1].selectedAnswer).toBeNull();
    expect(result.reviewTimestamps).toHaveLength(1);
    expect(result.reviewTimestamps[0].chunkId).toBe(questions[1].sourceTimestamp.chunkId);
  });
});
