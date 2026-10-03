# Documentation

- [`architecture/ai-gateway.md`](architecture/ai-gateway.md): nguồn sự thật cho kiến trúc runtime
  hiện hành sau khi bỏ Google OAuth khỏi extension.
- `architecture/*.docx`: các bản SDS đã chốt ở những mốc trước; được giữ làm hồ sơ và có thể
  còn mô tả kiến trúc Google OAuth/Gemini trực tiếp.
- `../SDS_*.docx` và các file sinh trong `../work/`: bản sao/kết quả render từ kiến trúc cũ,
  không phải nguồn cấu hình runtime.
- `project-management/`: kế hoạch và phân công ban đầu của dự án. Đây là tài liệu lịch sử,
  không phải hướng dẫn cấu hình hoặc vận hành bản hiện tại.
- `testing/`: test plan, test report và bằng chứng nghiệm thu do Thành viên 4 quản lý.

Thư mục `../outputs/` chỉ dành cho kết quả làm việc tạm thời của công cụ/AI và đã được loại khỏi Git.

Khi nội dung mâu thuẫn nhau, ưu tiên code và README cùng phiên bản, sau đó đến
`architecture/ai-gateway.md`; không dùng các bản SDS/kế hoạch cũ để khôi phục OAuth.
