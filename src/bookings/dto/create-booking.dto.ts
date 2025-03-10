import {
  IsNotEmpty,
  IsUUID,
  IsEmail,
  IsString,
  IsOptional,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';

export class CreateBookingDto {
  @IsNotEmpty()
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one seat must be selected' })
  @ArrayMaxSize(10, { message: 'Maximum 10 seats can be booked at once' })
  @IsUUID('4', { each: true })
  seatIds: string[];

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
