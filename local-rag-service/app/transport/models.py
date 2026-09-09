"""TV2 draft DTOs from assignment section 5.3; pending shared contract review."""
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

VideoId = Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{11}$")]
Text = Annotated[str, Field(min_length=1, max_length=10000)]
Seconds = Annotated[float, Field(ge=0, allow_inf_nan=False)]
Count = Annotated[int, Field(ge=0)]
Purpose = Literal["quiz", "flashcard", "review"]


class DTO(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True, allow_inf_nan=False)


class Timestamp(DTO):
    startSec: Seconds
    endSec: Seconds

    @model_validator(mode="after")
    def ordered(self):
        if self.endSec < self.startSec:
            raise ValueError("Invalid timestamp order")
        return self


class Video(DTO):
    videoId: VideoId
    title: Annotated[str, Field(min_length=1, max_length=500)]
    durationSec: Annotated[float, Field(gt=0)]
    language: Annotated[str, Field(min_length=1, max_length=35)]


class Segment(Timestamp):
    text: Text
    position: Count


class IndexRequest(DTO):
    video: Video
    transcriptSegments: Annotated[list[Segment], Field(min_length=1, max_length=20000)]

    @model_validator(mode="after")
    def validate_transcript(self):
        previous_position, previous_start = -1, -1.0
        for segment in self.transcriptSegments:
            if (segment.endSec > self.video.durationSec or segment.position <= previous_position
                    or segment.startSec < previous_start):
                raise ValueError("Invalid transcript sequence")
            previous_position, previous_start = segment.position, segment.startSec
        return self


class RetrieveRequest(DTO):
    query: Annotated[str, Field(min_length=1, max_length=2000)]
    purpose: Purpose
    maxResults: Annotated[int, Field(ge=1)] | None = None


class SourceTimestamp(Timestamp):
    chunkId: Text


class Question(DTO):
    questionId: Text
    question: Text
    options: Annotated[list[Text], Field(min_length=2, max_length=10)]
    correctAnswer: Count  # Draft: zero-based option index.
    explanation: Text
    topic: Text
    sourceTimestamp: SourceTimestamp

    @model_validator(mode="after")
    def valid_answer(self):
        if self.correctAnswer >= len(self.options) or len(set(self.options)) != len(self.options):
            raise ValueError("Invalid options/answer")
        return self


class UserAnswer(DTO):
    questionId: Text
    selectedAnswer: Count | None = None


class AssessmentRequest(DTO):
    quizId: Text | None = None
    questions: Annotated[list[Question], Field(min_length=1, max_length=100)]
    userAnswers: Annotated[list[UserAnswer], Field(max_length=100)]

    @model_validator(mode="after")
    def valid_answers(self):
        questions = {q.questionId: q for q in self.questions}
        if len(questions) != len(self.questions):
            raise ValueError("Duplicate question")
        seen = set()
        for answer in self.userAnswers:
            if answer.questionId not in questions or answer.questionId in seen:
                raise ValueError("Invalid question reference")
            if answer.selectedAnswer is not None and answer.selectedAnswer >= len(questions[answer.questionId].options):
                raise ValueError("Invalid selected answer")
            seen.add(answer.questionId)
        return self


class ErrorDetail(DTO):
    code: str
    message: str
    retryable: bool
    details: None = None


class ErrorResponse(DTO):
    error: ErrorDetail


class HealthResponse(DTO):
    status: Literal["ready", "not_ready"]
    serviceVersion: str
    pipelineVersion: str
    vectorStoreReady: bool
    embeddingModelReady: bool
    error: ErrorDetail | None = None


class IndexResponse(DTO):
    videoId: VideoId
    indexStatus: Literal["ready", "indexing"]
    cached: bool
    chunkCount: Count | None = None
    pipelineVersion: Text

    @model_validator(mode="after")
    def coherent(self):
        if self.cached != (self.indexStatus == "ready") or (self.cached and self.chunkCount is None):
            raise ValueError("Invalid index response")
        return self


class IndexStatusResponse(DTO):
    videoId: VideoId
    indexStatus: Literal["not_indexed", "indexing", "ready", "failed"]
    chunkCount: Count
    pipelineVersion: Text
    error: ErrorDetail | None = None


class RetrievedChunk(Timestamp):
    chunkId: Text
    videoId: VideoId
    text: Text
    score: float  # Score scale is owned by TV3.
    position: Count


class RetrieveResponse(DTO):
    videoId: VideoId
    purpose: Purpose
    chunks: list[RetrievedChunk]
    reason: Literal["NO_RELEVANT_CONTEXT"] | None = None


class QuestionResult(DTO):
    questionId: Text
    correct: bool
    correctAnswer: Count
    selectedAnswer: Count | None


class ReviewTimestamp(SourceTimestamp):
    topic: Text
    reason: Text


class AssessmentResponse(DTO):
    score: Annotated[float, Field(ge=0, le=100)]
    correctCount: Count
    totalCount: Count
    questionResults: list[QuestionResult]
    strongTopics: list[Text]
    weakTopics: list[Text]
    reviewTimestamps: list[ReviewTimestamp]


class DeleteResponse(DTO):
    videoId: VideoId
    deleted: bool
    deletedChunkCount: Count
