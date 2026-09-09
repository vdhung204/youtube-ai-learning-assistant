# Local RAG Service

Service Python chỉ chạy trên localhost, phục vụ xử lý transcript, embedding, ChromaDB và retrieval. Đây không phải backend lưu trữ tập trung và không quản lý tài khoản.

- Thành viên 2 sở hữu khung service, transport, health check và script vận hành.
- Thành viên 3 sở hữu toàn bộ logic AI/RAG và ChromaDB.
- OAuth token không được gửi tới service này.
- Dữ liệu ChromaDB là cache cục bộ và không được commit.

## Trạng thái bàn giao TV2

Đã triển khai khung FastAPI, lifecycle, 6 endpoint V1, DTO kiểm tra input/output,
giới hạn request, origin allowlist, timeout/hủy tác vụ và script Windows.
Code nằm trong `app/core/`, `app/transport/`, `tests/service/` và `../scripts/`.

**Chưa tích hợp RAG thật:** các thư mục TV3 hiện chỉ có `.gitkeep`. Khi chưa cấu hình
facade, service vẫn mở cổng nhưng health trả **503 `SERVICE_NOT_READY`**. Đây là trạng
thái đúng; không có mock tự động báo ready trong bản chạy thật.

`shared/contracts/` hiện chưa có schema đã duyệt. DTO/interface trong thay đổi này
là **bản triển khai dự thảo để TV1 + TV3 review**, dựa trên mục 5.3 bản phân công.
Chưa được coi là contract dùng chung đã chốt. Các điểm cần quyết định cụ thể nằm
trong [bản bàn giao](app/transport/INTEGRATION.md).

## Setup và chạy trên Windows

Yêu cầu Python 3.11+ và PowerShell. Chạy tại thư mục gốc repository:

```powershell
.\scripts\setup-local-service.ps1
.\scripts\start-local-service.ps1
```

Setup tạo `local-rag-service/.venv`, cài các phiên bản trong
`scripts/requirements-local-service.txt`. Không cần activate venv, không cần API key,
Google OAuth, ChromaDB hay tải model để kiểm thử riêng phần TV2.

Base URL: `http://127.0.0.1:8765/api/v1`. Xem schema dự thảo tại
`http://127.0.0.1:8765/openapi.json` khi service đang chạy.

### Thử API bằng Swagger UI

Mở **http://127.0.0.1:8765/docs**. Nếu service đã chạy trước khi bật docs, chạy
`stop-local-service.ps1` rồi `start-local-service.ps1` để nạp code mới.

1. Mở `GET /api/v1/health` → **Try it out** → **Execute**.
   Xem mã HTTP và JSON ở **Server response**. Hiện chưa có RAG thật nên nhận 503
   với `SERVICE_NOT_READY`; kết quả này xác nhận HTTP service đang chạy.
2. Mở `POST /api/v1/videos/{videoId}/index` → **Try it out**.
   Điền `videoId` là `dQw4w9WgXcQ`, thay Request body bằng JSON sau rồi **Execute**:

```json
{
  "video": {
    "videoId": "dQw4w9WgXcQ",
    "title": "Video kiểm thử",
    "durationSec": 60,
    "language": "vi"
  },
  "transcriptSegments": [
    {"text": "Nội dung kiểm thử.", "startSec": 0, "endSec": 10, "position": 0}
  ]
}
```

Body hợp lệ hiện nhận 503 do chưa có facade. Đổi `endSec` thành `-1` hoặc
`transcriptSegments` thành `[]` để kiểm tra 400 `TRANSCRIPT_INVALID`.
Đổi riêng `video.videoId` thành `9bZkp7q19f0` để kiểm tra 400 `VIDEO_ID_MISMATCH`.
Khi TV3 cung cấp RAG thật, body hợp lệ mới có thể trả 202 indexing hoặc 200 cache hit.

Swagger cùng host/port với service được gọi POST/DELETE; không cần thêm localhost
vào `YALA_ALLOWED_ORIGINS`. Trang web khác port vẫn bị từ chối. Không cần Authorize
hay token. Swagger UI tải JavaScript/CSS từ CDN mặc định của FastAPI, nên trình
duyệt cần truy cập Internet để hiển thị trang.

```powershell
.\scripts\stop-local-service.ps1
.\scripts\clear-local-data.ps1 -WhatIf
```

`-WhatIf` chỉ hiển thị đích xóa. Bỏ `-WhatIf` để xóa cache sau khi xác nhận;
phải dừng service trước. Chi tiết và xử lý lỗi: [scripts/README.md](../scripts/README.md).

## Cấu hình

Các biến môi trường được đọc khi start; thay đổi cần stop/start lại. Không tự đọc `.env`.

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `YALA_HOST` | `127.0.0.1` | Chỉ chấp nhận địa chỉ này |
| `YALA_PORT` | `8765` | Port 1–65535 |
| `YALA_DATA_DIR` | đường dẫn tuyệt đối `local-rag-service/data` | Chỉ nhận thư mục trong data của dự án |
| `YALA_ALLOWED_ORIGINS` | rỗng | Danh sách `chrome-extension://<extension-id>` phân cách bằng dấu phẩy |
| `YALA_MAX_BODY_BYTES` | `2097152` | Giới hạn thực tế 2 MiB, kể cả request streaming không có Content-Length |
| `YALA_REQUEST_TIMEOUT_SEC` | `30` | Giới hạn đọc body và mỗi lời gọi facade |
| `YALA_LIFECYCLE_TIMEOUT_SEC` | `120` | Giới hạn startup/shutdown dependency |
| `YALA_MAX_RESULTS_LIMIT` | `20` | Trần transport; không quyết định top-k/threshold RAG |
| `YALA_RAG_FACTORY` | rỗng | `python.module:factory`, hàm không tham số trả facade của TV3 |

TV1 lấy extension ID thật từ `chrome://extensions`, rồi cấu hình origin tương ứng
trong phiên PowerShell trước khi start. Không dùng `*`, origin `null` hoặc origin trang
YouTube. Extension phải gọi từ background/side panel bằng `Content-Type: application/json`.
Request không có Origin được phép cho công cụ localhost; Origin không phải cơ chế
xác thực các tiến trình khác trên máy. Host chỉ nhận `127.0.0.1` hoặc `localhost`.

Không endpoint nào cần hoặc chấp nhận header Authorization, Cookie, X-API-Key;
query string và field ngoài DTO bị từ chối. Không ghi body, câu trả lời, token,
exception text hay traceback vào log do service quản lý. Adapter TV3 phải tuân thủ
cùng quy tắc với logger của thư viện do adapter cấu hình.

Cache được truyền cho facade tại `<YALA_DATA_DIR>/chroma`. Process-control chỉ ghi
PID, mã instance và port tại `data/runtime`; không lưu dữ liệu học tập. Service không
tự xóa hay thay đổi schema cache trong startup/shutdown.

## Kiểm thử đã chạy

Tại thư mục gốc repository:

```powershell
.\local-rag-service\.venv\Scripts\python.exe -m unittest discover -s local-rag-service/tests/service -v
.\local-rag-service\.venv\Scripts\python.exe -m pip check
```

Kết quả ngày 09/09/2026, Windows, Python 3.11.6:

- **25 test pass**: Swagger cùng origin, health/lifecycle, index 200/202, các trạng thái index, validation,
  payload streaming, CORS/origin, credential rejection, mapping lỗi an toàn,
  retrieval khác video, assessment adapter, cache delete, timeout và client disconnect.
- Test vận hành: xóa cache fixture đúng thư mục, giữ file bên cạnh, từ chối xóa khi
  giữ lock, từ chối đường dẫn ngoài data, không kill process theo PID cũ.
- Test restart giữ nguyên một file cache tổng hợp. **Chưa chứng minh khả năng mở lại
  ChromaDB thật**, vì chưa có adapter TV3.
- Setup vào venv mới thành công; `pip check`: `No broken requirements found`.
- Start bằng script thật, HTTP health trả 503 đúng mã khi chưa có facade; OpenAPI có
  6 path; origin ngoài allowlist trả 403; stop sạch và gọi stop lần hai an toàn.
- `clear-local-data.ps1 -WhatIf` hiển thị đúng `local-rag-service/data/chroma`.

Starlette 1.6.0 phát cảnh báo deprecation khi TestClient dùng httpx; bộ test vẫn pass.
Đây là dependency kiểm thử, không ảnh hưởng HTTP server đang chạy.

## Việc còn cần phối hợp

1. TV1 + TV3 review DTO, mã lỗi bổ sung, cấu hình giới hạn, dependency và facade;
   đưa contract đã duyệt vào `shared/contracts/` rồi mới dùng chung hai phía.
2. TV3 cung cấp factory/adapter theo interface; TV2 cấu hình và chạy lại integration
   với embedding + ChromaDB thật, nhất là cache hit/restart và hai video độc lập.
3. TV1 nối client 6 endpoint, TV4 chạy E2E extension → RAG → Gemini → assessment.
4. Có review của thành viên liên quan trước khi merge theo `CONTRIBUTING.md`.

