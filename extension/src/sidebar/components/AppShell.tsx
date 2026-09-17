import { useState, type ReactNode } from "react";
import type { GoogleAuthState } from "../../types/auth";
import type { AppNotice, AppView } from "../../types/learning";
import { Icon } from "./ui";

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

interface HeaderProps {
  authState: GoogleAuthState;
  isDark: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onToggleTheme: () => void;
}

function Header({ authState, isDark, onSignIn, onSignOut, onToggleTheme }: HeaderProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const ready = authState.status === "ready";
  const canStartSignIn = ["expired", "permission_denied", "signed_out"].includes(
    authState.status,
  );
  const accountName = authState.account?.label || "Google";

  return (
    <header className="app-header">
      <div className="brand-lockup">
        <span className="brand-title">YouTube AI Learning Assistant</span>
      </div>

      <div className="header-actions">
        <div className="profile-menu-wrap">
          <button
            aria-expanded={ready ? profileOpen : undefined}
            aria-haspopup={ready ? "menu" : undefined}
            aria-label={
              ready
                ? `Tài khoản ${accountName}`
                : canStartSignIn
                  ? "Mở màn hình đăng nhập Google"
                  : `Trạng thái Google: ${authState.message}`
            }
            className="profile-pill"
            disabled={!ready && !canStartSignIn}
            onClick={() => (ready ? setProfileOpen((open) => !open) : onSignIn())}
            title={ready ? authState.account?.email || accountName : "Đăng nhập bằng Google"}
            type="button"
          >
            <span className="avatar">
              {ready ? (
                <span aria-hidden="true">{accountName.slice(0, 1).toLocaleUpperCase()}</span>
              ) : (
                <Icon name="user" size={15} />
              )}
            </span>
            <span className="profile-name">{ready ? accountName : "Đăng nhập"}</span>
            {ready ? <Icon name="chevron-down" size={14} /> : null}
          </button>
          {ready && profileOpen ? (
            <div className="profile-menu" role="menu">
              <strong>{accountName}</strong>
              <span>{authState.account?.email || "Tài khoản Google"}</span>
              <span className="profile-ready">
                <span className="status-dot" /> Gemini sẵn sàng
              </span>
              <button
                onClick={() => {
                  setProfileOpen(false);
                  onSignOut();
                }}
                role="menuitem"
                type="button"
              >
                Đăng xuất khỏi tiện ích
              </button>
            </div>
          ) : null}
        </div>
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
