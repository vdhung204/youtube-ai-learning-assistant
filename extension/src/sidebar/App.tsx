import { useEffect, useState } from "react";
import { FlashcardView } from "../features/flashcard/FlashcardView";
import { LoginScreen } from "../features/authentication/LoginScreen";
import { AssessmentView } from "../features/learning-assessment/AssessmentView";
import { QuizView } from "../features/quiz/QuizView";
import type { AssessmentResponse, Question } from "../types/api";
import type { AppView } from "../types/learning";
import { AppShell } from "./components/AppShell";
import { Button, RuntimeStateCard } from "./components/ui";
import { useLocalServiceHealth } from "./hooks/useLocalServiceHealth";
import { useGoogleAuth } from "./hooks/useGoogleAuth";
import { useLearningContentCache } from "./hooks/useLearningContentCache";
import { useVideoRagSession } from "./hooks/useVideoRagSession";
import { useYouTubeContext } from "./hooks/useYouTubeContext";
import { HomeView } from "./views/HomeView";

interface AssessmentSession {
  assessment: AssessmentResponse;
  questions: Question[];
  videoId: string;
}

export function App() {
  const [activeView, setActiveView] = useState<AppView>("home");
  const [isDark, setIsDark] = useState(false);
  const [assessmentSession, setAssessmentSession] = useState<AssessmentSession | null>(null);
  const [quizAttempt, setQuizAttempt] = useState(0);
  const auth = useGoogleAuth();
  const learningContent = useLearningContentCache(auth.generateContent);
  const authenticated = auth.state.status === "ready";
  const serviceHealth = useLocalServiceHealth(authenticated);
  const youtube = useYouTubeContext(authenticated);
  const video = youtube.state.status === "ready" ? youtube.state.video : undefined;
  const ragSession = useVideoRagSession({
    enabled: authenticated,
    serviceStatus: serviceHealth.state.status,
    video,
  });
  const ragRetryable = "retryable" in ragSession.state && ragSession.state.retryable;

  useEffect(() => {
    setActiveView("home");
    setAssessmentSession(null);
    setQuizAttempt((attempt) => attempt + 1);
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
    setQuizAttempt((attempt) => attempt + 1);
    setActiveView("quiz");
  };

  const renderAuthenticatedView = () => {
    if (activeView === "home") {
      return (
        <HomeView
          extensionOrigin={serviceHealth.extensionOrigin}
          generateContent={auth.generateContent}
          onNavigate={setActiveView}
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

    if (activeView === "quiz") {
      return (
        <QuizView
          generateContent={auth.generateContent}
          key={`${video.videoId}-${quizAttempt}`}
          loadQuiz={learningContent.loadQuiz}
          onComplete={completeQuiz}
          onSeek={(seconds) => void youtube.seekTo(seconds)}
          video={video}
        />
      );
    }

    return (
      <FlashcardView
        generateContent={auth.generateContent}
        key={video.videoId}
        loadFlashcards={learningContent.loadFlashcards}
        onSeek={(seconds) => void youtube.seekTo(seconds)}
        video={video}
      />
    );
  };

  return (
    <AppShell
      activeView={activeView}
      authState={auth.state}
      isDark={isDark}
      notice={youtube.notice}
      onDismissNotice={youtube.dismissNotice}
      onNavigate={setActiveView}
      onSignIn={() => void auth.signIn()}
      onSignOut={() => void auth.signOut()}
      onToggleTheme={() => setIsDark((current) => !current)}
      showNavigation={authenticated}
    >
      {authenticated ? (
        <div className="learning-session" key={video?.videoId ?? "no-video"}>
          {renderAuthenticatedView()}
        </div>
      ) : (
        <LoginScreen
          onRetry={() => void auth.retry()}
          onSignIn={() => void auth.signIn()}
          onSignOut={() => void auth.signOut()}
          state={auth.state}
        />
      )}
    </AppShell>
  );
}
