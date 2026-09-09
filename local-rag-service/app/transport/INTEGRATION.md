# TV2 — Bản bàn giao tích hợp để review

## Phạm vi và tình trạng

Thực hiện mục 5 trong `docs/project-management/phan_cong_chi_tiet.txt` trên nhánh
`feat/tv2-service-skeleton`. Nhánh đã đối chiếu với `origin/main` ngày 09/09/2026.
Không có thay đổi trong source TV1/TV3/TV4 hoặc `shared/contracts/`.

Đây là bản service chạy/test độc lập để review. Schema dùng chung và dependency
chưa được nhóm phê duyệt. Không được ghi nhận hoàn thành tích hợp RAG hoặc E2E.

## Các endpoint

| Method/path (sau `/api/v1`) | Input | Output |
|---|---|---|
| GET `/health` | không body | 200 ready hoặc 503 not_ready kèm SERVICE_NOT_READY |
| POST `/videos/{videoId}/index` | video, transcriptSegments | 200 cached/ready/chunkCount hoặc 202 indexing |
| GET `/videos/{videoId}/index-status` | không body | not_indexed/indexing/ready/failed |
| POST `/videos/{videoId}/retrieve` | query, purpose, maxResults? | videoId, purpose, chunks; rỗng có NO_RELEVANT_CONTEXT |
| POST `/videos/{videoId}/assessments/quiz` | questions, userAnswers, quizId? | score, counts, questionResults, topics, reviewTimestamps |
| DELETE `/videos/{videoId}/cache` | không body | videoId, deleted, deletedChunkCount |

Request/response dùng camelCase. Schema chi tiết được sinh từ `models.py` qua
`/openapi.json`, giúp reviewer đối chiếu trực tiếp với route đang chạy.
Validation trả HTTP 400 và ErrorResponse; OpenAPI loại response 422 mặc định của FastAPI.

## Những quyết định dự thảo cần TV1 + TV3 chốt

- `videoId` là 11 ký tự `[A-Za-z0-9_-]`; duration phải dương và hữu hạn.
- Transcript phải có text không rỗng; timestamp không âm, end >= start, không vượt
  duration; position tăng nghiêm ngặt, startSec không giảm. Cho phép segment overlap.
- Quiz gửi `questions[]`, mỗi câu có `questionId`, `question`, `options: string[]`,
  `correctAnswer`, `explanation`, `topic`, `sourceTimestamp`.
- `correctAnswer` và `userAnswers[].selectedAnswer` dùng **chỉ số đáp án từ 0**.
  Không trả lời được biểu diễn bằng thiếu phần tử userAnswers hoặc selectedAnswer=null.
  Mỗi userAnswer tham chiếu một questionId có thật, không được trùng.
- `sourceTimestamp` gồm startSec, endSec, chunkId. QuestionResult gồm questionId,
  correct, correctAnswer, selectedAnswer. Score theo thang 0–100; strongTopics và
  weakTopics là mảng tên chủ đề. Những cấu trúc này chưa được tài liệu định nghĩa đầy đủ.
- RetrievedChunk có videoId như mục contract chung, ngoài các trường ở mục retrieve.
  Transport kiểm tra videoId của mọi chunk khớp URL trước khi trả cho extension.
- `maxResults` vượt trần bị từ chối bằng INVALID_REQUEST. Khi bỏ trống, facade dùng
  chính sách retrieval của TV3 và phải đảm bảo output không quá trần transport.
- Mã lỗi bổ sung ngoài bản phân công: ORIGIN_NOT_ALLOWED (403),
  CREDENTIALS_NOT_ALLOWED (400), REQUEST_TIMEOUT (504), NOT_FOUND (404),
  METHOD_NOT_ALLOWED (405), INTERNAL_ERROR (500). Mã/message cố định ở `core/errors.py`.
- Health chưa ready giữ đủ 5 trường trạng thái và thêm `error` theo envelope chung.
- Origin allowlist mặc định rỗng; công cụ không gửi Origin vẫn được gọi localhost.
  Swagger tại `/docs` được gửi request cùng chính xác host/port của service;
  origin localhost khác port vẫn bị từ chối.
- Dependency được pin tại `scripts/requirements-local-service.txt` để review và tái lập.

Sau khi nhóm chốt, cập nhật `shared/contracts/` trước và đối chiếu lại DTO/producer/
consumer trong các PR liên quan. Không coi tài liệu này thay thế quy trình review đó.

## Giao diện cho TV3

`app/core/rag_facade.py` định nghĩa `RagFacade` và `Readiness`.
Factory được chỉ định qua `YALA_RAG_FACTORY=python.module:factory`. Factory không
nhận tham số và trả một object có các phương thức async:

| Phương thức | Trách nhiệm TV3 |
|---|---|
| startup(cache_dir: Path) | mở model và PersistentClient trong đúng cache_dir |
| shutdown() | kết thúc/flush/cancel tác vụ của module, đóng tài nguyên; giữ cache hợp lệ |
| readiness() -> Readiness | báo pipeline_version và trạng thái model/vector store |
| index(video_id, payload) -> dict | điều phối normalize/chunk/embed/index; xử lý cache và tác vụ nền |
| index_status(video_id) -> dict | đọc trạng thái đúng video, kể cả sau restart |
| retrieve(video_id, payload) -> dict | truy vấn có filter videoId và trả context |
| assess_quiz(video_id, payload) -> dict | scoring/topic/review timestamp; dữ liệu phiên không ghi lâu dài |
| delete_cache(video_id) -> dict | xóa đúng record của video; gọi lại vẫn an toàn |

Payload là dict đã validate bằng DTO. Kết quả dict phải theo DTO response. Facade
có thể raise `ServiceError("INDEX_NOT_FOUND")` hoặc mã trong `core/errors.py`.
Lỗi ngoài allowlist được đổi thành mã lỗi của endpoint; không trả exception text.

Facade phải nhường event loop và truyền tiếp `asyncio.CancelledError`. Transport
cancel coroutine khi timeout hoặc client disconnect. Công việc CPU/I/O đồng bộ cần
adapter quản lý worker/executor phù hợp; cancel coroutine không bảo đảm dừng một
thread đã chạy. Timeout không rollback cache; TV3 chịu trách nhiệm transaction,
idempotency và lifecycle của job index nền đã nhận qua response 202.

`tests/service/fakes.py` chỉ là fixture tổng hợp trong RAM để test adapter.
Fixture không chunk/embed/search/chấm quiz thật và không dùng trong production.

## Bằng chứng và giới hạn để ghi PR

- Cách chạy/test và kết quả: `local-rag-service/README.md`.
- Tự động: 25 test pass với facade fixture (gồm Swagger cùng origin); pip check pass.
- Thực tế: setup venv, script start/stop, health 503, origin 403, OpenAPI 6 path.
- Chưa có: shared contract được duyệt, factory TV3 thật, cache ChromaDB qua restart,
  luồng Chrome Extension/OAuth/Gemini và review từ thành viên khác.
- Reviewer cần có: TV1 (HTTP/DTO), TV3 (facade/DTO/dependency), TV4 (privacy/acceptance).

Thiết kế lifecycle tham khảo [FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/);
validation strict theo [Pydantic strict mode](https://docs.pydantic.dev/latest/concepts/strict_mode/).
