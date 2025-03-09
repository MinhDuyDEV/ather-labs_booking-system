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
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { Booking } from './entities/booking.entity';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  async create(@Body() createBookingDto: CreateBookingDto): Promise<Booking> {
    return this.bookingsService.createBooking(createBookingDto);
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
