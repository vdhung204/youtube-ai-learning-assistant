import { useEffect, useRef, useState } from "react";
import {
  answerVideoQuestion,
  type GenerateContent,
} from "../../integrations/learning/pipeline";
import { assessQuiz } from "../../integrations/local-service/client";
import type { AssessmentResponse, Question } from "../../types/api";
import type { CurrentVideo } from "../../types/learning";
import { AskAI } from "../../sidebar/components/AskAI";
import { Button } from "../../sidebar/components/Button";
import { ProgressBar } from "../../sidebar/components/ProgressBar";
import { QuizQuestionCard } from "./QuizQuestionCard";
import type { QuizAnswers } from "./scoreQuiz";

interface QuizViewProps {
  generateContent: GenerateContent;
  loadQuiz: (video: CurrentVideo, options?: { regenerate?: boolean }) => Promise<Question[]>;
  onComplete: (assessment: AssessmentResponse, questions: Question[]) => void;
  onSeek: (seconds: number) => void;
  video: CurrentVideo;
}

type QuizLoadState =
  | { status: "loading" }
  | { status: "ready"; questions: Question[] }
  | { status: "error"; message: string };

export function QuizView({ generateContent, loadQuiz, onComplete, onSeek, video }: QuizViewProps) {
  const [loadState, setLoadState] = useState<QuizLoadState>({ status: "loading" });
  const [generationRequest, setGenerationRequest] = useState({ regenerate: false, version: 0 });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [chatExpanded, setChatExpanded] = useState(false);
  const [assessmentState, setAssessmentState] = useState<"idle" | "loading" | "error">("idle");
  const [assessmentError, setAssessmentError] = useState("");
  const assessmentController = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    setLoadState({ status: "loading" });
    setCurrentIndex(0);
    setAnswers({});
    void loadQuiz(video, { regenerate: generationRequest.regenerate })
      .then((questions) => {
        if (active) {
          setLoadState({ status: "ready", questions });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadState({
            status: "error",
            message: error instanceof Error ? error.message : "Không thể tạo quiz từ video.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [
    generationRequest.regenerate,
    generationRequest.version,
    loadQuiz,
    video.channel,
    video.durationSec,
    video.language,
    video.title,
    video.videoId,
  ]);

  useEffect(() => () => assessmentController.current?.abort(), []);

  if (loadState.status === "loading") {
    return <RuntimeQuizState title="Đang tạo Quiz" message="Đang truy xuất transcript và yêu cầu Gemini tạo câu hỏi…" />;
  }
  if (loadState.status === "error") {
    return (
      <RuntimeQuizState
        title="Không thể tạo Quiz"
        message={loadState.message}
        onRetry={() => setGenerationRequest((request) => ({ regenerate: false, version: request.version + 1 }))}
      />
    );
  }

  const questions = loadState.questions;
  const question = questions[currentIndex];
  const currentNumber = currentIndex + 1;
  const selectedAnswer = answers[question.questionId];

  const submitAssessment = async () => {
    if (assessmentState === "loading") {
      return;
    }
    assessmentController.current?.abort();
    const controller = new AbortController();
    assessmentController.current = controller;
    setAssessmentState("loading");
    setAssessmentError("");
    try {
      const result = await assessQuiz(video.videoId, {
        questions,
        userAnswers: questions.map((item) => ({
          questionId: item.questionId,
          selectedAnswer: answers[item.questionId] ?? null,
        })),
      }, { signal: controller.signal });
      if (!controller.signal.aborted) {
        onComplete(result, questions);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setAssessmentState("error");
        setAssessmentError(error instanceof Error ? error.message : "Không thể chấm bài quiz.");
      }
    }
  };

  const moveForward = () => {
    if (currentIndex === questions.length - 1) {
      void submitAssessment();
      return;
    }
    setCurrentIndex((index) => index + 1);
    setChatExpanded(false);
  };

  return (
    <div className="view-stack quiz-view">
      {!chatExpanded ? (
        <section aria-label="Tiến trình quiz" className="quiz-progress-card surface-card">
          <div className="generated-content-actions">
            <span>Bộ quiz đã lưu cho video này</span>
            <Button
              aria-label="Thêm Quiz mới"
              onClick={() => setGenerationRequest((request) => ({ regenerate: true, version: request.version + 1 }))}
              tone="secondary"
            >
              + Thêm
            </Button>
          </div>
          <div className="progress-card-meta">
            <span className="question-count">Câu {currentNumber} / {questions.length}</span>
            <span className="video-context" title={`${video.channel} • ${video.title}`}>
              {video.channel} • {video.title}
            </span>
          </div>
          <ProgressBar
            label={`Đang ở câu ${currentNumber} trên ${questions.length}`}
            value={(currentNumber / questions.length) * 100}
          />
        </section>
      ) : null}

      <QuizQuestionCard
        busy={assessmentState === "loading"}
        compact={chatExpanded}
        current={currentNumber}
        onNext={moveForward}
        onSelect={(optionIndex) => setAnswers((current) => ({ ...current, [question.questionId]: optionIndex }))}
        onSkip={moveForward}
        question={question}
        selectedAnswer={selectedAnswer}
        total={questions.length}
      />

      {assessmentState === "loading" ? <p className="runtime-status-line" role="status">Đang chấm bài bằng Local RAG Service…</p> : null}
      {assessmentState === "error" ? (
        <section className="runtime-inline-error" role="alert">
          <p>{assessmentError}</p>
          <Button onClick={() => void submitAssessment()} tone="secondary">Thử chấm lại</Button>
        </section>
      ) : null}

      <AskAI
        collapsedTitle="Hỏi AI về câu này"
        context="quiz"
        description="Gợi ý được tạo từ transcript liên quan mà không đưa thẳng đáp án."
        expanded={chatExpanded}
        expandedTitle="Gợi ý AI"
        followUpPlaceholder="Hỏi tiếp về câu này..."
        key={question.questionId}
        onAsk={(userQuestion, signal) => answerVideoQuestion(
          video,
          `Không tiết lộ đáp án. Câu quiz: ${question.question}. Người học hỏi: ${userQuestion}`,
          generateContent,
          signal,
        )}
        onExpandedChange={setChatExpanded}
        onSourceSelect={onSeek}
        placeholder="VD: Gợi ý phương pháp suy luận câu này là gì?"
        statusLabel="RAG + Gemini"
      />
    </div>
  );
}

function RuntimeQuizState({
  message,
  onRetry,
  title,
}: {
  message: string;
  onRetry?: () => void;
  title: string;
}) {
  return (
    <div className="view-stack quiz-view">
      <section className="runtime-state-card surface-card" role="status">
        <h2>{title}</h2>
        <p>{message}</p>
        {onRetry ? <Button onClick={onRetry} tone="secondary">Thử lại</Button> : null}
      </section>
    </div>
  );
}
