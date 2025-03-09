import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Query,
  HttpException,
  Logger,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { Booking } from './entities/booking.entity';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { v4 as uuidv4 } from 'uuid';
import { KafkaProducerService } from 'src/kafka/kafka-producer.service';

@Controller('bookings')
export class BookingsController {
  private readonly logger = new Logger(BookingsController.name);
  private readonly BOOKING_REQUESTS_TOPIC = 'booking-requests';

  constructor(
    private readonly bookingsService: BookingsService,
    private readonly kafkaProducerService: KafkaProducerService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async create(
    @Body() createBookingDto: CreateBookingDto,
  ): Promise<{ requestId: string; message: string }> {
    try {
      const requestId = uuidv4();

      // Send booking request to Kafka
      await this.kafkaProducerService.sendMessage(
        this.BOOKING_REQUESTS_TOPIC,
        {
          bookingData: createBookingDto,
          requestId,
          timestamp: new Date().toISOString(),
        },
        createBookingDto.seatId, // Use seatId as the message key for ordering
      );

      return {
        requestId,
        message:
          'Your booking request has been received and is being processed. Please check your email for confirmation.',
      };
    } catch (error) {
      this.logger.error(
        `Error sending booking request to Kafka: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Failed to process booking request',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/confirm')
  async confirm(
    @Param('id') id: string,
    @Body('email') email: string,
  ): Promise<Booking> {
    return this.bookingsService.confirmBookingWithPayment(id, email);
  }

  @Get('check')
  async checkBooking(
    @Query('id') id: string,
    @Query('email') email: string,
  ): Promise<Booking> {
    return this.bookingsService.getBookingByIdAndEmail(id, email);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(
    @Param('id') id: string,
    @Body('email') email: string,
  ): Promise<void> {
    await this.bookingsService.cancelBookingByEmail(id, email);
  }

  // endpoint for user to get their bookings
  @UseGuards(JwtAuthGuard)
  @Get('user')
  async getUserBookings(@Request() req): Promise<Booking[]> {
    return this.bookingsService.getBookingsByEmail(req.user.email);
  }
}
