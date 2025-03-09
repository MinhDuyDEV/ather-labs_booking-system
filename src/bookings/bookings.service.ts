import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThan } from 'typeorm';
import { Booking, BookingStatus } from './entities/booking.entity';
import { Seat } from '../seats/entities/seat.entity';
import { LockingService } from '../locking/locking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);
  private readonly reservationTimeoutMs: number;

  constructor(
    @InjectRepository(Booking)
    private bookingRepository: Repository<Booking>,
    @InjectRepository(Seat)
    private seatRepository: Repository<Seat>,
    private lockingService: LockingService,
    private dataSource: DataSource,
    private configService: ConfigService,
    private paymentsService: PaymentsService,
  ) {
    // Lấy thời gian timeout từ cấu hình (mặc định là 10 phút)
    const timeoutMinutes = this.configService.get<number>(
      'booking.timeoutMinutes',
      10,
    );
    this.reservationTimeoutMs = timeoutMinutes * 60 * 1000;
  }

  async createBooking(createBookingDto: CreateBookingDto): Promise<Booking> {
    const { seatId, email, customerName, phoneNumber } = createBookingDto;

    // Acquire a distributed lock for the seat
    const lockKey = `seat:${seatId}`;
    const lockToken = await this.lockingService.acquireLock(lockKey);

    if (!lockToken) {
      throw new ConflictException(
        'Seat is currently being processed by another request',
      );
    }

    try {
      // Start a database transaction
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // Check if seat exists
        const seat = await queryRunner.manager.findOne(Seat, {
          where: { id: seatId },
        });

        if (!seat) {
          throw new NotFoundException('Seat not found');
        }

        if (!seat.isActive) {
          throw new BadRequestException('Seat is not available for booking');
        }

        // Check if seat is already booked
        const activeBooking = await queryRunner.manager.findOne(Booking, {
          where: [
            { seatId, status: BookingStatus.CONFIRMED },
            {
              seatId,
              status: BookingStatus.PENDING,
              expiresAt: MoreThan(new Date()),
            },
          ],
        });

        if (activeBooking) {
          throw new ConflictException('Seat is already booked or reserved');
        }

        // Calculate expiration time
        const expiresAt = new Date();
        expiresAt.setTime(expiresAt.getTime() + this.reservationTimeoutMs);

        // Create new booking
        const booking = new Booking();
        booking.seatId = seatId;
        booking.email = email;
        booking.customerName = customerName;
        booking.phoneNumber = phoneNumber;
        booking.status = BookingStatus.PENDING;
        booking.expiresAt = expiresAt;
        booking.confirmationCode = uuidv4().substring(0, 8).toUpperCase();

        const savedBooking = await queryRunner.manager.save(booking);

        // Commit transaction
        await queryRunner.commitTransaction();

        return savedBooking;
      } catch (error) {
        // Rollback transaction in case of error
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        // Release query runner
        await queryRunner.release();
      }
    } finally {
      // Always release the lock
      await this.lockingService.releaseLock(lockKey, lockToken);
    }
  }

  async getBookingByIdAndEmail(
    bookingId: string,
    email: string,
  ): Promise<Booking> {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId, email },
      relations: ['seat', 'seat.room'],
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }

  async getBookingsByEmail(email: string): Promise<Booking[]> {
    return this.bookingRepository.find({
      where: { email },
      relations: ['seat', 'seat.room'],
      order: { createdAt: 'DESC' },
    });
  }

  async cancelBookingByEmail(bookingId: string, email: string): Promise<void> {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId, email },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (
      booking.status !== BookingStatus.PENDING &&
      booking.status !== BookingStatus.CONFIRMED
    ) {
      throw new BadRequestException(
        `Booking cannot be cancelled (current status: ${booking.status})`,
      );
    }

    // Acquire a distributed lock for the seat
    const lockKey = `seat:${booking.seatId}`;
    const lockToken = await this.lockingService.acquireLock(lockKey);

    if (!lockToken) {
      throw new ConflictException(
        'Seat is currently being processed by another request',
      );
    }

    try {
      booking.status = BookingStatus.CANCELLED;
      await this.bookingRepository.save(booking);
    } finally {
      await this.lockingService.releaseLock(lockKey, lockToken);
    }
  }

  async confirmBookingWithPayment(
    bookingId: string,
    email: string,
  ): Promise<Booking> {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId, email },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException(
        `Booking cannot be confirmed (current status: ${booking.status})`,
      );
    }

    if (booking.expiresAt < new Date()) {
      booking.status = BookingStatus.EXPIRED;
      await this.bookingRepository.save(booking);
      throw new BadRequestException('Booking has expired');
    }

    // Acquire a distributed lock for the seat
    const lockKey = `seat:${booking.seatId}`;
    const lockToken = await this.lockingService.acquireLock(lockKey);

    if (!lockToken) {
      throw new ConflictException(
        'Seat is currently being processed by another request',
      );
    }

    try {
      // Xử lý thanh toán
      const paymentResult = await this.paymentsService.processPayment(
        100, // Giả sử giá vé là 100
        email,
      );

      if (!paymentResult.success) {
        throw new BadRequestException(paymentResult.message);
      }

      // Cập nhật trạng thái đặt chỗ
      booking.status = BookingStatus.CONFIRMED;
      booking.expiresAt = null; // Remove expiration for confirmed bookings
      booking.paymentTransactionId = paymentResult.transactionId;

      return await this.bookingRepository.save(booking);
    } finally {
      await this.lockingService.releaseLock(lockKey, lockToken);
    }
  }

  async expireBookings(): Promise<number> {
    const result = await this.bookingRepository
      .createQueryBuilder()
      .update(Booking)
      .set({ status: BookingStatus.EXPIRED })
      .where('status = :status AND expiresAt < :now', {
        status: BookingStatus.PENDING,
        now: new Date(),
      })
      .execute();

    return result.affected || 0;
  }
}
