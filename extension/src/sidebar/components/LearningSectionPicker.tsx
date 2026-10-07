import type { LearningSection } from "../../types/learning";
import { formatDuration } from "../videoPresentation";
import { Button } from "./ui";

export function LearningSectionPicker({sections, selectedId, onSelect, onCurrent, onSeek}: {
  sections: LearningSection[]; selectedId: string;
  onSelect: (id: string) => void; onCurrent: () => void; onSeek: (seconds: number) => void;
}) {
  const index = sections.findIndex(section => section.id === selectedId);
  const selected = sections[index];
  if (!selected) return null;
  return <section className="learning-section-picker surface-card" aria-label="Học theo chapter">
    <label htmlFor="learning-section">Chọn phần học · {index + 1}/{sections.length}</label>
    <select id="learning-section" value={selectedId} onChange={event => onSelect(event.target.value)}>
      {sections.map(section => <option key={section.id} value={section.id}>
        {formatDuration(section.startSec)} · {section.title}
      </option>)}
    </select>
    <p>{formatDuration(selected.startSec)}–{formatDuration(selected.endSec)} · {selected.source === "youtube" ? "Theo chapter YouTube" : "Chia theo phụ đề"}</p>
    <div className="learning-section-actions">
      <Button tone="secondary" onClick={() => onSelect(sections[0].id)}>Học từ đầu</Button>
      <Button tone="secondary" onClick={onCurrent}>Phần đang xem</Button>
      <Button tone="secondary" onClick={() => onSeek(selected.startSec)}>Xem đoạn này</Button>
      <Button disabled={index === sections.length - 1} onClick={() => onSelect(sections[index + 1].id)}>Học phần tiếp</Button>
    </div>
  </section>;
}
