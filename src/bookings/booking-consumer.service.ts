import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { RedisService } from '../redis/redis.service';
import { Interval } from '@nestjs/schedule';

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
      const existingBookingId = await this.redisService.get(
        `${this.REQUEST_ID_PREFIX}${requestId}`,
      );

      if (existingBookingId) {
        this.logger.log(
          `Request ${requestId} already processed with booking ID ${existingBookingId}. Skipping.`,
        );
        return;
      }

      if (
        !bookingData ||
        !bookingData.seatId ||
        !bookingData.email ||
        !bookingData.customerName
      ) {
        this.logger.error(
          `Invalid booking data: ${JSON.stringify(bookingData)}`,
        );
        return;
      }

      this.logger.log(
        `Creating booking for seat ${bookingData.seatId} and email ${bookingData.email}`,
      );

      const createBookingDto: CreateBookingDto = {
        seatId: bookingData.seatId,
        email: bookingData.email,
        customerName: bookingData.customerName,
        phoneNumber: bookingData.phoneNumber,
      };

      // Use a try-catch block specifically for the booking creation
      try {
        const booking =
          await this.bookingsService.createBooking(createBookingDto);

        // Store the mapping between requestId and bookingId in Redis
        await this.redisService.set(
          `${this.REQUEST_ID_PREFIX}${requestId}`,
          booking.id,
          this.REQUEST_ID_EXPIRY,
        );

        this.logger.log(
          `Booking created successfully: ${booking.id} for request: ${requestId}`,
        );

        // send notification to the user about the booking status
      } catch (bookingError) {
        this.logger.error(
          `Error creating booking: ${bookingError.message}`,
          bookingError.stack,
        );

        // If the seat is already booked, we can mark this request as processed
        // to avoid retrying it unnecessarily
        if (bookingError.message.includes('already booked')) {
          await this.redisService.set(
            `${this.REQUEST_ID_PREFIX}${requestId}`,
            'CONFLICT',
            this.REQUEST_ID_EXPIRY,
          );
          this.logger.log(
            `Marked request ${requestId} as conflicted (seat already booked)`,
          );
        }

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
