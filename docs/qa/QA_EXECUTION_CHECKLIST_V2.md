# QA Execution Checklist V2

## A. Baseline tự động
- [ ] `npm.cmd --prefix extension test`
- [ ] `npm.cmd --prefix extension run build`
- [ ] `node --experimental-strip-types --test extension/src/ai-content/tests/content.test.ts`
- [ ] `npm.cmd --prefix gateway run check`
- [ ] `.\\local-rag-service\\.venv\\Scripts\\python.exe -m unittest discover -s local-rag-service/tests/rag`
- [ ] `.\\local-rag-service\\.venv\\Scripts\\python.exe -m unittest discover -s local-rag-service/tests/service`

Lưu output terminal và tổng số pass/fail/skip.

## B. Smoke thực tế
- [ ] Local RAG health ready.
- [ ] Gateway health OK.
- [ ] Extension build + load unpacked.
- [ ] Mở video có transcript.
- [ ] Sidebar nhận video.
- [ ] Index -> ready.
- [ ] Quiz chạy.
- [ ] Flashcard chạy.
- [ ] Ask AI chạy và có citation.

## C. Acceptance theo SDS V2
- [ ] Không xuất hiện OAuth/sign-in của sản phẩm.
- [ ] Index đúng video.
- [ ] Batch quiz đầu đến sớm.
- [ ] Batch sau không reset answer/current question.
- [ ] Quota giữ câu cũ và tuân thủ Retry-After.
- [ ] Submit khi request pending không bị late append.
- [ ] Redo không gọi AI tạo lại bộ câu.
- [ ] Đổi video không lọt response cũ.
- [ ] Flashcard theo phần + timestamp.
- [ ] Ask AI câu cụ thể + câu tổng quan; kiểm relevance citation.

## D. Security quick check
- [ ] Search bundle/repo không thấy provider secret thật.
- [ ] `.env` thật không tracked.
- [ ] Manifest không còn OAuth identity cho Gemini.
- [ ] Origin sai bị chặn.
- [ ] Log không lộ key/token/full transcript nhạy cảm.
- [ ] localStorage chỉ chứa dữ liệu học cục bộ đã công bố.

## E. Kết quả cuối
- [ ] Cập nhật cột Status trong `QA_TEST_CASES_V2.csv`.
- [ ] Mỗi FAIL có Bug ID.
- [ ] Retest bug đã fix.
- [ ] Ghi Known Limitations.
- [ ] Tổng hợp pass/fail/blocked/not run.
- [ ] Viết Test Report cuối.
