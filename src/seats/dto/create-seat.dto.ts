import {
  IsNotEmpty,
  IsString,
  IsInt,
  Min,
  IsUUID,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class CreateSeatDto {
  @IsNotEmpty()
  @IsInt()
  @Min(0)
  row: number;

  @IsNotEmpty()
  @IsInt()
  @Min(0)
  column: number;

  @IsNotEmpty()
  @IsString()
  label: string;

  @IsNotEmpty()
  @IsUUID()
  roomId: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
