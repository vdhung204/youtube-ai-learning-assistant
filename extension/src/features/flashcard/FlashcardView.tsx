import { useEffect, useState } from "react";
import {
  answerVideoQuestion,
  type GenerateContent,
} from "../../integrations/learning/pipeline";
import type { CurrentVideo, Flashcard, FlashcardConfidence } from "../../types/learning";
import { AskAI } from "../../sidebar/components/AskAI";
import { Button, Icon, ProgressBar, RuntimeStateCard } from "../../sidebar/components/ui";
import { formatDuration } from "../../sidebar/videoPresentation";

interface FlashcardViewProps {
  generateContent: GenerateContent;
  loadFlashcards: (video: CurrentVideo, options?: { regenerate?: boolean }) => Promise<Flashcard[]>;
  onSeek: (seconds: number) => void;
  video: CurrentVideo;
}

type FlashcardLoadState =
  | { status: "loading" }
  | { status: "ready"; cards: Flashcard[] }
  | { status: "error"; message: string };

export function FlashcardView({ generateContent, loadFlashcards, onSeek, video }: FlashcardViewProps) {
  const [loadState, setLoadState] = useState<FlashcardLoadState>({ status: "loading" });
  const [generationRequest, setGenerationRequest] = useState({ regenerate: false, version: 0 });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [confidence, setConfidence] = useState<Record<string, FlashcardConfidence>>({});

  useEffect(() => {
    let active = true;
    setLoadState({ status: "loading" });
    setCurrentIndex(0);
    setFlipped(false);
    setConfidence({});
    void loadFlashcards(video, { regenerate: generationRequest.regenerate })
      .then((cards) => {
        if (active) {
          setLoadState({ status: "ready", cards });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadState({
            status: "error",
            message: error instanceof Error ? error.message : "Không thể tạo flashcard từ video.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [
    generationRequest.regenerate,
    generationRequest.version,
    loadFlashcards,
    video.channel,
    video.durationSec,
    video.language,
    video.title,
    video.videoId,
  ]);

  if (loadState.status === "loading") {
    return (
      <div className="view-stack flashcard-view">
        <RuntimeStateCard
          message="Đang truy xuất transcript và tạo bộ thẻ ghi nhớ…"
          title="Đang tạo Flashcards"
        />
      </div>
    );
  }
  if (loadState.status === "error") {
    return (
      <div className="view-stack flashcard-view">
        <RuntimeStateCard
        message={loadState.message}
          title="Không thể tạo Flashcards"
        >
          <Button
            onClick={() => setGenerationRequest((request) => ({ regenerate: false, version: request.version + 1 }))}
            tone="secondary"
          >
            Thử lại
          </Button>
        </RuntimeStateCard>
      </div>
    );
  }

  const cards = loadState.cards;
  const card = cards[currentIndex];
  const currentNumber = currentIndex + 1;
  const moveTo = (nextIndex: number) => {
    setCurrentIndex(nextIndex);
    setFlipped(false);
    setChatExpanded(false);
  };

  return (
    <div className="view-stack flashcard-view">
      {chatExpanded ? (
        <section className="flashcard-summary">
          <div className="flashcard-summary-heading">
            <div>
              <span className="flashcard-count solid">Thẻ {currentNumber} / {cards.length}</span>
              <h2>{card.front}</h2>
            </div>
            <span className="topic-badge purple">{card.topic}</span>
          </div>
          <p>{card.back}</p>
        </section>
      ) : (
        <>
          <section className="deck-header">
            <div className="generated-content-actions">
              <span>Bộ flashcard đã lưu cho video này</span>
              <Button
                aria-label="Thêm Flashcards mới"
                onClick={() => setGenerationRequest((request) => ({ regenerate: true, version: request.version + 1 }))}
                tone="secondary"
              >
                + Thêm
              </Button>
            </div>
            <div className="deck-meta">
              <div>
                <span className="flashcard-count">Thẻ {currentNumber} / {cards.length}</span>
                <span className="topic-badge">{card.topic}</span>
              </div>
              <span className="video-context" title={`${video.channel} • ${video.title}`}>
                <span className="video-dot" />
                {video.channel} • {video.title}
              </span>
            </div>
            <ProgressBar
              label={`Tiến trình flashcard ${currentNumber} trên ${cards.length}`}
              tone="purple"
              value={(currentNumber / cards.length) * 100}
            />
          </section>

          <FlashcardCard
            card={card}
            flipped={flipped}
            onFlip={() => setFlipped((value) => !value)}
            onOpenSource={() => onSeek(card.sourceTimestamp.startSec)}
          />

          <fieldset className="confidence-control">
            <legend>Tự đánh giá thẻ này</legend>
            <button
              aria-pressed={confidence[card.flashcardId] === "review"}
              className={confidence[card.flashcardId] === "review" ? "is-selected" : undefined}
              onClick={() => setConfidence((current) => ({ ...current, [card.flashcardId]: "review" }))}
              type="button"
            >
              Chưa nhớ
            </button>
            <button
              aria-pressed={confidence[card.flashcardId] === "known"}
              className={confidence[card.flashcardId] === "known" ? "is-selected is-known" : undefined}
              onClick={() => setConfidence((current) => ({ ...current, [card.flashcardId]: "known" }))}
              type="button"
            >
              Đã nhớ
            </button>
          </fieldset>

          <div className="flashcard-actions">
            <Button disabled={currentIndex === 0} onClick={() => moveTo(currentIndex - 1)} tone="secondary">
              <Icon name="arrow-back" size={16} />
              Thẻ trước
            </Button>
            <Button disabled={currentIndex === cards.length - 1} onClick={() => moveTo(currentIndex + 1)} tone="purple">
              Thẻ tiếp theo
              <Icon name="arrow-forward" size={16} />
            </Button>
          </div>
        </>
      )}

      <AskAI
        collapsedTitle="Hỏi AI về thẻ này"
        context="flashcard"
        description="Giải thích thêm bằng transcript liên quan trong video."
        expanded={chatExpanded}
        expandedTitle="Hỏi đáp về thẻ này"
        followUpPlaceholder="Hỏi tiếp về thẻ này..."
        key={card.flashcardId}
        onAsk={(question, signal) => answerVideoQuestion(
          video,
          `Thẻ ghi nhớ: ${card.front}. ${question}`,
          generateContent,
          signal,
        )}
        onExpandedChange={setChatExpanded}
        onSourceSelect={onSeek}
        placeholder="VD: Giải thích dễ hiểu hơn bằng ví dụ?"
        statusLabel="RAG + Gemini"
      />
    </div>
  );
}

function FlashcardCard({
  card,
  flipped,
  onFlip,
  onOpenSource,
}: {
  card: Flashcard;
  flipped: boolean;
  onFlip: () => void;
  onOpenSource: () => void;
}) {
  return (
    <article className={flipped ? "flashcard-card is-back" : "flashcard-card"}>
      <div className="flashcard-topline">
        <span className="card-side-label">{flipped ? "Mặt sau" : "Mặt trước"}</span>
        <span aria-hidden="true" className="touch-hint">{flipped ? "✓" : "↻"}</span>
      </div>
      <div className="flashcard-copy">
        <h2>{flipped ? card.back : card.front}</h2>
        <p>{flipped ? card.topic : card.hint}</p>
        <span>{flipped ? "Nhấn để quay lại khái niệm" : "Nhấn để lật thẻ xem giải thích"}</span>
      </div>
      <div className="flashcard-card-actions">
        <Button className="timestamp-button" onClick={onOpenSource} tone="secondary">
          <Icon name="play" size={14} />
          Xem đoạn {formatDuration(card.sourceTimestamp.startSec)}
        </Button>
        <Button className="flip-button" onClick={onFlip} tone="purple">
          {flipped ? "Xem mặt trước" : "Lật thẻ"}
          <Icon name="refresh" size={16} />
        </Button>
      </div>
    </article>
  );
}
