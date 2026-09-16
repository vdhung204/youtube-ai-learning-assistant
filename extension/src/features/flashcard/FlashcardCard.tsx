import type { Flashcard } from "../../types/learning";
import { Button } from "../../sidebar/components/Button";
import { Icon } from "../../sidebar/components/Icon";
import { formatDuration } from "../../sidebar/utils/formatDuration";

interface FlashcardCardProps {
  card: Flashcard;
  flipped: boolean;
  onFlip: () => void;
  onOpenSource: () => void;
}

export function FlashcardCard({ card, flipped, onFlip, onOpenSource }: FlashcardCardProps) {
  return (
    <article className={flipped ? "flashcard-card is-back" : "flashcard-card"}>
      <div className="flashcard-topline">
        <span className="card-side-label">{flipped ? "Mặt sau" : "Mặt trước"}</span>
        <span aria-hidden="true" className="touch-hint">
          {flipped ? "✓" : "↻"}
        </span>
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
