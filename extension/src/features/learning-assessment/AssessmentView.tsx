import type { AssessmentResponse, Question } from "../../types/api";
import { Button } from "../../sidebar/components/Button";
import { Icon } from "../../sidebar/components/Icon";
import { formatDuration } from "../../sidebar/utils/formatDuration";

interface AssessmentViewProps {
  assessment: AssessmentResponse | null;
  onReviewQuiz: () => void;
  onSeek: (seconds: number) => void;
  onStartQuiz: () => void;
  questions: Question[];
}

export function AssessmentView({
  assessment,
  onReviewQuiz,
  onSeek,
  onStartQuiz,
  questions,
}: AssessmentViewProps) {
  if (!assessment) {
    return (
      <div className="view-stack assessment-view">
        <section className="assessment-empty">
          <span className="question-eyebrow">Đánh giá trong phiên</span>
          <h2>Chưa có kết quả Quiz</h2>
          <p>Hoàn thành quiz được tạo từ video hiện tại để xem kết quả và các đoạn nên ôn lại.</p>
          <Button onClick={onStartQuiz}>
            Bắt đầu Quiz
            <Icon name="arrow-forward" size={16} />
          </Button>
        </section>
      </div>
    );
  }

  const resultMessage = assessment.score >= 80 ? "Bạn đang tiến bộ tốt" : "Hãy ôn lại các chủ đề chính";

  return (
    <div className="view-stack assessment-view">
      <section className="score-card">
        <div aria-label={`Điểm ${assessment.score} trên 100`} className="score-ring">
          <strong>{assessment.score}</strong>
          <span>/ 100</span>
        </div>
        <div className="score-copy">
          <span className="question-eyebrow">Kết quả gần nhất</span>
          <h2>{resultMessage}</h2>
          <p>Trả lời đúng {assessment.correctCount}/{assessment.totalCount} câu trong lần làm hiện tại.</p>
        </div>
      </section>

      <section className="assessment-card">
        <h2>Chủ đề đã nắm tốt</h2>
        <div className="topic-list success">
          {assessment.strongTopics.length > 0
            ? assessment.strongTopics.map((topic) => <span key={topic}>✓ {topic}</span>)
            : <span>Chưa có — hãy thử lại sau khi ôn tập</span>}
        </div>
      </section>

      {assessment.reviewTimestamps.length > 0 ? (
        <section className="assessment-card">
          <h2>Đoạn nên ôn lại</h2>
          <div className="review-timestamp-list">
            {assessment.reviewTimestamps.map((timestamp) => (
              <button
                key={`${timestamp.chunkId}-${timestamp.topic}`}
                onClick={() => onSeek(timestamp.startSec)}
                type="button"
              >
                <span className="source-time">
                  <Icon name="play" size={13} />
                  {formatDuration(timestamp.startSec)}
                </span>
                <span>
                  <strong>{timestamp.topic}</strong>
                  <small>{timestamp.reason}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="assessment-card">
        <h2>Cần cải thiện</h2>
        <div className="topic-list warning">
          {assessment.weakTopics.length > 0
            ? assessment.weakTopics.map((topic) => <span key={topic}>{topic}</span>)
            : <span>Không có chủ đề yếu trong lần làm này</span>}
        </div>
      </section>

      <section className="assessment-card">
        <h2>Chi tiết câu trả lời</h2>
        <div className="quiz-review-list">
          {assessment.questionResults.map((result, index) => {
            const question = questions.find((item) => item.questionId === result.questionId);
            if (!question) {
              return null;
            }
            const selectedLabel = result.selectedAnswer === null
              ? "Chưa trả lời"
              : question.options[result.selectedAnswer] ?? "Lựa chọn không hợp lệ";
            return (
              <details
                className={result.correct ? "quiz-review-item is-correct" : "quiz-review-item is-incorrect"}
                key={result.questionId}
                open={!result.correct}
              >
                <summary>
                  <span>Câu {index + 1}</span>
                  <strong>{result.correct ? "Đúng" : result.selectedAnswer === null ? "Bỏ trống" : "Chưa đúng"}</strong>
                </summary>
                <div className="quiz-review-content">
                  <p>{question.question}</p>
                  <dl>
                    <div><dt>Bạn chọn</dt><dd>{selectedLabel}</dd></div>
                    <div><dt>Đáp án</dt><dd>{question.options[result.correctAnswer]}</dd></div>
                  </dl>
                  <p className="answer-explanation">{question.explanation}</p>
                  <button
                    className="review-source-button"
                    onClick={() => onSeek(question.sourceTimestamp.startSec)}
                    type="button"
                  >
                    <Icon name="play" size={13} />
                    Xem lại đoạn {formatDuration(question.sourceTimestamp.startSec)}
                  </button>
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <Button fullWidth onClick={onReviewQuiz} tone="secondary">
        <Icon name="arrow-back" size={16} />
        Ôn lại Quiz
      </Button>
    </div>
  );
}
