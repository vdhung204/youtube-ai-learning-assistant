import type { ReactNode } from "react";
import type { AppNotice, AppView } from "../../types/learning";
import { Icon } from "./ui";

interface AppShellProps {
  activeView: AppView;
  children: ReactNode;
  isDark: boolean;
  notice: AppNotice | null;
  onDismissNotice: () => void;
  onNavigate: (view: AppView) => void;
  onToggleTheme: () => void;
}

export function AppShell({
  activeView,
  children,
  isDark,
  notice,
  onDismissNotice,
  onNavigate,
  onToggleTheme,
}: AppShellProps) {
  return (
    <div className="app-viewport" data-theme={isDark ? "dark" : "light"}>
      <div className="app-shell">
        <Header isDark={isDark} onToggleTheme={onToggleTheme} />
        <TopNavigation activeView={activeView} onNavigate={onNavigate} />
        {notice ? (
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

interface HeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
}

function Header({ isDark, onToggleTheme }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="brand-lockup">
        <span className="brand-title">YouTube AI Learning Assistant</span>
      </div>

      <div className="header-actions">
        <span className="gateway-status" title="Nội dung AI được gửi qua gateway của dự án">
          <span className="status-dot" /> AI qua Gateway
        </span>
        <button
          aria-label={isDark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
          className="icon-button theme-toggle"
          onClick={onToggleTheme}
          type="button"
        >
          <Icon name={isDark ? "sun" : "moon"} size={18} />
        </button>
      </div>
    </header>
  );
}

interface TopNavigationProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
}

const navigationItems: ReadonlyArray<{ label: string; value: AppView }> = [
  { label: "Trang chính", value: "home" },
  { label: "Quiz", value: "quiz" },
  { label: "Flashcard", value: "flashcard" },
  { label: "Đánh giá", value: "assessment" },
];

function TopNavigation({ activeView, onNavigate }: TopNavigationProps) {
  return (
    <nav aria-label="Chế độ học tập" className="top-navigation">
      <span className="navigation-label">Chế độ</span>
      <div className="navigation-tabs">
        {navigationItems.map((item) => (
          <button
            aria-current={activeView === item.value ? "page" : undefined}
            className={activeView === item.value ? "navigation-tab is-active" : "navigation-tab"}
            key={item.value}
            onClick={() => onNavigate(item.value)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
