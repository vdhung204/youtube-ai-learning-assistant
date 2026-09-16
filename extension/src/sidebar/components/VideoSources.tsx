import type { VideoSource } from "../../types/learning";
import { formatDuration } from "../utils/formatDuration";
import { Icon } from "./Icon";

interface VideoSourcesProps {
  onSelect?: (source: VideoSource) => void;
  sources: VideoSource[];
}

export function VideoSources({ onSelect, sources }: VideoSourcesProps) {
  return (
    <div className="video-sources">
      <div className="source-title">
        <Icon name="play" size={14} />
        <span>Nguồn trong video</span>
      </div>
      <div className="source-list">
        {sources.map((source) => (
          <button
            aria-label={`Mở video tại ${formatDuration(source.startSec)}: ${source.label}`}
            className="source-item"
            key={source.chunkId}
            onClick={() => onSelect?.(source)}
            type="button"
          >
            <span className="source-time">
              <Icon name="timer" size={13} />
              {formatDuration(source.startSec)}
            </span>
            <span className="source-label">{source.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
