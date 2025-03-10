# Hệ thống đặt chỗ (Booking System)

Hệ thống đặt chỗ xây dựng với NestJS, áp dụng Distributed Locking, Reservation Timeout và Kafka để xử lý đặt chỗ đồng thời, quản lý thời gian hết hạn và xử lý khối lượng lớn yêu cầu.

## Tính năng

- **Quản lý phòng và chỗ ngồi**: Tạo, cập nhật, xóa phòng và chỗ ngồi
- **Đặt chỗ không cần đăng nhập**: Người dùng có thể đặt chỗ chỉ với email và thông tin cá nhân
- **Đặt nhiều ghế cùng lúc**: Hỗ trợ đặt tối đa 10 ghế trong một lần đặt chỗ
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
   - Sử dụng **Redis** để thực hiện Distributed Locking cho tất cả các ghế được yêu cầu
   - Kiểm tra tính khả dụng của tất cả các ghế
   - Tạo đặt chỗ trong **Database** với cùng một mã xác nhận
   - Thiết lập thời gian hết hạn (Reservation Timeout)
3. **BookingTimeoutService** định kỳ kiểm tra và cập nhật trạng thái các đặt chỗ hết hạn

## Yêu cầu hệ thống

- Node.js (>= 14.x)
- PostgreSQL
- Redis
- Kafka & Zookeeper
- Docker & Docker Compose (tùy chọn)

## Cài đặt

### Phương pháp 1: Sử dụng Docker Compose (Khuyến nghị)

1. Clone repository:

```bash
git clone https://github.com/MinhDuyDEV/ather-labs_booking-system.git
cd booking-system
```

2. Tạo file `.env`:

```bash
touch .env
```

3. Cập nhật các biến môi trường trong file `.env`:

```bash
# Cấu hình ứng dụng
NODE_ENV=development
PORT=3000

# Cấu hình cơ sở dữ liệu
DB_HOST=db
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=booking-system

# Cấu hình Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=

# Cấu hình JWT
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=1d

# Cấu hình đặt chỗ
BOOKING_TIMEOUT_MINUTES=10

# Cấu hình Kafka
KAFKA_BROKERS=kafka:29092
KAFKA_CLIENT_ID=booking-system
KAFKA_GROUP_ID=booking-system-group
```

4. Khởi động tất cả các dịch vụ với Docker Compose:

```bash
# Môi trường phát triển (với hot-reload)
docker-compose up -d

# Môi trường production
docker-compose -f docker-compose.prod.yml up -d
```

Ứng dụng sẽ chạy tại http://localhost:3000

### Phương pháp 2: Cài đặt thủ công

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
DB_DATABASE=booking-system

# Cấu hình Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

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

5. Khởi động các dịch vụ phụ thuộc với Docker Compose:

```bash
docker-compose up -d db redis zookeeper kafka kafka-ui
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

### Bước 1: đăng nhập (dành cho admin)

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
  "description": "Phòng chiếu phim số 1",
  "rows": 10,
  "columns": 10
}
```

Response:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Phòng chiếu 1",
  "description": "Phòng chiếu phim số 1",
  "rows": 10,
  "columns": 10,
  "createdAt": "2023-09-01T12:00:00.000Z",
  "updatedAt": "2023-09-01T12:00:00.000Z"
}
```

### Bước 3: Tạo ghế cho phòng

#### 3.1. Tạo ghế tự động

```
POST /api/seats/room/{roomId}/generate
```

Headers:

```
Authorization: Bearer {access_token}
```

Response:

```json
{
  "message": "100 seats generated successfully"
}
```

### Bước 4: Lấy danh sách ghế trong phòng

```
GET /api/seats/room/{roomId}
```

Response:

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "row": 1,
    "column": 1,
    "label": "A1",
    "isActive": true,
    "price": 100.0,
    "roomId": "550e8400-e29b-41d4-a716-446655440000"
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "row": 1,
    "column": 2,
    "label": "A2",
    "isActive": true,
    "price": 100.0,
    "roomId": "550e8400-e29b-41d4-a716-446655440000"
  }
  // ...
]
```

### Bước 5: Đặt chỗ (không cần đăng nhập)

#### 5.1. Đặt một ghế

```
POST /api/bookings
```

Body:

```json
{
  "seatIds": ["550e8400-e29b-41d4-a716-446655440001"],
  "email": "user@example.com",
  "customerName": "Nguyễn Văn A",
  "phoneNumber": "0123456789"
}
```

Response:

```json
{
  "requestId": "7f9c24e0-3f70-4b9a-bf4b-8b984dc4cd3d",
  "message": "Your booking request has been received and is being processed. Please check the status using the provided URL.",
  "checkStatusUrl": "/bookings/request/7f9c24e0-3f70-4b9a-bf4b-8b984dc4cd3d"
}
```

#### 5.2. Đặt nhiều ghế cùng lúc

```
POST /api/bookings
```

Body:

```json
{
  "seatIds": [
    "550e8400-e29b-41d4-a716-446655440001",
    "550e8400-e29b-41d4-a716-446655440002",
    "550e8400-e29b-41d4-a716-446655440003"
  ],
  "email": "user@example.com",
  "customerName": "Nguyễn Văn A",
  "phoneNumber": "0123456789"
}
```

Response:

```json
{
  "requestId": "7f9c24e0-3f70-4b9a-bf4b-8b984dc4cd3d",
  "message": "Your booking request has been received and is being processed. Please check the status using the provided URL.",
  "checkStatusUrl": "/bookings/request/7f9c24e0-3f70-4b9a-bf4b-8b984dc4cd3d"
}
```

#### 5.3. Đặt ghế đã được đặt trước đó

Nếu bạn cố gắng đặt ghế đã được người khác đặt trước đó (kể cả khi ghế đó chỉ đang ở trạng thái PENDING và chưa hết hạn), hệ thống sẽ trả về thông báo lỗi chi tiết:

```
GET /api/bookings/request/{requestId}
```

Response:

```json
{
  "message": "The following seats are already booked: A1, A2. Please select different seats.",
  "error": {
    "message": "The following seats are already booked or reserved: A1, A2",
    "code": "SEATS_ALREADY_BOOKED",
    "seats": "A1, A2"
  }
}
```

### Bước 6: Kiểm tra trạng thái đặt chỗ

```
GET /api/bookings/request/{requestId}
```

Response (nếu đã xử lý xong):

```json
{
  "confirmationCode": "ABC12345",
  "checkBookingsUrl": "/bookings/check-group?code=ABC12345&email=YOUR_EMAIL"
}
```

### Bước 7: Xem chi tiết đặt chỗ

#### 7.1. Xem chi tiết một đặt chỗ

```
GET /api/bookings/check?id={bookingId}&email={email}
```

Response:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440010",
  "email": "user@example.com",
  "customerName": "Nguyễn Văn A",
  "phoneNumber": "0123456789",
  "seatId": "550e8400-e29b-41d4-a716-446655440001",
  "status": "pending",
  "expiresAt": "2023-09-01T12:10:00.000Z",
  "confirmationCode": "ABC12345",
  "createdAt": "2023-09-01T12:00:00.000Z",
  "updatedAt": "2023-09-01T12:00:00.000Z",
  "seat": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "label": "A1",
    "price": 100.0
  }
}
```

#### 7.2. Xem chi tiết nhiều đặt chỗ cùng mã xác nhận

```
GET /api/bookings/check-group?code={confirmationCode}&email={email}
```

Response:

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440010",
    "email": "user@example.com",
    "customerName": "Nguyễn Văn A",
    "phoneNumber": "0123456789",
    "seatId": "550e8400-e29b-41d4-a716-446655440001",
    "status": "pending",
    "expiresAt": "2023-09-01T12:10:00.000Z",
    "confirmationCode": "ABC12345",
    "createdAt": "2023-09-01T12:00:00.000Z",
    "updatedAt": "2023-09-01T12:00:00.000Z",
    "seat": {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "label": "A1",
      "price": 100.0
    }
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440011",
    "email": "user@example.com",
    "customerName": "Nguyễn Văn A",
    "phoneNumber": "0123456789",
    "seatId": "550e8400-e29b-41d4-a716-446655440002",
    "status": "pending",
    "expiresAt": "2023-09-01T12:10:00.000Z",
    "confirmationCode": "ABC12345",
    "createdAt": "2023-09-01T12:00:00.000Z",
    "updatedAt": "2023-09-01T12:00:00.000Z",
    "seat": {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "label": "A2",
      "price": 100.0
    }
  }
]
```

### Bước 8: Xác nhận đặt chỗ và thanh toán

#### 8.1. Xác nhận một đặt chỗ

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
  "id": "550e8400-e29b-41d4-a716-446655440010",
  "email": "user@example.com",
  "customerName": "Nguyễn Văn A",
  "phoneNumber": "0123456789",
  "seatId": "550e8400-e29b-41d4-a716-446655440001",
  "status": "confirmed",
  "expiresAt": null,
  "confirmationCode": "ABC12345",
  "paymentTransactionId": "tx_123456789",
  "createdAt": "2023-09-01T12:00:00.000Z",
  "updatedAt": "2023-09-01T12:05:00.000Z"
}
```

#### 8.2. Xác nhận nhiều đặt chỗ cùng lúc

```
POST /api/bookings/confirm-group
```

Body:

```json
{
  "confirmationCode": "ABC12345",
  "email": "user@example.com"
}
```

Response:

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440010",
    "status": "confirmed",
    "paymentTransactionId": "tx_123456789"
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440011",
    "status": "confirmed",
    "paymentTransactionId": "tx_123456789"
  }
]
```

### Bước 9: Hủy đặt chỗ

#### 9.1. Hủy một đặt chỗ

```
DELETE /api/bookings/{bookingId}
```

Body:

```json
{
  "email": "user@example.com"
}
```

#### 9.2. Hủy nhiều đặt chỗ cùng lúc

```
DELETE /api/bookings/group/{confirmationCode}
```

Body:

```json
{
  "email": "user@example.com"
}
```

### Bước 10: Kiểm tra đặt chỗ hết hạn

Sau khi đợi thời gian timeout (mặc định 10 phút), kiểm tra lại trạng thái đặt chỗ:

```
GET /api/bookings/check?id={bookingId}&email={email}
```

Response:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440010",
  "status": "expired",
  "expiresAt": "2023-09-01T12:10:00.000Z"
}
```

### Bước 11: Test race condition

Để test race condition, gửi nhiều request đặt chỗ cùng một ghế đồng thời:

1. Sử dụng công cụ như Apache Benchmark hoặc wrk để gửi nhiều request cùng lúc
2. Chỉ một request sẽ thành công, các request khác sẽ nhận được lỗi 409 Conflict

```bash
ab -n 10 -c 10 -p booking-payload.json -T application/json http://localhost:3000/api/bookings
```

## Các trường hợp test bổ sung

1. **Đặt ghế đã bị vô hiệu hóa**: Sẽ nhận được lỗi 400 Bad Request
2. **Đặt ghế đã được đặt**: Sẽ nhận được thông báo lỗi chi tiết về các ghế đã được đặt, bao gồm tên ghế cụ thể
3. **Xác nhận đặt chỗ đã xác nhận**: Sẽ nhận được lỗi 400 Bad Request
4. **Xác nhận đặt chỗ đã hết hạn**: Sẽ nhận được lỗi 400 Bad Request
5. **Đặt nhiều ghế khi một số ghế không khả dụng**: Sẽ nhận được lỗi chi tiết với danh sách các ghế không khả dụng

## Lưu ý

- Thời gian hết hạn đặt chỗ mặc định là 10 phút, có thể thay đổi trong file `.env`
- Hệ thống sử dụng Distributed Locking để ngăn chặn race condition khi nhiều người đặt cùng một chỗ ngồi
- Khi đặt nhiều ghế cùng lúc, nếu một ghế không khả dụng, toàn bộ yêu cầu sẽ bị từ chối
- Hệ thống sẽ ngay lập tức trả về lỗi khi người dùng cố gắng đặt ghế đã được đặt trước đó (kể cả khi ghế đó chỉ đang ở trạng thái PENDING và chưa hết hạn)
- Thông báo lỗi sẽ bao gồm thông tin chi tiết về các ghế đã được đặt, giúp người dùng dễ dàng chọn ghế khác

## Đóng góp

Vui lòng xem file [CONTRIBUTING.md](CONTRIBUTING.md) để biết thêm chi tiết.

## Giấy phép

Dự án này được cấp phép theo giấy phép MIT - xem file [LICENSE](LICENSE) để biết thêm chi tiết.
