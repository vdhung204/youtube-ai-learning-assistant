# Kiến trúc AI Gateway

Trạng thái: **hiện hành**. Tài liệu này thay thế luồng Chrome Identity/Google OAuth và việc
extension gọi thẳng Gemini được mô tả trong các bản SDS/kế hoạch cũ.

Đặc tả toàn hệ thống và bảng đối chiếu với SDS V1 nằm tại
[SDS phiên bản 2](SDS_YouTube_AI_Learning_Assistant_V2.md).

## 1. Quyết định kiến trúc

Extension gọi một API trung gian chạy bằng Vercel Functions. Chỉ gateway biết Gemini API key;
người dùng cài extension không cần đăng nhập Google, tạo Google Cloud OAuth Client hay gửi
Extension ID cho nhóm phát triển.

```text
YouTube page
    │ video metadata + transcript
    v
Chrome Extension ───── localhost ────> Local RAG Service ──> ChromaDB cục bộ
    │                                      │
    │ task + RAG context                    │ retrieved chunks + timestamps
    v                                      │
AI Gateway (Vercel) <──────────────────────┘
    │ server-owned prompt/schema + API key
    v
Gemini API
    │ structured JSON
    v
Gateway validation ──> Extension validation/mapping ──> Quiz / Flashcard / Ask AI
```

Gateway là proxy AI không trạng thái, không phải backend tài khoản hay nơi lưu lịch sử học tập.
Local RAG Service vẫn chạy trên máy người dùng và không biết Gemini API key.

## 2. Ranh giới tin cậy

| Thành phần | Được giữ hoặc xử lý | Không được giữ hoặc chấp nhận |
|---|---|---|
| Extension | Video hiện tại, transcript, kết quả retrieval, cache quiz/flashcard cục bộ | Gemini API key, Google OAuth token, tùy chọn model bí mật |
| Local RAG Service | Chunk, embedding, timestamp và ChromaDB cục bộ | Gemini API key, OAuth token, cookie trình duyệt |
| AI Gateway | Biến môi trường chứa key, policy model, prompt/schema chuẩn, request trong thời gian xử lý | Secret do client gửi, prompt hệ thống tùy ý, schema/model tùy ý, lịch sử học tập lâu dài |
| Gemini API | Nội dung request cần thiết để sinh kết quả | Dữ liệu ngoài request do ứng dụng tự bổ sung |

Transcript là dữ liệu không tin cậy: nội dung trong transcript không được xem là instruction.
Gateway dựng lại prompt và output schema theo loại tác vụ do server hỗ trợ; client không được gửi
`systemInstruction`, schema tùy ý, tên model hoặc generation policy để chuyển tiếp nguyên trạng.

## 3. Luồng một yêu cầu sinh nội dung

Quiz là một bộ câu hỏi chung cho toàn video. Extension đọc tuần tự các trang
transcript (tối đa 6 chunk, vẫn chịu ngân sách context), yêu cầu tối đa 5 câu mỗi
lần gọi AI và nối ngay kết quả đã kiểm tra vào bộ đang làm. AI được trả ít hơn
5 câu hoặc mảng rỗng nếu đoạn không có đủ ý kiến thức. Chỉ có một request tạo
quiz đang chạy; thành công thì đọc trang tiếp theo. Câu trùng văn bản được bỏ.
ID câu, đáp án và câu đang xem giữ nguyên khi thêm batch hoặc chuyển tab UI.
Cache cục bộ lưu các batch thành công cùng con trỏ, không dùng lại cache chapter cũ.
Nộp bài hủy sinh tiếp và đóng băng bộ câu hiện có; làm lại dùng chính bộ đã chốt.

429/503 và lỗi mạng tạm thời được thử lại tối đa hai lần mỗi batch. Client giữ
nguyên `Retry-After`; nếu không có header thì backoff tăng dần. Khi cần chờ hơn
5 phút hoặc hết số lần thử, tạm dừng để người dùng tiếp tục sau, giữ nguyên dữ
liệu. UI không đếm ngược hoặc hứa thời gian hoàn thành. Nút tiếp tục cũng không
được bỏ qua thời điểm `Retry-After`. Assessment hỗ trợ tối đa 2.000 câu; giới hạn
body 2 MiB vẫn áp dụng. Nếu đạt giới hạn câu, UI dừng rõ ràng thay vì bỏ âm thầm.

Flashcard vẫn học theo chapter/phần khoảng 5 phút hoặc 8.000 ký tự tại biên
phụ đề, tối đa 10 thẻ mỗi request, cache riêng theo video/phần.

1. Extension lấy transcript từ tab YouTube và gửi transcript cho Local RAG Service qua localhost.
2. Local service trả các chunk liên quan cùng `chunkId`, score và timestamp.
3. Extension gửi loại tác vụ cùng dữ liệu đầu vào đã giới hạn tới `POST /api/generate`.
4. Gateway kiểm tra origin, method, content type, kích thước body và schema runtime.
5. Gateway chọn prompt, response schema, model và giới hạn output phía server rồi gọi Gemini.
6. Gateway parse và kiểm tra structured output. Lỗi tạm thời hoặc JSON không hợp lệ chỉ được retry
   trong giới hạn đã cấu hình.
7. Extension kiểm tra grounding lần nữa, ánh xạ `sourceChunkId` về timestamp gốc và chỉ sau đó
   hiển thị kết quả.

`GET /api/health` chỉ dùng để kiểm tra deployment/configuration; endpoint này không gọi Gemini và
không tiết lộ API key.

## 4. Hợp đồng và lỗi

Các loại tác vụ hiện hành là `questions`, `flashcards`, `answers` và `feedback`. Request chỉ chứa
dữ liệu nghiệp vụ cần thiết: `task`, `language`, `requestedCount`, `context`, `question` hoặc
`assessment` khi tác vụ tương ứng cần chúng. Gateway không nhận `promptVersion`, system prompt,
output schema hay tên model từ client. Response thành công bọc structured result đã được gateway
kiểm tra; extension vẫn phải kiểm tra contract AI trước khi dùng.

Gateway trả lỗi JSON ổn định với mã máy đọc được. Nhóm lỗi chính:

- request/configuration không hợp lệ;
- origin hoặc method không được phép;
- payload quá lớn hoặc vượt rate limit;
- provider timeout/network/quota;
- provider trả JSON hoặc structured output không hợp lệ.

Không trả raw provider response, stack trace hay secret cho client. Gateway client của extension
không tự retry ở tầng HTTP trong luồng học. Riêng scheduler quiz có thể thử lại batch lỗi theo
chính sách ở mục 3. Gateway retry provider trong từng request theo `GEMINI_MAX_RETRIES`, và trả
sớm nếu `Retry-After` không vừa deadline function. Hai tầng này cần được tính cùng khi đánh giá quota.

Giới hạn server hiện hành:

| Giới hạn | Giá trị |
|---|---:|
| JSON request body | 64 KiB |
| Tổng text của transcript chunks | 20.000 byte UTF-8 |
| Số chunk | 1–12 |
| Quiz/flashcard trong một batch | 1–10 |
| Câu hỏi Ask AI | 2.000 ký tự |
| Provider response | 512 KiB |

Ngân sách output do gateway chọn theo task: `questions` là
`max(3072, requestedCount * 512 + 512)`, `flashcards` là
`max(2048, requestedCount * 320 + 512)`, `answers` là 3.072 token và `feedback` là 2.048 token.
Đây là trần request, không bảo đảm model luôn trả đủ nội dung và không làm tăng context/output
limit vốn có của model. Provider adapter hiện dùng Gemini Interactions API; chi tiết wire request
nằm trong `gateway/src/gemini.ts`, không thuộc contract mà extension được tùy ý cung cấp.

## 5. Bảo mật và chống lạm dụng

- Chỉ cấu hình Gemini API key trong biến môi trường của deployment; không dùng tiền tố `VITE_` cho
  biến này và không commit `.env`.
- CORS/origin allowlist giảm gọi nhầm từ browser nhưng **không phải cơ chế xác thực**. Một endpoint
  công khai vẫn có thể bị gọi ngoài trình duyệt.
- Production phải bật rate limiting theo IP hoặc lớp firewall của nền tảng, đặt quota
  và cảnh báo chi phí tại provider. Nếu dùng rate limit tùy chọn trong code, cấu hình store chia sẻ;
  bộ nhớ của một serverless instance không phải giới hạn toàn cục đáng tin cậy.
- Giới hạn kích thước body, số chunk, độ dài text, số item và timeout ở gateway; không tin giới hạn
  từ UI.
- Không log request body, transcript, câu hỏi/câu trả lời, header authorization hay provider body.
  Log vận hành chỉ nên có request ID, task, latency, status và mã lỗi đã làm sạch.
- Tất cả lưu lượng cloud dùng HTTPS. Request tới Local RAG Service tiếp tục dùng
  `credentials: "omit"` và không mang credential của gateway.

Vì không còn tài khoản người dùng, chủ deployment chịu quota và chi phí Gemini cho mọi lượt gọi.
Trước khi phát hành rộng phải có rate limit, ngân sách/cảnh báo và quy trình rotate key.

## 6. CORS và Extension ID

Người dùng không cần gửi Extension ID để đăng ký OAuth. Với bản phát hành Chrome Web Store,
Extension ID ổn định nên production có thể khóa `ALLOWED_EXTENSION_ORIGINS` vào origin đó. Trong phát triển,
mỗi bản unpacked có thể có ID khác; đặt cùng public manifest key qua
`VITE_YALA_EXTENSION_PUBLIC_KEY` hoặc thêm origin dev vào allowlist của gateway theo
`gateway/README.md`.

Nếu sản phẩm cố ý chấp nhận mọi origin `chrome-extension://...`, hãy xem API là public hoàn toàn và
dựa vào rate limit/quota chứ không coi kiểm tra origin là hàng rào bảo mật.

## 7. Vận hành và triển khai

Các biến server chính:

| Biến | Bắt buộc | Mục đích |
|---|---|---|
| `GEMINI_API_KEY` | Có | Secret chỉ đặt tại gateway |
| `ALLOWED_EXTENSION_ORIGINS` | Có | Danh sách origin extension chính xác, phân cách bằng dấu phẩy |
| `GEMINI_MODEL` | Không | Model do server chọn |
| `GEMINI_TIMEOUT_MS` | Không | Deadline provider; mặc định 25 giây |
| `GEMINI_MAX_RETRIES` | Không | Retry provider; mặc định 1. Không chờ trong function khi provider yêu cầu `Retry-After` dài. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Production | Store rate limit phân tán; phải đặt đủ cả hai |
| `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_SECONDS` | Không | Mặc định 20 request trong 60 giây |

Khi đã cấu hình Upstash mà store không khả dụng, gateway fail closed thay vì gọi Gemini không giới
hạn. Không biến server nào ở trên được dùng tiền tố `VITE_`.

Extension chỉ có hai cấu hình public: `VITE_YALA_GATEWAY_URL` và public key tùy chọn
`VITE_YALA_EXTENSION_PUBLIC_KEY`. Vite đóng các giá trị này vào bundle/manifest; tuyệt đối không
dùng chúng cho credential.

Hướng dẫn biến môi trường, lệnh kiểm thử và deploy nằm tại:

- [`../../gateway/README.md`](../../gateway/README.md) cho AI Gateway;
- [`../../extension/README.md`](../../extension/README.md) cho URL gateway được đóng vào bản build;
- [`../../local-rag-service/README.md`](../../local-rag-service/README.md) cho RAG chạy tại máy người dùng.

Checklist production tối thiểu:

1. Gemini API key nằm trong secret store và đã giới hạn/rotate được.
2. Model được hỗ trợ tại region/project của deployment.
3. Origin production, request limits, timeout và rate limit được cấu hình.
4. `GET /api/health` báo ready nhưng không tiết lộ secret.
5. Test quiz, flashcard, Ask AI, invalid input, 429, timeout và invalid provider output đều chạy.
6. Log không chứa transcript/secret; dashboard theo dõi latency, lỗi, quota và chi phí.
7. Extension production được build với URL HTTPS cố định của gateway và không còn permission
   `identity`, OAuth manifest hay host permission trực tiếp tới Google APIs.

## 8. Ảnh hưởng của migration

Đã loại khỏi runtime hiện hành:

- `chrome.identity` và màn hình đăng nhập/đăng xuất Google;
- OAuth Client ID, consent screen, test user và đăng ký Item ID theo từng extension;
- gọi `generativelanguage.googleapis.com` trực tiếp từ extension;
- project/model/provider credential do client quyết định.

Đổi lại, chức năng sinh nội dung cần Internet và phụ thuộc availability/quota của gateway cùng
Gemini. Gateway không làm tăng context/output limit của model; nó cải thiện khả năng đóng gói,
bảo mật key, kiểm soát policy và độ ổn định nhờ validation/retry tập trung.
