import { Seat } from 'src/seats/entities/seat.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

@Entity('rooms')
export class Room {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column()
  rows: number;

  @Column()
  columns: number;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => Seat, (seat) => seat.room)
  seats: Seat[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
