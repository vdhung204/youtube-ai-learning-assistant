# YouTube AI Learning Assistant

Chrome Extension hỗ trợ người dùng học chủ động từ một video YouTube: đọc transcript, tạo quiz/flashcard, chấm kết quả, xác định phần đã hiểu và phần cần cải thiện, sau đó đưa người dùng về đúng timestamp nên xem lại.

## 1. Phạm vi V1

Luồng nghiệm thu chính:

```text
YouTube video
  -> Chrome Extension
  -> Google OAuth (khi người dùng chủ động đăng nhập)
  -> Lấy transcript có timestamp
  -> Local RAG Service xử lý transcript
  -> Embedding + ChromaDB cục bộ
  -> Gemini tạo quiz/flashcard từ context RAG
  -> Người dùng làm bài
  -> Chấm điểm và phân tích chủ đề
  -> Gợi ý timestamp cần xem lại trong chính video
```

V1 bao gồm:

- Chrome Extension dùng React, TypeScript và Manifest V3.
- Sidebar hoạt động trên trang xem video YouTube.
- Google OAuth và Gemini; không nhúng API key của provider vào extension.
- Transcript processing, chunking, embedding và semantic retrieval.
- ChromaDB `PersistentClient` lưu chunk, embedding và timestamp trên máy người dùng.
- Quiz, flashcard, chấm điểm và nhận xét phần học tốt/chưa tốt.
- Đề xuất timestamp để quay lại đúng đoạn của video đang học.

V1 không bao gồm:

- MySQL hoặc cơ sở dữ liệu nghiệp vụ.
- Server lưu trữ tập trung trên Internet.
- Lưu OAuth token, cookie, câu trả lời, điểm số hoặc lịch sử học tập lâu dài.
- Đồng bộ nhiều thiết bị, gợi ý video mới hoặc lộ trình học dài hạn.
- Đọc hay tái sử dụng cookie Google AI Studio.

## 2. Kiến trúc tổng quát

```text
┌──────────────────────────────┐
│ YouTube page                 │
│ Video ID + transcript + time │
└──────────────┬───────────────┘
               │
               v
┌──────────────────────────────┐       ┌──────────────────────────┐
│ Chrome Extension             │──────>│ Google OAuth + Gemini    │
│ UI, OAuth, scoring, playback │       │ Quiz/flashcard/feedback  │
└──────────────┬───────────────┘       └──────────────────────────┘
               │ localhost
               v
┌──────────────────────────────┐
│ Local RAG Service            │
│ Process, embed, retrieve     │
└──────────────┬───────────────┘
               │
               v
┌──────────────────────────────┐
│ ChromaDB PersistentClient    │
│ Chunk + embedding + timestamp│
└──────────────────────────────┘
```

OAuth token chỉ nằm trong luồng xác thực của extension. Token không được chuyển cho Local RAG Service, không ghi vào ChromaDB và không xuất hiện trong log.

## 3. Cấu trúc repository

```text
.
├── extension/                         # Thành viên 1; riêng src/ai-content do TV3 sở hữu
│   ├── public/
│   │   └── icons/
│   └── src/
│       ├── background/                # Service worker, lifecycle extension
│       ├── content/                   # Tích hợp trang YouTube
│       ├── sidebar/                   # React shell, hooks, view và UI dùng chung
│       ├── features/
│       │   ├── authentication/        # OAuth UI và trạng thái đăng nhập
│       │   ├── quiz/                  # Giao diện làm bài
│       │   ├── flashcard/             # Giao diện flashcard
│       │   └── learning-assessment/   # Hiển thị kết quả và chỗ cần xem lại
│       ├── integrations/
│       │   ├── local-service/         # HTTP client tới localhost
│       │   ├── google-oauth/          # Chrome Identity integration
│       │   ├── gemini/                # Transport gọi Gemini, không chứa secret
│       │   ├── youtube/                # Bridge tới content script/tab YouTube
│       │   └── learning/               # Điều phối retrieval, prompt và mapping
│       ├── ai-content/                 # TV3: prompt, mapping, validate AI output
│       ├── types/                      # Contract API, message và UI
│       └── tests/                      # Unit/integration test của extension
├── local-rag-service/
│   ├── app/
│   │   ├── core/                      # TV2: config, lifecycle, health
│   │   ├── transport/                 # TV2: endpoint/DTO adapter trên localhost
│   │   ├── transcript/                # TV3: làm sạch và chuẩn hóa transcript
│   │   ├── chunking/                  # TV3: chunk, overlap, timestamp
│   │   ├── embedding/                 # TV3: model và batch embedding
│   │   ├── vector_store/              # TV3: ChromaDB schema/adapter
│   │   ├── retrieval/                 # TV3: search, filter, context builder
│   │   └── assessment/                # TV3: topic/strength/weakness/timestamp
│   └── tests/
│       ├── service/                   # TV2
│       └── rag/                       # TV3
├── shared/
│   └── contracts/                     # Schema giao tiếp; thay đổi cần review chéo
├── scripts/                            # TV2: setup/start/stop/clear local data
├── tests/
│   └── e2e/                           # TV4: integration và end-to-end
├── docs/
│   ├── architecture/                  # Thiết kế đã được nhóm duyệt
│   ├── project-management/            # Kế hoạch và phân công công việc
│   └── testing/                       # TV4: test plan/report/evidence
├── outputs/                            # Kết quả làm việc tạm; không commit
├── work/                               # Công cụ và file trung gian tạo tài liệu
├── CONTRIBUTING.md                    # Quy trình branch, commit và review
├── OWNERS.md                          # Quyền sở hữu theo thư mục
└── .gitignore
```

Các thư mục thể hiện ranh giới runtime và quyền sở hữu hiện tại. Không đổi công nghệ hoặc hợp đồng dùng chung một cách đơn phương.

## 4. Phân công theo thư mục

| Thành viên | Phạm vi chính | Không tự thay đổi |
|---|---|---|
| Thành viên 1 — Extension Frontend | `extension/`, trừ `extension/src/ai-content/` | Pipeline RAG, ChromaDB schema, prompt và assessment logic |
| Thành viên 2 — Local Service & Integration | `local-rag-service/app/core/`, `transport/`, `local-rag-service/tests/service/`, `scripts/` | Chunking, embedding, retrieval và ChromaDB schema |
| Thành viên 3 — AI/RAG Lead | `extension/src/ai-content/`, các module AI/RAG trong local service, `local-rag-service/tests/rag/` | UI/lifecycle extension và khung vận hành service ngoài giao diện đã thống nhất |
| Thành viên 4 — QA/Integration | `tests/e2e/`, `docs/testing/` | Source của thành viên khác; lỗi được sửa qua issue/PR của owner |

Chi tiết quyền sở hữu và điểm cần review chéo nằm trong [OWNERS.md](OWNERS.md).

## 5. Quy tắc tránh conflict

1. Không commit trực tiếp lên `main`.
2. Mỗi task dùng một branch riêng, ví dụ `feat/tv1-sidebar`, `feat/tv2-health-check`, `feat/tv3-rag-retrieval`, `test/tv4-oauth-e2e`.
3. Chỉ sửa thư mục mình sở hữu. Nếu cần sửa phần của người khác, trao đổi trên Teams và thêm owner đó vào review.
4. Trước khi sửa file dùng chung, thông báo nhóm và chỉ định một người thực hiện trong thời điểm đó.
5. Các file dùng chung gồm: `README.md`, `CONTRIBUTING.md`, `OWNERS.md`, manifest, file dependency/lock, schema trong `shared/contracts/` và tài liệu kiến trúc.
6. Pull/rebase nhánh mới nhất trước khi mở pull request; không format hoặc đổi tên hàng loạt ngoài phạm vi task.
7. Pull request nhỏ, ghi rõ cách kiểm thử, ảnh hưởng hợp đồng và hạn chế còn lại.
8. Không commit token, cookie, secret, `.env`, dữ liệu ChromaDB hoặc transcript của người dùng.

Quy trình đầy đủ xem tại [CONTRIBUTING.md](CONTRIBUTING.md).

## 6. Hợp đồng tích hợp bắt buộc

Trước khi hai phía triển khai song song, nhóm cần chốt schema trong `shared/contracts/` cho các đối tượng tối thiểu:

- Video và transcript segment có `videoId`, `text`, `startSec`, `endSec`.
- Trạng thái index video và lỗi Local RAG Service.
- Retrieved chunk có nội dung, similarity score và timestamp.
- Quiz, đáp án, topic và source timestamp.
- Flashcard, topic và source timestamp.
- Assessment gồm score, strong topics, weak topics và review timestamps.

Mọi thay đổi schema phải cập nhật contract trước, sau đó mới cập nhật producer và consumer trong cùng pull request hoặc các pull request được liên kết.

## 7. Chạy dự án

Lệnh cài đặt, build và chạy thật được duy trì tại:

- [extension/README.md](extension/README.md): build và load unpacked extension.
- [local-rag-service/README.md](local-rag-service/README.md): setup và chạy service cục bộ.
- [scripts/README.md](scripts/README.md): script dành cho máy phát triển/demo.

Không ghi lệnh giả vào README. Mỗi lệnh chỉ được thêm sau khi đã chạy thử trên một máy mới hoặc môi trường sạch.

## 8. Điều kiện hoàn thành V1

- Extension nhận đúng video và transcript có timestamp.
- OAuth chỉ mở sau thao tác của người dùng; không có API key/cookie AI Studio trong source.
- Local RAG Service lập chỉ mục và retrieval đúng theo `videoId`.
- ChromaDB lưu chunk, embedding và timestamp cục bộ.
- Quiz/flashcard bám nội dung transcript và có timestamp nguồn hợp lệ.
- Chấm quiz đúng; báo cáo chỉ ra phần làm tốt, phần cần cải thiện.
- Nút xem lại đưa người dùng đến đúng đoạn của video hiện tại.
- Không lưu lịch sử học tập dài hạn và không gợi ý video mới.

## 9. Tài liệu dự án

- Kế hoạch hiện hành: `docs/project-management/plan.txt`.
- Phân công chi tiết: `docs/project-management/phan_cong_chi_tiet.txt`.
- SDS V1: `docs/architecture/SDS_YouTube_AI_Learning_Assistant_V1.docx`.
- Tài liệu kiểm thử và bằng chứng nghiệm thu sẽ được bổ sung trong `docs/testing/`.
