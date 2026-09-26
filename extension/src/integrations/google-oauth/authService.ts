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
const GOOGLE_USER_INFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/generative-language.retriever",
  "https://www.googleapis.com/auth/userinfo.email",
];

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readTokenAccount(token: string): Promise<GoogleAccount> {
  let response: Response;
  try {
    response = await fetch(GOOGLE_USER_INFO_URL, {
      credentials: "omit",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      method: "GET",
    });
  } catch {
    throw new GoogleAuthError(
      "UNAVAILABLE",
      "Không thể xác minh tài khoản Google đang cấp token. Hãy kiểm tra mạng rồi thử lại.",
    );
  }

  if (response.status === 401) {
    await invalidateGoogleToken(token);
    await chrome.identity.clearAllCachedAuthTokens();
    throw new GoogleAuthError("SIGNED_OUT", "Phiên Google đã hết hạn. Hãy đăng nhập lại.");
  }
  if (response.status === 403) {
    throw new GoogleAuthError(
      "PERMISSION_DENIED",
      "Bạn chưa cấp quyền đọc email để xác minh tài khoản Google đang sử dụng.",
    );
  }
  if (!response.ok) {
    throw new GoogleAuthError(
      "UNAVAILABLE",
      "Google không thể xác minh tài khoản đang sử dụng. Hãy thử lại sau.",
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new GoogleAuthError("UNAVAILABLE", "Google trả về thông tin tài khoản không hợp lệ.");
  }
  if (!isRecord(body) || typeof body.id !== "string" || typeof body.email !== "string") {
    throw new GoogleAuthError("UNAVAILABLE", "Google trả về thông tin tài khoản không hợp lệ.");
  }

  const id = body.id.trim();
  const email = body.email.trim();
  if (!id || !email) {
    throw new GoogleAuthError("UNAVAILABLE", "Google không trả về email của tài khoản đang sử dụng.");
  }
  return { email, id, label: accountLabel(email) };
}

export async function getGoogleSession(interactive: boolean): Promise<GoogleSession> {
  assertOAuthConfigured();

  let result: chrome.identity.GetAuthTokenResult;
  try {
    result = await chrome.identity.getAuthToken({
      interactive,
      scopes: GOOGLE_OAUTH_SCOPES,
    });
  } catch {
    throw new GoogleAuthError(
      interactive ? "PERMISSION_DENIED" : "SIGNED_OUT",
      interactive
        ? "Bạn chưa hoàn tất hoặc đã từ chối cấp quyền Google cho tiện ích."
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

  if (
    result.grantedScopes &&
    GOOGLE_OAUTH_SCOPES.some((scope) => !result.grantedScopes?.includes(scope))
  ) {
    await invalidateGoogleToken(result.token);
    await chrome.identity.clearAllCachedAuthTokens();
    throw new GoogleAuthError(
      interactive ? "PERMISSION_DENIED" : "SIGNED_OUT",
      interactive
        ? "Bạn cần cấp đủ quyền Gemini và email để tiếp tục."
        : "Phiên Google cũ chưa có đủ quyền. Hãy đăng nhập lại.",
    );
  }

  return { account: await readTokenAccount(result.token), token: result.token };
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
