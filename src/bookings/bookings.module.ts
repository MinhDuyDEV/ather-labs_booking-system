import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingTimeoutService } from './booking-timeout.service';
import { Booking } from './entities/booking.entity';
import { Seat } from 'src/seats/entities/seat.entity';
import { LockingModule } from 'src/locking/locking.module';
import { PaymentsModule } from 'src/payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, Seat]),
    LockingModule,
    PaymentsModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [BookingsController],
  providers: [BookingsService, BookingTimeoutService],
  exports: [BookingsService],
})
export class BookingsModule {}
