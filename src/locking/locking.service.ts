import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LockingService {
  private readonly logger = new Logger(LockingService.name);
  private readonly lockPrefix = 'lock:';
  private readonly defaultTTL = 30000; // 30 seconds

  constructor(private readonly redisService: RedisService) {}

  /**
   * Acquire a distributed lock
   * @param resource Resource identifier to lock
   * @param ttl Time-to-live in milliseconds
   * @returns Lock token if successful, null otherwise
   */
  async acquireLock(
    resource: string,
    ttl: number = this.defaultTTL,
  ): Promise<string | null> {
    const token = uuidv4();
    const key = `${this.lockPrefix}${resource}`;

    const redis = this.redisService.getClient();

    // Use SET NX (Not eXists) to ensure atomicity
    const result = await redis.set(key, token, 'PX', ttl, 'NX');

    if (result === 'OK') {
      this.logger.debug(`Lock acquired for ${resource} with token ${token}`);
      return token;
    }

    this.logger.debug(`Failed to acquire lock for ${resource}`);
    return null;
  }

  /**
   * Release a distributed lock
   * @param resource Resource identifier to unlock
   * @param token Lock token to verify ownership
   * @returns true if released successfully, false otherwise
   */
  async releaseLock(resource: string, token: string): Promise<boolean> {
    const key = `${this.lockPrefix}${resource}`;
    const redis = this.redisService.getClient();

    // Use Lua script to ensure atomicity of check-and-delete
    const script = `
      if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1])
      else
        return 0
      end
    `;

    const result = await redis.eval(script, 1, key, token);

    if (result === 1) {
      this.logger.debug(`Lock released for ${resource} with token ${token}`);
      return true;
    }

    this.logger.debug(
      `Failed to release lock for ${resource} with token ${token}`,
    );
    return false;
  }
}
