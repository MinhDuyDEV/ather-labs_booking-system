import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingTimeoutService } from './booking-timeout.service';
import { BookingConsumerService } from './booking-consumer.service';
import { Booking } from './entities/booking.entity';
import { Seat } from 'src/seats/entities/seat.entity';
import { LockingModule } from 'src/locking/locking.module';
import { PaymentsModule } from 'src/payments/payments.module';
import { KafkaModule } from 'src/kafka/kafka.module';
import { KafkaProducerService } from 'src/kafka/kafka-producer.service';
import { RedisModule } from 'src/redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, Seat]),
    LockingModule,
    PaymentsModule,
    ScheduleModule.forRoot(),
    KafkaModule,
    RedisModule,
  ],
  controllers: [BookingsController],
  providers: [
    BookingsService,
    BookingTimeoutService,
    KafkaProducerService,
    BookingConsumerService,
  ],
  exports: [BookingsService],
})
export class BookingsModule {}
