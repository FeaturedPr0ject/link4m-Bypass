# Link4M Inspector

Ứng dụng web tiếng Việt phân tích chuỗi HTTP redirect công khai của Link4M. Dùng Vercel serverless, không cần chạy server trên máy cá nhân.

## Tính năng
- Giao diện responsive, tối ưu cả điện thoại và máy tính.
- Theo dõi tối đa 8 bước chuyển hướng HTTP.
- Tìm URL MediaFire nếu URL đó thực sự xuất hiện trong nội dung phản hồi được tải về.
- Hiển thị rõ khi không thể xác định đích thay vì đoán URL.
- Chặn URL đầu vào và redirect tới địa chỉ IP nội bộ.
- Không tự động mở URL đích.

## Triển khai
1. Mở https://vercel.com/new và import repository này.
2. Framework preset: Other.
3. Nhấn Deploy. Không cần database hoặc biến môi trường.

Vercel tự triển khai endpoint `api/resolve.js`.

## Giới hạn quan trọng
Một số link Link4M chỉ đưa tới MediaFire sau khi người dùng lấy và nhập mã trên trang trung gian hoặc khi JavaScript chạy trong trình duyệt. API serverless này không thực thi JavaScript, không giải CAPTCHA và không vượt cơ chế mã xác minh. Trong các trường hợp đó, không thể xác định chắc chắn đích thực tế chỉ từ HTTP; kết quả sẽ ghi rõ giới hạn.

Tên miền đầu vào mặc định: `link4m.com`, `link4m.net`, `link4m.org`, `link4m.app`. Hãy xác minh tên miền trước khi sử dụng.
