import { useCallback, useEffect, useRef, useState } from "react";
import {
  canUseGoogleIdentity,
  getGoogleSession,
  GoogleAuthError,
  invalidateGoogleToken,
  signOutGoogle,
} from "../../integrations/google-oauth/authService";
import {
  generateContent as requestGeminiContent,
  GeminiAccessError,
  resolveGeminiModels,
  type GeminiGenerateOptions,
  type GeminiPromptInput,
} from "../../integrations/gemini/client";
import type { GoogleAuthState } from "../../types/auth";

const GOOGLE_CLOUD_PROJECT_ID = import.meta.env.VITE_YALA_GOOGLE_CLOUD_PROJECT_ID?.trim();
const GEMINI_MODEL = import.meta.env.VITE_YALA_GEMINI_MODEL?.trim();

const initialState: GoogleAuthState = {
  message: "Đang kiểm tra phiên Google đã được cấp quyền…",
  status: "checking",
};

export function useGoogleAuth() {
  const [state, setState] = useState<GoogleAuthState>(initialState);
  const tokenRef = useRef<string | undefined>(undefined);
  const modelsRef = useRef<string[]>([]);
  const operationRef = useRef(0);
  const authAbortRef = useRef<AbortController | undefined>(undefined);
  const generationControllersRef = useRef(new Set<AbortController>());

  const cancelGenerationRequests = useCallback(() => {
    for (const controller of generationControllersRef.current) {
      controller.abort();
    }
    generationControllersRef.current.clear();
  }, []);

  const authenticate = useCallback(async (interactive: boolean) => {
    authAbortRef.current?.abort();
    cancelGenerationRequests();
    const authController = new AbortController();
    authAbortRef.current = authController;
    const operation = ++operationRef.current;
    tokenRef.current = undefined;
    modelsRef.current = [];
    setState({
      message: interactive
        ? "Đang mở Google OAuth để bạn cấp quyền…"
        : "Đang kiểm tra phiên Google đã được cấp quyền…",
      status: interactive ? "authorizing" : "checking",
    });

    try {
      const session = await getGoogleSession(interactive);
      if (operation !== operationRef.current) {
        return;
      }
      tokenRef.current = session.token;
      setState({
        account: session.account,
        message: "Đã đăng nhập. Đang kiểm tra quyền sử dụng Gemini…",
        status: "checking_gemini",
      });

      const models = await resolveGeminiModels(session.token, {
        preferredModel: GEMINI_MODEL,
        projectId: GOOGLE_CLOUD_PROJECT_ID,
        signal: authController.signal,
      });
      if (operation !== operationRef.current) {
        return;
      }
      modelsRef.current = models.slice(0, 3);
      setState({
        account: session.account,
        message: "Google OAuth và Gemini đã sẵn sàng.",
        status: "ready",
      });
    } catch (error) {
      if (operation !== operationRef.current) {
        return;
      }
      if (error instanceof GoogleAuthError) {
        const status =
          error.code === "MISCONFIGURED"
            ? "misconfigured"
            : error.code === "UNAVAILABLE"
              ? "unavailable"
              : error.code === "PERMISSION_DENIED"
                ? "permission_denied"
                : "signed_out";
        setState({ message: error.message, status });
        return;
      }
      if (error instanceof GeminiAccessError) {
        if (error.code === "TOKEN_EXPIRED" && tokenRef.current) {
          const expiredToken = tokenRef.current;
          tokenRef.current = undefined;
          modelsRef.current = [];
          await invalidateGoogleToken(expiredToken);
          if (operation !== operationRef.current) {
            return;
          }
        }
        const status =
          error.code === "TOKEN_EXPIRED"
            ? "expired"
            : error.code === "PERMISSION_DENIED"
              ? "gemini_forbidden"
              : error.code === "QUOTA_EXCEEDED"
                ? "quota_exceeded"
                : "error";
        setState({ message: error.message, status });
        return;
      }
      setState({
        message: "Không thể hoàn tất đăng nhập Google. Hãy thử lại.",
        status: "error",
      });
    } finally {
      if (authAbortRef.current === authController) {
        authAbortRef.current = undefined;
      }
    }
  }, [cancelGenerationRequests]);

  const generateContent = useCallback(
    async <T = unknown>(
      prompt: GeminiPromptInput,
      options: Omit<GeminiGenerateOptions<T>, "fallbackModels" | "model" | "projectId"> = {},
    ): Promise<T> => {
      const token = tokenRef.current;
      const models = modelsRef.current;
      if (!token || models.length === 0) {
        throw new GeminiAccessError(
          "TOKEN_EXPIRED",
          "Phiên Google chưa sẵn sàng. Hãy đăng nhập lại.",
          401,
          { retryable: false },
        );
      }

      const authOperation = operationRef.current;
      // The side panel has one active learning action. Cancel a stale generation
      // before starting the newest one so tab/view changes cannot create a burst.
      cancelGenerationRequests();
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (options.signal?.aborted) {
        controller.abort();
      } else {
        options.signal?.addEventListener("abort", abort, { once: true });
      }
      generationControllersRef.current.add(controller);

      try {
        return await requestGeminiContent(token, prompt, {
          ...options,
          fallbackModels: models.slice(1),
          model: models[0],
          projectId: GOOGLE_CLOUD_PROJECT_ID,
          signal: controller.signal,
        });
      } catch (error) {
        if (
          error instanceof GeminiAccessError &&
          authOperation === operationRef.current &&
          tokenRef.current === token
        ) {
          if (error.code === "TOKEN_EXPIRED") {
            tokenRef.current = undefined;
            modelsRef.current = [];
            cancelGenerationRequests();
            await invalidateGoogleToken(token);
            if (authOperation === operationRef.current && !tokenRef.current) {
              setState({ message: error.message, status: "expired" });
            }
          } else if (error.code === "PERMISSION_DENIED") {
            setState((current) => ({
              ...current,
              message: error.message,
              status: "gemini_forbidden",
            }));
          }
        }
        throw error;
      } finally {
        options.signal?.removeEventListener("abort", abort);
        generationControllersRef.current.delete(controller);
      }
    },
    [cancelGenerationRequests],
  );

  const signOut = useCallback(async () => {
    authAbortRef.current?.abort();
    authAbortRef.current = undefined;
    cancelGenerationRequests();
    ++operationRef.current;
    const token = tokenRef.current;
    tokenRef.current = undefined;
    modelsRef.current = [];
    try {
      await signOutGoogle(token);
      setState({ message: "Bạn đã đăng xuất khỏi tiện ích.", status: "signed_out" });
    } catch {
      setState({
        message: "Không thể xóa phiên Google đã cache. Hãy thử đăng xuất lại.",
        status: "error",
      });
    }
  }, [cancelGenerationRequests]);

  useEffect(() => {
    void authenticate(false);
    return () => {
      ++operationRef.current;
      authAbortRef.current?.abort();
      cancelGenerationRequests();
    };
  }, [authenticate, cancelGenerationRequests]);

  useEffect(() => {
    if (!canUseGoogleIdentity()) {
      return;
    }
    const listener = (_account: chrome.identity.AccountInfo, signedIn: boolean) => {
      if (signedIn) {
        void authenticate(false);
        return;
      }
      ++operationRef.current;
      authAbortRef.current?.abort();
      authAbortRef.current = undefined;
      cancelGenerationRequests();
      tokenRef.current = undefined;
      modelsRef.current = [];
      setState({ message: "Tài khoản Google đã đăng xuất.", status: "signed_out" });
    };
    chrome.identity.onSignInChanged.addListener(listener);
    return () => chrome.identity.onSignInChanged.removeListener(listener);
  }, [authenticate, cancelGenerationRequests]);

  return {
    generateContent,
    retry: () => authenticate(false),
    signIn: () => authenticate(true),
    signOut,
    state,
  };
}
