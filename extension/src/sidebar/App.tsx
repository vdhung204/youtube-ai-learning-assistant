import { useEffect, useState } from "react";
import { FlashcardView } from "../features/flashcard/FlashcardView";
import { LoginScreen } from "../features/authentication/LoginScreen";
import { AssessmentView } from "../features/learning-assessment/AssessmentView";
import { QuizView } from "../features/quiz/QuizView";
import type { AssessmentResponse, Question } from "../types/api";
import type { AppView } from "../types/learning";
import { AppShell } from "./components/AppShell";
import { Button } from "./components/Button";
import { useLocalServiceHealth } from "./hooks/useLocalServiceHealth";
import { useGoogleAuth } from "./hooks/useGoogleAuth";
import { useLearningContentCache } from "./hooks/useLearningContentCache";
import { useVideoRagSession } from "./hooks/useVideoRagSession";
import { useYouTubeContext } from "./hooks/useYouTubeContext";
import { HomeView } from "./views/HomeView";

export function App() {
  const [activeView, setActiveView] = useState<AppView>("home");
  const [isDark, setIsDark] = useState(false);
  const [assessment, setAssessment] = useState<AssessmentResponse | null>(null);
  const [assessmentQuestions, setAssessmentQuestions] = useState<Question[]>([]);
  const [assessmentVideoId, setAssessmentVideoId] = useState<string | null>(null);
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
    setAssessment(null);
    setAssessmentQuestions([]);
    setAssessmentVideoId(null);
    setQuizAttempt((attempt) => attempt + 1);
  }, [video?.videoId]);

  const completeQuiz = (result: AssessmentResponse, questions: Question[]) => {
    if (!video) {
      return;
    }
    setAssessment(result);
    setAssessmentQuestions(questions);
    setAssessmentVideoId(video.videoId);
    setActiveView("assessment");
  };

  const restartQuiz = () => {
    setAssessment(null);
    setAssessmentQuestions([]);
    setAssessmentVideoId(null);
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
      const belongsToActiveVideo = Boolean(video && assessmentVideoId === video.videoId);
      return (
        <AssessmentView
          assessment={belongsToActiveVideo ? assessment : null}
          onReviewQuiz={restartQuiz}
          onSeek={(seconds) => void youtube.seekTo(seconds)}
          onStartQuiz={restartQuiz}
          questions={belongsToActiveVideo ? assessmentQuestions : []}
        />
      );
    }

    if (!video || !ragSession.isReady) {
      return (
        <div className="view-stack">
          <section className="runtime-state-card surface-card" role="status">
            <h2>Nội dung video chưa sẵn sàng</h2>
            <p>{video ? ragSession.state.message : youtube.state.message}</p>
            <Button onClick={() => setActiveView("home")} tone="secondary">
              Về trang chính
            </Button>
            {video && ragRetryable && serviceHealth.state.status === "ready" ? (
              <Button onClick={ragSession.retry}>Thử lại</Button>
            ) : null}
          </section>
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
