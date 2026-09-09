"""Only messages from this allowlist may cross the HTTP boundary."""

ERRORS = {
    "INVALID_REQUEST": (400, "Request không hợp lệ.", False),
    "INVALID_VIDEO_ID": (400, "Video ID không hợp lệ.", False),
    "VIDEO_ID_MISMATCH": (400, "Video ID trong URL và body không khớp.", False),
    "PAYLOAD_TOO_LARGE": (413, "Request vượt giới hạn dung lượng.", False),
    "TRANSCRIPT_INVALID": (400, "Transcript hoặc timestamp không hợp lệ.", False),
    "QUERY_INVALID": (400, "Truy vấn không hợp lệ.", False),
    "QUIZ_INVALID": (400, "Quiz hoặc câu trả lời không hợp lệ.", False),
    "INDEX_NOT_FOUND": (404, "Video chưa được lập chỉ mục.", False),
    "INDEX_FAILED": (500, "Không thể lập chỉ mục video.", True),
    "RETRIEVAL_FAILED": (500, "Không thể truy xuất nội dung.", True),
    "ASSESSMENT_FAILED": (500, "Không thể đánh giá bài làm.", True),
    "CACHE_DELETE_FAILED": (500, "Không thể xóa cache video.", True),
    "SERVICE_NOT_READY": (503, "Local RAG Service chưa sẵn sàng.", True),
    "ORIGIN_NOT_ALLOWED": (403, "Origin không được cấp quyền.", False),
    "CREDENTIALS_NOT_ALLOWED": (400, "Không gửi thông tin xác thực tới local service.", False),
    "REQUEST_TIMEOUT": (504, "Tác vụ vượt thời gian cho phép.", True),
    "NOT_FOUND": (404, "Endpoint không tồn tại.", False),
    "METHOD_NOT_ALLOWED": (405, "HTTP method không được hỗ trợ.", False),
    "INTERNAL_ERROR": (500, "Lỗi nội bộ local service.", True),
}


class ServiceError(Exception):
    def __init__(self, code: str):
        self.code = code if code in ERRORS else "INTERNAL_ERROR"
        super().__init__(self.code)


def error_body(code: str):
    _, message, retryable = ERRORS[code]
    return {"error": {"code": code, "message": message, "retryable": retryable, "details": None}}
