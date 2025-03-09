import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { RoomsModule } from './rooms/rooms.module';
import { SeatsModule } from './seats/seats.module';

@Module({
  imports: [ConfigModule, DatabaseModule, UsersModule, AuthModule, RoomsModule, SeatsModule],
})
export class AppModule {}
