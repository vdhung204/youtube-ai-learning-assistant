# Bàn giao Thành viên 3 — AI/RAG và đánh giá học tập

Ngày hoàn thiện kỹ thuật: 10/09/2026

## Phạm vi đã hoàn thành

- Transcript processor: chuẩn hóa Unicode/khoảng trắng, lọc noise có allowlist, kiểm tra
  timestamp/thứ tự và gộp segment ngắn có giới hạn khoảng nghỉ.
- Timestamp-aware chunker: đếm token theo tokenizer thật, chia segment dài, overlap cấu hình,
  giữ thứ tự và timestamp nguồn.
- Embedding pipeline: model đa ngôn ngữ chạy local, batch, vector chuẩn hóa, khóa revision,
  từ chối input quá dài thay vì cắt âm thầm.
- ChromaDB adapter: `PersistentClient`, cosine distance, metadata đầy đủ, cô lập theo video,
  model và pipeline version; publish index theo thế hệ; cache hit/restart/delete an toàn.
- Retriever: filter `videoId`, threshold/top-k, deduplicate và Context Builder có budget.
- Prompt quiz/flashcard/feedback: version hóa, context-only, chống instruction trong transcript,
  yêu cầu evidence/chunk ID và trạng thái thiếu dữ kiện.
- Validator/mapper: kiểm tra JSON, field, đáp án, duplicate, nguồn và timestamp; response thô
  Gemini không đi thẳng vào UI.
- Assessment: chấm điểm deterministic, nhóm strong/weak topic, lấy timestamp ôn lại cho câu
  sai/bỏ trống và không lưu bài làm hoặc điểm.
- Facade cho đủ sáu Local REST API do TV2 cung cấp.
- Bộ fixture Việt/Anh, query không có đáp án, expected timestamp, benchmark Recall@k/MRR,
  unit/integration/persistence/HTTP test và test model thật.

## Kết quả xác minh

- 41/41 test AI/RAG pass; bốn test model thật được chạy bằng cờ opt-in.
- 25/25 test service TV2 pass sau khi tích hợp facade.
- 13/13 test AI-content TypeScript pass; `tsc --noEmit` pass.
- Python `compileall` pass và 99 package trong venv tương thích.
- Benchmark evaluation: Recall@5 `1.00`, MRR `0.95`, abstention accuracy `1.00`, sai số
  timestamp đầu đoạn trên hit `0.0 giây`, query trung bình `22.57 ms`.
- Model cache khoảng `499.6 MB`; RSS đỉnh lấy mẫu khoảng `1.01 GB`; load model `8.57 giây`.

Chi tiết có thể kiểm tra trong `../../tests/rag/reports/benchmark-minilm.json` và README cùng
thư mục module này.

## Contract/interface liên quan

- Factory: `app.retrieval.facade:create_facade`.
- Python interface: `app/core/rag_facade.py` do TV2 sở hữu.
- Schema xuất để review: `contracts/local-service.schema.json`.
- AI-content export: `extension/src/ai-content/index.ts`.
- Đáp án dùng chỉ số từ 0; thiếu hoặc `null` được tính sai.
- Cosine `score = 1 - distance`; giá trị cao hơn liên quan hơn, miền được chặn `[-1, 1]`.

## Cách chạy và kiểm thử

Xem `README.md` trong thư mục này và `extension/src/ai-content/README.md`. Các lệnh trong hai
tài liệu đã được chạy trong môi trường dự án hiện tại.

## Bằng chứng và giới hạn

- Fixture benchmark là nội dung giáo dục Việt/Anh do dự án tự viết và có provenance rõ ràng;
  không chứa transcript người dùng và không giả là dữ liệu YouTube thật.
- Chưa tuyên bố E2E Extension → OAuth → Gemini → Local Service: code transport/UI thuộc TV1,
  còn E2E trên video thật thuộc TV4.
- Contract trong ``shared/contracts/` chưa được tự ý thay đổi. TV1 và TV2 phải review schema
  xuất trước; TV4 review AI output/privacy và chạy E2E.
- ChromaDB V1 dùng một writer process trên cùng cache; writer thứ hai bị từ chối.

## Người cần review

- TV1: prompt request, validator/mapper và contract Gemini/UI.
- TV2: facade, dependency và DTO Local Service.
- TV4: fixture, metric, privacy và kịch bản E2E.
