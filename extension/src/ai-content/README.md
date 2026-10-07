# AI content contract

Package TypeScript này định nghĩa request nghiệp vụ có giới hạn, kiểm tra dữ liệu AI và chuyển
kết quả hợp lệ sang model quiz/flashcard/assessment của UI. Package không gọi Gemini, không chứa
API key và không cho extension tự chọn model, system prompt, schema hay generation settings.

## Luồng tích hợp

```ts
const request = buildQuizRequest(sourceContext, 5, "vi");
const raw = await generateContent(request, {
  validate: (response) => validateQuiz(response, sourceContext),
});
const questions = mapQuiz(raw, sourceContext);
```

`generateContent` thuộc `src/integrations/ai-gateway/`. Extension chỉ gửi `task`, `language`,
context retrieval và dữ liệu nghiệp vụ cần thiết. AI Gateway dựng prompt/schema, chọn model, gọi
Gemini và chuẩn hóa envelope trả về.

`sourceContext` phải chứa đúng `videoId`, `durationSec` và các chunk Local RAG Service vừa trả.
Validator từ chối JSON lỗi/sai field, đáp án không hợp lệ, nội dung trùng, chunk không tồn tại
và evidence không phải đoạn văn có thật trong chunk. Mapper lấy timestamp từ chunk tin cậy;
AI không được tự sinh timestamp.

Transcript luôn là dữ liệu không tin cậy. Chính sách prompt-injection và structured output nằm ở
gateway, còn validator trong extension vẫn là lớp phòng thủ cuối trước UI. Nhận xét AI không được
tính lại điểm hoặc thay đổi strong/weak topics do Local RAG Service xác định.

Lỗi validator là `AIContentError` với mã ổn định; message không chứa response thô. Pipeline chỉ
retry lỗi tạm thời có giới hạn và không truyền response thô của provider trực tiếp tới component.

Kiểm tra độc lập:

```powershell
Set-Location .\extension\src\ai-content
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
```

Mọi thay đổi request/response contract cần được owner extension, gateway và QA review cùng nhau.
