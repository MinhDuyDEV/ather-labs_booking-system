import { Module } from '@nestjs/common';
import { LockingService } from './locking.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [LockingService],
  exports: [LockingService],
})
export class LockingModule {}
