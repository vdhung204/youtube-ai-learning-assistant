# Báo cáo benchmark AI/RAG

Ngày chạy: 09/09/2026, Windows, Python 3.11.16, CPU 16 logical cores.

Model được chọn: `paraphrase-multilingual-MiniLM-L12-v2` tại commit
`e8f8c211226b894fcb81acc59f3b34ba3efd5f42`.

Lý do chọn cho V1: model hỗ trợ tiếng Việt/Anh, vector 384 chiều, chạy local và đạt kết quả tốt
nhất trong sweep cấu hình nhỏ của bộ phát triển. Cấu hình được chọn là chunk 64 token, overlap
8 token, top-k 5, cosine similarity threshold 0.35. Tập evaluation chỉ chạy sau khi chọn cấu hình.

Kết quả held-out evaluation trong `benchmark-minilm.json`:

| Chỉ số | Kết quả |
|---|---:|
| Query | 12, gồm 10 answerable và 2 out-of-scope |
| Recall@5 | 1.00 |
| MRR | 0.95 |
| Abstention accuracy | 1.00 |
| Mean timestamp start error trên hit | 0 giây |
| Mean query latency | 22.57 ms |
| Model load | 8.57 giây |
| Model cache | khoảng 499.6 MB |
| Sampled process peak RSS | khoảng 1.01 GB |

Các con số trên chỉ áp dụng cho fixture song ngữ tự viết. Fixture có provenance ngay trong
`../fixtures/evaluation.json`, không lấy transcript hoặc nội dung từ YouTube. Nó dùng để kiểm tra
thuật toán, cô lập video, timestamp và câu hỏi không có căn cứ. Đây chưa phải bằng chứng chất lượng
trên video thật; TV4 cần lặp lại cùng script với transcript được nhóm có quyền sử dụng.

`benchmark-minilm.json` lưu từng cấu hình, từng query, score, timestamp trả về và giới hạn phép đo
để kết quả có thể kiểm tra lại.
