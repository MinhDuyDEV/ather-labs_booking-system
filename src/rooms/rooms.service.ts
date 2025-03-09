import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Room } from './entities/room.entity';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(Room)
    private roomsRepository: Repository<Room>,
  ) {}

  async create(createRoomDto: CreateRoomDto): Promise<Room> {
    const existingRoom = await this.roomsRepository.findOne({
      where: { name: createRoomDto.name },
    });

    if (existingRoom) {
      throw new ConflictException(
        `Room with name "${createRoomDto.name}" already exists`,
      );
    }

    const room = this.roomsRepository.create(createRoomDto);
    return this.roomsRepository.save(room);
  }

  async findAll(): Promise<Room[]> {
    return this.roomsRepository.find({
      order: {
        name: 'ASC',
      },
    });
  }

  async findAllActive(): Promise<Room[]> {
    return this.roomsRepository.find({
      where: { isActive: true },
      order: {
        name: 'ASC',
      },
    });
  }

  async findOne(id: string): Promise<Room> {
    const room = await this.roomsRepository.findOne({
      where: { id },
    });

    if (!room) {
      throw new NotFoundException(`Room with ID "${id}" not found`);
    }

    return room;
  }

  async update(id: string, updateRoomDto: UpdateRoomDto): Promise<Room> {
    const room = await this.findOne(id);

    if (updateRoomDto.name && updateRoomDto.name !== room.name) {
      const existingRoom = await this.roomsRepository.findOne({
        where: { name: updateRoomDto.name },
      });

      if (existingRoom) {
        throw new ConflictException(
          `Room with name "${updateRoomDto.name}" already exists`,
        );
      }
    }

    this.roomsRepository.merge(room, updateRoomDto);
    return this.roomsRepository.save(room);
  }

  async remove(id: string): Promise<void> {
    const room = await this.findOne(id);
    await this.roomsRepository.remove(room);
  }

  async activate(id: string): Promise<Room> {
    const room = await this.findOne(id);
    room.isActive = true;
    return this.roomsRepository.save(room);
  }

  async deactivate(id: string): Promise<Room> {
    const room = await this.findOne(id);
    room.isActive = false;
    return this.roomsRepository.save(room);
  }
}
