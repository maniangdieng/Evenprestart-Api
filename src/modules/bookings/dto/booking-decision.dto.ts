import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Décision de l'équipe Event Prest'Art sur une demande de réservation,
 * après négociation avec l'artiste (le client et l'artiste ne sont jamais
 * mis en relation directe).
 */
export enum BookingDecisionAction {
  CONFIRM = 'CONFIRM',
  REFUSE = 'REFUSE',
}

export class BookingDecisionDto {
  @IsEnum(BookingDecisionAction)
  action: BookingDecisionAction;

  /** Cachet final négocié avec l'artiste ; les frais de service sont recalculés. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  artistFee?: number;

  /** Message transmis au client (motif du refus, précisions…). */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class CancelBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
