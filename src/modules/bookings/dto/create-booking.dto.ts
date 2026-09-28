import { IsDateString, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateBookingDto {
  @IsString()
  talentProfileId: string;

  @IsOptional()
  @IsString()
  servicePackageId?: string;

  @IsDateString()
  eventDate: string;

  @IsString()
  location: string;

  @IsOptional()
  @IsObject()
  technicalOptions?: Record<string, unknown>;
}
