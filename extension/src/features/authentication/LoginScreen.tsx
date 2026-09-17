import type { GoogleAuthState } from "../../types/auth";
import { Button, Icon } from "../../sidebar/components/ui";

interface LoginScreenProps {
  onRetry: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  state: GoogleAuthState;
}

const progressStatuses: ReadonlySet<GoogleAuthState["status"]> = new Set([
  "checking",
  "authorizing",
  "checking_gemini",
]);

const titles: Record<GoogleAuthState["status"], string> = {
  authorizing: "Đang cấp quyền Google",
  checking: "Đang kiểm tra đăng nhập",
  checking_gemini: "Đang kiểm tra Gemini",
  error: "Không thể hoàn tất đăng nhập",
  expired: "Phiên Google đã hết hạn",
  gemini_forbidden: "Gemini chưa được cấp quyền",
  misconfigured: "Google OAuth chưa được cấu hình",
  permission_denied: "Bạn chưa cấp quyền",
  quota_exceeded: "Gemini đã hết quota",
  ready: "Google và Gemini đã sẵn sàng",
  signed_out: "Đăng nhập bằng Google",
  unavailable: "Google OAuth không khả dụng",
};

export function LoginScreen({ onRetry, onSignIn, onSignOut, state }: LoginScreenProps) {
  const isProgress = progressStatuses.has(state.status);
  const canSignIn = [
    "expired",
    "permission_denied",
    "signed_out",
  ].includes(state.status);
  const canRetry = ["error", "gemini_forbidden", "quota_exceeded"].includes(state.status);

  return (
    <section aria-labelledby="google-auth-title" className="auth-card">
      <div className="google-mark" aria-hidden="true">
        G
      </div>
      <div aria-live="polite" className="auth-copy" role={isProgress ? "status" : undefined}>
        <p className="auth-eyebrow">Tài khoản học tập</p>
        <h1 id="google-auth-title">{titles[state.status]}</h1>
        <p>{state.message}</p>
      </div>

      {isProgress ? (
        <div aria-hidden="true" className="auth-progress">
          <span />
        </div>
      ) : null}

      {canSignIn ? (
        <Button className="google-sign-in" fullWidth onClick={onSignIn}>
          <span className="google-button-mark" aria-hidden="true">
            G
          </span>
          {state.status === "signed_out" ? "Đăng nhập bằng Google" : "Đăng nhập lại"}
        </Button>
      ) : null}

      {canRetry ? (
        <Button fullWidth onClick={onRetry} tone="secondary">
          <Icon name="refresh" size={15} />
          Kiểm tra lại
        </Button>
      ) : null}

      {state.status === "gemini_forbidden" ? (
        <Button fullWidth onClick={onSignOut} tone="secondary">
          <Icon name="user" size={15} />
          Đổi tài khoản Google
        </Button>
      ) : null}

      {state.status === "misconfigured" ? (
        <p className="auth-config-hint">
          Build lại extension với <code>VITE_YALA_GOOGLE_OAUTH_CLIENT_ID</code>, sau đó reload
          extension.
        </p>
      ) : null}

      <ul className="auth-privacy-list">
        <li>OAuth chỉ mở sau khi bạn bấm nút đăng nhập.</li>
        <li>Token chỉ tồn tại tạm trong bộ nhớ; cache do Chrome Identity quản lý.</li>
        <li>Local RAG Service không nhận token hoặc cookie Google.</li>
      </ul>
    </section>
  );
}
