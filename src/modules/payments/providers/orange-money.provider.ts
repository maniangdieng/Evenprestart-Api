import { Injectable, NotImplementedException } from '@nestjs/common';
import type { PaymentProviderAdapter } from './payment-provider.interface';

/**
 * TODO Phase 2 (cahier des charges 8.2) : intégrer l'API Orange Money
 * Sénégal (Web Payment / API marchand) une fois le contrat marchand signé.
 */
@Injectable()
export class OrangeMoneyProvider implements PaymentProviderAdapter {
  initiate(): never {
    throw new NotImplementedException(
      'Intégration Orange Money à brancher en Phase 2 — contrat marchand requis.',
    );
  }

  parseWebhook(): never {
    throw new NotImplementedException('Webhook Orange Money non implémenté.');
  }
}
