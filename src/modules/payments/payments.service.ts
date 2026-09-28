import { BadRequestException, Injectable } from '@nestjs/common';
import { PaymentProvider } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ManualPaymentProvider } from './providers/manual.provider';
import { WaveProvider } from './providers/wave.provider';
import { OrangeMoneyProvider } from './providers/orange-money.provider';
import { StripeProvider } from './providers/stripe.provider';
import type { PaymentProviderAdapter } from './providers/payment-provider.interface';
import { bookingDetails } from '../bookings/booking-details';
import { formatEventDate } from '../mail/mail.templates';

@Injectable()
export class PaymentsService {
  private readonly adapters: Record<PaymentProvider, PaymentProviderAdapter>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    manual: ManualPaymentProvider,
    wave: WaveProvider,
    orangeMoney: OrangeMoneyProvider,
    stripe: StripeProvider,
  ) {
    this.adapters = {
      MANUAL: manual,
      WAVE: wave,
      ORANGE_MONEY: orangeMoney,
      FREE_MONEY: orangeMoney, // même famille d'API que l'Orange Money côté Sénégal
      STRIPE: stripe,
      PAYPAL: stripe,
    };
  }

  async initiate(bookingId: string, provider: PaymentProvider) {
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
    });
    // On ne paie qu'une réservation confirmée par l'équipe (cachet négocié).
    if (booking.status !== 'CONFIRMED') {
      throw new BadRequestException(
        "Cette réservation doit d'abord être confirmée par l'équipe Event Prest'Art.",
      );
    }
    const adapter = this.adapters[provider];
    const { externalRef } = await adapter.initiate(
      bookingId,
      Number(booking.totalAmount),
    );

    return this.prisma.payment.create({
      data: {
        bookingId,
        provider,
        amount: booking.totalAmount,
        externalRef,
      },
    });
  }

  /** Utilisé par le Back-Office pour confirmer un paiement MANUAL reçu hors-ligne. */
  async confirmManual(paymentId: string) {
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    if (payment.provider !== 'MANUAL') {
      throw new BadRequestException(
        'Seuls les paiements manuels se confirment via cet endpoint.',
      );
    }
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'SUCCEEDED' },
    });
    const booking = await this.prisma.booking.update({
      where: { id: payment.bookingId },
      data: { status: 'PAID' },
    });
    await this.notifyPaymentSucceeded(booking.id);
    return booking;
  }

  async handleWebhook(provider: PaymentProvider, payload: unknown) {
    const adapter = this.adapters[provider];
    const { externalRef, status } = adapter.parseWebhook(payload);

    const existing = await this.prisma.payment.findFirstOrThrow({
      where: { externalRef },
    });
    const payment = await this.prisma.payment.update({
      where: { id: existing.id },
      data: { status, rawPayload: payload as any },
    });

    if (status === 'SUCCEEDED') {
      await this.prisma.booking.update({
        where: { id: payment.bookingId },
        data: { status: 'PAID' },
      });
      await this.notifyPaymentSucceeded(payment.bookingId);
    }
    return payment;
  }

  private async notifyPaymentSucceeded(bookingId: string) {
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: {
        talentProfile: { select: { userId: true, stageName: true } },
        servicePackage: { select: { name: true } },
      },
    });
    // L'artiste n'est prévenu que si l'équipe lui a déjà confirmé la date.
    await this.notifications.notify(
      booking.talentProfile.userId,
      'PAYMENT_RECEIVED',
      'Prestation garantie',
      `La prestation du ${formatEventDate(booking.eventDate)} a été réglée à Event Prest'Art : elle est désormais ferme. Votre cachet vous sera versé par Event Prest'Art.`,
      'EMAIL',
      { bookingId },
      {
        details: bookingDetails(booking, 'artist'),
        ctaPath: '/artiste/reservations',
        ctaLabel: 'Voir mon agenda',
      },
    );
    await this.notifications.notify(
      booking.clientId,
      'PAYMENT_RECEIVED',
      'Paiement confirmé',
      `Votre paiement pour ${booking.talentProfile.stageName} a bien été reçu. Votre réservation est confirmée. Vous recevrez un rappel la veille de l'événement.`,
      'EMAIL',
      { bookingId },
      {
        details: bookingDetails(booking, 'client'),
        ctaPath: `/talents/${booking.talentProfileId}`,
        ctaLabel: 'Voir le profil',
      },
    );
    await this.notifications.notifyAdmins(
      'PAYMENT_RECEIVED',
      'Paiement confirmé',
      `Paiement confirmé pour la réservation de ${booking.talentProfile.stageName}.`,
      { bookingId },
      'EMAIL',
      {
        details: bookingDetails(booking, 'admin'),
        ctaPath: '/admin/reservations',
        ctaLabel: 'Voir les réservations',
      },
    );
  }
}
