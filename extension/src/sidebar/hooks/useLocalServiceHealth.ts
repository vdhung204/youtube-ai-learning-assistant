import { useCallback, useEffect, useState } from "react";
import type { HealthResponse } from "../../types/api";
import { getHealth, LocalServiceError } from "../../integrations/local-service/client";
import { hasChromeExtensionRuntime } from "../../integrations/youtube/client";

export type LocalServiceHealthState =
  | { status: "idle"; data?: undefined; message: string }
  | { status: "checking"; data?: undefined; message: string }
  | { status: "ready" | "not_ready"; data: HealthResponse; message: string }
  | { status: "offline" | "error" | "unavailable"; data?: undefined; message: string };

const initialState: LocalServiceHealthState = {
  status: "checking",
  message: "Đang kiểm tra Local RAG Service…",
};

const idleState: LocalServiceHealthState = {
  status: "idle",
  message: "Local RAG Service sẽ được kiểm tra sau khi đăng nhập Google.",
};

export function useLocalServiceHealth(enabled = true) {
  const [state, setState] = useState<LocalServiceHealthState>(enabled ? initialState : idleState);
  const [requestVersion, setRequestVersion] = useState(0);
  const refresh = useCallback(() => setRequestVersion((version) => version + 1), []);

  useEffect(() => {
    if (!enabled) {
      setState(idleState);
      return;
    }
    if (!hasChromeExtensionRuntime()) {
      setState({
        status: "unavailable",
        message: "Health check chỉ chạy trong Chrome Extension đã được load.",
      });
      return;
    }

    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 4_000);
    setState(initialState);

    void getHealth(controller.signal)
      .then((health) => {
        if (!active) {
          return;
        }
        if (health.status === "ready") {
          setState({ status: "ready", data: health, message: "Local RAG Service đã sẵn sàng." });
        } else {
          setState({
            status: "not_ready",
            data: health,
            message: "Service đang chạy nhưng RAG chưa được cấu hình hoặc chưa sẵn sàng.",
          });
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        if (controller.signal.aborted) {
          setState({
            status: "offline",
            message: "Local Service không phản hồi trong thời gian cho phép.",
          });
          return;
        }
        if (error instanceof LocalServiceError) {
          setState({
            status: error.kind === "network" ? "offline" : "error",
            message: error.message,
          });
          return;
        }
        setState({ status: "error", message: "Không thể xác định trạng thái Local Service." });
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [enabled, requestVersion]);

  const extensionOrigin = hasChromeExtensionRuntime()
    ? chrome.runtime.getURL("").replace(/\/$/, "")
    : null;

  return { extensionOrigin, refresh, state };
}
