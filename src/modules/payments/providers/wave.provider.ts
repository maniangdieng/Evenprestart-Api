import { Injectable, NotImplementedException } from '@nestjs/common';
import type { PaymentProviderAdapter } from './payment-provider.interface';

/**
 * TODO Phase 2 (cahier des charges 8.2) : intégrer l'API Wave Checkout
 * (https://docs.wave.com/business) une fois les identifiants marchands
 * obtenus — créer une session de paiement puis vérifier la signature du
 * webhook `checkout.session.completed`.
 */
@Injectable()
export class WaveProvider implements PaymentProviderAdapter {
  initiate(): never {
    throw new NotImplementedException(
      "Intégration Wave à brancher en Phase 2 — clé API requise.",
    );
  }

  parseWebhook(): never {
    throw new NotImplementedException('Webhook Wave non implémenté.');
  }
}
