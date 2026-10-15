# Link4M Inspector

Web app giao diện tiếng Việt để phân tích các HTTP redirect có thể quan sát được của Link4M. Triển khai trên Vercel serverless, không cần chạy server trên máy người dùng.

## Tính năng

- Responsive cho điện thoại và máy tính
- Kiểm tra chuỗi HTTP redirect tối đa 8 bước
- Hiển thị mã trạng thái và URL cuối cùng quan sát được
- Báo khi trang yêu cầu quyền truy cập, bị giới hạn hoặc không kết nối được
- Không tự mở URL đích
- Kiểm tra URL cơ bản để hạn chế truy cập địa chỉ mạng nội bộ

## Deploy

1. Mở repository này trên GitHub và kiểm tra các file.
2. Truy cập https://vercel.com/new, import repository `FeaturedPr0ject/link4m-Bypass`.
3. Nhấn Deploy. Không cần biến môi trường hoặc database.

Vercel tự nhận diện `api/resolve.js` là serverless function.

## Tên miền đầu vào

Mặc định cho phép `link4m.com`, `link4m.net`, `link4m.org` và `link4m.app` kể cả subdomain. Cần xác minh tên miền Link4M chính thức; nếu khác, sửa `ALLOWED_START_DOMAINS` trong `api/resolve.js`.

## Giới hạn

- Chỉ theo dõi HTTP Location redirects; không vượt CAPTCHA, đăng nhập, JavaScript redirect hoặc meta refresh.
- Một số website chặn request từ serverless hoặc hoạt động khác nhau khi không dùng trình duyệt.
- URL đích không đồng nghĩa với an toàn. Kiểm tra tên miền trước khi mở.
- Trước khi dùng công khai, nên bổ sung rate limiting và biện pháp kiểm soát outbound networking.
