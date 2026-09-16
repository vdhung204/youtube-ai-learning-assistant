export type VideoId = string;
export type RetrievalPurpose = "quiz" | "flashcard" | "review";
export type IndexStatus = "not_indexed" | "indexing" | "ready" | "failed";
export type LocalServiceErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_VIDEO_ID"
  | "VIDEO_ID_MISMATCH"
  | "PAYLOAD_TOO_LARGE"
  | "TRANSCRIPT_INVALID"
  | "QUERY_INVALID"
  | "QUIZ_INVALID"
  | "INDEX_NOT_FOUND"
  | "INDEX_FAILED"
  | "RETRIEVAL_FAILED"
  | "ASSESSMENT_FAILED"
  | "CACHE_DELETE_FAILED"
  | "SERVICE_NOT_READY"
  | "ORIGIN_NOT_ALLOWED"
  | "CREDENTIALS_NOT_ALLOWED"
  | "REQUEST_TIMEOUT"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "INTERNAL_ERROR";

export interface Timestamp {
  startSec: number;
  endSec: number;
}

export interface SourceTimestamp extends Timestamp {
  chunkId: string;
}

export interface Video {
  videoId: VideoId;
  title: string;
  durationSec: number;
  language: string;
}

export interface TranscriptSegment extends Timestamp {
  text: string;
  position: number;
}

export interface IndexRequest {
  video: Video;
  transcriptSegments: TranscriptSegment[];
}

export interface RetrieveRequest {
  query: string;
  purpose: RetrievalPurpose;
  maxResults?: number;
}

export interface RetrievedChunk extends Timestamp {
  chunkId: string;
  videoId: VideoId;
  text: string;
  score: number;
  position: number;
}

export interface RetrieveResponse {
  videoId: VideoId;
  purpose: RetrievalPurpose;
  chunks: RetrievedChunk[];
  reason?: "NO_RELEVANT_CONTEXT";
}

export interface Question {
  questionId: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  topic: string;
  sourceTimestamp: SourceTimestamp;
}

export interface UserAnswer {
  questionId: string;
  selectedAnswer: number | null;
}

export interface AssessmentRequest {
  quizId?: string;
  questions: Question[];
  userAnswers: UserAnswer[];
}

export interface QuestionResult {
  questionId: string;
  correct: boolean;
  correctAnswer: number;
  selectedAnswer: number | null;
}

export interface ReviewTimestamp extends SourceTimestamp {
  topic: string;
  reason: string;
}

export interface AssessmentResponse {
  score: number;
  correctCount: number;
  totalCount: number;
  questionResults: QuestionResult[];
  strongTopics: string[];
  weakTopics: string[];
  reviewTimestamps: ReviewTimestamp[];
}

export interface ErrorDetail {
  code: LocalServiceErrorCode;
  message: string;
  retryable: boolean;
  details: null;
}

export interface ErrorResponse {
  error: ErrorDetail;
}

export interface HealthResponse {
  status: "ready" | "not_ready";
  serviceVersion: string;
  pipelineVersion: string;
  vectorStoreReady: boolean;
  embeddingModelReady: boolean;
  error?: ErrorDetail;
}

export interface IndexResponse {
  videoId: VideoId;
  indexStatus: "ready" | "indexing";
  cached: boolean;
  chunkCount?: number;
  pipelineVersion: string;
}

export interface IndexStatusResponse {
  videoId: VideoId;
  indexStatus: IndexStatus;
  chunkCount: number;
  pipelineVersion: string;
  error?: ErrorDetail;
}

export interface DeleteResponse {
  videoId: VideoId;
  deleted: boolean;
  deletedChunkCount: number;
}
