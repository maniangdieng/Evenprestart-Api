import { Injectable } from '@nestjs/common';
import type { PaymentProviderAdapter } from './payment-provider.interface';

/**
 * Paiement manuel / hors-ligne — couvre le MVP (cahier des charges, Phase 1).
 * L'admin confirme la réception du paiement depuis le Back-Office, ce qui
 * fait passer le Payment en SUCCEEDED (voir PaymentsService.confirmManual).
 */
@Injectable()
export class ManualPaymentProvider implements PaymentProviderAdapter {
  async initiate(bookingId: string) {
    return { externalRef: `manual_${bookingId}_${Date.now()}` };
  }

  parseWebhook(): never {
    throw new Error(
      'Le provider manuel ne reçoit pas de webhook, utilisez PaymentsService.confirmManual.',
    );
  }
}
