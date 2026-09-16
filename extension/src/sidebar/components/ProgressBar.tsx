interface ProgressBarProps {
  label: string;
  value: number;
  tone?: "blue" | "purple";
}

export function ProgressBar({ label, value, tone = "blue" }: ProgressBarProps) {
  const safeValue = Math.min(100, Math.max(0, value));

  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={safeValue}
      className={`progress progress--${tone}`}
      role="progressbar"
    >
      <span style={{ width: `${safeValue}%` }} />
    </div>
  );
}
