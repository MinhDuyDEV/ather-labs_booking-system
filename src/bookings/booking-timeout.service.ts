import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingsService } from './bookings.service';

@Injectable()
export class BookingTimeoutService {
  private readonly logger = new Logger(BookingTimeoutService.name);

  constructor(private readonly bookingsService: BookingsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredBookings() {
    this.logger.debug('Checking for expired bookings...');

    try {
      const expiredCount = await this.bookingsService.expireBookings();

      if (expiredCount > 0) {
        this.logger.log(`Expired ${expiredCount} pending bookings`);
      }
    } catch (error) {
      this.logger.error('Error while expiring bookings', error.stack);
    }
  }
}
