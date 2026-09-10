# TV3 AI/RAG pipeline

Module này là phần triển khai của Thành viên 3. Luồng chính:

```text
transcript -> normalize/merge -> timestamp chunks -> local embeddings
           -> versioned ChromaDB -> retrieval/context
quiz result -> deterministic scoring/topic analysis -> review timestamps
```

## Quyết định kỹ thuật V1

- Model mặc định: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`, cố định commit
  `e8f8c211226b894fcb81acc59f3b34ba3efd5f42`, 384 chiều, chạy cục bộ.
- Chunk mặc định: tối đa 64 token của tokenizer model, overlap tối đa 8 token theo
  fragment nguồn, không ghép qua khoảng nghỉ lớn hơn 5 giây.
- Retrieval mặc định: cosine similarity, `top_k=5`, threshold `0.35`.
- Chủ đề đạt từ 70% câu đúng được xếp vào `strongTopics`; thấp hơn là `weakTopics`.
  Câu bỏ trống được tính sai. Đây là đánh giá của phiên quiz hiện tại, không phải kết luận
  chung về năng lực người học.
- Mỗi collection được phân biệt theo model, dimension và pipeline version. Một thế hệ index
  mới chỉ được công bố sau khi ghi đủ dữ liệu. Query bắt buộc lọc `videoId` và generation.
- Chỉ transcript chunk/embedding/timestamp được lưu. Không lưu OAuth token, câu trả lời,
  điểm số hay lịch sử học tập.

Các giá trị trên được chọn từ benchmark phát triển trong
`../../tests/rag/reports/benchmark-minilm.json`. Báo cáo đó dùng dữ liệu tự viết, không phải
kết quả nghiệm thu trên video YouTube thật.

## Cài đặt và chạy

Chạy tại repository root bằng PowerShell. Cần Python 3.11+:

```powershell
.\scripts\setup-local-service.ps1
.\local-rag-service\.venv\Scripts\python.exe -m pip install `
  -r .\local-rag-service\app\embedding\requirements-rag.txt

Set-Location .\local-rag-service
.\.venv\Scripts\python.exe -m app.embedding.prepare_model
$env:YALA_RAG_FACTORY = "app.retrieval.facade:create_facade"
Set-Location ..
.\scripts\start-local-service.ps1
```

`prepare_model` là bước tải model công khai có chủ đích. Khi chạy service, adapter chỉ đọc
model trong cache local và không tự tải. Transcript không được gửi tới Hugging Face.

Kiểm tra health tại `http://127.0.0.1:8765/api/v1/health`. Lần index mới trả `202 indexing`;
client thăm dò `index-status` đến `ready`. Gửi lại transcript không đổi trả cache hit `200`.

Các cấu hình có thể thay qua biến môi trường trước khi start:

| Biến | Mặc định |
|---|---:|
| `YALA_CHUNK_TOKENS` | 64 |
| `YALA_OVERLAP_TOKENS` | 8 |
| `YALA_CHUNK_MAX_GAP_SEC` | 5 |
| `YALA_MERGE_MIN_CHARS` | 24 |
| `YALA_MERGE_GAP_SEC` | 1 |
| `YALA_TOP_K` | 5 |
| `YALA_SIMILARITY_THRESHOLD` | 0.35 |
| `YALA_CONTEXT_BUDGET` | 6000 UTF-8 bytes, a conservative Gemini prompt budget |
| `YALA_DEDUP_OVERLAP` | 0.8 |
| `YALA_STRONG_TOPIC_RATIO` | 0.7 |
| `YALA_EMBEDDING_BATCH_SIZE` | 16 |
| `YALA_EMBEDDING_DEVICE` | cpu |

Thay model, revision hoặc chunk config tạo pipeline version/collection khác và không tái sử
dụng nhầm cache cũ. `DELETE /cache` xóa mọi collection do TV3 sở hữu của đúng video đó.

## Interface cho TV1 và TV2

TV2 nạp factory bằng `YALA_RAG_FACTORY=app.retrieval.facade:create_facade`. Facade triển khai
đủ `startup`, `shutdown`, `readiness`, `index`, `index_status`, `retrieve`, `assess_quiz` và
`delete_cache` trong `app/core/rag_facade.py`.

Schema JSON được xuất tại `contracts/local-service.schema.json` từ DTO hiện hành. Đây là bản
để TV1, TV2 và TV3 review chéo trước khi chuyển sang `shared/contracts/`; script xuất lại:

```powershell
.\local-rag-service\.venv\Scripts\python.exe `
  .\local-rag-service\tests\rag\export_contracts.py
```

Điểm contract cần chốt là `correctAnswer`/`selectedAnswer` dùng chỉ số từ 0; đáp án thiếu hoặc
`null` tính sai; review timestamp gồm `chunkId`, `startSec`, `endSec`, `topic`, `reason`.

## Kiểm thử

```powershell
.\local-rag-service\.venv\Scripts\python.exe -m unittest discover `
  -s .\local-rag-service\tests\rag -v

$env:YALA_TEST_REAL_MODEL = "1"
.\local-rag-service\.venv\Scripts\python.exe -m unittest discover `
  -s .\local-rag-service\tests\rag -p test_real_embedding.py -v
Remove-Item Env:YALA_TEST_REAL_MODEL
```

Test thường dùng encoder tổng hợp được ghi rõ là fixture, nhưng ChromaDB, persistence,
facade và HTTP adapter đều là code thật. Test opt-in dùng model thật đã chuẩn bị local.

Chạy lại benchmark:

```powershell
.\local-rag-service\.venv\Scripts\python.exe `
  .\local-rag-service\tests\rag\benchmark.py --sweep `
  --output .\local-rag-service\tests\rag\reports\benchmark-minilm.json
```

## Giới hạn tích hợp

- TV1 vẫn phải nối `PromptRequest` vào Gemini transport và chỉ đưa kết quả qua validator/mapper.
- TV4 cần chạy E2E trên video thật, OAuth thật và Gemini thật.
- V1 dùng một writer process cho ChromaDB. Writer thứ hai trên cùng cache bị từ chối để tránh
  hỏng dữ liệu.
- Timestamp của fragment tách từ một segment dài kế thừa khoảng thời gian của segment nguồn;
  module không bịa độ chính xác nhỏ hơn dữ liệu transcript cung cấp.
