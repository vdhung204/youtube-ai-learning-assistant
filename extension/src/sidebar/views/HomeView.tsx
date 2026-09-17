import { useState } from "react";
import {
  answerVideoQuestion,
  FLASHCARD_GENERATION_COUNT,
  QUIZ_GENERATION_COUNT,
  type GenerateContent,
} from "../../integrations/learning/pipeline";
import type { AppView, CurrentVideo } from "../../types/learning";
import { AskAI } from "../components/AskAI";
import { Button, Icon, RuntimeStateCard } from "../components/ui";
import { VideoCard, VideoMilestones } from "../components/Video";
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
        <VideoCard
          detectionMessage={videoDetectionMessage}
          onSyncTimestamps={onRetryRag}
          video={video}
        />
      ) : (
        <RuntimeStateCard message={videoDetectionMessage} title="Chưa có video YouTube" />
      )}

      {serviceHealth.status !== "ready" ? (
        <ServiceStatusCard
          extensionOrigin={extensionOrigin}
          onRefresh={onRefreshHealth}
          state={serviceHealth}
        />
      ) : null}

      {video && !ragReady ? (
        <RuntimeStateCard
          className={`runtime-state-card--${ragState.status}`}
          message={ragState.message}
          role={["error", "no_transcript", "service_offline", "stale"].includes(ragState.status) ? "alert" : "status"}
          title={ragTitle}
        >
          {!ragReady && ragRetryable && serviceHealth.status === "ready" ? (
            <Button onClick={onRetryRag} tone="secondary">Thử lại</Button>
          ) : null}
        </RuntimeStateCard>
      ) : null}

      <section aria-label="Bắt đầu học nhanh" className="quick-action-grid">
        <article className="quick-card quick-card--quiz">
          <div className="quick-card-topline">
            <span className="count-badge">Tối đa {QUIZ_GENERATION_COUNT} câu</span>
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
            <span className="count-badge">Tối đa {FLASHCARD_GENERATION_COUNT} thẻ</span>
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

const serviceStatusLabels: Record<LocalServiceHealthState["status"], string> = {
  checking: "Đang kiểm tra",
  error: "Lỗi kết nối",
  idle: "Chờ đăng nhập",
  not_ready: "RAG chưa sẵn sàng",
  offline: "Service ngoại tuyến",
  ready: "RAG sẵn sàng",
  unavailable: "Chưa chạy trong extension",
};

interface ServiceStatusCardProps {
  extensionOrigin: string | null;
  onRefresh: () => void;
  state: LocalServiceHealthState;
}

function ServiceStatusCard({ extensionOrigin, onRefresh, state }: ServiceStatusCardProps) {
  const showSetupHint = state.status === "offline" || state.status === "error";

  return (
    <section className={`service-card service-card--${state.status}`}>
      <div className="service-card-copy">
        <div className="service-card-title">
          <span className="status-dot" />
          <h2>Local RAG Service</h2>
          <span>{serviceStatusLabels[state.status]}</span>
        </div>
        <p>{state.message}</p>
        {showSetupHint && extensionOrigin ? (
          <p className="origin-hint">
            Origin cần allowlist: <code>{extensionOrigin}</code>
          </p>
        ) : null}
        {state.data ? (
          <p className="service-version">
            Service {state.data.serviceVersion} • Pipeline {state.data.pipelineVersion}
          </p>
        ) : null}
      </div>
      <Button
        className="service-refresh"
        disabled={state.status === "checking"}
        onClick={onRefresh}
        tone="secondary"
      >
        <Icon name="refresh" size={14} />
        Kiểm tra lại
      </Button>
    </section>
  );
}
