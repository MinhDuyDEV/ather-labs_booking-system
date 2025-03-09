import {
  IsNotEmpty,
  IsUUID,
  IsEmail,
  IsString,
  IsOptional,
} from 'class-validator';

export class CreateBookingDto {
  @IsNotEmpty()
  @IsUUID()
  seatId: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  customerName: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;
}
