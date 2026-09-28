export interface InitiatedPayment {
  externalRef: string;
  /** URL to redirect the client to for hosted checkout providers (Wave, Stripe, PayPal). */
  redirectUrl?: string;
}

export interface PaymentProviderAdapter {
  initiate(bookingId: string, amountXof: number): Promise<InitiatedPayment>;
  /** Verifies and normalizes an incoming webhook payload into a status. */
  parseWebhook(
    payload: unknown,
  ): { externalRef: string; status: 'SUCCEEDED' | 'FAILED' };
}
