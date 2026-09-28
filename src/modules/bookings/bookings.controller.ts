import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CancelBookingDto } from './dto/booking-decision.dto';

// La décision sur une demande (confirmation / refus) et l'annulation côté
// plateforme se font via /admin/bookings — cf. AdminController.
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @UseGuards(RolesGuard)
  @Roles('CLIENT')
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.create(user.userId, dto);
  }

  @Get('mine')
  findMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('as') as?: 'client' | 'artist',
  ) {
    return as === 'artist'
      ? this.bookingsService.findMineAsArtist(user.userId)
      : this.bookingsService.findMineAsClient(user.userId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.bookingsService.findOne(id, user);
  }

  @UseGuards(RolesGuard)
  @Roles('CLIENT')
  @Patch(':id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookingsService.cancelByClient(id, user.userId, dto.reason);
  }
}
