import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Seat } from './entities/seat.entity';
import { CreateSeatDto } from './dto/create-seat.dto';
import { UpdateSeatDto } from './dto/update-seat.dto';
import { RoomsService } from '../rooms/rooms.service';

@Injectable()
export class SeatsService {
  constructor(
    @InjectRepository(Seat)
    private seatsRepository: Repository<Seat>,
    private roomsService: RoomsService,
  ) {}

  async create(createSeatDto: CreateSeatDto): Promise<Seat> {
    // Kiểm tra xem phòng có tồn tại không
    const room = await this.roomsService.findOne(createSeatDto.roomId);
    // Kiểm tra xem vị trí chỗ ngồi có hợp lệ không
    if (
      createSeatDto.row >= room.rows ||
      createSeatDto.column >= room.columns
    ) {
      throw new BadRequestException(
        `Invalid seat position. Room dimensions are ${room.rows}x${room.columns}`,
      );
    }

    // Kiểm tra xem chỗ ngồi đã tồn tại chưa
    const existingSeat = await this.seatsRepository.findOne({
      where: {
        roomId: createSeatDto.roomId,
        row: createSeatDto.row,
        column: createSeatDto.column,
      },
    });
    if (existingSeat) {
      throw new ConflictException(
        `Seat at position (${createSeatDto.row}, ${createSeatDto.column}) already exists in this room`,
      );
    }

    const seat = this.seatsRepository.create(createSeatDto);
    return this.seatsRepository.save(seat);
  }

  async findAll(): Promise<Seat[]> {
    return this.seatsRepository.find({
      relations: ['room'],
    });
  }

  async findByRoom(roomId: string): Promise<Seat[]> {
    // Kiểm tra xem phòng có tồn tại không
    await this.roomsService.findOne(roomId);

    return this.seatsRepository.find({
      where: { roomId },
      order: {
        row: 'ASC',
        column: 'ASC',
      },
    });
  }

  async findOne(id: string): Promise<Seat> {
    const seat = await this.seatsRepository.findOne({
      where: { id },
      relations: ['room'],
    });
    if (!seat) {
      throw new NotFoundException(`Seat with ID "${id}" not found`);
    }

    return seat;
  }

  async update(id: string, updateSeatDto: UpdateSeatDto): Promise<Seat> {
    const seat = await this.findOne(id);
    // Nếu roomId được cập nhật, kiểm tra xem phòng mới có tồn tại không
    if (updateSeatDto.roomId && updateSeatDto.roomId !== seat.roomId) {
      await this.roomsService.findOne(updateSeatDto.roomId);
    }

    // Nếu vị trí được cập nhật, kiểm tra xem vị trí mới có hợp lệ không
    if (
      (updateSeatDto.row !== undefined || updateSeatDto.column !== undefined) &&
      updateSeatDto.roomId
    ) {
      const room = await this.roomsService.findOne(updateSeatDto.roomId);
      const newRow = updateSeatDto.row ?? seat.row;
      const newColumn = updateSeatDto.column ?? seat.column;

      if (newRow >= room.rows || newColumn >= room.columns) {
        throw new BadRequestException(
          `Invalid seat position. Room dimensions are ${room.rows}x${room.columns}`,
        );
      }

      const existingSeat = await this.seatsRepository.findOne({
        where: {
          roomId: updateSeatDto.roomId,
          row: newRow,
          column: newColumn,
          id: Not(id),
        },
      });
      if (existingSeat) {
        throw new ConflictException(
          `Seat at position (${newRow}, ${newColumn}) already exists in this room`,
        );
      }
    }

    this.seatsRepository.merge(seat, updateSeatDto);
    return this.seatsRepository.save(seat);
  }

  async remove(id: string): Promise<void> {
    const seat = await this.findOne(id);
    await this.seatsRepository.remove(seat);
  }

  async generateSeatsForRoom(roomId: string): Promise<Seat[]> {
    const room = await this.roomsService.findOne(roomId);
    const existingSeats = await this.seatsRepository.find({
      where: { roomId },
    });

    if (existingSeats.length > 0) {
      throw new ConflictException(`Room already has seats generated`);
    }

    const seats: Seat[] = [];

    for (let row = 0; row < room.rows; row++) {
      for (let column = 0; column < room.columns; column++) {
        const rowLabel = String.fromCharCode(65 + row);
        const label = `${rowLabel}${column + 1}`;

        const seat = this.seatsRepository.create({
          row,
          column,
          label,
          roomId,
          isActive: true,
        });

        seats.push(seat);
      }
    }

    return this.seatsRepository.save(seats);
  }

  async activate(id: string): Promise<Seat> {
    const seat = await this.findOne(id);
    seat.isActive = true;
    return this.seatsRepository.save(seat);
  }

  async deactivate(id: string): Promise<Seat> {
    const seat = await this.findOne(id);
    seat.isActive = false;
    return this.seatsRepository.save(seat);
  }
}
