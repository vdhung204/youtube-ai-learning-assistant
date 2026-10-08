# QA Test Plan V2 — YouTube AI Learning Assistant

## 1. Mục tiêu
Xác minh hệ thống theo SDS V2 hoạt động đúng khi tích hợp Chrome Extension, Local RAG Service, ChromaDB, AI Gateway và Gemini; phát hiện lỗi chức năng, tích hợp, phục hồi, bảo mật và chất lượng AI trước khi release/demo.

## 2. Cơ sở kiểm thử
- SDS V2 hiện hành trong `docs/architecture/SDS_YouTube_AI_Learning_Assistant_V2.md`.
- Code/schema trên `main` hiện hành.
- Automated tests hiện có trong `extension/`, `gateway/`, `local-rag-service/tests/`.
- Các kịch bản nghiệm thu được nêu trong SDS V2.

## 3. Phạm vi kiểm thử
### 3.1 Trong phạm vi
1. Cài đặt/build extension và khởi động Local RAG Service.
2. Nhận diện video YouTube, transcript, chapter, timestamp, seek.
3. Index/cache/retrieval của Local RAG Service + ChromaDB.
4. Progressive Quiz theo batch, submit, redo, checkpoint, retry.
5. Flashcard theo phần/chapter và nguồn timestamp.
6. Ask AI, evidence/citation, insufficient context.
7. AI Gateway: origin, validation, quota/retry, lỗi provider.
8. Chuyển video, reload, đóng/mở sidebar, nhiều tab.
9. Security/privacy: secret, log, localStorage, CORS/origin.
10. Regression và smoke test end-to-end.

### 3.2 Ngoài phạm vi
- OAuth Google của sản phẩm (đã loại bỏ ở SDS V2).
- MySQL/tài khoản ứng dụng/lịch sử học tập server.
- Multi-video knowledge aggregation.
- Speech-to-text cho video không có transcript.
- Load test quy mô production nếu không có môi trường phù hợp.

## 4. Môi trường kiểm thử
- OS chính: Windows 10/11.
- Browser: Google Chrome stable; nếu có thời gian, kiểm tra thêm Chrome phiên bản khác gần nhất.
- Extension: build từ `extension/dist` của cùng commit kiểm thử.
- Local RAG Service: Python venv + model embedding theo README.
- Gateway: deployment Vercel cấu hình theo SDS V2.
- Network: bình thường + mô phỏng offline/timeout/quota khi có thể.

Ghi lại cho mỗi vòng test: commit SHA, Chrome version, Python version, Node version, gateway deployment URL/version, extension ID.

## 5. Test data
Chuẩn bị 10–15 video, gồm:
- Tiếng Việt / tiếng Anh.
- Video ngắn / dài.
- Có chapter / không chapter.
- Subtitle tác giả / auto-caption / không subtitle.
- Nội dung kỹ thuật và nội dung phổ thông.

Với mỗi video tạo bộ câu hỏi chuẩn:
- 2 câu dễ.
- 2 câu trung bình.
- 1 câu khó.
- 1 câu ngoài nội dung video.
- 1 câu yêu cầu kiểm chứng timestamp.

## 6. Nhóm kiểm thử
- SMK: Smoke / Installation.
- YT: YouTube / Transcript / Timestamp.
- RAG: Index / Retrieval / Cache.
- QUIZ: Progressive Quiz.
- FC: Flashcard.
- ASK: Ask AI / citation / grounding.
- ERR: Error / Recovery / Quota.
- SEC: Security / Privacy.
- REG: Regression / Cross-video / Multi-tab.
- PERF: Latency / basic performance observation.

## 7. Mức độ lỗi
- Critical: không cài/chạy được sản phẩm, crash toàn hệ thống, lộ secret/API key.
- High: sai dữ liệu nghiêm trọng, trộn dữ liệu giữa video, Ask AI/Quiz không grounded, submit sai kết quả.
- Medium: một chức năng phụ hỏng, retry/cache/UI state sai nhưng có workaround.
- Low: lỗi hiển thị nhỏ, wording/layout không ảnh hưởng luồng chính.

## 8. Tiêu chí Pass/Fail
- PASS: actual result khớp expected result, không có lỗi chức năng đáng kể.
- FAIL: khác expected result hoặc gây rủi ro dữ liệu/state/security.
- BLOCKED: không thể chạy vì phụ thuộc/môi trường/quota.
- NOT RUN: chưa thực hiện.

## 9. Release criteria
- 100% luồng MVP có test case.
- Không còn Critical/High mở trước release/demo.
- Medium còn lại phải ghi Known Limitations và có workaround/risk note.
- Toàn bộ automated test chính pass; test skip phải được liệt kê, không tính là pass.
- Không có provider secret/token trong extension bundle, repository hoặc log công khai.
- 10 kịch bản acceptance trong SDS V2 phải được chạy thực tế ít nhất một lần.

## 10. Bằng chứng cần lưu
Mỗi test manual quan trọng lưu ít nhất một trong các dạng:
- Screenshot.
- Screen recording ngắn.
- Console/network log đã loại dữ liệu nhạy cảm.
- Output terminal/test runner.

Đặt tên gợi ý: `evidence/<TEST-ID>/...`.

## 11. Bug report template
- Bug ID / Title
- Severity / Priority
- Environment / Commit SHA
- Preconditions
- Steps to reproduce
- Expected result
- Actual result
- Evidence
- Suspected component
- Assignee
- Status
- Retest result

## 12. Quy trình thực hiện
1. Chạy automated baseline.
2. Chạy smoke + installation.
3. Chạy nhóm YouTube/RAG.
4. Chạy Quiz/Flashcard/Ask AI.
5. Chạy Error/Recovery/Security.
6. Chạy regression sau fix.
7. Tổng hợp metrics và Test Report.
