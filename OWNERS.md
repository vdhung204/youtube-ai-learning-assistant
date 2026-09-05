# Quyền sở hữu source code

Quyền sở hữu giúp xác định người chịu trách nhiệm kỹ thuật và người phải review. Nó không ngăn thành viên hỗ trợ nhau.

## Thành viên 1 — Extension Frontend

Sở hữu:

- `extension/src/background/`
- `extension/src/content/`
- `extension/src/sidebar/`
- `extension/src/features/`
- `extension/src/integrations/`
- `extension/src/session/`
- `extension/src/types/`
- `extension/src/tests/`
- `extension/public/`

Trách nhiệm chính: React/TypeScript/Manifest V3, sidebar, YouTube Adapter, timestamp navigation, Google OAuth UI, Gemini transport và tích hợp kết quả vào giao diện.

Ranh giới: không tự thay đổi prompt, AI output schema, chunking, embedding, retrieval, ChromaDB schema hoặc learning-assessment logic.

## Thành viên 2 — Local Service & Integration

Sở hữu:

- `local-rag-service/app/core/`
- `local-rag-service/app/transport/`
- `local-rag-service/tests/service/`
- `scripts/`

Trách nhiệm chính: khung FastAPI/service localhost, lifecycle, health check, giới hạn input, xử lý lỗi giao tiếp, tích hợp các module RAG và script vận hành.

Ranh giới: không tự thay đổi chunking, embedding model, retrieval, ChromaDB collection/metadata, prompt hoặc assessment logic.

## Thành viên 3 — AI/RAG Lead

Sở hữu:

- `extension/src/ai-content/`
- `local-rag-service/app/transcript/`
- `local-rag-service/app/chunking/`
- `local-rag-service/app/embedding/`
- `local-rag-service/app/vector_store/`
- `local-rag-service/app/retrieval/`
- `local-rag-service/app/assessment/`
- `local-rag-service/tests/rag/`

Trách nhiệm chính: transcript processing, timestamp-aware chunking, embedding, ChromaDB schema/adapter, semantic retrieval, Context Builder, prompt, AI output validation, quiz/flashcard content logic, đánh giá phần học tốt/chưa tốt và đề xuất timestamp xem lại.

Mọi thay đổi embedding model, chunking strategy, collection schema, top-k, threshold, prompt hoặc assessment logic cần Thành viên 3 thực hiện hoặc phê duyệt.

## Thành viên 4 — QA/Integration & Documentation

Sở hữu:

- `tests/e2e/`
- `docs/testing/`

Trách nhiệm chính: test plan, integration/E2E, kiểm thử OAuth và bảo mật, test report, bằng chứng nghiệm thu, slide và video demo.

Thành viên 4 không sửa trực tiếp source module để làm test pass; lỗi được tạo issue và chuyển cho owner tương ứng.

## Vị trí dùng chung

Các vị trí sau cần review của các owner bị ảnh hưởng:

- `shared/contracts/`
- `docs/architecture/`
- `docs/project-management/`
- `README.md`, `CONTRIBUTING.md`, `OWNERS.md`
- Manifest, dependency file và lock file
- Interface giữa extension với Local RAG Service
- Interface giữa Local RAG Service với pipeline AI/RAG

Quy tắc review contract:

- Contract Extension <-> Local Service: Thành viên 1 + Thành viên 2 + Thành viên 3.
- Contract Gemini/AI output: Thành viên 1 + Thành viên 3 + Thành viên 4.
- Test acceptance và privacy/security: owner liên quan + Thành viên 4.
