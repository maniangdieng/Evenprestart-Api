import { IsEnum } from 'class-validator';
import { PaymentProvider } from '@prisma/client';

export class InitiatePaymentDto {
  @IsEnum(PaymentProvider)
  provider: PaymentProvider;
}
