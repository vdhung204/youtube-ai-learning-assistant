import type { ReactNode } from "react";
import type { GoogleAuthState } from "../../types/auth";
import type { AppNotice, AppView } from "../../types/learning";
import { Header } from "./Header";
import { Icon } from "./Icon";
import { TopNavigation } from "./TopNavigation";

interface AppShellProps {
  activeView: AppView;
  authState: GoogleAuthState;
  children: ReactNode;
  isDark: boolean;
  notice: AppNotice | null;
  onDismissNotice: () => void;
  onNavigate: (view: AppView) => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onToggleTheme: () => void;
  showNavigation: boolean;
}

export function AppShell({
  activeView,
  authState,
  children,
  isDark,
  notice,
  onDismissNotice,
  onNavigate,
  onSignIn,
  onSignOut,
  onToggleTheme,
  showNavigation,
}: AppShellProps) {
  return (
    <div className="app-viewport" data-theme={isDark ? "dark" : "light"}>
      <div className="app-shell">
        <Header
          authState={authState}
          isDark={isDark}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
          onToggleTheme={onToggleTheme}
        />
        {showNavigation ? <TopNavigation activeView={activeView} onNavigate={onNavigate} /> : null}
        {showNavigation && notice ? (
          <div className={`app-notice app-notice--${notice.tone}`} role="status">
            <span>{notice.message}</span>
            <button aria-label="Đóng thông báo" onClick={onDismissNotice} type="button">
              <Icon name="close" size={14} />
            </button>
          </div>
        ) : null}
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
