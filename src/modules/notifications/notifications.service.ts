import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MailService } from '../mail/mail.service';
import { EmailDetail } from '../mail/mail.templates';

/** Contenu additionnel de l'email accompagnant une notification `EMAIL`. */
export interface NotificationEmailOptions {
  details?: EmailDetail[];
  /** Chemin du front vers lequel pointe le bouton, ex. `/artiste/reservations`. */
  ctaPath?: string;
  ctaLabel?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly mail: MailService,
  ) {}

  /**
   * Crée une notification in-app (toujours) et, si `channel === 'EMAIL'`,
   * envoie en plus un email via Brevo. L'email part en arrière-plan : un
   * échec d'envoi est journalisé mais ne fait jamais échouer l'action métier.
   */
  async notify(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    channel: NotificationChannel = 'IN_APP',
    metadata?: Record<string, unknown>,
    email?: NotificationEmailOptions,
  ) {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        channel,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
    this.realtime.emitToUser(userId, 'notification', notification);

    if (channel === 'EMAIL') {
      this.sendEmail(userId, title, body, email).catch((error) =>
        this.logger.error(
          `Email de notification non envoyé (${userId})`,
          error,
        ),
      );
    }
    // TODO : canal SMS (Twilio) quand channel === 'SMS'.
    return notification;
  }

  /** Notifie tous les administrateurs (ADMIN + SUPER_ADMIN) d'un même événement. */
  async notifyAdmins(
    type: NotificationType,
    title: string,
    body: string,
    metadata?: Record<string, unknown>,
    channel: NotificationChannel = 'IN_APP',
    email?: NotificationEmailOptions,
  ) {
    const admins = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true },
      select: { id: true },
    });
    await Promise.all(
      admins.map((admin) =>
        this.notify(admin.id, type, title, body, channel, metadata, email),
      ),
    );
  }

  private async sendEmail(
    userId: string,
    title: string,
    body: string,
    options: NotificationEmailOptions = {},
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, isActive: true },
    });
    if (!user?.isActive) return;

    await this.mail.sendSafe(
      { email: user.email, name: user.firstName },
      title,
      {
        heading: title,
        greeting: `Bonjour ${user.firstName},`,
        paragraphs: [body],
        details: options.details,
        cta: options.ctaPath
          ? {
              label: options.ctaLabel ?? 'Voir sur la plateforme',
              url: this.mail.webUrl(options.ctaPath),
            }
          : undefined,
      },
      ['notification'],
    );
  }

  findMine(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  countUnread(userId: string) {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  async markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}
