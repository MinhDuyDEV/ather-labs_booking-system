# Hệ thống đặt chỗ (Booking System)

Hệ thống đặt chỗ xây dựng với NestJS, áp dụng Distributed Locking và Reservation Timeout để xử lý đặt chỗ đồng thời và quản lý thời gian hết hạn.

## Tính năng

- **Quản lý phòng và chỗ ngồi**: Tạo, cập nhật, xóa phòng và chỗ ngồi
- **Đặt chỗ không cần đăng nhập**: Người dùng có thể đặt chỗ chỉ với email và thông tin cá nhân
- **Distributed Locking**: Ngăn chặn race condition khi nhiều người đặt cùng một chỗ ngồi
- **Reservation Timeout**: Tự động hết hạn các đặt chỗ chưa được xác nhận sau một khoảng thời gian
- **Thanh toán ngẫu nhiên**: Mô phỏng quá trình thanh toán với xác suất thành công 80%
- **Quản lý admin**: Quản lý phòng, chỗ ngồi và xem thông tin đặt chỗ

## Yêu cầu hệ thống

- Node.js (>= 14.x)
- PostgreSQL
- Redis

## Cài đặt

1. Clone repository:

```bash
git clone https://github.com/MinhDuyDEV/ather-labs_booking-system.git
cd booking-system
```

2. Cài đặt các gói phụ thuộc:

```bash
npm install
```

3. Tạo file `.env`:

```bash
touch .env
```

4. Cập nhật các biến môi trường trong file `.env`:

```bash
# Cấu hình ứng dụng
NODE_ENV=development
PORT=3000

# Cấu hình cơ sở dữ liệu
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=booking_system

# Cấu hình Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis123

# Cấu hình JWT
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=1d

# Cấu hình đặt chỗ
BOOKING_TIMEOUT_MINUTES=10
```

5. Khởi tạo cơ sở dữ liệu:

```bash
# Tạo database trong PostgreSQL
createdb booking_system

# Chạy migration (nếu có)
npm run migration:run
```

6. Khởi động ứng dụng:

```bash
# Chế độ phát triển
npm run start:dev

# Chế độ production
npm run build
npm run start:prod
```

## Hướng dẫn test

Dưới đây là luồng test đầy đủ để kiểm tra các tính năng của hệ thống đặt chỗ.

### Bước 1: Đăng ký và đăng nhập (dành cho admin)

#### 1.1. Đăng ký tài khoản admin

```
POST /api/auth/register
```

Body:

```json
{
  "username": "admin",
  "password": "admin123",
  "isAdmin": true
}
```

#### 1.2. Đăng nhập

```
POST /api/auth/login
```

Body:

```json
{
  "username": "admin",
  "password": "admin123"
}
```

Response:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "username": "admin",
    "isAdmin": true
  }
}
```

Lưu `access_token` để sử dụng cho các request yêu cầu xác thực.

### Bước 2: Tạo phòng (cần quyền admin)

#### 2.1. Tạo phòng mới

```
POST /api/rooms
```

Headers:

```
Authorization: Bearer {access_token}
```

Body:

```json
{
  "name": "Phòng chiếu 1",
  "description": "Phòng chiếu phim lớn",
  "rows": 10,
  "columns": 10,
  "isActive": true
}
```

Response:

```json
{
  "id": "room-id-1",
  "name": "Phòng chiếu 1",
  "description": "Phòng chiếu phim lớn",
  "rows": 10,
  "columns": 10,
  "isActive": true,
  "createdAt": "2023-03-09T...",
  "updatedAt": "2023-03-09T..."
}
```

Lưu `id` của phòng để sử dụng cho các bước tiếp theo.

### Bước 3: Tạo chỗ ngồi cho phòng (cần quyền admin)

#### 3.1. Tự động tạo chỗ ngồi cho phòng

```
POST /api/seats/room/{roomId}/generate
```

Headers:

```
Authorization: Bearer {access_token}
```

Thay `{roomId}` bằng ID của phòng đã tạo ở bước 2.

Response:

```json
[
  {
    "id": "seat-id-1",
    "row": 0,
    "column": 0,
    "label": "A1",
    "roomId": "room-id-1",
    "isActive": true,
    "createdAt": "2023-03-09T...",
    "updatedAt": "2023-03-09T..."
  }
  // ... các chỗ ngồi khác
]
```

### Bước 4: Xem danh sách chỗ ngồi trong phòng

#### 4.1. Lấy danh sách chỗ ngồi

```
GET /api/seats/room/{roomId}
```

Thay `{roomId}` bằng ID của phòng.

Response:

```json
[
  {
    "id": "seat-id-1",
    "row": 0,
    "column": 0,
    "label": "A1",
    "roomId": "room-id-1",
    "isActive": true,
    "createdAt": "2023-03-09T...",
    "updatedAt": "2023-03-09T..."
  }
  // ... các chỗ ngồi khác
]
```

Lưu `id` của một chỗ ngồi để sử dụng cho bước tiếp theo.

### Bước 5: Đặt chỗ (không cần đăng nhập)

#### 5.1. Tạo đặt chỗ mới

```
POST /api/bookings
```

Body:

```json
{
  "seatId": "seat-id-1",
  "email": "user@example.com",
  "customerName": "Nguyễn Văn A",
  "phoneNumber": "0123456789"
}
```

Response:

```json
{
  "id": "booking-id-1",
  "seatId": "seat-id-1",
  "email": "user@example.com",
  "customerName": "Nguyễn Văn A",
  "phoneNumber": "0123456789",
  "status": "pending",
  "expiresAt": "2023-03-09T...",
  "confirmationCode": "ABC12345",
  "createdAt": "2023-03-09T...",
  "updatedAt": "2023-03-09T..."
}
```

Lưu `id` của đặt chỗ để sử dụng cho các bước tiếp theo.

### Bước 6: Kiểm tra trạng thái đặt chỗ

#### 6.1. Kiểm tra đặt chỗ

```
GET /api/bookings/check?id={bookingId}&email={email}
```

Thay `{bookingId}` bằng ID của đặt chỗ và `{email}` bằng email đã sử dụng khi đặt chỗ.

Response:

```json
{
  "id": "booking-id-1",
  "seatId": "seat-id-1",
  "email": "user@example.com",
  "customerName": "Nguyễn Văn A",
  "phoneNumber": "0123456789",
  "status": "pending",
  "expiresAt": "2023-03-09T...",
  "confirmationCode": "ABC12345",
  "seat": {
    "id": "seat-id-1",
    "row": 0,
    "column": 0,
    "label": "A1",
    "roomId": "room-id-1",
    "isActive": true
  },
  "createdAt": "2023-03-09T...",
  "updatedAt": "2023-03-09T..."
}
```

### Bước 7: Xác nhận đặt chỗ và thanh toán

#### 7.1. Xác nhận đặt chỗ

```
POST /api/bookings/{bookingId}/confirm
```

Thay `{bookingId}` bằng ID của đặt chỗ.

Body:

```json
{
  "email": "user@example.com"
}
```

Response (nếu thanh toán thành công - 80% xác suất):

```json
{
  "id": "booking-id-1",
  "seatId": "seat-id-1",
  "email": "user@example.com",
  "customerName": "Nguyễn Văn A",
  "phoneNumber": "0123456789",
  "status": "confirmed",
  "confirmationCode": "ABC12345",
  "paymentTransactionId": "transaction-id-1",
  "createdAt": "2023-03-09T...",
  "updatedAt": "2023-03-09T..."
}
```

Response (nếu thanh toán thất bại - 20% xác suất):

```json
{
  "statusCode": 400,
  "message": "Payment processing failed. Please try again.",
  "error": "Bad Request"
}
```

### Bước 8: Hủy đặt chỗ (nếu cần)

#### 8.1. Hủy đặt chỗ

```
DELETE /api/bookings/{bookingId}
```

Thay `{bookingId}` bằng ID của đặt chỗ.

Body:

```json
{
  "email": "user@example.com"
}
```

Response: HTTP 204 No Content (nếu thành công)

### Bước 9: Kiểm tra đặt chỗ đã hết hạn

#### 9.1. Đợi hơn 10 phút sau khi đặt chỗ (hoặc điều chỉnh thời gian hết hạn trong cấu hình)

#### 9.2. Kiểm tra lại trạng thái đặt chỗ

```
GET /api/bookings/check?id={bookingId}&email={email}
```

Response (nếu đã hết hạn):

```json
{
  "id": "booking-id-1",
  "seatId": "seat-id-1",
  "email": "user@example.com",
  "customerName": "Nguyễn Văn A",
  "phoneNumber": "0123456789",
  "status": "expired",
  "confirmationCode": "ABC12345",
  "seat": {
    "id": "seat-id-1",
    "row": 0,
    "column": 0,
    "label": "A1",
    "roomId": "room-id-1",
    "isActive": true
  },
  "createdAt": "2023-03-09T...",
  "updatedAt": "2023-03-09T..."
}
```

### Bước 10: Kiểm tra race condition (đặt chỗ đồng thời)

#### 10.1. Gửi nhiều request đặt chỗ cùng lúc cho cùng một chỗ ngồi

Sử dụng công cụ như Apache JMeter hoặc viết script để gửi nhiều request đồng thời:

```
POST /api/bookings
```

Body:

```json
{
  "seatId": "seat-id-1",
  "email": "user1@example.com",
  "customerName": "Nguyễn Văn A",
  "phoneNumber": "0123456789"
}
```

```json
{
  "seatId": "seat-id-1",
  "email": "user2@example.com",
  "customerName": "Trần Thị B",
  "phoneNumber": "0987654321"
}
```

Chỉ một request sẽ thành công, các request khác sẽ nhận được lỗi:

```json
{
  "statusCode": 409,
  "message": "Seat is already booked or reserved",
  "error": "Conflict"
}
```

## Các trường hợp test khác

1. **Test đặt chỗ đã bị vô hiệu hóa**:

   - Vô hiệu hóa một chỗ ngồi (cần quyền admin)
   - Thử đặt chỗ đó

2. **Test đặt chỗ đã được đặt**:

   - Đặt một chỗ ngồi và xác nhận thành công
   - Thử đặt lại chỗ ngồi đó

3. **Test hủy đặt chỗ đã xác nhận**:

   - Đặt và xác nhận một chỗ ngồi
   - Hủy đặt chỗ đó

4. **Test đặt chỗ sau khi hết hạn**:
   - Đặt một chỗ ngồi nhưng không xác nhận
   - Đợi cho đến khi hết hạn
   - Đặt lại chỗ ngồi đó

## Kiến trúc hệ thống

### Distributed Locking

Hệ thống sử dụng Redis để triển khai distributed locking, đảm bảo rằng chỉ một request có thể xử lý một chỗ ngồi tại một thời điểm. Điều này ngăn chặn race condition khi nhiều người cùng đặt một chỗ ngồi.

### Reservation Timeout

Mỗi đặt chỗ có thời gian hết hạn (mặc định là 10 phút). Nếu người dùng không xác nhận và thanh toán trong thời gian này, đặt chỗ sẽ tự động hết hạn và chỗ ngồi sẽ được giải phóng cho người khác.

### Thanh toán ngẫu nhiên

Hệ thống mô phỏng quá trình thanh toán với xác suất thành công 80%. Trong môi trường thực tế, bạn có thể tích hợp với các cổng thanh toán thực như PayPal, Stripe, v.v.

## License

Nest is [MIT licensed](LICENSE).
