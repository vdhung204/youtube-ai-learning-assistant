# Shared contracts

Đặt schema/DTO mẫu tại đây trước khi các thành viên triển khai song song.

Các contract dùng chung:

- Video và transcript segment.
- Index request/status/error.
- Retrieved chunk và timestamp.
- Quiz/flashcard có source timestamp.
- Quiz submission/scoring trong phiên.
- Learning assessment và review timestamps.
- AI Gateway request theo task (`questions`, `flashcards`, `answers`, `feedback`) và error envelope.

Contract Local RAG hiện được xuất từ DTO tại
`../../local-rag-service/app/retrieval/contracts/local-service.schema.json`. Contract AI Gateway
được triển khai đối xứng trong `../../gateway/src/contracts.ts` và
`../../extension/src/integrations/ai-gateway/`; tài liệu wire contract hiện hành nằm tại
`../../docs/architecture/ai-gateway.md`.

AI Gateway không nhận prompt hệ thống, tên model, output schema hoặc credential từ client.
Mọi thay đổi field phải được cập nhật đồng thời ở producer, consumer, test contract và tài liệu này.

