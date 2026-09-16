import type { LocalServiceHealthState } from "../hooks/useLocalServiceHealth";
import { Button } from "./Button";
import { Icon } from "./Icon";

interface ServiceStatusCardProps {
  extensionOrigin: string | null;
  onRefresh: () => void;
  state: LocalServiceHealthState;
}

const labels: Record<LocalServiceHealthState["status"], string> = {
  checking: "Đang kiểm tra",
  error: "Lỗi kết nối",
  idle: "Chờ đăng nhập",
  not_ready: "RAG chưa sẵn sàng",
  offline: "Service ngoại tuyến",
  ready: "RAG sẵn sàng",
  unavailable: "Chưa chạy trong extension",
};

export function ServiceStatusCard({ extensionOrigin, onRefresh, state }: ServiceStatusCardProps) {
  const showSetupHint = state.status === "offline" || state.status === "error";

  return (
    <section className={`service-card service-card--${state.status}`}>
      <div className="service-card-copy">
        <div className="service-card-title">
          <span className="status-dot" />
          <h2>Local RAG Service</h2>
          <span>{labels[state.status]}</span>
        </div>
        <p>{state.message}</p>
        {showSetupHint && extensionOrigin ? (
          <p className="origin-hint">
            Origin cần allowlist: <code>{extensionOrigin}</code>
          </p>
        ) : null}
        {state.data ? (
          <p className="service-version">
            Service {state.data.serviceVersion} • Pipeline {state.data.pipelineVersion}
          </p>
        ) : null}
      </div>
      <Button
        className="service-refresh"
        disabled={state.status === "checking"}
        onClick={onRefresh}
        tone="secondary"
      >
        <Icon name="refresh" size={14} />
        Kiểm tra lại
      </Button>
    </section>
  );
}
