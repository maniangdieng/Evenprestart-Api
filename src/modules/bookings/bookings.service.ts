import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { formatAmount, formatEventDate } from '../mail/mail.templates';
import { bookingDetails } from './booking-details';
import { CreateBookingDto } from './dto/create-booking.dto';
import {
  BookingDecisionAction,
  BookingDecisionDto,
} from './dto/booking-decision.dto';

const DEFAULT_COMMISSION_RATE = 10; // % — cf. cahier des charges 11.2, à valider par l'agence
const ARTIST_BOOKINGS_PATH = '/artiste/reservations';
const ADMIN_BOOKINGS_PATH = '/admin/reservations';

// Event Prest'Art est l'unique intermédiaire : le client adresse sa demande
// à la plateforme, l'équipe admin négocie avec l'artiste puis confirme ou
// refuse. Client et artiste ne sont jamais mis en relation directe.

/** Demandes en attente d'une décision de l'équipe (ACCEPTED/COUNTER_OFFERED : anciens statuts). */
const AWAITING_DECISION: BookingStatus[] = [
  'PENDING',
  'ACCEPTED',
  'COUNTER_OFFERED',
];

/** Seules les réservations confirmées par l'équipe sont visibles de l'artiste. */
const ARTIST_VISIBLE: BookingStatus[] = [
  'CONFIRMED',
  'PAID',
  'COMPLETED',
  'DISPUTED',
  'REFUNDED',
];

/** Vue artiste : ni identité du client, ni prix payé par le client. */
const ARTIST_BOOKING_SELECT = {
  id: true,
  talentProfileId: true,
  servicePackageId: true,
  eventDate: true,
  location: true,
  technicalOptions: true,
  status: true,
  subtotalAmount: true,
  createdAt: true,
  talentProfile: { select: { id: true, stageName: true } },
  servicePackage: { select: { name: true } },
} satisfies Prisma.BookingSelect;

const BOOKING_NOTIFY_INCLUDE = {
  talentProfile: { select: { id: true, userId: true, stageName: true } },
  servicePackage: { select: { name: true } },
  client: {
    select: { firstName: true, lastName: true, email: true, phone: true },
  },
} satisfies Prisma.BookingInclude;

type BookingForNotification = Prisma.BookingGetPayload<{
  include: typeof BOOKING_NOTIFY_INCLUDE;
}>;

function isAdmin(user: AuthenticatedUser) {
  return user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Demande de réservation d'un client : elle est adressée à l'équipe
   * Event Prest'Art, pas à l'artiste (qui n'est prévenu qu'après confirmation).
   */
  async create(
    clientId: string,
    dto: CreateBookingDto,
    options: { createdByAdmin?: boolean } = {},
  ) {
    const talentProfile = await this.prisma.talentProfile.findUnique({
      where: { id: dto.talentProfileId },
      include: { categories: { include: { category: true } } },
    });
    if (!talentProfile) {
      throw new NotFoundException('Talent introuvable.');
    }

    let subtotal = talentProfile.basePriceFrom;
    if (dto.servicePackageId) {
      const pkg = await this.prisma.servicePackage.findUnique({
        where: { id: dto.servicePackageId },
      });
      if (!pkg || pkg.talentProfileId !== talentProfile.id) {
        throw new BadRequestException(
          'Formule invalide pour ce profil talent.',
        );
      }
      subtotal = pkg.price;
    }
    if (!subtotal) {
      throw new BadRequestException(
        'Aucun tarif de référence disponible pour ce talent.',
      );
    }

    const commissionRate = Number(
      talentProfile.categories[0]?.category.commissionRate ??
        DEFAULT_COMMISSION_RATE,
    );
    const subtotalAmount = Number(subtotal);
    const serviceFeeAmount = (subtotalAmount * commissionRate) / 100;

    const booking = await this.prisma.booking.create({
      data: {
        clientId,
        talentProfileId: talentProfile.id,
        servicePackageId: dto.servicePackageId,
        eventDate: new Date(dto.eventDate),
        location: dto.location,
        technicalOptions: dto.technicalOptions as Prisma.InputJsonValue,
        subtotalAmount,
        serviceFeeAmount,
        totalAmount: subtotalAmount + serviceFeeAmount,
        commissionRate,
      },
      include: BOOKING_NOTIFY_INCLUDE,
    });

    if (!options.createdByAdmin) {
      await this.notifications.notifyAdmins(
        'BOOKING_REQUEST',
        'Nouvelle demande de réservation',
        `${booking.client.firstName} ${booking.client.lastName} souhaite réserver ${talentProfile.stageName}. Contactez l'artiste pour vérifier sa disponibilité et négocier, puis confirmez ou refusez la demande.`,
        { bookingId: booking.id },
        'EMAIL',
        {
          details: this.adminDetails(booking),
          ctaPath: `${ADMIN_BOOKINGS_PATH}?tab=attente`,
          ctaLabel: 'Traiter la demande',
        },
      );
    }
    await this.notifications.notify(
      clientId,
      'BOOKING_REQUEST',
      'Votre demande de réservation a bien été reçue',
      `Merci ! L'équipe Event Prest'Art a bien reçu votre demande pour ${talentProfile.stageName}. Nous vérifions la disponibilité de l'artiste et revenons vers vous très rapidement pour confirmer votre réservation.`,
      'EMAIL',
      { bookingId: booking.id },
      {
        details: bookingDetails(booking, 'client'),
        ctaPath: `/talents/${talentProfile.id}`,
        ctaLabel: 'Revoir le profil',
      },
    );

    return booking;
  }

  /** Détail d'une réservation, filtré selon le rôle de l'appelant. */
  async findOne(id: string, user: AuthenticatedUser) {
    if (user.role === 'ARTIST') {
      const booking = await this.prisma.booking.findFirst({
        where: {
          id,
          talentProfile: { userId: user.userId },
          status: { in: ARTIST_VISIBLE },
        },
        select: ARTIST_BOOKING_SELECT,
      });
      if (!booking) throw new NotFoundException('Réservation introuvable.');
      return booking;
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        talentProfile: { select: { id: true, stageName: true } },
        servicePackage: { select: { name: true } },
        payments: true,
        documents: true,
        ...(isAdmin(user) && {
          client: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
        }),
      },
    });
    if (!booking || (!isAdmin(user) && booking.clientId !== user.userId)) {
      throw new NotFoundException('Réservation introuvable.');
    }
    return booking;
  }

  findMineAsClient(clientId: string) {
    return this.prisma.booking.findMany({
      where: { clientId },
      include: {
        talentProfile: { select: { id: true, stageName: true } },
        servicePackage: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Agenda de l'artiste : prestations confirmées par l'équipe uniquement. */
  findMineAsArtist(userId: string) {
    return this.prisma.booking.findMany({
      where: { talentProfile: { userId }, status: { in: ARTIST_VISIBLE } },
      select: ARTIST_BOOKING_SELECT,
      orderBy: { eventDate: 'asc' },
    });
  }

  /**
   * Décision de l'équipe après négociation avec l'artiste : confirmation
   * (éventuellement avec le cachet renégocié) ou refus de la demande.
   */
  async decide(bookingId: string, dto: BookingDecisionDto) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: BOOKING_NOTIFY_INCLUDE,
    });
    if (!booking) {
      throw new NotFoundException('Réservation introuvable.');
    }
    if (!AWAITING_DECISION.includes(booking.status)) {
      throw new BadRequestException('Cette demande a déjà été traitée.');
    }

    if (dto.action === BookingDecisionAction.REFUSE) {
      const updated = await this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason:
            dto.note ?? "Refusée par l'équipe Event Prest'Art",
        },
        include: BOOKING_NOTIFY_INCLUDE,
      });
      await this.notifications.notify(
        booking.clientId,
        'BOOKING_REFUSED',
        "Votre demande de réservation n'a pas pu aboutir",
        `Nous sommes désolés : votre demande pour ${booking.talentProfile.stageName} n'a pas pu être confirmée.${dto.note ? ` ${dto.note}` : ''} Notre équipe peut vous proposer d'autres talents pour votre événement.`,
        'EMAIL',
        { bookingId },
        {
          details: bookingDetails(updated, 'client'),
          ctaPath: '/decouvrir',
          ctaLabel: "Découvrir d'autres talents",
        },
      );
      return updated;
    }

    const amounts =
      dto.artistFee !== undefined
        ? (() => {
            const serviceFeeAmount =
              (dto.artistFee * Number(booking.commissionRate)) / 100;
            return {
              subtotalAmount: dto.artistFee,
              serviceFeeAmount,
              totalAmount: dto.artistFee + serviceFeeAmount,
            };
          })()
        : {};

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CONFIRMED', ...amounts },
      include: BOOKING_NOTIFY_INCLUDE,
    });

    await Promise.all([
      this.notifications.notify(
        booking.clientId,
        'BOOKING_ACCEPTED',
        'Votre réservation est confirmée',
        `Bonne nouvelle ! ${booking.talentProfile.stageName} sera présent(e) pour votre événement. Le montant final est de ${formatAmount(updated.totalAmount)}.${dto.note ? ` ${dto.note}` : ''} Procédez au paiement pour garantir la prestation.`,
        'EMAIL',
        { bookingId },
        {
          details: bookingDetails(updated, 'client'),
          ctaPath: `/talents/${booking.talentProfileId}`,
          ctaLabel: 'Voir le profil',
        },
      ),
      this.notifications.notify(
        booking.talentProfile.userId,
        'BOOKING_ACCEPTED',
        'Nouvelle prestation confirmée',
        `Event Prest'Art vous a programmé(e) pour un événement le ${formatEventDate(updated.eventDate)}. Pour toute question sur cette prestation, contactez l'équipe Event Prest'Art depuis votre messagerie.`,
        'EMAIL',
        { bookingId },
        {
          details: bookingDetails(updated, 'artist'),
          ctaPath: ARTIST_BOOKINGS_PATH,
          ctaLabel: 'Voir mon agenda',
        },
      ),
    ]);

    return updated;
  }

  /** Annulation par le client de sa propre demande. */
  async cancelByClient(bookingId: string, clientId: string, reason?: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: BOOKING_NOTIFY_INCLUDE,
    });
    if (!booking || booking.clientId !== clientId) {
      throw new NotFoundException('Réservation introuvable.');
    }
    return this.cancel(booking, 'client', reason);
  }

  /** Annulation d'une réservation par l'équipe Event Prest'Art. */
  async cancelByAdmin(bookingId: string, reason?: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: BOOKING_NOTIFY_INCLUDE,
    });
    if (!booking) {
      throw new NotFoundException('Réservation introuvable.');
    }
    return this.cancel(booking, 'admin', reason);
  }

  private async cancel(
    booking: BookingForNotification,
    by: 'client' | 'admin',
    reason?: string,
  ) {
    if (
      ['CANCELLED', 'COMPLETED', 'REFUNDED'].includes(booking.status) ||
      (by === 'client' && booking.status === 'PAID')
    ) {
      throw new ForbiddenException(
        by === 'client' && booking.status === 'PAID'
          ? "Cette réservation est déjà payée : contactez l'équipe Event Prest'Art pour l'annuler."
          : 'Cette réservation ne peut plus être annulée.',
      );
    }

    const artistWasInformed = ARTIST_VISIBLE.includes(booking.status);
    const updated = await this.prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
      include: BOOKING_NOTIFY_INCLUDE,
    });
    const when = formatEventDate(booking.eventDate);
    const motif = reason ? ` Motif : ${reason}` : '';

    const tasks: Promise<unknown>[] = [];
    if (by === 'client') {
      tasks.push(
        this.notifications.notifyAdmins(
          'BOOKING_CANCELLED',
          'Réservation annulée par le client',
          `${booking.client.firstName} ${booking.client.lastName} a annulé sa réservation de ${booking.talentProfile.stageName} du ${when}.${motif}${artistWasInformed ? " L'artiste en a été informé." : ''}`,
          { bookingId: booking.id },
          'EMAIL',
          {
            details: this.adminDetails(updated),
            ctaPath: ADMIN_BOOKINGS_PATH,
            ctaLabel: 'Voir les réservations',
          },
        ),
      );
    } else {
      tasks.push(
        this.notifications.notify(
          booking.clientId,
          'BOOKING_CANCELLED',
          'Votre réservation a été annulée',
          `Votre réservation de ${booking.talentProfile.stageName} du ${when} a été annulée par l'équipe Event Prest'Art.${motif} Contactez-nous pour toute question.`,
          'EMAIL',
          { bookingId: booking.id },
          {
            details: bookingDetails(updated, 'client'),
            ctaPath: '/contact',
            ctaLabel: 'Nous contacter',
          },
        ),
      );
    }
    if (artistWasInformed) {
      tasks.push(
        this.notifications.notify(
          booking.talentProfile.userId,
          'BOOKING_CANCELLED',
          'Prestation annulée',
          `La prestation prévue le ${when} a été annulée. Votre date est de nouveau libre.`,
          'EMAIL',
          { bookingId: booking.id },
          {
            details: bookingDetails(updated, 'artist'),
            ctaPath: ARTIST_BOOKINGS_PATH,
            ctaLabel: 'Voir mon agenda',
          },
        ),
      );
    }
    await Promise.all(tasks);

    return updated;
  }

  private adminDetails(booking: BookingForNotification) {
    const { client } = booking;
    return [
      [
        'Client',
        `${client.firstName} ${client.lastName} · ${client.email}${client.phone ? ` · ${client.phone}` : ''}`,
      ] as [string, string],
      ['Artiste', booking.talentProfile.stageName] as [string, string],
      ...bookingDetails(booking, 'admin'),
    ];
  }
}
