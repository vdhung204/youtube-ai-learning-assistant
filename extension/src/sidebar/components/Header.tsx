import { useState } from "react";
import type { GoogleAuthState } from "../../types/auth";
import { Icon } from "./Icon";

interface HeaderProps {
  authState: GoogleAuthState;
  isDark: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onToggleTheme: () => void;
}

export function Header({
  authState,
  isDark,
  onSignIn,
  onSignOut,
  onToggleTheme,
}: HeaderProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const ready = authState.status === "ready";
  const canStartSignIn = ["expired", "permission_denied", "signed_out"].includes(
    authState.status,
  );
  const accountName = authState.account?.label || "Google";
  const initial = accountName.slice(0, 1).toLocaleUpperCase();

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
              {ready ? <span aria-hidden="true">{initial}</span> : <Icon name="user" size={15} />}
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
