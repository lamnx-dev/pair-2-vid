# Bộ Test Case Kiểm Thử Thủ Công — `pair-2-vid` (`p2v`)

Tài liệu này chứa danh sách toàn bộ các test case thủ công (Manual Test Cases) cho ứng dụng CLI `pair-2-vid` (`p2v` v1.2.0).

---

## 📋 Mục lục

1. [Tổng Quan Hướng Dẫn Kiểm Thử](#1-tổng-quan-hướng-dẫn-kiểm-thử)
2. [Nhóm 1: Kiểm Thử Lệnh Build (`p2v` / `p2v build`)](#2-nhóm-1-kiểm-thử-lệnh-build-p2v--p2v-build)
3. [Nhóm 2: Kiểm Thử Giữ File Trung Gian (`-k` / `--keep`)](#3-nhóm-2-kiểm-thử-giữ-file-trung-gian--k---keep)
4. [Nhóm 3: Kiểm Thử Tổng Hợp TTS Từ Text (`p2v tts` & Build từ `.txt`)](#4-nhóm-3-kiểm-thử-tổng-hợp-tts-từ-text-p2v-tts--build-từ-txt)
5. [Nhóm 4: Kiểm Thử Lệnh Validate (`p2v validate`)](#5-nhóm-4-kiểm-thử-lệnh-validate-p2v-validate)
6. [Nhóm 5: Kiểm Thử Các Định Dạng Media & Khung Hình Video](#6-nhóm-5-kiểm-thử-các-định-dạng-media--khung-hình-video)
7. [Nhóm 6: Kiểm Thử Xử Lý Lỗi & Trường Hợp Biên (Edge Cases)](#7-nhóm-6-kiểm-thử-xử-lý-lỗi--trường-hợp-biên-edge-cases)

---

## 1. Tổng Quan Hướng Dẫn Kiểm Thử

### 🛠️ Điều kiện môi trường

- NodeJS ≥ 18
- `ffmpeg` đã được cài đặt và thêm vào PATH hệ thống
- File mô hình TTS Piper ONNX đặt đúng tại `./models/ngochuyen5.onnx`
- Đã link CLI bằng `pnpm link --global` hoặc chạy qua `node dist/cli.js` / `pnpm dev`

### 📊 Mẫu bảng kết quả

| Mã TC | Tiêu đề | Loại | Trạng thái (Pass/Fail) | Ghi chú |
| :---- | :------ | :--- | :--------------------- | :------ |

---

## 2. Nhóm 1: Kiểm Thử Lệnh Build (`p2v` / `p2v build`)

### TC-BUILD-01: Build video với cấu hình mặc định (không truyền tham số)

- **Mục tiêu:** Kiểm tra lệnh `p2v` chạy thành công khi có các cặp `image + audio` trong thư mục hiện tại.
- **Điều kiện tiên quyết:** Thư mục hiện tại chứa `01.png` và `01.mp3`. Không có file `output.mp4` sẵn.
- **Các bước thực hiện:**
  1. Mở terminal tại thư mục kiểm thử.
  2. Chạy lệnh: `p2v` (hoặc `p2v build`).
- **Kết quả mong đợi:**
  - CLI hiển thị quá trình quét file và tiến trình build.
  - Tạo thành công file `output.mp4` tại thư mục hiện tại.
  - Video phát bình thường với hình ảnh `01.png` và âm thanh `01.mp3`.
  - Các file tạm/trung gian tự động dọn dẹp sạch sẽ.

---

### TC-BUILD-02: Build với đường dẫn chỉ định (`-i` và `-o`)

- **Mục tiêu:** Kiểm tra tham số `-i` (input directory) và `-o` (output directory).
- **Điều kiện tiên quyết:** Thư mục `./test-in` chứa `a.jpg`, `a.wav` và thư mục `./test-out` chưa có `output.mp4`.
- **Các bước thực hiện:**
  1. Chạy lệnh: `p2v build -i ./test-in -o ./test-out`.
- **Kết quả mong đợi:**
  - Lệnh chạy thành công.
  - File `output.mp4` được tạo đúng vị trí `./test-out/output.mp4`.

---

### TC-BUILD-03: Ghi đè file output đã tồn tại với cờ `-f` / `--force`

- **Mục tiêu:** Kiểm tra xử lý ghi đè file khi file `output.mp4` đã tồn tại.
- **Điều kiện tiên quyết:** Thư mục output đã có sẵn file `output.mp4`.
- **Các bước thực hiện:**
  1. Chạy lệnh không có `-f`: `p2v -i ./test-in -o ./test-out` → Kiểm tra phản hồi.
  2. Chạy lệnh có `-f`: `p2v -i ./test-in -o ./test-out -f`.
- **Kết quả mong đợi:**
  - Khi không có `-f`: CLI thông báo lỗi hoặc cảnh báo file `output.mp4` đã tồn tại và không ghi đè.
  - Khi có `-f`: Lệnh ghi đè file `output.mp4` thành công mà không báo lỗi.

---

### TC-BUILD-04: Build nhiều phân đoạn và kiểm tra thứ tự ghép

- **Mục tiêu:** Đảm bảo các phân đoạn video được sắp xếp đúng thứ tự alphabet theo basename.
- **Điều kiện tiên quyết:** Thư mục input chứa `01.png`, `01.mp3`, `02.png`, `02.mp3`, `03.png`, `03.mp3`.
- **Các bước thực hiện:**
  1. Chạy lệnh: `p2v -i ./input -o ./output -f`.
  2. Mở file `output.mp4` để kiểm tra.
- **Kết quả mong đợi:**
  - Video tổng ghép nối theo thứ tự chuẩn: Phân đoạn 01 → Khung xanh → Phân đoạn 02 → Khung xanh → Phân đoạn 03.
  - Tổng độ dài video bằng tổng độ dài các file audio + thời gian chuyển cảnh xanh (0.2s cho mỗi khoảng giữa).

---

## 3. Nhóm 2: Kiểm Thử Giữ File Trung Gian (`-k` / `--keep`)

### TC-KEEP-01: Giữ lại video phân đoạn (`-k video`)

- **Mục tiêu:** Kiểm tra tùy chọn `-k video` để tạo và lưu các file video đơn lẻ.
- **Điều kiện tiên quyết:** Input chứa `01.png`+`01.mp3`, `02.jpg`+`02.wav`.
- **Các bước thực hiện:**
  1. Chạy lệnh: `p2v -i ./input -o ./output -k video -f`.
- **Kết quả mong đợi:**
  - Trong thư mục `./output` xuất hiện:
    - `output.mp4` (video tổng)
    - `01.mp4` (video phân đoạn 1)
    - `02.mp4` (video phân đoạn 2)
  - Các file audio TTS trung gian (nếu có) bị xóa.

---

### TC-KEEP-02: Giữ lại audio TTS (`-k audio`)

- **Mục tiêu:** Kiểm tra tùy chọn `-k audio` khi build project có sử dụng TTS từ file `.txt`.
- **Điều kiện tiên quyết:** Input chứa `01.png` và `01.txt`.
- **Các bước thực hiện:**
  1. Chạy lệnh: `p2v -i ./input -o ./output -k audio -f`.
- **Kết quả mong đợi:**
  - Trong thư mục `./output` xuất hiện:
    - `output.mp4`
    - `01.wav` (file audio TTS được tổng hợp từ `01.txt`)
  - File video phân đoạn `01.mp4` không được giữ lại (bị dọn dẹp).

---

### TC-KEEP-03: Giữ tất cả file trung gian (`-k all`)

- **Mục tiêu:** Kiểm tra tùy chọn `-k all`.
- **Điều kiện tiên quyết:** Input chứa `01.png`+`01.mp3`, `02.png`+`02.txt`.
- **Các bước thực hiện:**
  1. Chạy lệnh: `p2v -i ./input -o ./output -k all -f`.
- **Kết quả mong đợi:**
  - Thư mục `./output` giữ lại toàn bộ: `output.mp4`, `01.mp4`, `02.mp4`, và `02.wav` (audio TTS).

---

## 4. Nhóm 3: Kiểm Thử Tổng Hợp TTS Từ Text (`p2v tts` & Build từ `.txt`)

### TC-TTS-01: Lệnh tổng hợp TTS độc lập (`p2v tts`)

- **Mục tiêu:** Kiểm tra lệnh `p2v tts` để sinh file `.wav` từ các file `.txt`.
- **Điều kiện tiên quyết:** Input chứa `intro.txt` (nội dung tiếng Việt: "Xin chào các bạn") và `outro.txt`.
- **Các bước thực hiện:**
  1. Chạy lệnh: `p2v tts -i ./input -o ./output -f`.
- **Kết quả mong đợi:**
  - Tạo thành công `intro.wav` và `outro.wav` trong thư mục output.
  - File `.wav` mở lên nghe rõ giọng đọc chuẩn tiếng Việt (`ngochuyen5`).
  - Không tạo ra bất kỳ file video `.mp4` nào.

---

### TC-TTS-02: Tự động tổng hợp TTS khi build video (`image + txt`)

- **Mục tiêu:** Kiểm tra pipeline tự động chuyển đổi `.txt` thành giọng nói rồi ghép video khi không có file audio.
- **Điều kiện tiên quyết:** Input chứa `scene1.png` và `scene1.txt`. Không có `scene1.mp3`/`wav`.
- **Các bước thực hiện:**
  1. Chạy lệnh: `p2v -i ./input -o ./output -f`.
- **Kết quả mong đợi:**
  - CLI tự động gọi mô hình Piper ONNX để tạo audio giọng nói từ `scene1.txt`.
  - Sau đó tự động ghép `scene1.png` + audio vừa tạo thành `output.mp4`.
  - Video có tiếng đọc văn bản trong `scene1.txt`.

---

### TC-TTS-03: Ưu tiên file audio sẵn có hơn file `.txt`

- **Mục tiêu:** Kiểm tra trường hợp một basename có cả 3 file: `.png`, `.mp3` và `.txt`.
- **Điều kiện tiên quyết:** Input chứa `01.png`, `01.mp3` (nhạc), và `01.txt` (văn bản).
- **Các bước thực hiện:**
  1. Chạy lệnh: `p2v -i ./input -o ./output -f`.
- **Kết quả mong đợi:**
  - Công cụ ưu tiên sử dụng `01.mp3` có sẵn làm âm thanh cho video.
  - Không tốn thời gian tổng hợp TTS cho `01.txt`.

---

## 5. Nhóm 4: Kiểm Thử Lệnh Validate (`p2v validate`)

### TC-VAL-01: Validate thư mục chứa dữ liệu hợp lệ

- **Mục tiêu:** Kiểm tra lệnh `p2v validate` khi tất cả file đều tạo cặp hợp lệ.
- **Điều kiện tiên quyết:** Input chứa `01.png`+`01.mp3`, `02.webp`+`02.txt`.
- **Các bước thực hiện:**
  1. Chạy lệnh: `p2v validate -i ./input`.
- **Kết quả mong đợi:**
  - CLI hiển thị danh sách các cặp media hợp lệ và kích thước hình ảnh.
  - Trả về mã thoát (exit code) `0`.

---

### TC-VAL-02: Validate thư mục có file lẻ (thiếu ảnh hoặc thiếu audio/txt)

- **Mục tiêu:** Kiểm tra thông báo lỗi validation khi dữ liệu không bắt cặp được.
- **Điều kiện tiên quyết:** Input chứa `01.png` (thiếu audio/txt), `02.mp3` (thiếu ảnh).
- **Các bước thực hiện:**
  1. Chạy lệnh: `p2v validate -i ./input`.
- **Kết quả mong đợi:**
  - CLI in thông báo lỗi rõ ràng liệt kê:
    - File âm thanh/txt thiếu ảnh: `02.mp3`
    - File ảnh thiếu âm thanh/txt: `01.png`
  - Trả về mã thoát (exit code) `1`.

---

### TC-VAL-03: Validate khi phát hiện trùng tên file (trùng basename cùng loại)

- **Mục tiêu:** Kiểm tra phát hiện xung đột khi có nhiều file cùng basename và cùng thuộc nhóm ảnh/âm thanh.
- **Điều kiện tiên quyết:** Input chứa `01.png`, `01.jpg` (trùng basename nhóm ảnh), và `01.mp3`.
- **Các bước thực hiện:**
  1. Chạy lệnh: `p2v validate -i ./input`.
- **Kết quả mong đợi:**
  - CLI cảnh báo trùng lặp file ảnh đối với basename `01`.
  - Trả về mã thoát `1`.

---

## 6. Nhóm 5: Kiểm Thử Các Định Dạng Media & Khung Hình Video

### TC-FMT-01: Kiểm tra các định dạng ảnh được hỗ trợ

- **Mục tiêu:** Đảm bảo công cụ xử lý tốt tất cả định dạng ảnh mở rộng (`.png`, `.jpg`, `.jpeg`, `.webp`).
- **Điều kiện tiên quyết:** Input chứa:
  - `01.png` + `01.mp3`
  - `02.jpg` + `02.mp3`
  - `03.jpeg` + `03.mp3`
  - `04.webp` + `04.mp3`
- **Các bước thực hiện:**
  1. Chạy lệnh: `p2v -i ./input -o ./output -f`.
- **Kết quả mong đợi:**
  - Xử lý thành công cả 4 phân đoạn mà không gặp lỗi định dạng FFmpeg.

---

### TC-FMT-02: Kiểm tra các định dạng âm thanh được hỗ trợ

- **Mục tiêu:** Đảm bảo công cụ xử lý tốt tất cả định dạng audio (`.mp3`, `.wav`, `.m4a`, `.aac`).
- **Điều kiện tiên quyết:** Input chứa 4 phân đoạn tương ứng với 4 đuôi file audio trên.
- **Các bước thực hiện:**
  1. Chạy lệnh: `p2v -i ./input -o ./output -f`.
- **Kết quả mong đợi:**
  - Build thành công, âm thanh tất cả phân đoạn phát bình thường trong `output.mp4`.

---

### TC-FMT-03: Kiểm tra tỉ lệ khung hình (9:16 Portrait) & Fullwidth scaling

- **Mục tiêu:** Đảm bảo video đầu ra có tỉ lệ chuẩn 9:16 (ví dụ 1080x1920) và hình ảnh hiển thị 100% chiều rộng khung hình.
- **Điều kiện tiên quyết:** Input chứa ảnh có độ phân giải ngang/vuông (ví dụ `1920x1080` hoặc `800x800`).
- **Các bước thực hiện:**
  1. Chạy lệnh: `p2v -i ./input -o ./output -f`.
  2. Dùng công cụ kiểm tra thông tin video (FFprobe hoặc VLC Media Player).
- **Kết quả mong đợi:**
  - Độ phân giải video là `1080x1920` (chuẩn Portrait).
  - Chiều rộng ảnh được fit 100% chiều rộng khung hình (1080px), giữ nguyên tỉ lệ gốc của ảnh.

---

### TC-FMT-04: Kiểm tra phông xanh chuyển cảnh giữa các phân đoạn (Chroma Key Green Frame)

- **Mục tiêu:** Đảm bảo phông màu xanh lá (`green`) xuất hiện 0.2 giây ở giữa các phân đoạn.
- **Điều kiện tiên quyết:** Input có từ 2 phân đoạn trở lên (`01`, `02`).
- **Các bước thực hiện:**
  1. Build video: `p2v -i ./input -o ./output -f`.
  2. Mở `output.mp4` trong phần mềm dựng phim (CapCut / Premiere) hoặc tua chậm thời điểm nối giữa bài 1 và bài 2.
- **Kết quả mong đợi:**
  - Xuất hiện màn hình xanh lá cây thuần (Pure Green) chính xác 0.2s giữa phân đoạn 01 và 02.

---

## 7. Nhóm 6: Kiểm Thử Xử Lý Lỗi & Trường Hợp Biên (Edge Cases)

### TC-EDGE-01: Thư mục input không tồn tại

- **Các bước thực hiện:** Chạy `p2v -i ./folder-khong-ton-tai`.
- **Kết quả mong đợi:** CLI thông báo lỗi `Input directory does not exist` và dừng chương trình êm đẹp.

---

### TC-EDGE-02: Thư mục input rỗng

- **Các bước thực hiện:** Chạy `p2v -i ./empty-dir`.
- **Kết quả mong đợi:** CLI thông báo không tìm thấy cặp file media nào hợp lệ để xử lý.

---

### TC-EDGE-03: File văn bản `.txt` chứa kí tự đặc biệt / Tiếng Việt có dấu phức tạp

- **Điều kiện tiên quyết:** `01.txt` chứa đoạn văn tiếng Việt dài có dấu, xuống dòng, dấu câu (`!`, `?`, `"`, `...`).
- **Các bước thực hiện:** Chạy `p2v tts -i ./input -o ./output -f`.
- **Kết quả mong đợi:** Mô hình Piper tổng hợp mượt mà, đọc đúng ngữ điệu, không bị crash do lỗi mã hóa UTF-8.

---

### TC-EDGE-04: Tên file chứa khoảng trắng và ký tự đặc biệt

- **Điều kiện tiên quyết:** Input chứa `bai hat 01 (ban goc).png` và `bai hat 01 (ban goc).mp3`.
- **Các bước thực hiện:** Chạy `p2v -i ./input -o ./output -f`.
- **Kết quả mong đợi:** CLI escape đường dẫn chính xác khi truyền sang FFmpeg, build video thành công.

---

### TC-EDGE-05: Hỗ trợ thư mục hỗn hợp (Mixed Batch: Cả Video + Audio & Video + Text)

- **Điều kiện tiên quyết:** Thư mục input chứa:
  - `01.png` + `01.mp3` (Audio sẵn)
  - `02.jpg` + `02.txt` (Cần chạy TTS)
- **Các bước thực hiện:** Chạy `p2v -i ./input -o ./output -f`.
- **Kết quả mong đợi:**
  - Cả 2 phân đoạn đều được xử lý chính xác và ghép nối liên tục trong `output.mp4`.
