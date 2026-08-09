# pair2vid (`p2v`)

Công cụ CLI hỗ trợ chuyển đổi hàng loạt các cặp file ảnh và âm thanh khớp nhau thành các video MP4.

## Tính năng nổi bật

- Lệnh viết tắt ngắn gọn: **`p2v`** (hoặc `pair2vid`).
- Tự động ghép nối ảnh và âm thanh theo **tên file gốc (basename)** (ví dụ: `01.png` + `01.mp3` → `01.mp4`).
- Định dạng ảnh hỗ trợ: `.png`, `.jpg`, `.jpeg`, `.webp`.
- Định dạng âm thanh hỗ trợ: `.mp3`, `.wav`, `.m4a`, `.aac`.
- Thời lượng video khớp chính xác với thời lượng âm thanh thông qua `ffprobe`.
- Giữ nguyên độ phân giải ảnh gốc, không bị cắt hình (crop), méo hình (stretch) hay tỷ lệ bị thay đổi.
- Video đầu ra mã hóa theo chuẩn **H.264 + AAC (yuv420p)**.
- Phát hiện file bị thiếu, tên gốc trùng lặp và kiểm tra sự đồng nhất về kích thước ảnh.

## Hướng dẫn nhanh

Mở terminal ngay tại thư mục chứa các file ảnh & âm thanh và chạy:

```bash
p2v
```

Lệnh `p2v` sẽ tự động quét thư mục hiện tại (`.`) và xuất các video MP4 vào thư mục `./output`.

## Các lệnh & Tùy chọn

### Tạo video (Mặc định)

```bash
p2v
# HOẶC
p2v build
# Ghi đè file nếu đã tồn tại:
p2v -f
# HOẶC
p2v --force
```

### Kiểm tra tính hợp lệ của dữ liệu đầu vào

```bash
p2v validate
```

### Tùy chỉnh đường dẫn thư mục đầu vào / đầu ra

```bash
p2v -i ./duong-dan/dau-vao -o ./duong-dan/dau-ra
```
