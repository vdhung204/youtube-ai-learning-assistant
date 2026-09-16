import type { ReactNode } from "react";

interface ChatMessageProps {
  children: ReactNode;
  role: "assistant" | "user";
}

export function ChatMessage({ children, role }: ChatMessageProps) {
  if (role === "user") {
    return (
      <div className="chat-message chat-message--user">
        <div className="chat-bubble chat-bubble--user">{children}</div>
      </div>
    );
  }

  return (
    <div className="chat-message chat-message--assistant">
      <div className="assistant-label">
        <span className="assistant-dot" />
        AI Learning Assistant
      </div>
      <div className="chat-bubble chat-bubble--assistant">{children}</div>
    </div>
  );
}
