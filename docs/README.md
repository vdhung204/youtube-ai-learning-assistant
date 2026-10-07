# Documentation

- [`architecture/SDS_YouTube_AI_Learning_Assistant_V2.md`](architecture/SDS_YouTube_AI_Learning_Assistant_V2.md):
  SDS hiện hành đối chiếu code tại commit `edaab7d`, cập nhật việc bỏ OAuth, gateway Vercel,
  quiz toàn video sinh từng đợt, flashcard theo phần, lưu tiến độ cục bộ và các giới hạn còn lại.
- [`architecture/ai-gateway.md`](architecture/ai-gateway.md): mô tả chi tiết kiến trúc gateway
  và vận hành sau khi bỏ Google OAuth khỏi extension.
- `architecture/*.docx`: các bản SDS đã chốt ở những mốc trước; được giữ làm hồ sơ và có thể
  còn mô tả kiến trúc Google OAuth/Gemini trực tiếp.
- `../SDS_*.docx` và các file sinh trong `../work/`: bản sao/kết quả render từ kiến trúc cũ,
  không phải nguồn cấu hình runtime.
- `project-management/`: kế hoạch và phân công ban đầu của dự án. Đây là tài liệu lịch sử,
  không phải hướng dẫn cấu hình hoặc vận hành bản hiện tại.
- `testing/`: test plan, test report và bằng chứng nghiệm thu do Thành viên 4 quản lý.

Thư mục `../outputs/` chỉ dành cho kết quả làm việc tạm thời của công cụ/AI và đã được loại khỏi Git.

Khi nội dung mâu thuẫn nhau, đối chiếu code và schema cùng commit trước, sau đó đến SDS V2
và tài liệu kiến trúc/hướng dẫn cùng phiên bản. Một số README bàn giao cũ chỉ phản ánh thời điểm
chưa tích hợp đầy đủ; không dùng chúng hoặc SDS/kế hoạch cũ để khôi phục OAuth.
