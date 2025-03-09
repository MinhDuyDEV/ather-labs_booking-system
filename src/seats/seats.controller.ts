import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SeatsService } from './seats.service';
import { CreateSeatDto } from './dto/create-seat.dto';
import { UpdateSeatDto } from './dto/update-seat.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('seats')
export class SeatsController {
  constructor(private readonly seatsService: SeatsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createSeatDto: CreateSeatDto) {
    return this.seatsService.create(createSeatDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll() {
    return this.seatsService.findAll();
  }

  @Get('room/:roomId')
  findByRoom(@Param('roomId') roomId: string) {
    return this.seatsService.findByRoom(roomId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.seatsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSeatDto: UpdateSeatDto) {
    return this.seatsService.update(id, updateSeatDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.seatsService.remove(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('room/:roomId/generate')
  generateSeats(@Param('roomId') roomId: string) {
    return this.seatsService.generateSeatsForRoom(roomId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.seatsService.activate(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.seatsService.deactivate(id);
  }
}
