import { type FormEvent, useEffect, useRef, useState } from "react";
import type { AssistantAnswer } from "../../integrations/learning/pipeline";
import type { AskAIContext } from "../../types/learning";
import { Button, ChatMessage, Icon } from "./ui";
import { VideoSources } from "./Video";

interface AskAIProps {
  collapsedTitle: string;
  context: AskAIContext;
  description: string;
  disabledReason?: string;
  expanded: boolean;
  expandedTitle: string;
  followUpPlaceholder: string;
  onAsk: (question: string, signal: AbortSignal) => Promise<AssistantAnswer>;
  onExpandedChange: (expanded: boolean) => void;
  onSourceSelect?: (seconds: number) => void;
  placeholder: string;
  statusLabel: string;
}

type AnswerState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: AssistantAnswer }
  | { status: "error"; message: string };

export function AskAI({
  collapsedTitle,
  context,
  description,
  disabledReason,
  expanded,
  expandedTitle,
  followUpPlaceholder,
  onAsk,
  onExpandedChange,
  onSourceSelect,
  placeholder,
  statusLabel,
}: AskAIProps) {
  const [draft, setDraft] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AnswerState>({ status: "idle" });
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => {
    ++requestId.current;
    controller.current?.abort();
  }, []);

  const runQuestion = async (nextQuestion: string) => {
    const id = ++requestId.current;
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setQuestion(nextQuestion);
    setAnswer({ status: "loading" });
    onExpandedChange(true);
    try {
      const result = await onAsk(nextQuestion, nextController.signal);
      if (id === requestId.current && !nextController.signal.aborted) {
        setAnswer({ status: "ready", data: result });
      }
    } catch (error) {
      if (id === requestId.current && !nextController.signal.aborted) {
        setAnswer({
          status: "error",
          message: error instanceof Error ? error.message : "Không thể trả lời câu hỏi lúc này.",
        });
      }
    }
  };

  const submitQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextQuestion = draft.normalize("NFC").replace(/\s+/gu, " ").trim();
    if (!nextQuestion || disabledReason) {
      return;
    }
    setDraft("");
    void runQuestion(nextQuestion);
  };

  if (!expanded) {
    const quickHome = context === "home";
    return (
      <section className={`ask-ai ask-ai--collapsed ask-ai--${context}`}>
        <div className="ask-ai-heading-row">
          <div className="ask-ai-title">
            <Icon name={quickHome || context === "quiz" ? "lightbulb" : "sparkles"} size={18} />
            <h2>{collapsedTitle}</h2>
          </div>
          {!quickHome ? (
            <span className={`assistant-mode assistant-mode--${context}`}>{statusLabel}</span>
          ) : null}
        </div>
        {!quickHome || disabledReason ? (
          <p className="ask-ai-description">{disabledReason ?? description}</p>
        ) : null}
        <form className="ask-input-row" onSubmit={submitQuestion}>
          <label className="sr-only" htmlFor={`ask-${context}`}>{collapsedTitle}</label>
          <input
            disabled={Boolean(disabledReason)}
            id={`ask-${context}`}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={placeholder}
            type="text"
            value={draft}
          />
          <button
            aria-label="Gửi câu hỏi"
            className="send-button"
            disabled={Boolean(disabledReason) || !draft.trim()}
            type="submit"
          >
            <Icon name="send" size={16} />
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className={`ask-ai ask-ai--expanded ask-ai--${context}`}>
      <div className="chat-header">
        <div className="ask-ai-title">
          <span className="chat-icon">
            <Icon name={context === "quiz" ? "lightbulb" : "sparkles"} size={16} />
          </span>
          <h2>{expandedTitle}</h2>
          {context === "quiz" ? <span className="hint-note">Không tiết lộ đáp án</span> : null}
        </div>
        <button
          aria-label="Thu nhỏ hội thoại"
          className="icon-button close-chat"
          onClick={() => onExpandedChange(false)}
          type="button"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      <div aria-live="polite" className="chat-stream">
        {question ? <ChatMessage role="user">{question}</ChatMessage> : null}
        <ChatMessage role="assistant">
          <div className="assistant-answer">
            {answer.status === "loading" ? <p>Đang truy xuất transcript và tạo câu trả lời…</p> : null}
            {answer.status === "idle" ? <p>Nhập câu hỏi để bắt đầu.</p> : null}
            {answer.status === "error" ? (
              <div className="runtime-inline-error">
                <p>{answer.message}</p>
                <Button disabled={!question} onClick={() => void runQuestion(question)} tone="secondary">
                  Thử lại
                </Button>
              </div>
            ) : null}
            {answer.status === "ready" ? (
              <>
                {answer.data.paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph}`}>{paragraph}</p>)}
                <VideoSources
                  onSelect={(source) => onSourceSelect?.(source.startSec)}
                  sources={answer.data.sources}
                />
              </>
            ) : null}
          </div>
        </ChatMessage>
      </div>

      <form className="chat-composer" onSubmit={submitQuestion}>
        <label className="sr-only" htmlFor={`follow-up-${context}`}>{followUpPlaceholder}</label>
        <input
          disabled={Boolean(disabledReason) || answer.status === "loading"}
          id={`follow-up-${context}`}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={followUpPlaceholder}
          type="text"
          value={draft}
        />
        <button
          aria-label="Gửi câu hỏi tiếp theo"
          className="send-button"
          disabled={Boolean(disabledReason) || answer.status === "loading" || !draft.trim()}
          type="submit"
        >
          <Icon name="send" size={16} />
        </button>
      </form>
    </section>
  );
}
