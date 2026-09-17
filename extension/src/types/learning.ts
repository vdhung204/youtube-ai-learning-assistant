import type { SourceTimestamp, Video } from "./api";

export type AppView = "home" | "quiz" | "flashcard" | "assessment";
export type AskAIContext = Exclude<AppView, "assessment">;

export interface CurrentVideo extends Video {
  channel: string;
  currentTimeSec: number;
  dataSource: "youtube";
  thumbnailUrl?: string;
  thumbnailLabel: string;
}

export type FlashcardConfidence = "known" | "review";

export interface AppNotice {
  message: string;
  tone: "error" | "success";
}

export interface Flashcard {
  flashcardId: string;
  front: string;
  back: string;
  hint: string;
  topic: string;
  sourceTimestamp: SourceTimestamp;
}

export interface VideoSource extends SourceTimestamp {
  label: string;
}

export interface VideoMilestone {
  label: string;
  startSec: number;
}
