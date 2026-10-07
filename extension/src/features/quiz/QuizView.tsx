import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { answerVideoQuestion, type GenerateContent } from "../../integrations/learning/pipeline";
import type { ProgressiveQuizSession } from "../../integrations/learning/progressiveQuiz";
import { assessQuiz } from "../../integrations/local-service/client";
import type { AssessmentResponse, Question } from "../../types/api";
import type { CurrentVideo } from "../../types/learning";
import { AskAI } from "../../sidebar/components/AskAI";
import { Button, RuntimeStateCard } from "../../sidebar/components/ui";

interface QuizViewProps {
  generateContent: GenerateContent;
  session: ProgressiveQuizSession;
  onComplete: (assessment: AssessmentResponse, questions: Question[]) => void;
  onSeek: (seconds: number) => void;
  video: CurrentVideo;
}

export function QuizView({ generateContent, session, onComplete, onSeek, video }: QuizViewProps) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [assessmentState, setAssessmentState] = useState<"idle" | "loading" | "error">("idle");
  const [assessmentError, setAssessmentError] = useState("");
  const assessmentController = useRef<AbortController | null>(null);
  useEffect(() => { void session.start(); }, [session]);
  useEffect(() => () => assessmentController.current?.abort(), []);

  const submitAssessment = async () => {
    if (assessmentState === "loading" || !state.questions.length) return;
    // Freeze before awaiting: late generation must not change the score denominator.
    const payload = session.freeze();
    const controller = new AbortController();
    assessmentController.current?.abort();
    assessmentController.current = controller;
    setAssessmentState("loading");
    setAssessmentError("");
    try {
      const result = await assessQuiz(video.videoId, payload, { signal: controller.signal });
      if (!controller.signal.aborted) onComplete(result, payload.questions);
    } catch (error) {
      if (!controller.signal.aborted) {
        setAssessmentState("error");
        setAssessmentError(error instanceof Error ? error.message : "Không thể chấm bài quiz.");
      }
    }
  };

  if (!state.questions.length) return <div className="view-stack quiz-view">
    <RuntimeStateCard title={state.status === "complete" ? "Video chưa có câu hỏi" :
      state.status === "paused" ? "Tạm dừng tạo Quiz" : "Đang tạo câu hỏi"}
      message={state.status === "complete" ? "Chưa tìm thấy ý kiến thức đủ rõ để tạo câu hỏi từ transcript video này." :
        state.message || "Đợt đầu sẽ xuất hiện ngay khi AI tạo xong."}>
      {state.status === "paused" ? <Button onClick={() => void session.start()} tone="secondary">Tiếp tục tạo</Button> : null}
    </RuntimeStateCard>
  </div>;

  const question = state.questions[state.currentIndex];
  const frozen = state.status === "submitted";
  const busy = assessmentState === "loading";
  const move = (index: number) => { session.move(index); setChatExpanded(false); };
  return <div className="view-stack quiz-view">
    {!chatExpanded ? <section aria-label="Tiến trình quiz" className="quiz-progress-card surface-card">
      <div className="progress-card-meta">
        <span className="question-count">Câu {state.currentIndex + 1} / {state.questions.length}</span>
        <span className="video-context" title={`${video.channel} • ${video.title}`}>{video.title}</span>
      </div>
      <p className="runtime-status-line">Đã có {state.questions.length} câu · Đã trả lời {Object.keys(state.answers).length} câu</p>
    </section> : null}
    <article className={chatExpanded ? "question-card is-compact" : "question-card"}>
      <span className="question-eyebrow">Câu hỏi trắc nghiệm</span>
      <h2 className="question-title">{question.question}</h2>
      <fieldset className="quiz-options" disabled={busy || frozen}>
        <legend className="sr-only">Chọn một đáp án</legend>
        {question.options.map((option, index) => <label key={`${question.questionId}:${index}`}
          className={state.answers[question.questionId] === index ? "quiz-option is-selected" : "quiz-option"}>
          <input type="radio" name={question.questionId} value={index}
            checked={state.answers[question.questionId] === index}
            onChange={() => session.select(question.questionId, index)} />
          <span className="option-marker">{String.fromCharCode(65 + index)}</span>
          <span className="option-copy">{option}</span>
        </label>)}
      </fieldset>
      {!chatExpanded ? <div className="question-actions">
        <Button disabled={busy || state.currentIndex === 0} onClick={() => move(state.currentIndex - 1)} tone="secondary">Câu trước</Button>
        <Button disabled={busy || state.currentIndex + 1 >= state.questions.length}
          onClick={() => move(state.currentIndex + 1)}>Câu tiếp theo</Button>
      </div> : null}
    </article>
    <section className="quiz-generation-status" aria-label="Trạng thái tạo câu hỏi">
      <p className="runtime-status-line" role="status">{state.message}</p>
      {state.status === "paused" ? <Button onClick={() => void session.start()} tone="secondary">Tiếp tục tạo</Button> : null}
      <Button disabled={busy} onClick={() => void submitAssessment()} tone="secondary">
        {busy ? "Đang chấm…" : frozen ? "Xem kết quả" : "Nộp bài"}
      </Button>
      {!frozen && state.status !== "complete" ? <small>Nộp bài sẽ dừng tạo thêm và chấm các câu hiện có.</small> : null}
    </section>
    {assessmentState === "error" ? <section className="runtime-inline-error" role="alert">
      <p>{assessmentError}</p>
      <Button onClick={() => void submitAssessment()} tone="secondary">Thử chấm lại</Button>
    </section> : null}
    <AskAI collapsedTitle="Hỏi AI về câu này" context="quiz"
      description="Gợi ý được tạo từ transcript liên quan mà không đưa thẳng đáp án."
      expanded={chatExpanded} expandedTitle="Gợi ý AI" followUpPlaceholder="Hỏi tiếp về câu này..."
      key={question.questionId}
      onAsk={(userQuestion, signal) => answerVideoQuestion(video,
        `Không tiết lộ đáp án. Câu quiz: ${question.question}. Người học hỏi: ${userQuestion}`, generateContent, signal)}
      onExpandedChange={setChatExpanded} onSourceSelect={onSeek}
      placeholder="VD: Gợi ý phương pháp suy luận câu này là gì?" statusLabel="RAG + AI" />
  </div>;
}
