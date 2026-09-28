import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { BookingStatus, UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BookingsService } from '../bookings/bookings.service';
import { CreateBookingDto } from '../bookings/dto/create-booking.dto';
import {
  BookingDecisionDto,
  CancelBookingDto,
} from '../bookings/dto/booking-decision.dto';
import { AdminService } from './admin.service';

class ResolveDisputeDto {
  @IsString()
  resolution: string;
}

class UpdateUserRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}

class UpdateUserActiveDto {
  @IsBoolean()
  isActive: boolean;
}

class CreateUserDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsString()
  phone?: string;
}

class CreateAdminBookingDto extends CreateBookingDto {
  @IsString()
  clientId: string;
}

@UseGuards(RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly bookingsService: BookingsService,
  ) {}

  @Get('dashboard')
  getDashboard() {
    return this.adminService.getDashboardStats();
  }

  @Get('profiles/pending')
  listPendingProfiles() {
    return this.adminService.listPendingProfiles();
  }

  @Patch('profiles/:id/validate')
  validateProfile(@Param('id') id: string) {
    return this.adminService.validateProfile(id);
  }

  @Get('disputes')
  listDisputes() {
    return this.adminService.listDisputes();
  }

  @Patch('disputes/:id/resolve')
  resolveDispute(@Param('id') id: string, @Body() dto: ResolveDisputeDto) {
    return this.adminService.resolveDispute(id, dto.resolution);
  }

  @Get('users')
  listUsers(@Query('role') role?: UserRole, @Query('search') search?: string) {
    return this.adminService.listUsers({ role, search });
  }

  @Post('users')
  createUser(@Body() dto: CreateUserDto) {
    return this.adminService.createUser(dto);
  }

  @Patch('users/:id/role')
  updateUserRole(@Param('id') id: string, @Body() dto: UpdateUserRoleDto) {
    return this.adminService.setUserRole(id, dto.role);
  }

  @Patch('users/:id/active')
  updateUserActive(@Param('id') id: string, @Body() dto: UpdateUserActiveDto) {
    return this.adminService.setUserActive(id, dto.isActive);
  }

  @Get('bookings')
  listBookings(@Query('status') status?: BookingStatus) {
    return this.adminService.listBookings({ status });
  }

  @Post('bookings')
  createBooking(@Body() dto: CreateAdminBookingDto) {
    const { clientId, ...bookingDto } = dto;
    return this.bookingsService.create(clientId, bookingDto, {
      createdByAdmin: true,
    });
  }

  /** Confirmation ou refus d'une demande, après négociation avec l'artiste. */
  @Patch('bookings/:id/decision')
  decideBooking(@Param('id') id: string, @Body() dto: BookingDecisionDto) {
    return this.bookingsService.decide(id, dto);
  }

  @Patch('bookings/:id/cancel')
  cancelBooking(@Param('id') id: string, @Body() dto: CancelBookingDto) {
    return this.bookingsService.cancelByAdmin(id, dto.reason);
  }

  @Get('profiles/:id')
  getProfile(@Param('id') id: string) {
    return this.adminService.getProfileDetail(id);
  }
}
