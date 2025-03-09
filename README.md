# Hệ thống đặt chỗ (Booking System)

Hệ thống đặt chỗ xây dựng với NestJS, áp dụng Distributed Locking, Reservation Timeout và Kafka để xử lý đặt chỗ đồng thời, quản lý thời gian hết hạn và xử lý khối lượng lớn yêu cầu.

## Tính năng

- **Quản lý phòng và chỗ ngồi**: Tạo, cập nhật, xóa phòng và chỗ ngồi
- **Đặt chỗ không cần đăng nhập**: Người dùng có thể đặt chỗ chỉ với email và thông tin cá nhân
- **Distributed Locking**: Ngăn chặn race condition khi nhiều người đặt cùng một chỗ ngồi
- **Reservation Timeout**: Tự động hết hạn các đặt chỗ chưa được xác nhận sau một khoảng thời gian
- **Xử lý bất đồng bộ với Kafka**: Xử lý hàng nghìn yêu cầu đặt chỗ đồng thời
- **Thanh toán ngẫu nhiên**: Mô phỏng quá trình thanh toán với xác suất thành công 80%
- **Quản lý admin**: Quản lý phòng, chỗ ngồi và xem thông tin đặt chỗ

## Kiến trúc hệ thống

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│             │     │             │     │             │     │             │
│  API Layer  │────▶│   Kafka     │────▶│  Consumer   │────▶│  Database   │
│             │     │   Broker    │     │  Service    │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                                        │                  ▲
       │                                        │                  │
       │                                        ▼                  │
       │                               ┌─────────────┐            │
       │                               │             │            │
       └──────────────────────────────▶│   Redis     │────────────┘
                                       │  (Locking)  │
                                       │             │
                                       └─────────────┘
```

### Luồng xử lý đặt chỗ

1. **API Layer** nhận yêu cầu đặt chỗ và gửi đến **Kafka Broker**
2. **Consumer Service** lấy yêu cầu từ Kafka và xử lý:
   - Sử dụng **Redis** để thực hiện Distributed Locking
   - Kiểm tra tính khả dụng của chỗ ngồi
   - Tạo đặt chỗ trong **Database**
   - Thiết lập thời gian hết hạn (Reservation Timeout)
3. **BookingTimeoutService** định kỳ kiểm tra và cập nhật trạng thái các đặt chỗ hết hạn

## Yêu cầu hệ thống

- Node.js (>= 14.x)
- PostgreSQL
- Redis
- Kafka & Zookeeper

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

# Cấu hình Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=booking-system
KAFKA_GROUP_ID=booking-system-group
```

5. Khởi động các dịch vụ với Docker Compose:

```bash
docker-compose up -d
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
  "createdAt": "2025-02-02T...",
  "updatedAt": "2025-02-02T..."
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
    "createdAt": "2025-02-02T...",
    "updatedAt": "2025-02-02T..."
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
    "createdAt": "2025-02-02T...",
    "updatedAt": "2025-02-02T..."
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

Response (với Kafka):

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Your booking request has been received and is being processed. Please check your email for confirmation."
}
```

**Lưu ý**: Với kiến trúc Kafka, yêu cầu đặt chỗ được xử lý bất đồng bộ. Bạn sẽ nhận được một `requestId` và cần đợi một khoảng thời gian ngắn để yêu cầu được xử lý.

### Bước 6: Kiểm tra trạng thái đặt chỗ

#### 6.1. Kiểm tra trạng thái

```
GET /api/bookings/check?id={bookingId}&email={email}
```

Thay `{bookingId}` bằng ID của đặt chỗ và `{email}` bằng email đã sử dụng để đặt chỗ.

**Lưu ý**: Với kiến trúc Kafka, bạn cần biết `bookingId`. Trong môi trường thực tế, bạn có thể:

- Kiểm tra logs để tìm ID
- Triển khai một endpoint để kiểm tra trạng thái theo requestId
- Gửi email thông báo với booking ID

Response:

```json
{
  "id": "booking-id-1",
  "seatId": "seat-id-1",
  "email": "user@example.com",
  "customerName": "Nguyễn Văn A",
  "phoneNumber": "0123456789",
  "status": "pending",
  "expiresAt": "2025-02-02T...",
  "createdAt": "2025-02-02T...",
  "updatedAt": "2025-02-02T..."
}
```

### Bước 7: Xác nhận đặt chỗ và thanh toán

#### 7.1. Xác nhận đặt chỗ

```
POST /api/bookings/{bookingId}/confirm
```

Body:

```json
{
  "email": "user@example.com"
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
  "status": "confirmed",
  "paymentTransactionId": "payment-id-1",
  "expiresAt": null,
  "createdAt": "2025-02-02T...",
  "updatedAt": "2025-02-02T..."
}
```

### Bước 8: Hủy đặt chỗ

#### 8.1. Hủy đặt chỗ

```
DELETE /api/bookings/{bookingId}
```

Body:

```json
{
  "email": "user@example.com"
}
```

Response: 204 No Content

### Bước 9: Kiểm tra đặt chỗ hết hạn

Đợi thời gian timeout (mặc định 10 phút) và kiểm tra trạng thái đặt chỗ:

```
GET /api/bookings/check?id={bookingId}&email={email}
```

Response:

```json
{
  "id": "booking-id-1",
  "seatId": "seat-id-1",
  "email": "user@example.com",
  "customerName": "Nguyễn Văn A",
  "phoneNumber": "0123456789",
  "status": "expired",
  "expiresAt": "2025-02-02T...",
  "createdAt": "2025-02-02T...",
  "updatedAt": "2025-02-02T..."
}
```

### Bước 10: Test race condition

Để test race condition, gửi nhiều yêu cầu đặt chỗ đồng thời cho cùng một chỗ ngồi:

1. Gửi nhiều yêu cầu đồng thời cho cùng một ghế
2. Tất cả các yêu cầu đều nhận được requestId (status 202)
3. Chỉ một yêu cầu được xử lý thành công, các yêu cầu khác sẽ thất bại khi xử lý
4. Kiểm tra trạng thái của từng yêu cầu để xác định yêu cầu nào thành công

## Các trường hợp test bổ sung

1. **Test đặt chỗ đã bị vô hiệu hóa**: Thử đặt chỗ đã bị vô hiệu hóa (isActive = false)
2. **Test đặt chỗ đã được đặt**: Thử đặt chỗ đã được đặt và xác nhận
3. **Test xác nhận đặt chỗ đã xác nhận**: Thử xác nhận đặt chỗ đã được xác nhận
4. **Test xác nhận đặt chỗ đã hết hạn**: Thử xác nhận đặt chỗ đã hết hạn

## Kiến trúc chi tiết

### Kafka trong hệ thống đặt chỗ

Kafka được sử dụng để xử lý khối lượng lớn yêu cầu đặt chỗ đồng thời. Luồng xử lý như sau:

1. **API Layer** nhận yêu cầu đặt chỗ và gửi đến topic `booking-requests` trong Kafka
2. **BookingConsumerService** đăng ký với topic `booking-requests` và xử lý các yêu cầu
3. Khi xử lý yêu cầu, **BookingConsumerService** sử dụng **Distributed Locking** để đảm bảo không có race condition
4. Sau khi tạo đặt chỗ, **Reservation Timeout** được thiết lập để tự động hết hạn các đặt chỗ chưa được xác nhận

### Distributed Locking + Kafka

Hệ thống kết hợp cả Kafka và Distributed Locking để tận dụng ưu điểm của cả hai phương pháp:

- **Kafka** xử lý việc nhận và xếp hàng các yêu cầu đặt chỗ, đảm bảo không mất yêu cầu ngay cả khi hệ thống quá tải
- **Distributed Locking** đảm bảo xử lý tuần tự cho mỗi chỗ ngồi, ngăn chặn race condition
- **Reservation Timeout** quản lý vòng đời của các đặt chỗ, tự động giải phóng chỗ ngồi không được xác nhận

Kiến trúc kết hợp này cho phép:

- Xử lý hàng nghìn yêu cầu đồng thời
- Đảm bảo không có race condition
- Tự động giải phóng chỗ ngồi không được xác nhận
- Khả năng phục hồi cao khi hệ thống gặp sự cố

## Quản lý Kafka

Bạn có thể truy cập Kafka UI tại http://localhost:8080 để quản lý Kafka:

- Xem danh sách topics
- Xem messages trong topics
- Xem danh sách consumers và consumer groups
- Theo dõi trạng thái của Kafka cluster

## License

MIT
