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

## Học theo chapter

`RetrieveRequest` hỗ trợ thêm `startSec`, `endSec` (phải đi cùng nhau, khoảng
`[startSec, endSec)`) và `afterPosition` (con trỏ tùy chọn, chỉ dùng cùng khoảng).
Với `quiz`/`flashcard`, yêu cầu có khoảng thời gian trả các chunk giao với khoảng đó
theo thứ tự, không lấy mẫu hoặc lọc theo độ tương đồng. `nextPosition` trong
`RetrieveResponse` là vị trí cuối trang khi còn dữ liệu; bỏ trường này khi đã hết.
Client phải đọc hết các trang, giữ nguyên chunkId/timestamp để chấm bài. Review
vẫn dùng tìm kiếm ngữ nghĩa. Các trường mới đều tùy chọn để giữ tương thích.

`requestedCount` của AI Gateway là **số lượng tối đa mỗi lượt sinh**, không phải
số câu bắt buộc của chapter. `ok` cho phép 1..requestedCount mục có dẫn chứng;
`insufficient_context` có mảng rỗng khi không có ý kiến thức để tạo nội dung.
Quiz đọc tuần tự toàn video, mỗi batch yêu cầu tối đa 5 câu. Mỗi batch thành
công được nối vào bộ câu hỏi đang làm; ID và đáp án cũ không đổi. Con trỏ chỉ
tiến sau khi batch được kiểm tra thành công. Nộp bài đóng băng bộ câu hiện có.
Flashcard vẫn sinh theo phần học. Assessment nhận tối đa 2.000 câu và đáp án
(giới hạn body 2 MiB vẫn áp dụng), thay giới hạn 100 để hỗ trợ quiz video dài.
Retry tuân theo đầy đủ `Retry-After`, không công bố thời gian chờ cố định trên UI.

