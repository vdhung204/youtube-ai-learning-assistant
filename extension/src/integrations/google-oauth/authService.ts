import type { GoogleAccount } from "../../types/auth";

export type GoogleAuthErrorCode =
  | "SIGNED_OUT"
  | "PERMISSION_DENIED"
  | "MISCONFIGURED"
  | "UNAVAILABLE";

export class GoogleAuthError extends Error {
  readonly code: GoogleAuthErrorCode;

  constructor(code: GoogleAuthErrorCode, message: string) {
    super(message);
    this.name = "GoogleAuthError";
    this.code = code;
  }
}

export interface GoogleSession {
  account: GoogleAccount;
  token: string;
}

const OAUTH_CLIENT_ID_PATTERN = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/i;
const GOOGLE_TOKEN_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

function hasIdentityRuntime(): boolean {
  return (
    typeof chrome !== "undefined" &&
    Boolean(chrome.runtime?.id) &&
    typeof chrome.runtime?.getManifest === "function" &&
    typeof chrome.identity?.getAuthToken === "function"
  );
}

function assertOAuthConfigured(): void {
  if (!hasIdentityRuntime()) {
    throw new GoogleAuthError(
      "UNAVAILABLE",
      "Google OAuth chỉ hoạt động trong Chrome Extension đã được load.",
    );
  }

  const clientId = chrome.runtime.getManifest().oauth2?.client_id?.trim() ?? "";
  if (!OAUTH_CLIENT_ID_PATTERN.test(clientId)) {
    throw new GoogleAuthError(
      "MISCONFIGURED",
      "Bản build chưa có Google OAuth Client ID hợp lệ.",
    );
  }
}

function accountLabel(email: string): string {
  const localPart = email.split("@")[0]?.trim();
  return localPart || "Google";
}

async function readProfile(): Promise<GoogleAccount> {
  try {
    const profile = await chrome.identity.getProfileUserInfo({
      accountStatus: chrome.identity.AccountStatus.ANY,
    });
    return {
      email: profile.email,
      id: profile.id,
      label: accountLabel(profile.email),
    };
  } catch {
    return { email: "", id: "", label: "Google" };
  }
}

export async function getGoogleSession(interactive: boolean): Promise<GoogleSession> {
  assertOAuthConfigured();

  let result: chrome.identity.GetAuthTokenResult;
  try {
    result = await chrome.identity.getAuthToken({ interactive });
  } catch {
    throw new GoogleAuthError(
      interactive ? "PERMISSION_DENIED" : "SIGNED_OUT",
      interactive
        ? "Bạn chưa cấp quyền Google cho tiện ích."
        : "Bạn chưa đăng nhập hoặc chưa cấp quyền Google cho tiện ích.",
    );
  }

  if (!result.token) {
    throw new GoogleAuthError(
      interactive ? "PERMISSION_DENIED" : "SIGNED_OUT",
      interactive
        ? "Google không trả về quyền truy cập cho tiện ích."
        : "Chưa tìm thấy phiên Google đã được cấp quyền.",
    );
  }

  return { account: await readProfile(), token: result.token };
}

export async function invalidateGoogleToken(token: string): Promise<void> {
  if (!hasIdentityRuntime() || !token) {
    return;
  }
  try {
    await chrome.identity.removeCachedAuthToken({ token });
  } catch {
    // The token may already have expired or been removed by Chrome.
  }
}

async function revokeGoogleToken(token: string): Promise<void> {
  if (!token) {
    return;
  }
  try {
    await fetch(GOOGLE_TOKEN_REVOKE_URL, {
      body: new URLSearchParams({ token }).toString(),
      credentials: "omit",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
  } catch {
    // Cache cleanup still prevents this extension from reusing the token.
  }
}

export async function signOutGoogle(token?: string): Promise<void> {
  if (!hasIdentityRuntime()) {
    return;
  }
  if (token) {
    await invalidateGoogleToken(token);
    await revokeGoogleToken(token);
  }
  await chrome.identity.clearAllCachedAuthTokens();
}

export function canUseGoogleIdentity(): boolean {
  return hasIdentityRuntime();
}
