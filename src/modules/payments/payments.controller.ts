import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PaymentProvider } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('bookings/:bookingId/initiate')
  initiate(
    @Param('bookingId') bookingId: string,
    @Body() dto: InitiatePaymentDto,
  ) {
    return this.paymentsService.initiate(bookingId, dto.provider);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch(':paymentId/confirm-manual')
  confirmManual(@Param('paymentId') paymentId: string) {
    return this.paymentsService.confirmManual(paymentId);
  }

  @Public()
  @Post('webhook/:provider')
  webhook(
    @Param('provider') provider: PaymentProvider,
    @Body() payload: unknown,
  ) {
    return this.paymentsService.handleWebhook(provider, payload);
  }
}
