# Extension

Khu vực Chrome Extension dùng React, TypeScript và Manifest V3.

- Thành viên 1 sở hữu UI, YouTube integration, OAuth và các transport adapter.
- Thành viên 3 sở hữu riêng `src/ai-content/` cho prompt, mapping và validation kết quả AI.
- Contract với Local RAG Service phải đặt trong `../shared/contracts/` trước khi triển khai hai phía.

Lệnh cài đặt, build và load unpacked sẽ chỉ được bổ sung sau khi package extension được khởi tạo và kiểm thử thực tế.

