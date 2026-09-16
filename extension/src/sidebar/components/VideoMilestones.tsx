import type { VideoMilestone } from "../../types/learning";
import { formatDuration } from "../utils/formatDuration";
import { Icon } from "./Icon";

interface VideoMilestonesProps {
  milestones: readonly VideoMilestone[];
  onSeek: (seconds: number) => void;
}

export function VideoMilestones({ milestones, onSeek }: VideoMilestonesProps) {
  if (milestones.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="video-milestones-title" className="video-milestones surface-card">
      <div className="milestone-heading">
        <h2 id="video-milestones-title"><span aria-hidden="true">⚡</span> Mốc kiến thức theo Timestamp</h2>
        <span>{milestones.length} mốc • Nhấn để mở YouTube</span>
      </div>
      <div className="milestone-list">
        {milestones.map((milestone) => {
          const timestamp = formatDuration(milestone.startSec);
          return (
            <button
              aria-label={`Mở video tại ${timestamp}: ${milestone.label}`}
              key={`${milestone.startSec}-${milestone.label}`}
              onClick={() => onSeek(milestone.startSec)}
              type="button"
            >
              <span className="milestone-time">{timestamp}</span>
              <span className="milestone-label" title={milestone.label}>{milestone.label}</span>
              <Icon name="play" size={14} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
