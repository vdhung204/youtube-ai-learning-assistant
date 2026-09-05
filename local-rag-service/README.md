# Local RAG Service

Service Python chỉ chạy trên localhost, phục vụ xử lý transcript, embedding, ChromaDB và retrieval. Đây không phải backend lưu trữ tập trung và không quản lý tài khoản.

- Thành viên 2 sở hữu khung service, transport, health check và script vận hành.
- Thành viên 3 sở hữu toàn bộ logic AI/RAG và ChromaDB.
- OAuth token không được gửi tới service này.
- Dữ liệu ChromaDB là cache cục bộ và không được commit.

Lệnh setup/start/test sẽ chỉ được bổ sung sau khi môi trường service được khởi tạo và kiểm thử thực tế.

