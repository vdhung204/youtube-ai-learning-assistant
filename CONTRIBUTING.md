# Quy trình làm việc chung

Tài liệu này nhằm giảm conflict khi bốn thành viên phát triển song song.

## 1. Trước khi bắt đầu một task

1. Tạo issue/task có mô tả đầu vào, đầu ra và điều kiện hoàn thành.
2. Kiểm tra `OWNERS.md` để xác định người sở hữu thư mục.
3. Nếu task chạm file dùng chung, thông báo trên Teams và chỉ định một người trực tiếp sửa file đó.
4. Tạo branch từ phiên bản `main` mới nhất.

Quy ước branch:

```text
feat/tv1-<ten-chuc-nang>
feat/tv2-<ten-chuc-nang>
feat/tv3-<ten-chuc-nang>
test/tv4-<ten-kich-ban>
docs/<ten-tai-lieu>
fix/<ten-loi>
```

## 2. Trong khi phát triển

- Chỉ sửa file phục vụ trực tiếp cho task.
- Không format, đổi tên hoặc di chuyển hàng loạt file của module khác.
- Không commit file sinh tự động, cache, dữ liệu ChromaDB, transcript hoặc secret.
- Mỗi commit nên hoàn thành một thay đổi có nghĩa và có thể review độc lập.
- Nếu phát hiện cần đổi contract, dừng triển khai hai phía và cập nhật `shared/contracts/` trước.
- Không đưa OAuth token qua Local RAG Service hoặc ghi token vào log.

Quy ước commit gợi ý:

```text
feat(extension): add YouTube video detection
feat(rag): add timestamp-aware chunking
fix(service): handle local service unavailable
test(e2e): cover denied OAuth permission
docs(readme): update verified setup steps
```

## 3. File và thư mục dùng chung

Các vị trí sau không có quyền sửa đơn phương:

- `README.md`, `CONTRIBUTING.md`, `OWNERS.md`.
- Manifest và cấu hình build ở cấp package.
- File dependency và lock file.
- `shared/contracts/`.
- `docs/architecture/`.
- Interface giữa extension, Local RAG Service và module AI/RAG.

Nguyên tắc: một người thực hiện thay đổi; các owner bị ảnh hưởng review trước khi merge.

## 4. Pull request

Mỗi pull request phải có:

- Task/issue liên quan.
- Phạm vi file đã thay đổi.
- Cách chạy và cách kiểm thử.
- Kết quả kiểm thử hoặc bằng chứng thủ công.
- Thay đổi contract, migration cache hoặc ảnh hưởng tích hợp nếu có.
- Hạn chế/chưa xử lý.

Yêu cầu review tối thiểu:

- Thay đổi trong module riêng: owner module review.
- Thay đổi `shared/contracts/`: owner producer và consumer cùng review.
- Thay đổi AI/RAG: Thành viên 3 review.
- Thay đổi OAuth hoặc bảo mật: Thành viên 1 và Thành viên 4 review.
- Thay đổi luồng localhost/service: Thành viên 2 và bên gọi review.

## 5. Trình tự tích hợp khuyến nghị

1. Chốt contract và dữ liệu mẫu.
2. Producer và consumer phát triển bằng fixture/mock riêng.
3. Chạy unit test của từng module.
4. Tích hợp extension với Local RAG Service.
5. Chạy integration/E2E của Thành viên 4.
6. Chỉ merge khi contract, cách chạy và bằng chứng kiểm thử khớp nhau.

## 6. Xử lý conflict

- Người tạo conflict không tự chọn bỏ thay đổi của owner khác.
- Hai owner cùng xem phần xung đột và thống nhất phiên bản đúng.
- Không dùng thao tác reset/checkout làm mất code chưa merge của thành viên khác.
- Sau khi giải quyết, chạy lại test của cả hai module bị ảnh hưởng.

