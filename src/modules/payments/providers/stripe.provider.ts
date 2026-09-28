import { Injectable, NotImplementedException } from '@nestjs/common';
import type { PaymentProviderAdapter } from './payment-provider.interface';

/**
 * TODO Phase 2 (cahier des charges 8.2) : intégrer Stripe Checkout pour la
 * diaspora (npm i stripe, créer une Checkout Session, vérifier la signature
 * du webhook avec STRIPE_WEBHOOK_SECRET).
 */
@Injectable()
export class StripeProvider implements PaymentProviderAdapter {
  initiate(): never {
    throw new NotImplementedException(
      'Intégration Stripe à brancher en Phase 2 — clé secrète requise.',
    );
  }

  parseWebhook(): never {
    throw new NotImplementedException('Webhook Stripe non implémenté.');
  }
}
