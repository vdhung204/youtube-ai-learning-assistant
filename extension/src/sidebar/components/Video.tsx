import type { CurrentVideo, VideoMilestone, VideoSource } from "../../types/learning";
import { formatDuration } from "../videoPresentation";
import { Icon } from "./ui";

export function VideoCard({
  detectionMessage,
  onSyncTimestamps,
  video,
}: {
  detectionMessage: string;
  onSyncTimestamps: () => void;
  video: CurrentVideo;
}) {
  return (
    <section aria-label="Video hiện tại" className="video-card surface-card">
      <div
        className={video.thumbnailUrl ? "video-thumbnail has-image" : "video-thumbnail"}
        style={video.thumbnailUrl ? { backgroundImage: `url(${video.thumbnailUrl})` } : undefined}
      >
        <span className="thumbnail-label">{video.thumbnailLabel}</span>
        <span className="play-overlay"><Icon name="play" size={13} /></span>
        <span className="duration-badge">{formatDuration(video.durationSec)}</span>
      </div>
      <div className="video-details">
        <div className="video-meta-row">
          <span className="video-channel">{video.channel}</span>
          <span className="video-time">
            {formatDuration(video.currentTimeSec)} / {formatDuration(video.durationSec)}
          </span>
        </div>
        <h2 className="video-title" title={video.title}>{video.title}</h2>
        <div className="video-status-row">
          <span className="video-ready-dot" title={detectionMessage}>
            <span className="sr-only">Đã nhận diện video</span>
          </span>
          <button
            aria-label="Đồng bộ lại timestamp"
            className="timestamp-sync-button"
            onClick={onSyncTimestamps}
            title="Đồng bộ lại timestamp"
            type="button"
          >
            <Icon name="refresh" size={13} />
          </button>
        </div>
      </div>
    </section>
  );
}

export function VideoMilestones({
  milestones,
  onSeek,
}: {
  milestones: readonly VideoMilestone[];
  onSeek: (seconds: number) => void;
}) {
  if (milestones.length === 0) {
    return null;
  }
  const scrollable = milestones.length > 3;
  return (
    <section aria-labelledby="video-milestones-title" className="video-milestones surface-card">
      <div className="milestone-heading">
        <h2 id="video-milestones-title"><span aria-hidden="true">⚡</span> Mốc kiến thức theo Timestamp</h2>
        <span>{milestones.length} mốc • {scrollable ? "Cuộn để xem" : "Nhấn để mở YouTube"}</span>
      </div>
      <div
        aria-label="Danh sách timestamp của video"
        className={scrollable ? "milestone-list is-scrollable" : "milestone-list"}
        role="region"
        tabIndex={scrollable ? 0 : undefined}
      >
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

export function VideoSources({
  onSelect,
  sources,
}: {
  onSelect?: (source: VideoSource) => void;
  sources: VideoSource[];
}) {
  return (
    <div className="video-sources">
      <div className="source-title"><Icon name="play" size={14} /><span>Nguồn trong video</span></div>
      <div className="source-list">
        {sources.map((source) => (
          <button
            aria-label={`Mở video tại ${formatDuration(source.startSec)}: ${source.label}`}
            className="source-item"
            key={source.chunkId}
            onClick={() => onSelect?.(source)}
            type="button"
          >
            <span className="source-time"><Icon name="timer" size={13} />{formatDuration(source.startSec)}</span>
            <span className="source-label">{source.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
