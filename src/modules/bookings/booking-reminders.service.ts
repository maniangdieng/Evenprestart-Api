import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { bookingDetails } from './booking-details';

const REMINDER_WINDOW_HOURS = 24;

/**
 * Rappel automatique (email + in-app) envoyé au client et à l'artiste
 * la veille d'un événement confirmé par l'équipe (confirmé ou payé).
 */
@Injectable()
export class BookingRemindersService {
  private readonly logger = new Logger(BookingRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sendUpcomingEventReminders() {
    const now = new Date();
    const windowEnd = new Date(
      now.getTime() + REMINDER_WINDOW_HOURS * 3_600_000,
    );

    const bookings = await this.prisma.booking.findMany({
      where: {
        status: { in: ['CONFIRMED', 'PAID'] },
        reminderSentAt: null,
        eventDate: { gte: now, lte: windowEnd },
      },
      include: {
        talentProfile: { select: { userId: true, stageName: true } },
        servicePackage: { select: { name: true } },
      },
    });

    for (const booking of bookings) {
      // Réservation « atomique » du rappel : si une autre instance de l'API
      // l'a déjà pris en charge, count vaut 0 et on n'envoie rien.
      const { count } = await this.prisma.booking.updateMany({
        where: { id: booking.id, reminderSentAt: null },
        data: { reminderSentAt: new Date() },
      });
      if (count === 0) continue;

      try {
        await Promise.all([
          this.notifications.notify(
            booking.clientId,
            'EVENT_REMINDER',
            'Rappel : votre événement approche',
            `${booking.talentProfile.stageName} se produit pour vous très bientôt. Retrouvez ci-dessous le récapitulatif de votre réservation.`,
            'EMAIL',
            { bookingId: booking.id },
            {
              details: bookingDetails(booking, 'client'),
              ctaPath: `/talents/${booking.talentProfileId}`,
              ctaLabel: 'Voir le profil',
            },
          ),
          this.notifications.notify(
            booking.talentProfile.userId,
            'EVENT_REMINDER',
            'Rappel : prestation à venir',
            `Vous vous produisez très bientôt pour un événement organisé via Event Prest'Art. Pensez à préparer votre matériel et votre trajet ; pour toute question, contactez l'équipe.`,
            'EMAIL',
            { bookingId: booking.id },
            {
              details: bookingDetails(booking, 'artist'),
              ctaPath: '/artiste/reservations',
              ctaLabel: 'Voir mon agenda',
            },
          ),
        ]);
      } catch (error) {
        this.logger.error(
          `Rappel non envoyé pour la réservation ${booking.id}`,
          error,
        );
      }
    }

    if (bookings.length > 0) {
      this.logger.log(`${bookings.length} rappel(s) d'événement traité(s).`);
    }
  }
}
