import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { RoomsModule } from './rooms/rooms.module';
import { SeatsModule } from './seats/seats.module';
import { BookingsModule } from './bookings/bookings.module';
import { PaymentsModule } from './payments/payments.module';
import { RedisModule } from './redis/redis.module';
import { LockingModule } from './locking/locking.module';
import { KafkaModule } from './kafka/kafka.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    UsersModule,
    AuthModule,
    RoomsModule,
    SeatsModule,
    RedisModule,
    LockingModule,
    PaymentsModule,
    BookingsModule,
    KafkaModule,
  ],
})
export class AppModule {}
