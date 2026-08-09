# pair-2-vid (`p2v`)

Công cụ CLI tự động ghép các cặp ảnh và âm thanh thành video MP4 hoàn chỉnh.

## Tính năng nổi bật

- **Khớp dữ liệu thông minh:** Tự động ghép nối ảnh và âm thanh theo **tên file gốc (basename)** (ví dụ: `01.png` + `01.mp3`).
- **Xuất video tổng `content.mp4` mặc định:**
  - Chuẩn tỉ lệ khung hình **9:16 Portrait** (ví dụ `1080x1920`).
  - Hình ảnh hiển thị **100% Fullwidth** (chiều rộng vừa khít khung hình, chiều cao giữ nguyên tỉ lệ gốc của ảnh).
  - Tự động chèn **phông màu xanh (`#00FF00`) 0.2s** ở giữa các phân đoạn và phần thừa trên/dưới để dễ dàng xóa nền (Chroma Key) trong phần mềm dựng phim.
- **Tùy chọn lưu video lẻ (`-s` / `--singles`):** Lưu các video phân đoạn (`01.mp4`, `02.mp4`...) vào thư mục riêng `./singles/`.
- **Định dạng hỗ trợ:**
  - Ảnh: `.png`, `.jpg`, `.jpeg`, `.webp`.
  - Âm thanh: `.mp3`, `.wav`, `.m4a`, `.aac`.
- **Mã hóa chuẩn:** H.264 + AAC (`yuv420p`), tương thích 100% với CapCut, Premiere, DaVinci, TikTok, YouTube.

---

## Hướng dẫn sử dụng

### 1. Tạo duy nhất video tổng `content.mp4` (Mặc định)

```bash
p2v
# HOẶC chỉ định thư mục đầu vào / đầu ra:
p2v -i ./dau-vao -o ./dau-ra
```

### 2. Tạo `content.mp4` ĐỒNG THỜI lưu các video lẻ vào thư mục `./singles/`

```bash
p2v -s
# HOẶC:
p2v --singles
```

_Cấu trúc kết quả xuất ra:_

```text
.
├── content.mp4
└── singles/
    ├── 01.mp4
    ├── 02.mp4
    └── 03.mp4
```

### 3. Ghi đè file nếu đã tồn tại (`-f`)

```bash
p2v -f
```

### 4. Kiểm tra tính hợp lệ của dữ liệu đầu vào

```bash
p2v validate -i ./dau-vao
```

---

## Bảng các tùy chọn CLI (`Options`)

| Tùy chọn             | Mô tả                                         | Mặc định               |
| :------------------- | :-------------------------------------------- | :--------------------- |
| `-i, --input <dir>`  | Đường dẫn thư mục chứa ảnh & âm thanh đầu vào | `.` (Thư mục hiện tại) |
| `-o, --output <dir>` | Đường dẫn thư mục xuất video                  | `.` (Thư mục hiện tại) |
| `-f, --force`        | Ghi đè file đã tồn tại                        | `false`                |
| `-s, --singles`      | Lưu các video lẻ vào thư mục `./singles/`     | `false`                |
| `-h, --help`         | Hiển thị bảng trợ giúp lệnh                   |                        |
| `-V, --version`      | Hiển thị số phiên bản hiện tại                |                        |
