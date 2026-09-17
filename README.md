# Quiz Mầm Xinh — GitHub Pages + thư mục nạp đề

Bản này đã ghép 2 phần:
1. Giao diện mobile-first dễ thương.
2. Tự tạo bài trắc nghiệm từ file trong `quiz_sources/` bằng GitHub Actions.

## Cấu trúc

```text
.
├── index.html
├── styles.css
├── app.js
├── quiz_sources/             # Bạn nạp đề vào đây
│   ├── README.md
│   └── de-mau.txt
├── quizzes/                  # GitHub Actions tự sinh
│   ├── index.json
│   └── *.json
├── scripts/
│   └── build_quizzes.py
├── requirements.txt
└── .github/
    └── workflows/
        └── deploy-pages.yml
```

## Cách sử dụng trên GitHub

1. Tạo repository mới trên GitHub.
2. Upload toàn bộ nội dung project này lên branch `main`.
3. Vào **Settings → Pages**.
4. Ở **Build and deployment → Source**, chọn **GitHub Actions**.
5. Vào tab **Actions**, workflow `Build quizzes and deploy GitHub Pages` sẽ chạy.
6. Sau khi chạy thành công, GitHub Pages sẽ cung cấp đường dẫn website.

## Thêm đề mới

Ví dụ thêm:

```text
quiz_sources/de-tieng-viet.docx
```

sau đó commit/push.

GitHub Actions sẽ:
- đọc file;
- tìm câu hỏi và đáp án;
- tạo JSON trong `quizzes/`;
- deploy lại website.

Bạn KHÔNG cần sửa `app.js`.

## Chạy thử trên máy tính

Không nên double-click `index.html`, vì trình duyệt chặn `fetch()` khi chạy bằng `file://`.

Dùng một web server đơn giản:

```bash
python -m http.server 8000
```

sau đó mở:

```text
http://localhost:8000
```

## Định dạng đề khuyên dùng

```text
TITLE: Kiểm tra Toán
DESCRIPTION: Ôn tập
SUBJECT: Toán học
ICON: 🧮
DURATION: 10

Câu 1: 2 + 2 bằng bao nhiêu?
A. 2
B. 3
C. 4
D. 5
Đáp án: C
Giải thích: 2 + 2 = 4.
```

## Hỗ trợ file

- TXT: tốt nhất.
- DOCX: đọc paragraph văn bản.
- PDF: chỉ phù hợp PDF có text.
- JSON: phù hợp khi muốn kiểm soát dữ liệu chính xác.
- PDF scan / ảnh: chưa OCR.

## Lưu ý bảo mật

GitHub Pages là website tĩnh. File JSON có chứa đáp án đúng nên người biết DevTools có thể xem được đáp án.

Bản này phù hợp cho:
- luyện tập;
- bài tập;
- tự học;
- kiểm tra không yêu cầu chống gian lận.

Nếu cần kỳ thi bảo mật, phần chấm điểm phải chuyển sang backend/serverless.
