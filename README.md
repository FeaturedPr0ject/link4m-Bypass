# Link4M Inspector

Ứng dụng web tiếng Việt phân tích chuỗi HTTP redirect công khai của Link4M. Dùng Vercel serverless, không cần chạy server trên máy cá nhân.

## Tính năng
- Giao diện responsive, tối ưu cả điện thoại và máy tính.
- Theo dõi tối đa 8 bước chuyển hướng HTTP.
- Tìm URL MediaFire trong HTML, JSON, chuỗi URL được mã hóa và nội dung Base64 có thể giải mã.
- Phân tích tối đa 3 script cùng miền Link4M, ưu tiên `view.js`, để tìm URL đích được nhúng.
- Không trả URL Link4M trung gian như thể đó là link tải cuối; nếu chưa tìm thấy đích thì hiển thị trạng thái chưa xác định.
- Hiển thị rõ khi không thể xác định đích thay vì đoán URL.
- Chặn URL đầu vào và redirect tới địa chỉ IP nội bộ.
- Không tự động mở URL đích.

## Triển khai
1. Mở https://vercel.com/new và import repository này.
2. Framework preset: Other.
3. Nhấn Deploy. Không cần database hoặc biến môi trường.

Vercel tự triển khai endpoint `api/resolve.js`.

## Giới hạn quan trọng
Một số link Link4M chỉ đưa tới MediaFire sau khi người dùng lấy và nhập mã trên trang trung gian hoặc khi JavaScript chạy trong trình duyệt. API serverless này không chạy toàn bộ JavaScript của trang trong trình duyệt và không giải CAPTCHA, mật khẩu hoặc mã xác minh. Nó phân tích HTML/JSON, chuỗi mã hóa và tối đa 3 script cùng miền Link4M; nếu URL gốc chỉ được trả về sau một quy trình tương tác/xác minh hoặc API động chưa biết, kết quả vẫn có thể chưa xác định được.

Tên miền đầu vào mặc định: `link4m.com`, `link4m.net`, `link4m.org`, `link4m.app`. Hãy xác minh tên miền trước khi sử dụng.
