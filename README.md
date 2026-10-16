# Link4M Inspector

Ứng dụng web tiếng Việt phân tích chuỗi HTTP redirect công khai của Link4M. Dùng Vercel serverless, không cần chạy server trên máy cá nhân.

## Tính năng
- Giao diện responsive, tối ưu cả điện thoại và máy tính.
- Theo dõi tối đa 8 bước chuyển hướng HTTP.
- Tìm URL MediaFire trong HTML, JSON, chuỗi URL được mã hóa và nội dung Base64 có thể giải mã.
- Phân tích tối đa 3 script cùng miền Link4M, ưu tiên `view.js`, để tìm URL đích được nhúng.
- Dùng Playwright + Chromium headless làm lớp dự phòng để chạy JavaScript của trang và quan sát phản hồi mạng.
- Không trả URL Link4M trung gian như thể đó là link tải cuối; nếu chưa tìm thấy đích thì hiển thị trạng thái chưa xác định.
- Hiển thị rõ khi không thể xác định đích thay vì đoán URL.
- Chặn URL đầu vào và redirect tới địa chỉ IP nội bộ.
- Không tự động mở URL đích.
- Nhận diện CAPTCHA/xác minh phổ biến và cho phép mở trang gốc để người dùng tự hoàn tất.

## Triển khai
1. Mở https://vercel.com/new và import repository này.
2. Framework preset: Other.
3. Nhấn Deploy. Không cần database hoặc biến môi trường.

Vercel tự triển khai endpoint `api/resolve.js`.

## Giới hạn quan trọng
Một số link Link4M chỉ đưa tới MediaFire sau khi người dùng lấy và nhập mã trên trang trung gian hoặc khi JavaScript chạy trong trình duyệt. API serverless này thử theo thứ tự: redirect HTTP, HTML/JSON và chuỗi mã hóa, script cùng miền Link4M, rồi Chromium headless để chạy JavaScript và quan sát phản hồi mạng. Công cụ không giải CAPTCHA, không giả lập lượt truy cập và không vượt qua yêu cầu xác minh của con người. Khi cần xác minh, giao diện cung cấp nút mở trang tương ứng để người dùng tự hoàn tất rồi phân tích lại. Nếu link đích chỉ xuất hiện sau thao tác đó, kết quả tự động có thể vẫn chưa xác định được.

Tên miền đầu vào mặc định: `link4m.com`, `link4m.net`, `link4m.org`, `link4m.app`. Hãy xác minh tên miền trước khi sử dụng.
