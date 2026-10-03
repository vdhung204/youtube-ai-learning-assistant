# Hướng dẫn chạy YouTube AI Learning Assistant

> Tài liệu này dành cho người chưa từng tải hoặc cài Chrome Extension từ mã nguồn.

## 1. Chuẩn bị

Cần có:

- Windows và Google Chrome phiên bản 114 trở lên.
- Node.js 20 trở lên, kèm npm.
- PowerShell.
- Mã nguồn dự án đã được tải về máy.
- URL của AI Gateway đã deploy. Nếu bạn là người vận hành dự án, xem
  `gateway/README.md` để tạo gateway trước khi phát hành extension.

Người dùng cuối cài bản đã được nhóm đóng gói **không cần** Google Cloud, Google OAuth, API key
hay gửi Extension ID cá nhân. Các phần cấu hình dưới đây chỉ dành cho người build từ mã nguồn.

Nếu tải mã nguồn dưới dạng file `.zip`, hãy giải nén toàn bộ trước khi chạy. Ví dụ,
thư mục dự án sau khi giải nén là:

```text
C:\Users\<ten-cua-ban>\Desktop\youtube-ai-learning-assistant
```

## 2. Cài dependency và build extension

Mở PowerShell, chuyển đến thư mục `extension`:

```powershell
cd C:\duong-dan\toi\youtube-ai-learning-assistant\extension
Copy-Item .env.example .env.local
npm install
npm run build
```

Trước `npm run build`, mở `.env.local` và đặt URL deployment do người vận hành cung cấp:

```dotenv
VITE_YALA_GATEWAY_URL=https://your-gateway.vercel.app
```

Không đặt `GEMINI_API_KEY` trong thư mục extension. Biến có tiền tố `VITE_` được đóng vào bundle
và ai cài extension cũng có thể đọc được.

Nếu build thành công, thư mục `extension/dist` sẽ được tạo. Đây là thư mục cần
nạp vào Chrome, không phải thư mục `extension/src`.

## 3. Nạp extension vào Chrome

1. Mở Chrome và truy cập `chrome://extensions`.
2. Bật **Developer mode** ở góc trên bên phải.
3. Chọn **Load unpacked**.
4. Chọn thư mục `dist` bên trong thư mục `extension`.
5. Kiểm tra extension **YouTube AI Learning Assistant** đã xuất hiện trong danh sách.
6. Ghim extension vào thanh công cụ nếu muốn mở nhanh.

Sau khi build lại, quay về `chrome://extensions`, bấm **Reload** trên extension,
sau đó tải lại tab YouTube đang mở.

## 4. Mở extension trên video YouTube

1. Mở một video tại `https://www.youtube.com/watch?v=...`.
2. Bấm biểu tượng extension trên thanh công cụ.
3. Side Panel của Chrome sẽ mở ở cạnh phải.
4. Extension vào thẳng giao diện học; không có bước đăng nhập Google.

Extension cần được mở trên trang video YouTube, không phải trang chủ YouTube hoặc
một trang web khác.

## 5. Chạy Local RAG Service

Local RAG Service cần thiết cho xử lý transcript, retrieval, Ask AI, quiz và flashcard đầy đủ.
Service chạy trên chính máy của bạn tại `127.0.0.1:8765`. File ChromaDB vẫn ở máy; chỉ các đoạn
transcript được retrieval cho đúng tác vụ mới được extension gửi qua gateway tới Gemini.

Mở một cửa sổ PowerShell mới tại thư mục gốc dự án:

```powershell
cd C:\duong-dan\toi\youtube-ai-learning-assistant
.\scripts\setup-local-service.ps1
.\scripts\start-local-service.ps1
```

Nếu Chrome báo lỗi origin hoặc extension không kết nối được service, lấy ID của
extension tại `chrome://extensions`, rồi chạy lại service như sau:

```powershell
$env:YALA_ALLOWED_ORIGINS = "chrome-extension://<extension-id>"
.\scripts\start-local-service.ps1
```

Thay `<extension-id>` bằng ID thực tế của extension. Khi đổi biến môi trường, cần
dừng và khởi động lại service.

Để dừng service:

```powershell
.\scripts\stop-local-service.ps1
```

Có thể kiểm tra service bằng cách mở `http://127.0.0.1:8765/docs` hoặc gọi health
check trong trình duyệt. Nếu repository chưa được tích hợp RAG facade, health có thể
trả `503 SERVICE_NOT_READY`; điều này nghĩa là HTTP service đã chạy nhưng pipeline
RAG chưa sẵn sàng.

## 6. Cấu hình AI Gateway

### Nếu dùng gateway đã deploy

Chỉ cần `VITE_YALA_GATEWAY_URL` trong `extension/.env.local`, sau đó build lại:

```powershell
cd C:\duong-dan\toi\youtube-ai-learning-assistant\extension
npm run build
```

Reload extension tại `chrome://extensions` rồi refresh tab YouTube. URL production phải dùng
HTTPS; HTTP chỉ được chấp nhận với `localhost` hoặc `127.0.0.1` khi phát triển.

### Nếu tự vận hành gateway

Gateway cần Gemini API key **phía server** và allowlist origin của extension. Làm theo
`gateway/README.md` để cài dependency, tạo `gateway/.env.local`, chạy test và deploy. Với bản phát
hành Chrome Web Store, người vận hành cấu hình một origin ổn định duy nhất dạng
`chrome-extension://<production-extension-id>`; mọi người dùng đều dùng ID đó nên không cần gửi ID
theo từng máy.

Khi phát triển bằng **Load unpacked**, có thể đặt public manifest key dạng base64 vào
`VITE_YALA_EXTENSION_PUBLIC_KEY` theo `extension/.env.example` để giữ ID ổn định. Đây là public
key, không phải private signing key. Nếu không đặt key, lấy ID dev tại
`chrome://extensions` và thêm đúng origin đó vào `ALLOWED_EXTENSION_ORIGINS` của gateway. Đây là
bước của developer, không phải bước cài đặt cho người dùng cuối.

CORS chỉ kiểm tra nguồn gọi trong browser, không phải cơ chế xác thực. Trước khi phát hành rộng,
người vận hành phải bật rate limit phân tán (hoặc firewall của nền tảng), quota/cảnh báo ngân sách
Gemini và quy trình thay API key.

## 7. Xử lý lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Không thấy `dist` | Chạy `npm run build` trong thư mục `extension`. |
| Chrome không cho nạp extension | Chọn đúng thư mục `extension/dist`, không chọn `extension`. |
| Extension không cập nhật | Bấm **Reload** tại `chrome://extensions`, rồi refresh tab YouTube. |
| Side Panel không hiện | Mở một video YouTube rồi bấm lại biểu tượng extension. |
| Không tìm thấy `npm` | Cài Node.js 20 trở lên và mở lại PowerShell. |
| Báo AI Gateway chưa được cấu hình | Đặt `VITE_YALA_GATEWAY_URL`, build lại rồi reload extension. |
| Gateway trả `403` | Origin extension chưa có trong `ALLOWED_EXTENSION_ORIGINS`; sửa env gateway rồi restart/redeploy. |
| Gateway trả `429` | Đã chạm rate limit hoặc quota AI; chờ rồi thử lại, người vận hành kiểm tra dashboard. |
| Gateway trả `503` | Kiểm tra biến môi trường server, health endpoint và trạng thái provider; không đưa API key vào extension. |
| Không tìm thấy Python hoặc Python dưới 3.11 | Cài Python 3.11 trở lên rồi chạy lại script setup service. |
| Service trả `503 SERVICE_NOT_READY` | Kiểm tra cấu hình RAG facade; service khung đã chạy nhưng RAG chưa sẵn sàng. |
| Service trả lỗi origin `403` | Đặt `YALA_ALLOWED_ORIGINS` bằng `chrome-extension://<extension-id>` rồi stop/start service. |

## 8. Dừng hoặc gỡ extension

- Dừng Local RAG Service bằng `stop-local-service.ps1`.
- Tạm thời tắt extension bằng công tắc tại `chrome://extensions`.
- Xóa extension bằng nút **Remove** nếu không còn sử dụng.

Việc gỡ extension không tự xóa cache cục bộ của Local RAG Service trong
`local-rag-service/data/chroma`.
