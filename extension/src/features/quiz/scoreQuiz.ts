import type { AssessmentResponse, Question } from "../../types/api";

export type QuizAnswers = Record<string, number | undefined>;

export function scoreQuiz(questions: Question[], answers: QuizAnswers): AssessmentResponse {
  const questionResults = questions.map((question) => {
    const selectedAnswer = answers[question.questionId] ?? null;
    return {
      questionId: question.questionId,
      correct: selectedAnswer === question.correctAnswer,
      correctAnswer: question.correctAnswer,
      selectedAnswer,
    };
  });
  const correctCount = questionResults.filter((result) => result.correct).length;
  const topicStats = new Map<string, { correct: number; total: number }>();

  questions.forEach((question, index) => {
    const current = topicStats.get(question.topic) ?? { correct: 0, total: 0 };
    topicStats.set(question.topic, {
      correct: current.correct + (questionResults[index].correct ? 1 : 0),
      total: current.total + 1,
    });
  });

  const strongTopics: string[] = [];
  const weakTopics: string[] = [];
  topicStats.forEach((stats, topic) => {
    if (stats.correct === stats.total) {
      strongTopics.push(topic);
    } else {
      weakTopics.push(topic);
    }
  });

  return {
    score: questions.length === 0 ? 0 : Math.round((correctCount / questions.length) * 100),
    correctCount,
    totalCount: questions.length,
    questionResults,
    strongTopics,
    weakTopics,
    reviewTimestamps: questions
      .filter((_, index) => !questionResults[index].correct)
      .map((question) => ({
        ...question.sourceTimestamp,
        topic: question.topic,
        reason: `Ôn lại câu hỏi về ${question.topic}.`,
      })),
  };
}
