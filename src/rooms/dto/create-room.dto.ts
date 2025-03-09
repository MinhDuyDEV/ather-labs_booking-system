import {
  IsNotEmpty,
  IsString,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class CreateRoomDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Max(50)
  rows: number;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Max(50)
  columns: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
