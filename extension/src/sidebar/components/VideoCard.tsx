import type { CurrentVideo } from "../../types/learning";
import { formatDuration } from "../utils/formatDuration";
import { Icon } from "./Icon";

interface VideoCardProps {
  detectionMessage: string;
  video: CurrentVideo;
}

export function VideoCard({ detectionMessage, video }: VideoCardProps) {
  return (
    <section aria-label="Video hiện tại" className="video-card surface-card">
      <div
        className={video.thumbnailUrl ? "video-thumbnail has-image" : "video-thumbnail"}
        style={video.thumbnailUrl ? { backgroundImage: `url(${video.thumbnailUrl})` } : undefined}
      >
        <span className="thumbnail-label">{video.thumbnailLabel}</span>
        <span className="play-overlay">
          <Icon name="play" size={13} />
        </span>
        <span className="duration-badge">{formatDuration(video.durationSec)}</span>
      </div>

      <div className="video-details">
        <div className="video-meta-row">
          <span className="video-channel">{video.channel}</span>
          <span className="video-time">
            {formatDuration(video.currentTimeSec)} / {formatDuration(video.durationSec)}
          </span>
        </div>
        <h2 className="video-title" title={video.title}>
          {video.title}
        </h2>
        <div className="video-status-row">
          <span className="video-ready-dot" title={detectionMessage}>
            <span className="sr-only">Đã nhận diện video</span>
          </span>
        </div>
      </div>
    </section>
  );
}
