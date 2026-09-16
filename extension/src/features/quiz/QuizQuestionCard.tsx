import type { Question } from "../../types/api";
import { Button } from "../../sidebar/components/Button";
import { Icon } from "../../sidebar/components/Icon";

interface QuizQuestionCardProps {
  busy?: boolean;
  compact: boolean;
  current: number;
  onNext: () => void;
  onSelect: (optionIndex: number) => void;
  onSkip: () => void;
  question: Question;
  selectedAnswer?: number;
  total: number;
}

const letters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

export function QuizQuestionCard({
  busy = false,
  compact,
  current,
  onNext,
  onSelect,
  onSkip,
  question,
  selectedAnswer,
  total,
}: QuizQuestionCardProps) {
  const isLastQuestion = current === total;

  return (
    <article className={compact ? "question-card is-compact" : "question-card"}>
      {compact ? (
        <div className="compact-question-meta">
          <div>
            <span className="question-count">Câu {current} / {total}</span>
            <span className="difficulty">Độ khó: Trung bình</span>
          </div>
          <span className="solving-badge">Đang giải</span>
        </div>
      ) : (
        <span className="question-eyebrow">Câu hỏi trắc nghiệm</span>
      )}

      <h2 className="question-title">{question.question}</h2>

      <fieldset className="quiz-options" disabled={busy}>
        <legend className="sr-only">Chọn một đáp án</legend>
        {question.options.map((option, index) => {
          const selected = selectedAnswer === index;
          return (
            <label className={selected ? "quiz-option is-selected" : "quiz-option"} key={option}>
              <input
                checked={selected}
                name={question.questionId}
                onChange={() => onSelect(index)}
                type="radio"
                value={index}
              />
              <span className="option-marker">{letters[index]}</span>
              <span className="option-copy">{option}</span>
            </label>
          );
        })}
      </fieldset>

      {!compact ? (
        <div className="question-actions">
          <Button disabled={busy} onClick={onSkip} tone="secondary">Bỏ qua</Button>
          <Button disabled={busy || selectedAnswer === undefined} onClick={onNext}>
            {busy ? "Đang chấm…" : isLastQuestion ? "Nộp bài" : "Câu tiếp theo"}
            <Icon name="arrow-forward" size={16} />
          </Button>
        </div>
      ) : null}
    </article>
  );
}
