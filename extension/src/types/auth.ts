export interface GoogleAccount {
  email: string;
  id: string;
  label: string;
}

export type GoogleAuthStatus =
  | "checking"
  | "signed_out"
  | "authorizing"
  | "checking_gemini"
  | "ready"
  | "expired"
  | "permission_denied"
  | "gemini_forbidden"
  | "quota_exceeded"
  | "misconfigured"
  | "unavailable"
  | "error";

export interface GoogleAuthState {
  account?: GoogleAccount;
  message: string;
  status: GoogleAuthStatus;
}
