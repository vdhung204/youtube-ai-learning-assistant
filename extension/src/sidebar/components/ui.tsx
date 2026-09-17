import type { ButtonHTMLAttributes, ReactNode, SVGProps } from "react";

export type IconName =
  | "arrow-back"
  | "arrow-forward"
  | "cards"
  | "chevron-down"
  | "close"
  | "lightbulb"
  | "moon"
  | "play"
  | "refresh"
  | "send"
  | "sparkles"
  | "sun"
  | "timer"
  | "user";

const iconPaths: Record<IconName, ReactNode> = {
  "arrow-back": <path d="m15 18-6-6 6-6M9 12h10" />,
  "arrow-forward": <path d="m9 18 6-6-6-6m6 6H5" />,
  cards: (
    <>
      <rect x="4" y="7" width="16" height="13" rx="2" />
      <path d="M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M8 12h8" />
    </>
  ),
  "chevron-down": <path d="m8 10 4 4 4-4" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  lightbulb: (
    <>
      <path d="M9 18h6M10 22h4" />
      <path d="M8.2 14.5a6 6 0 1 1 7.6 0c-.8.6-1.3 1.5-1.3 2.5h-5c0-1-.5-1.9-1.3-2.5Z" />
    </>
  ),
  moon: <path d="M20.5 14.2A8 8 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />,
  play: <path d="m9 7 8 5-8 5V7Z" fill="currentColor" stroke="none" />,
  refresh: (
    <>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6.1 8A7 7 0 0 1 18 6l2 6M18 16a7 7 0 0 1-11.9 2L4 12" />
    </>
  ),
  send: <path d="m4 4 16 8-16 8 3-8-3-8Zm3 8h13" />,
  sparkles: (
    <>
      <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" />
      <path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15ZM5 3v3M3.5 4.5h3" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 1.5M9 2h6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </>
  ),
};

export function Icon({ name, size = 18, ...props }: SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {iconPaths[name]}
    </svg>
  );
}

export function Button({
  children,
  className = "",
  fullWidth = false,
  tone = "primary",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  fullWidth?: boolean;
  tone?: "primary" | "secondary" | "purple" | "text";
}) {
  const classes = ["button", `button--${tone}`, fullWidth && "button--full", className]
    .filter(Boolean)
    .join(" ");
  return <button className={classes} type={type} {...props}>{children}</button>;
}

export function ProgressBar({
  label,
  value,
  tone = "blue",
}: {
  label: string;
  value: number;
  tone?: "blue" | "purple";
}) {
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

export function RuntimeStateCard({
  children,
  className = "",
  message,
  role = "status",
  title,
}: {
  children?: ReactNode;
  className?: string;
  message: string;
  role?: "alert" | "status";
  title: string;
}) {
  return (
    <section className={["runtime-state-card surface-card", className].filter(Boolean).join(" ")} role={role}>
      <h2>{title}</h2>
      <p>{message}</p>
      {children}
    </section>
  );
}

export function ChatMessage({ children, role }: { children: ReactNode; role: "assistant" | "user" }) {
  if (role === "user") {
    return <div className="chat-message chat-message--user"><div className="chat-bubble chat-bubble--user">{children}</div></div>;
  }
  return (
    <div className="chat-message chat-message--assistant">
      <div className="assistant-label"><span className="assistant-dot" />AI Learning Assistant</div>
      <div className="chat-bubble chat-bubble--assistant">{children}</div>
    </div>
  );
}
