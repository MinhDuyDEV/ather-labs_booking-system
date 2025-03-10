import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThan, In } from 'typeorm';
import { Booking, BookingStatus } from './entities/booking.entity';
import { Seat } from '../seats/entities/seat.entity';
import { LockingService } from '../locking/locking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { PaymentsService } from '../payments/payments.service';

interface LockResult {
  success: boolean;
  lockedSeats: string[];
  failedSeats: string[];
  lockTokens: Map<string, string>;
}

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

  /**
   * Acquire locks for multiple seats
   * @param seatIds Array of seat IDs to lock
   * @returns LockResult object with success status and details
   */
  private async acquireMultipleLocks(seatIds: string[]): Promise<LockResult> {
    const lockTokens = new Map<string, string>();
    const lockedSeats: string[] = [];
    const failedSeats: string[] = [];

    // Try to acquire locks for all seats
    for (const seatId of seatIds) {
      const lockKey = `seat:${seatId}`;
      const lockToken = await this.lockingService.acquireLock(lockKey);

      if (lockToken) {
        lockTokens.set(seatId, lockToken);
        lockedSeats.push(seatId);
      } else {
        failedSeats.push(seatId);
      }
    }

    // If any seat failed to lock, release all acquired locks
    if (failedSeats.length > 0) {
      for (const seatId of lockedSeats) {
        const lockKey = `seat:${seatId}`;
        const lockToken = lockTokens.get(seatId);
        await this.lockingService.releaseLock(lockKey, lockToken);
      }
      return {
        success: false,
        lockedSeats: [],
        failedSeats,
        lockTokens: new Map(),
      };
    }

    return {
      success: true,
      lockedSeats,
      failedSeats: [],
      lockTokens,
    };
  }

  /**
   * Release locks for multiple seats
   * @param lockTokens Map of seat IDs to lock tokens
   */
  private async releaseMultipleLocks(
    lockTokens: Map<string, string>,
  ): Promise<void> {
    for (const [seatId, lockToken] of lockTokens.entries()) {
      const lockKey = `seat:${seatId}`;
      await this.lockingService.releaseLock(lockKey, lockToken);
    }
  }

  async createBooking(createBookingDto: CreateBookingDto): Promise<Booking[]> {
    const { seatIds, email, customerName, phoneNumber } = createBookingDto;

    // Acquire distributed locks for all seats
    const lockResult = await this.acquireMultipleLocks(seatIds);

    if (!lockResult.success) {
      const failedSeatsStr = lockResult.failedSeats.join(', ');
      throw new ConflictException(
        `The following seats are currently being processed by another request: ${failedSeatsStr}`,
      );
    }

    try {
      // Start a database transaction
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // Check if all seats exist and are active
        const seats = await queryRunner.manager.find(Seat, {
          where: { id: In(seatIds) },
        });

        if (seats.length !== seatIds.length) {
          const foundSeatIds = seats.map((seat) => seat.id);
          const missingSeats = seatIds.filter(
            (id) => !foundSeatIds.includes(id),
          );
          throw new NotFoundException(
            `The following seats were not found: ${missingSeats.join(', ')}`,
          );
        }

        const inactiveSeats = seats.filter((seat) => !seat.isActive);
        if (inactiveSeats.length > 0) {
          const inactiveSeatIds = inactiveSeats.map((seat) => seat.id);
          throw new BadRequestException(
            `The following seats are not available for booking: ${inactiveSeatIds.join(
              ', ',
            )}`,
          );
        }

        // Check if any seat is already booked
        const activeBookings = await queryRunner.manager.find(Booking, {
          where: [
            { seatId: In(seatIds), status: BookingStatus.CONFIRMED },
            {
              seatId: In(seatIds),
              status: BookingStatus.PENDING,
              expiresAt: MoreThan(new Date()),
            },
          ],
        });

        if (activeBookings.length > 0) {
          const bookedSeatIds = activeBookings.map((booking) => booking.seatId);
          const bookedSeatsInfo = await Promise.all(
            bookedSeatIds.map(async (seatId) => {
              const seat = seats.find((s) => s.id === seatId);
              return seat ? seat.label : seatId;
            }),
          );
          throw new ConflictException(
            `The following seats are already booked or reserved: ${bookedSeatsInfo.join(
              ', ',
            )}`,
          );
        }

        // Calculate expiration time
        const expiresAt = new Date();
        expiresAt.setTime(expiresAt.getTime() + this.reservationTimeoutMs);

        // Generate a single confirmation code for all bookings
        const confirmationCode = uuidv4().substring(0, 8).toUpperCase();

        // Create new bookings
        const bookings: Booking[] = [];
        for (const seatId of seatIds) {
          const booking = new Booking();
          booking.seatId = seatId;
          booking.email = email;
          booking.customerName = customerName;
          booking.phoneNumber = phoneNumber;
          booking.status = BookingStatus.PENDING;
          booking.expiresAt = expiresAt;
          booking.confirmationCode = confirmationCode;
          bookings.push(booking);
        }

        const savedBookings = await queryRunner.manager.save(bookings);

        // Commit transaction
        await queryRunner.commitTransaction();

        return savedBookings;
      } catch (error) {
        // Rollback transaction in case of error
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        // Release query runner
        await queryRunner.release();
      }
    } finally {
      // Always release the locks
      await this.releaseMultipleLocks(lockResult.lockTokens);
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

  async getBookingsByConfirmationCode(
    confirmationCode: string,
    email: string,
  ): Promise<Booking[]> {
    return this.bookingRepository.find({
      where: { confirmationCode, email },
      relations: ['seat', 'seat.room'],
      order: { createdAt: 'DESC' },
    });
  }

  async cancelBookingsByConfirmationCode(
    confirmationCode: string,
    email: string,
  ): Promise<void> {
    const bookings = await this.bookingRepository.find({
      where: { confirmationCode, email },
    });

    if (bookings.length === 0) {
      throw new NotFoundException('Bookings not found');
    }

    // Check if any booking cannot be cancelled
    const nonCancellableBookings = bookings.filter(
      (booking) =>
        booking.status !== BookingStatus.PENDING &&
        booking.status !== BookingStatus.CONFIRMED,
    );

    if (nonCancellableBookings.length > 0) {
      throw new BadRequestException(
        `Some bookings cannot be cancelled (current statuses: ${nonCancellableBookings
          .map((b) => b.status)
          .join(', ')})`,
      );
    }

    // Get all seat IDs
    const seatIds = bookings.map((booking) => booking.seatId);

    // Acquire distributed locks for all seats
    const lockResult = await this.acquireMultipleLocks(seatIds);

    if (!lockResult.success) {
      const failedSeatsStr = lockResult.failedSeats.join(', ');
      throw new ConflictException(
        `The following seats are currently being processed by another request: ${failedSeatsStr}`,
      );
    }

    try {
      // Update all bookings to cancelled
      await this.bookingRepository.update(
        { confirmationCode, email },
        { status: BookingStatus.CANCELLED },
      );
    } finally {
      await this.releaseMultipleLocks(lockResult.lockTokens);
    }
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

  async confirmBookingsWithPayment(
    confirmationCode: string,
    email: string,
  ): Promise<Booking[]> {
    const bookings = await this.bookingRepository.find({
      where: { confirmationCode, email },
      relations: ['seat'],
    });

    if (bookings.length === 0) {
      throw new NotFoundException('Bookings not found');
    }

    // Check if any booking cannot be confirmed
    const nonConfirmableBookings = bookings.filter(
      (booking) => booking.status !== BookingStatus.PENDING,
    );

    if (nonConfirmableBookings.length > 0) {
      throw new BadRequestException(
        `Some bookings cannot be confirmed (current statuses: ${nonConfirmableBookings
          .map((b) => b.status)
          .join(', ')})`,
      );
    }

    // Check if any booking has expired
    const now = new Date();
    const expiredBookings = bookings.filter(
      (booking) => booking.expiresAt < now,
    );

    if (expiredBookings.length > 0) {
      // Update expired bookings
      await this.bookingRepository.update(
        { id: In(expiredBookings.map((b) => b.id)) },
        { status: BookingStatus.EXPIRED },
      );
      throw new BadRequestException('Some bookings have expired');
    }

    // Get all seat IDs
    const seatIds = bookings.map((booking) => booking.seatId);

    // Acquire distributed locks for all seats
    const lockResult = await this.acquireMultipleLocks(seatIds);

    if (!lockResult.success) {
      const failedSeatsStr = lockResult.failedSeats.join(', ');
      throw new ConflictException(
        `The following seats are currently being processed by another request: ${failedSeatsStr}`,
      );
    }

    try {
      // Calculate total price (assuming each seat has a price property)
      const totalPrice = bookings.reduce(
        (sum, booking) => sum + (booking.seat?.price || 100),
        0,
      );

      // Process payment
      const paymentResult = await this.paymentsService.processPayment(
        totalPrice,
        email,
      );

      if (!paymentResult.success) {
        throw new BadRequestException(paymentResult.message);
      }

      // Update all bookings to confirmed
      await this.bookingRepository.update(
        { confirmationCode, email },
        {
          status: BookingStatus.CONFIRMED,
          expiresAt: null,
          paymentTransactionId: paymentResult.transactionId,
        },
      );

      // Fetch updated bookings
      return this.bookingRepository.find({
        where: { confirmationCode, email },
        relations: ['seat', 'seat.room'],
      });
    } finally {
      await this.releaseMultipleLocks(lockResult.lockTokens);
    }
  }

  async confirmBookingWithPayment(
    bookingId: string,
    email: string,
  ): Promise<Booking> {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId, email },
      relations: ['seat'],
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
        booking.seat?.price || 100, // Sử dụng giá vé từ seat nếu có, nếu không thì mặc định là 100
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
