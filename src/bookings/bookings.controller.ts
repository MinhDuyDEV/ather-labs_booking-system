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
import { RedisService } from 'src/redis/redis.service';

@Controller('bookings')
export class BookingsController {
  private readonly logger = new Logger(BookingsController.name);
  private readonly BOOKING_REQUESTS_TOPIC = 'booking-requests';
  private readonly REQUEST_ID_PREFIX = 'booking:request:';

  constructor(
    private readonly bookingsService: BookingsService,
    private readonly kafkaProducerService: KafkaProducerService,
    private readonly redisService: RedisService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async create(
    @Body() createBookingDto: CreateBookingDto,
  ): Promise<{ requestId: string; message: string; checkStatusUrl: string }> {
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
        // Use the first seatId as the message key for ordering
        // This ensures all bookings for the same seat go to the same partition
        createBookingDto.seatIds.length > 0
          ? createBookingDto.seatIds[0]
          : null,
      );

      return {
        requestId,
        message:
          'Your booking request has been received and is being processed. Please check the status using the provided URL.',
        checkStatusUrl: `/bookings/request/${requestId}`,
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

  @Get('request/:requestId')
  async getBookingByRequestId(
    @Param('requestId') requestId: string,
  ): Promise<
    | { confirmationCode: string; checkBookingsUrl: string }
    | { message: string; error?: any }
  > {
    try {
      const result = await this.redisService.get(
        `${this.REQUEST_ID_PREFIX}${requestId}`,
      );

      if (!result) {
        return {
          message:
            'Booking is still being processed or request ID is invalid. Please try again later.',
        };
      }

      // Kiểm tra xem kết quả có phải là JSON không
      try {
        const parsedResult = JSON.parse(result);

        // Nếu có mã lỗi, đây là thông tin lỗi
        if (parsedResult.code) {
          let errorMessage = 'Failed to create booking.';

          if (parsedResult.code === 'SEATS_ALREADY_BOOKED') {
            errorMessage = `The following seats are already booked: ${parsedResult.seats}. Please select different seats.`;
          } else if (parsedResult.code === 'SEATS_BEING_PROCESSED') {
            errorMessage = `The following seats are currently being processed: ${parsedResult.seats}. Please try again later.`;
          }

          return {
            message: errorMessage,
            error: parsedResult,
          };
        }

        // Nếu không có mã lỗi, có thể là confirmation code dạng JSON
        if (typeof parsedResult === 'string') {
          return {
            confirmationCode: parsedResult,
            checkBookingsUrl: `/bookings/check-group?code=${parsedResult}&email=YOUR_EMAIL`,
          };
        }
      } catch (e) {
        // Nếu không phải JSON, đây là confirmation code dạng string
        return {
          confirmationCode: result,
          checkBookingsUrl: `/bookings/check-group?code=${result}&email=YOUR_EMAIL`,
        };
      }

      // Trường hợp không xác định
      return {
        message: 'Booking status is unknown. Please contact support.',
      };
    } catch (error) {
      this.logger.error(
        `Error getting booking by request ID: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Failed to get booking information',
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

  @Post('confirm-group')
  async confirmGroup(
    @Body('confirmationCode') confirmationCode: string,
    @Body('email') email: string,
  ): Promise<Booking[]> {
    return this.bookingsService.confirmBookingsWithPayment(
      confirmationCode,
      email,
    );
  }

  @Get('check')
  async checkBooking(
    @Query('id') id: string,
    @Query('email') email: string,
  ): Promise<Booking> {
    return this.bookingsService.getBookingByIdAndEmail(id, email);
  }

  @Get('check-group')
  async checkBookingGroup(
    @Query('code') confirmationCode: string,
    @Query('email') email: string,
  ): Promise<Booking[]> {
    return this.bookingsService.getBookingsByConfirmationCode(
      confirmationCode,
      email,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(
    @Param('id') id: string,
    @Body('email') email: string,
  ): Promise<void> {
    await this.bookingsService.cancelBookingByEmail(id, email);
  }

  @Delete('group/:code')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelGroup(
    @Param('code') confirmationCode: string,
    @Body('email') email: string,
  ): Promise<void> {
    await this.bookingsService.cancelBookingsByConfirmationCode(
      confirmationCode,
      email,
    );
  }

  // endpoint for user to get their bookings
  @UseGuards(JwtAuthGuard)
  @Get('user')
  async getUserBookings(@Request() req): Promise<Booking[]> {
    return this.bookingsService.getBookingsByEmail(req.user.email);
  }
}
