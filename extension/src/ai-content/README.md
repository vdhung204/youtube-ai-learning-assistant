# TV3 AI content

Package TypeScript này tạo prompt, kiểm tra dữ liệu Gemini và chuyển kết quả hợp lệ sang model
quiz/flashcard/assessment của UI. Nó không gọi Gemini và không chứa component React.

## Luồng tích hợp

```ts
const request = buildQuizPrompt(sourceContext, 5, "vi");
// TV1 gửi systemInstruction, userContent và responseSchema qua Gemini transport.
const validated = validateQuiz(rawGeminiResponse, sourceContext);
const questions = mapQuiz(validated, sourceContext);
```

`sourceContext` phải chứa đúng `videoId`, `durationSec` và các chunk Local RAG Service vừa trả.
Validator từ chối JSON lỗi/sai field, đáp án không hợp lệ, nội dung trùng, chunk không tồn tại
và evidence không phải đoạn văn có thật trong chunk. Mapper lấy timestamp từ chunk tin cậy;
Gemini không được tự sinh timestamp.

Prompt coi transcript là dữ liệu không tin cậy, yêu cầu bỏ qua instruction nằm trong transcript,
chỉ dùng context và trả `insufficient_context` khi thiếu căn cứ. Nhận xét AI không được tính lại
điểm hoặc thay đổi strong/weak topics do Local RAG Service xác định.

Lỗi validator là `AIContentError` với mã ổn định; message không chứa response thô. TV1 có thể
cho phép tạo lại với các mã retryable và hiển thị lỗi cấu hình với mã non-retryable.

Kiểm tra độc lập:

```powershell
Set-Location .\extension\src\ai-content
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
```

Contract này cần TV1 và TV4 review trước khi ghép Gemini transport/UI. Không truyền response thô
của Gemini trực tiếp tới component.
