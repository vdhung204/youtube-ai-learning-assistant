import type { AssessmentResponse, Question } from "../../types/api";
import type { CurrentVideo, Flashcard, MockConversation } from "../../types/learning";

export const currentVideo: CurrentVideo = {
  videoId: "dQw4w9WgXcQ",
  title: "Neural Networks: Backprop & Gradients",
  channel: "3Blue1Brown",
  currentTimeSec: 462,
  dataSource: "youtube",
  durationSec: 1122,
  language: "vi",
  thumbnailLabel: "THE FUTURE OF AI",
};

export const quizQuestions: Question[] = [
  {
    questionId: "q1",
    question: "Trong một mạng neural, trọng số có vai trò chính nào?",
    options: [
      "Lưu màu sắc của dữ liệu",
      "Điều chỉnh mức ảnh hưởng của tín hiệu đầu vào",
      "Đếm số lượng tầng",
      "Thay thế hoàn toàn hàm kích hoạt",
    ],
    correctAnswer: 1,
    explanation: "Trọng số kiểm soát mức ảnh hưởng của từng tín hiệu trong mạng.",
    topic: "Cấu trúc mạng neural",
    sourceTimestamp: { chunkId: "chunk-01", startSec: 72, endSec: 118 },
  },
  {
    questionId: "q2",
    question: "Hàm mất mát được dùng để biểu diễn điều gì trong quá trình học?",
    options: [
      "Khoảng cách giữa dự đoán và kết quả mong muốn",
      "Số lượng neuron đang hoạt động",
      "Tốc độ phát video",
      "Kích thước của tập dữ liệu",
    ],
    correctAnswer: 0,
    explanation: "Hàm mất mát đo mức sai khác giữa dự đoán và mục tiêu.",
    topic: "Hàm mất mát",
    sourceTimestamp: { chunkId: "chunk-02", startSec: 171, endSec: 224 },
  },
  {
    questionId: "q3",
    question:
      "Trong giải thuật Lan truyền ngược (Backpropagation), quy tắc nào là cốt lõi để tính đạo hàm riêng của hàm mất mát đối với các trọng số ở tầng ẩn?",
    options: [
      "Quy tắc cộng xác suất Bayes",
      "Quy tắc chuỗi (Chain Rule) trong giải tích",
      "Ma trận hiệp phương sai PCA",
      "Thuật toán phân cụm K-Means",
    ],
    correctAnswer: 1,
    explanation: "Quy tắc chuỗi cho phép truyền đạo hàm qua các hàm hợp liên tiếp.",
    topic: "Backpropagation",
    sourceTimestamp: { chunkId: "chunk-03", startSec: 460, endSec: 555 },
  },
  {
    questionId: "q4",
    question: "Gradient cho biết thông tin nào khi tối ưu mạng neural?",
    options: [
      "Hướng và tốc độ thay đổi của hàm mất mát",
      "Tên của từng neuron",
      "Độ dài của video",
      "Số nhãn trong tập kiểm thử",
    ],
    correctAnswer: 0,
    explanation: "Gradient mô tả hướng thay đổi nhanh nhất của hàm mất mát.",
    topic: "Gradient",
    sourceTimestamp: { chunkId: "chunk-04", startSec: 557, endSec: 612 },
  },
  {
    questionId: "q5",
    question: "Gradient descent cập nhật trọng số theo hướng nào?",
    options: [
      "Cùng hướng gradient",
      "Ngẫu nhiên hoàn toàn",
      "Ngược hướng gradient",
      "Không thay đổi trọng số",
    ],
    correctAnswer: 2,
    explanation: "Đi ngược gradient giúp giảm hàm mất mát.",
    topic: "Tối ưu",
    sourceTimestamp: { chunkId: "chunk-05", startSec: 620, endSec: 681 },
  },
  {
    questionId: "q6",
    question: "Learning rate kiểm soát yếu tố nào?",
    options: [
      "Kích thước mỗi bước cập nhật",
      "Số tầng đầu vào",
      "Loại transcript",
      "Số video được mở",
    ],
    correctAnswer: 0,
    explanation: "Learning rate quyết định độ lớn của mỗi bước tối ưu.",
    topic: "Tối ưu",
    sourceTimestamp: { chunkId: "chunk-06", startSec: 684, endSec: 731 },
  },
  {
    questionId: "q7",
    question: "Tại sao đạo hàm cục bộ được nhân với nhau khi lan truyền ngược?",
    options: [
      "Vì mạng là chuỗi các hàm hợp",
      "Vì dữ liệu luôn là số nguyên",
      "Để tăng số neuron",
      "Để loại bỏ hàm mất mát",
    ],
    correctAnswer: 0,
    explanation: "Mỗi tầng là một phần của hàm hợp nên đạo hàm tuân theo quy tắc chuỗi.",
    topic: "Backpropagation",
    sourceTimestamp: { chunkId: "chunk-07", startSec: 736, endSec: 795 },
  },
  {
    questionId: "q8",
    question: "Một gradient rất nhỏ qua nhiều tầng có thể dẫn tới hiện tượng nào?",
    options: [
      "Vanishing gradient",
      "Tăng độ phân giải",
      "Dữ liệu tự gắn nhãn",
      "Mạng tự thêm tầng",
    ],
    correctAnswer: 0,
    explanation: "Gradient có thể suy giảm dần khi truyền qua nhiều tầng.",
    topic: "Vanishing gradient",
    sourceTimestamp: { chunkId: "chunk-08", startSec: 812, endSec: 875 },
  },
  {
    questionId: "q9",
    question: "Mục tiêu của một bước huấn luyện là gì?",
    options: [
      "Giảm hàm mất mát trên dữ liệu",
      "Tăng mọi trọng số",
      "Đổi ngôn ngữ transcript",
      "Xóa toàn bộ đầu vào",
    ],
    correctAnswer: 0,
    explanation: "Quá trình tối ưu tìm trọng số làm giảm sai số dự đoán.",
    topic: "Huấn luyện",
    sourceTimestamp: { chunkId: "chunk-09", startSec: 890, endSec: 947 },
  },
  {
    questionId: "q10",
    question: "Backpropagation kết hợp với thuật toán nào để cập nhật trọng số?",
    options: ["Gradient descent", "K-Means", "PCA", "Breadth-first search"],
    correctAnswer: 0,
    explanation: "Backpropagation tính gradient, còn gradient descent dùng gradient để cập nhật.",
    topic: "Backpropagation",
    sourceTimestamp: { chunkId: "chunk-10", startSec: 960, endSec: 1030 },
  },
];

export const flashcards: Flashcard[] = [
  {
    flashcardId: "f1",
    front: "Neuron",
    back: "Đơn vị nhận tín hiệu, áp dụng trọng số và hàm kích hoạt để tạo đầu ra.",
    hint: "Đơn vị xử lý cơ bản của mạng neural",
    topic: "Khái niệm cốt lõi",
    sourceTimestamp: { chunkId: "flash-01", startSec: 45, endSec: 91 },
  },
  {
    flashcardId: "f2",
    front: "Weight (Trọng số)",
    back: "Tham số cho biết mức ảnh hưởng của một tín hiệu lên neuron tiếp theo.",
    hint: "Tham số được điều chỉnh trong quá trình học",
    topic: "Khái niệm cốt lõi",
    sourceTimestamp: { chunkId: "flash-02", startSec: 95, endSec: 143 },
  },
  {
    flashcardId: "f3",
    front: "Loss Function",
    back: "Hàm đo khoảng cách giữa dự đoán của mạng và kết quả mong muốn.",
    hint: "Tín hiệu cho biết mô hình đang sai bao nhiêu",
    topic: "Tối ưu",
    sourceTimestamp: { chunkId: "flash-03", startSec: 171, endSec: 224 },
  },
  {
    flashcardId: "f4",
    front: "Chain Rule (Quy tắc chuỗi)",
    back: "Nếu y = f(u) và u = g(x), đạo hàm dy/dx bằng dy/du nhân với du/dx.",
    hint: "Khái niệm toán học nền tảng của Backpropagation",
    topic: "Toán giải tích",
    sourceTimestamp: { chunkId: "flash-04", startSec: 450, endSec: 520 },
  },
  {
    flashcardId: "f5",
    front: "Gradient",
    back: "Vector các đạo hàm riêng, biểu diễn hướng tăng nhanh nhất của hàm.",
    hint: "La bàn cho quá trình tối ưu",
    topic: "Toán giải tích",
    sourceTimestamp: { chunkId: "flash-05", startSec: 557, endSec: 612 },
  },
  {
    flashcardId: "f6",
    front: "Learning Rate",
    back: "Hệ số kiểm soát kích thước mỗi bước cập nhật trọng số.",
    hint: "Bước đi lớn hay nhỏ trên bề mặt loss",
    topic: "Tối ưu",
    sourceTimestamp: { chunkId: "flash-06", startSec: 684, endSec: 731 },
  },
  {
    flashcardId: "f7",
    front: "Backpropagation",
    back: "Thuật toán tính gradient từ đầu ra về đầu vào bằng quy tắc chuỗi.",
    hint: "Dòng thông tin đi ngược qua mạng",
    topic: "Mạng neural",
    sourceTimestamp: { chunkId: "flash-07", startSec: 736, endSec: 795 },
  },
  {
    flashcardId: "f8",
    front: "Vanishing Gradient",
    back: "Hiện tượng gradient trở nên quá nhỏ qua nhiều tầng khiến các tầng đầu học chậm.",
    hint: "Một thách thức của mạng sâu",
    topic: "Mạng neural",
    sourceTimestamp: { chunkId: "flash-08", startSec: 812, endSec: 875 },
  },
];

export const conversations: Record<"home" | "quiz" | "flashcard", MockConversation> = {
  home: {
    question: "Hiện tượng vanishing gradient là gì và đoạn nào giải thích rõ nhất?",
    answer: [
      "Vanishing gradient xảy ra khi gradient của hàm mất mát bị triệt tiêu dần qua các tầng sâu do đạo hàm kích hoạt quá nhỏ, làm các layer đầu khó cập nhật trọng số.",
    ],
    sources: [
      { chunkId: "home-source-1", startSec: 252, endSec: 292, label: "Vấn đề suy giảm đạo hàm qua các lớp sigmoid" },
      { chunkId: "home-source-2", startSec: 515, endSec: 552, label: "Minh họa trực quan đồ thị trọng số" },
      { chunkId: "home-source-3", startSec: 830, endSec: 868, label: "Cách giải quyết bằng hàm ReLU" },
    ],
  },
  quiz: {
    question: "Hãy gợi ý cách suy luận đạo hàm qua nhiều hàm lồng nhau trong video.",
    answer: [
      "Hãy nhớ lại cách tính đạo hàm của một hàm hợp f(g(x)). Trong video, tác giả dùng sơ đồ cây để lan truyền đạo hàm từ output ngược về input bằng cách kết hợp các đạo hàm thành phần.",
      "Tập trung vào mối liên hệ giữa các hàm lồng nhau; từ đó đối chiếu với những lựa chọn mô tả đúng cơ chế này.",
    ],
    sources: [
      { chunkId: "quiz-source-1", startSec: 460, endSec: 505, label: "Đạo hàm qua mạng ba tầng" },
      { chunkId: "quiz-source-2", startSec: 555, endSec: 600, label: "Sơ đồ dòng gradient ngược" },
    ],
  },
  flashcard: {
    question: "Giải thích quy tắc chuỗi bằng ví dụ đời sống trực quan giúp tôi?",
    answer: [
      "Tưởng tượng bạn đạp xe: tốc độ bánh xe phụ thuộc vào tốc độ bàn đạp, còn tốc độ bàn đạp phụ thuộc vào lực bắp chân.",
      "Quy tắc chuỗi cho biết lực bắp chân ảnh hưởng thế nào đến tốc độ xe bằng cách nhân các tỷ lệ thay đổi lại với nhau.",
    ],
    sources: [
      { chunkId: "flash-source-1", startSec: 330, endSec: 372, label: "Liên hệ tỷ lệ thay đổi bánh răng" },
      { chunkId: "flash-source-2", startSec: 490, endSec: 531, label: "Công thức vi phân dz/dx = dz/dy × dy/dx" },
    ],
  },
};

export const assessment: AssessmentResponse = {
  score: 80,
  correctCount: 8,
  totalCount: 10,
  questionResults: quizQuestions.map((question, index) => ({
    questionId: question.questionId,
    correct: index !== 2 && index !== 7,
    correctAnswer: question.correctAnswer,
    selectedAnswer: index === 2 || index === 7 ? null : question.correctAnswer,
  })),
  strongTopics: ["Cấu trúc mạng neural", "Tối ưu"],
  weakTopics: ["Backpropagation", "Vanishing gradient"],
  reviewTimestamps: [
    {
      chunkId: "review-1",
      startSec: 460,
      endSec: 520,
      topic: "Backpropagation",
      reason: "Ôn lại cách đạo hàm được truyền qua các tầng ẩn.",
    },
    {
      chunkId: "review-2",
      startSec: 812,
      endSec: 875,
      topic: "Vanishing gradient",
      reason: "Xem lại nguyên nhân gradient suy giảm trong mạng sâu.",
    },
  ],
};
