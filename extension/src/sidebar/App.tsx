import { useEffect, useMemo, useState } from "react";
import { FlashcardView } from "../features/flashcard/FlashcardView";
import { AssessmentView } from "../features/learning-assessment/AssessmentView";
import { QuizView } from "../features/quiz/QuizView";
import { generateContent } from "../integrations/ai-gateway/client";
import type { AssessmentResponse, Question } from "../types/api";
import type { AppView } from "../types/learning";
import { AppShell } from "./components/AppShell";
import { Button, RuntimeStateCard } from "./components/ui";
import { useLocalServiceHealth } from "./hooks/useLocalServiceHealth";
import { useLearningContentCache } from "./hooks/useLearningContentCache";
import { useVideoRagSession } from "./hooks/useVideoRagSession";
import { useYouTubeContext } from "./hooks/useYouTubeContext";
import { HomeView } from "./views/HomeView";
import { LearningSectionPicker } from "./components/LearningSectionPicker";
import { buildLearningSections } from "../integrations/learning/sections";
import { ProgressiveQuizSession, quizBatchLoader } from "../integrations/learning/progressiveQuiz";

interface AssessmentSession {
  assessment: AssessmentResponse;
  questions: Question[];
  videoId: string;
}

export function App() {
  const [activeView, setActiveView] = useState<AppView>("home");
  const [isDark, setIsDark] = useState(false);
  const [assessmentSession, setAssessmentSession] = useState<AssessmentSession | null>(null);
  const [selectedScope, setSelectedScope] = useState("");
  const learningContent = useLearningContentCache(generateContent);
  const serviceHealth = useLocalServiceHealth(true);
  const youtube = useYouTubeContext(true);
  const video = youtube.state.status === "ready" ? youtube.state.video : undefined;
  const quizSession = useMemo(() => video ? new ProgressiveQuizSession(
    `${video.videoId}:${video.durationSec}:${video.language}`, quizBatchLoader(video, generateContent),
  ) : undefined, [video?.videoId, video?.durationSec, video?.language]);
  useEffect(() => () => quizSession?.stop(), [quizSession]);
  const ragSession = useVideoRagSession({
    enabled: true,
    serviceStatus: serviceHealth.state.status,
    video,
  });
  const ragRetryable = "retryable" in ragSession.state && ragSession.state.retryable;
  const sections = useMemo(() => ragSession.state.status === "ready" && video
    ? ragSession.state.learningSections ?? buildLearningSections(ragSession.state.milestones, video.durationSec)
    : [], [ragSession.state, video?.videoId, video?.durationSec]);
  const currentSection = sections.find(s => video && s.startSec <= video.currentTimeSec && video.currentTimeSec < s.endSec)
    ?? (video && video.currentTimeSec >= video.durationSec ? sections.at(-1) : sections[0]);
  const section = sections.find(s => `${video?.videoId}:${s.id}` === selectedScope) ?? currentSection;
  useEffect(() => {
    if (video && section && selectedScope !== `${video.videoId}:${section.id}`) {
      setSelectedScope(`${video.videoId}:${section.id}`);
    }
  }, [video?.videoId, section?.id, selectedScope]);
  const selectSection = (id: string) => {
    setSelectedScope(`${video?.videoId}:${id}`);
  };
  const navigate = (view: AppView) => {
    if (activeView === "home" && view === "flashcard" && currentSection) {
      selectSection(currentSection.id);
    }
    setActiveView(view);
  };

  useEffect(() => {
    setActiveView("home");
    setAssessmentSession(null);
  }, [video?.videoId]);

  const completeQuiz = (result: AssessmentResponse, questions: Question[]) => {
    if (!video) {
      return;
    }
    setAssessmentSession({ assessment: result, questions, videoId: video.videoId });
    setActiveView("assessment");
  };

  const restartQuiz = () => {
    setAssessmentSession(null);
    if (quizSession?.getSnapshot().status === "submitted") quizSession.redo();
    setActiveView("quiz");
  };

  const renderActiveView = () => {
    if (activeView === "home") {
      return (
        <HomeView
          extensionOrigin={serviceHealth.extensionOrigin}
          generateContent={generateContent}
          onNavigate={navigate}
          onRefreshHealth={serviceHealth.refresh}
          onRetryRag={ragSession.retry}
          onSeek={(seconds) => void youtube.seekTo(seconds)}
          ragReady={ragSession.isReady}
          ragState={ragSession.state}
          serviceHealth={serviceHealth.state}
          video={video}
          videoDetectionMessage={youtube.state.message}
        />
      );
    }

    if (activeView === "assessment") {
      const belongsToActiveVideo = Boolean(
        video && assessmentSession?.videoId === video.videoId,
      );
      return (
        <AssessmentView
          assessment={belongsToActiveVideo ? assessmentSession?.assessment ?? null : null}
          onReviewQuiz={restartQuiz}
          onSeek={(seconds) => void youtube.seekTo(seconds)}
          onStartQuiz={restartQuiz}
          questions={belongsToActiveVideo ? assessmentSession?.questions ?? [] : []}
        />
      );
    }

    if (!video || !ragSession.isReady) {
      return (
        <div className="view-stack">
          <RuntimeStateCard
            message={video ? ragSession.state.message : youtube.state.message}
            title="Nội dung video chưa sẵn sàng"
          >
            <Button onClick={() => setActiveView("home")} tone="secondary">
              Về trang chính
            </Button>
            {video && ragRetryable && serviceHealth.state.status === "ready" ? (
              <Button onClick={ragSession.retry}>Thử lại</Button>
            ) : null}
          </RuntimeStateCard>
        </div>
      );
    }

    if (activeView === "quiz" && quizSession) {
      return (
        <QuizView
          generateContent={generateContent}
          key={video.videoId}
          session={quizSession}
          onComplete={completeQuiz}
          onSeek={(seconds) => void youtube.seekTo(seconds)}
          video={video}
        />
      );
    }

    return (
      <FlashcardView
        generateContent={generateContent}
        key={`${video.videoId}-${section?.id}`}
        loadFlashcards={learningContent.loadFlashcards}
        onSeek={(seconds) => void youtube.seekTo(seconds)}
        video={{...video, learningSection: section}}
      />
    );
  };

  return (
    <AppShell
      activeView={activeView}
      isDark={isDark}
      notice={youtube.notice}
      onDismissNotice={youtube.dismissNotice}
      onNavigate={navigate}
      onToggleTheme={() => setIsDark((current) => !current)}
    >
      <div className="learning-session" key={video?.videoId ?? "no-video"}>
        {activeView === "flashcard" && section && ragSession.isReady ? <LearningSectionPicker
          sections={sections} selectedId={section.id} onSelect={selectSection}
          onCurrent={() => currentSection && selectSection(currentSection.id)}
          onSeek={(seconds) => void youtube.seekTo(seconds)}
        /> : null}
        {renderActiveView()}
      </div>
    </AppShell>
  );
}
