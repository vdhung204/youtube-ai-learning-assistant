import { useState } from "react";
import { answerVideoQuestion, type GenerateContent } from "../../integrations/learning/pipeline";
import type { AppView, CurrentVideo } from "../../types/learning";
import { AskAI } from "../components/AskAI";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { ServiceStatusCard } from "../components/ServiceStatusCard";
import { VideoCard } from "../components/VideoCard";
import { VideoMilestones } from "../components/VideoMilestones";
import type { LocalServiceHealthState } from "../hooks/useLocalServiceHealth";
import type { VideoRagSessionState } from "../hooks/useVideoRagSession";

interface HomeViewProps {
  extensionOrigin: string | null;
  generateContent: GenerateContent;
  onNavigate: (view: AppView) => void;
  onRefreshHealth: () => void;
  onRetryRag: () => void;
  onSeek: (seconds: number) => void;
  ragReady: boolean;
  ragState: VideoRagSessionState;
  serviceHealth: LocalServiceHealthState;
  video?: CurrentVideo;
  videoDetectionMessage: string;
}

export function HomeView({
  extensionOrigin,
  generateContent,
  onNavigate,
  onRefreshHealth,
  onRetryRag,
  onSeek,
  ragReady,
  ragState,
  serviceHealth,
  video,
  videoDetectionMessage,
}: HomeViewProps) {
  const [chatExpanded, setChatExpanded] = useState(false);
  const disabledReason = ragReady && video
    ? undefined
    : video
      ? ragState.message
      : videoDetectionMessage;
  const ragRetryable = "retryable" in ragState && ragState.retryable;
  const milestones = ragState.status === "ready" ? ragState.milestones : [];
  const ragTitle = {
    error: "Không thể chuẩn bị dữ liệu video",
    idle: "Chưa có phiên RAG",
    indexing: "Đang lập chỉ mục transcript",
    loading_transcript: "Đang tải phụ đề YouTube",
    no_transcript: "Video không có phụ đề",
    ready: "Transcript đã được lập chỉ mục",
    service_offline: "Local RAG Service chưa sẵn sàng",
    stale: "Video đã thay đổi",
    waiting_for_service: "Đang chờ Local RAG Service",
  }[ragState.status];

  return (
    <div className="view-stack home-view">
      {video ? (
        <VideoCard detectionMessage={videoDetectionMessage} video={video} />
      ) : (
        <section className="runtime-state-card surface-card" role="status">
          <h2>Chưa có video YouTube</h2>
          <p>{videoDetectionMessage}</p>
        </section>
      )}

      {serviceHealth.status !== "ready" ? (
        <ServiceStatusCard
          extensionOrigin={extensionOrigin}
          onRefresh={onRefreshHealth}
          state={serviceHealth}
        />
      ) : null}

      {video && !ragReady ? (
        <section
          className={`runtime-state-card surface-card runtime-state-card--${ragState.status}`}
          role={["error", "no_transcript", "service_offline", "stale"].includes(ragState.status) ? "alert" : "status"}
        >
          <div>
            <h2>{ragTitle}</h2>
            <p>{ragState.message}</p>
          </div>
          {!ragReady && ragRetryable && serviceHealth.status === "ready" ? (
            <Button onClick={onRetryRag} tone="secondary">Thử lại</Button>
          ) : null}
        </section>
      ) : null}

      <section aria-label="Bắt đầu học nhanh" className="quick-action-grid">
        <article className="quick-card quick-card--quiz">
          <div className="quick-card-topline">
            <span className="count-badge">10 câu</span>
          </div>
          <h2>Tạo Quiz nhanh</h2>
          <p>Trắc nghiệm bám sát video với timestamp.</p>
          <Button disabled={!ragReady} fullWidth onClick={() => onNavigate("quiz")}>
            Bắt đầu Quiz
            <Icon name="arrow-forward" size={15} />
          </Button>
        </article>

        <article className="quick-card quick-card--flashcard">
          <div className="quick-card-topline">
            <span className="count-badge">8 thẻ</span>
          </div>
          <h2>Ôn Flashcards</h2>
          <p>Lật thẻ ghi nhớ khái niệm quan trọng.</p>
          <Button disabled={!ragReady} fullWidth onClick={() => onNavigate("flashcard")} tone="purple">
            Mở Flashcards
            <Icon name="cards" size={15} />
          </Button>
        </article>
      </section>

      {video ? <VideoMilestones milestones={milestones} onSeek={onSeek} /> : null}

      <AskAI
        collapsedTitle="Hỏi nhanh AI về video này"
        context="home"
        description="Câu trả lời chỉ sử dụng transcript do Local RAG Service truy xuất."
        disabledReason={disabledReason}
        expanded={chatExpanded}
        expandedTitle="Hỏi đáp về video này"
        followUpPlaceholder="Hỏi tiếp về video..."
        onAsk={(question, signal) => {
          if (!video) {
            return Promise.reject(new Error("Không còn video đang hoạt động."));
          }
          return answerVideoQuestion(video, question, generateContent, signal);
        }}
        onExpandedChange={setChatExpanded}
        onSourceSelect={onSeek}
        placeholder="VD: Khái niệm chính trong video là gì?"
        statusLabel={ragReady ? "RAG + Gemini" : "Chưa sẵn sàng"}
      />
    </div>
  );
}
