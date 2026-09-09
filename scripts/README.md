# Scripts

Thành viên 2 sở hữu các script vận hành Local RAG Service trên Windows.
Chạy những lệnh dưới đây từ thư mục gốc repository bằng PowerShell, Python 3.11+.

```powershell
.\scripts\setup-local-service.ps1
.\scripts\start-local-service.ps1
.\scripts\stop-local-service.ps1
.\scripts\clear-local-data.ps1 -WhatIf
```

- `setup-local-service.ps1`: tạo `.venv` riêng, cài dependency đã pin; chạy lại được.
- `start-local-service.ps1`: chạy process nền ẩn cửa sổ, working directory đúng,
  chờ đến khi HTTP listener mở. Báo đã listen không có nghĩa RAG đã ready.
- `stop-local-service.ps1`: gửi yêu cầu dừng cho đúng mã instance do script tạo;
  chờ Uvicorn kết thúc và chạy lifespan shutdown. Không kill process theo tên/PID.
- `clear-local-data.ps1`: hiển thị đường dẫn `<YALA_DATA_DIR>/chroma`; `-WhatIf` chỉ
  xem trước. Bỏ `-WhatIf` sẽ hỏi xác nhận trước khi xóa. Từ chối khi service giữ lock,
  khi đích nằm ngoài project data hoặc có symlink/junction. Chỉ xóa cache ChromaDB,
  giữ runtime và các thư mục khác. Không chạy helper `local_service.py clear` trực tiếp.

Các wrapper dùng Python trong `.venv`, không cần activate môi trường. Không thay đổi
ExecutionPolicy toàn hệ thống, không cài package vào Python toàn máy.

`local_service.py` là helper nội bộ: lock Windows khóa một byte để chỉ một service/
tác vụ bảo trì hoạt động, metadata nằm trong `local-rag-service/data/runtime` đã
được gitignore. Lock được hệ điều hành nhả khi process chết; metadata PID cũ không
được dùng để kill process. Cổng đang do ứng dụng khác sử dụng không bị chiếm cưỡng bức.

## Lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Không tìm thấy Python hoặc version < 3.11 | Cài Python 3.11+ rồi chạy setup lại; tham số `-Python` nhận đường dẫn Python |
| Pip không tải được package | Kiểm tra mạng/proxy/quyền mạng, chạy setup lại |
| PowerShell chặn script | Dùng cơ chế cấp quyền script theo chính sách máy; script không tự sửa chính sách |
| Start thất bại | Kiểm tra YALA_* hợp lệ, port chưa bị chiếm, service chưa chạy; không tự kill ứng dụng khác |
| Health 503 SERVICE_NOT_READY | Cấu hình factory TV3 và chờ model/vector store sẵn sàng; repo skeleton chưa có factory |
| Origin 403 | Đặt YALA_ALLOWED_ORIGINS bằng origin có ID extension thật rồi stop/start lại |
| Clear bị từ chối | Stop service, kiểm tra đường dẫn và loại symlink/junction khỏi data |
| Stop timeout | Adapter TV3 chưa hoàn thành/cancel công việc; kiểm tra shutdown adapter, không xóa cache đang dùng |

Chỉ quản lý instance khởi chạy bằng các script này. Nếu chạy entry point Python
trực tiếp để debug, cần tự dừng process debug trước khi xóa cache.

Setup/start/stop và clear `-WhatIf` đã chạy trên Windows ngày 09/09/2026.
Xóa thật chỉ được kiểm thử với cache tổng hợp trong thư mục test tạm của dự án.
Xem [hướng dẫn service](../local-rag-service/README.md) để chạy bộ test và cấu hình facade.

