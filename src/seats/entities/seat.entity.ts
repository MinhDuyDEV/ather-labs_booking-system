import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Room } from '../../rooms/entities/room.entity';

@Entity('seats')
export class Seat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  row: number;

  @Column()
  column: number;

  @Column()
  label: string;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => Room, { onDelete: 'CASCADE' })
  @JoinColumn()
  room: Room;

  @Column()
  roomId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
