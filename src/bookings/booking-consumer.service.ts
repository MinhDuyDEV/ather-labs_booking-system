import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { RedisService } from '../redis/redis.service';
import { Interval } from '@nestjs/schedule';

// Định nghĩa interface cho thông tin lỗi
interface BookingErrorInfo {
  message: string;
  code: string;
  seats?: string;
}

@Injectable()
export class BookingConsumerService implements OnModuleInit {
  private readonly logger = new Logger(BookingConsumerService.name);
  private readonly BOOKING_REQUESTS_TOPIC = 'booking-requests';
  private readonly REQUEST_ID_PREFIX = 'booking:request:';
  private readonly REQUEST_ID_EXPIRY = 60 * 60; // 1 hour in seconds
  private isSubscribed = false;
  private retryCount = 0;
  private readonly MAX_RETRIES = 30; // Increased from 10 to 30
  private readonly RETRY_INTERVAL = 10000; // 10 seconds
  private readonly INITIAL_RETRY_DELAY = 5000; // 5 seconds

  constructor(
    private readonly kafkaConsumerService: KafkaConsumerService,
    private readonly bookingsService: BookingsService,
    private readonly redisService: RedisService,
  ) {
    this.logger.log('BookingConsumerService initialized');
  }

  async onModuleInit() {
    this.logger.log('BookingConsumerService onModuleInit called');
    // Add a delay before the first subscription attempt to allow Kafka to fully initialize
    setTimeout(() => this.trySubscribe(), this.INITIAL_RETRY_DELAY);
  }

  @Interval(10000) // Try every 10 seconds if not subscribed
  async retrySubscription() {
    if (!this.isSubscribed && this.retryCount < this.MAX_RETRIES) {
      this.logger.log(
        `Retrying subscription to topic: ${this.BOOKING_REQUESTS_TOPIC} (Attempt ${this.retryCount + 1}/${this.MAX_RETRIES})`,
      );
      await this.trySubscribe();
    }
  }

  private async trySubscribe() {
    try {
      this.logger.log(
        `Attempting to subscribe to topic: ${this.BOOKING_REQUESTS_TOPIC}`,
      );

      // Subscribe to booking requests topic
      await this.kafkaConsumerService.subscribe(
        this.BOOKING_REQUESTS_TOPIC,
        this.handleMessage.bind(this),
      );

      this.logger.log(
        `Successfully registered handler for topic: ${this.BOOKING_REQUESTS_TOPIC}`,
      );
      this.isSubscribed = true;
      this.retryCount = 0; // Reset retry count on success
    } catch (error) {
      this.retryCount++;
      const backoffTime = Math.min(
        this.RETRY_INTERVAL * Math.pow(1.5, this.retryCount - 1),
        60000, // Max 1 minute
      );

      this.logger.error(
        `Error subscribing to topic ${this.BOOKING_REQUESTS_TOPIC} (Attempt ${this.retryCount}/${this.MAX_RETRIES}): ${error.message}. Retrying in ${backoffTime}ms.`,
        error.stack,
      );

      if (this.retryCount >= this.MAX_RETRIES) {
        this.logger.error(
          `Maximum retry attempts reached. Failed to subscribe to topic: ${this.BOOKING_REQUESTS_TOPIC}`,
        );
      }
    }
  }

  async handleMessage(message: any): Promise<void> {
    try {
      this.logger.log(
        `Received message from Kafka topic ${this.BOOKING_REQUESTS_TOPIC}`,
      );
      this.logger.debug(
        `Processing booking request: ${JSON.stringify(message)}`,
      );

      const { bookingData, requestId } = message;

      if (!requestId) {
        this.logger.error('Message missing requestId, cannot process');
        return;
      }

      // Check if this request has already been processed
      const existingConfirmationCode = await this.redisService.get(
        `${this.REQUEST_ID_PREFIX}${requestId}`,
      );

      if (existingConfirmationCode) {
        this.logger.log(
          `Request ${requestId} already processed with confirmation code ${existingConfirmationCode}. Skipping.`,
        );
        return;
      }

      if (
        !bookingData ||
        !bookingData.seatIds ||
        !Array.isArray(bookingData.seatIds) ||
        bookingData.seatIds.length === 0 ||
        !bookingData.email ||
        !bookingData.customerName
      ) {
        this.logger.error(
          `Invalid booking data: ${JSON.stringify(bookingData)}`,
        );
        return;
      }

      this.logger.log(
        `Creating booking for seats [${bookingData.seatIds.join(', ')}] and email ${bookingData.email}`,
      );

      const createBookingDto: CreateBookingDto = {
        seatIds: bookingData.seatIds,
        email: bookingData.email,
        customerName: bookingData.customerName,
        phoneNumber: bookingData.phoneNumber,
      };

      // Use a try-catch block specifically for the booking creation
      try {
        const bookings =
          await this.bookingsService.createBooking(createBookingDto);

        if (bookings.length === 0) {
          throw new Error('No bookings were created');
        }

        // All bookings will have the same confirmation code
        const confirmationCode = bookings[0].confirmationCode;

        // Store the mapping between requestId and confirmationCode in Redis
        await this.redisService.set(
          `${this.REQUEST_ID_PREFIX}${requestId}`,
          confirmationCode,
          this.REQUEST_ID_EXPIRY,
        );

        this.logger.log(
          `${bookings.length} bookings created successfully with confirmation code: ${confirmationCode} for request: ${requestId}`,
        );

        // send notification to the user about the booking status
      } catch (bookingError) {
        this.logger.error(
          `Error creating booking: ${bookingError.message}`,
          bookingError.stack,
        );

        // Lưu thông tin chi tiết về lỗi
        let errorInfo: BookingErrorInfo = {
          message: bookingError.message,
          code: 'BOOKING_ERROR',
        };

        // Nếu là lỗi ghế đã được đặt, lưu thông tin chi tiết hơn
        if (bookingError.message.includes('already booked or reserved')) {
          errorInfo = {
            message: bookingError.message,
            code: 'SEATS_ALREADY_BOOKED',
            seats: bookingError.message.split(
              'already booked or reserved: ',
            )[1],
          };
        } else if (bookingError.message.includes('being processed')) {
          errorInfo = {
            message: bookingError.message,
            code: 'SEATS_BEING_PROCESSED',
            seats: bookingError.message.split(
              'being processed by another request: ',
            )[1],
          };
        }

        // Lưu thông tin lỗi vào Redis để có thể trả về cho người dùng
        await this.redisService.set(
          `${this.REQUEST_ID_PREFIX}${requestId}`,
          JSON.stringify(errorInfo),
          this.REQUEST_ID_EXPIRY,
        );

        this.logger.log(
          `Marked request ${requestId} as failed with error: ${JSON.stringify(errorInfo)}`,
        );

        // Re-throw to be caught by the outer try-catch
        throw bookingError;
      }
    } catch (error) {
      this.logger.error(
        `Error processing booking request: ${error.message}`,
        error.stack,
      );

      // Here you could implement a retry mechanism or send the failed message to a dead letter queue
      // For example, store failed messages in Redis with a TTL for later processing
    }
  }
}
