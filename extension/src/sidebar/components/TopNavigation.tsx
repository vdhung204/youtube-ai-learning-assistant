import type { AppView } from "../../types/learning";

interface TopNavigationProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
}

const items: ReadonlyArray<{ label: string; value: AppView }> = [
  { label: "Trang chính", value: "home" },
  { label: "Quiz", value: "quiz" },
  { label: "Flashcard", value: "flashcard" },
  { label: "Đánh giá", value: "assessment" },
];

export function TopNavigation({ activeView, onNavigate }: TopNavigationProps) {
  return (
    <nav aria-label="Chế độ học tập" className="top-navigation">
      <span className="navigation-label">Chế độ</span>
      <div className="navigation-tabs">
        {items.map((item) => (
          <button
            aria-current={activeView === item.value ? "page" : undefined}
            className={activeView === item.value ? "navigation-tab is-active" : "navigation-tab"}
            key={item.value}
            onClick={() => onNavigate(item.value)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
