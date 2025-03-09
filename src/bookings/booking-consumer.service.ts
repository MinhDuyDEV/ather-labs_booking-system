import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@Injectable()
export class BookingConsumerService implements OnModuleInit {
  private readonly logger = new Logger(BookingConsumerService.name);
  private readonly BOOKING_REQUESTS_TOPIC = 'booking-requests';

  constructor(
    private readonly kafkaConsumerService: KafkaConsumerService,
    private readonly bookingsService: BookingsService,
  ) {}

  async onModuleInit() {
    // Subscribe to booking requests topic
    await this.kafkaConsumerService.subscribe(
      this.BOOKING_REQUESTS_TOPIC,
      this.handleMessage.bind(this),
    );

    this.logger.log(`Subscribed to topic: ${this.BOOKING_REQUESTS_TOPIC}`);
  }

  async handleMessage(message: any): Promise<void> {
    try {
      this.logger.debug(
        `Processing booking request: ${JSON.stringify(message)}`,
      );

      const { bookingData, requestId } = message;

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

      const createBookingDto: CreateBookingDto = {
        seatId: bookingData.seatId,
        email: bookingData.email,
        customerName: bookingData.customerName,
        phoneNumber: bookingData.phoneNumber,
      };

      const booking =
        await this.bookingsService.createBooking(createBookingDto);

      this.logger.log(
        `Booking created successfully: ${booking.id} for request: ${requestId}`,
      );

      // send notification to the user about the booking status
    } catch (error) {
      this.logger.error(
        `Error processing booking request: ${error.message}`,
        error.stack,
      );

      // implement a retry mechanism or send the failed message to a dead letter queue
    }
  }
}
