import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(authorId: string, dto: CreateReviewDto) {
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: dto.bookingId },
      include: { talentProfile: { select: { userId: true } } },
    });
    if (booking.clientId !== authorId) {
      throw new ForbiddenException(
        "Seul le client de cette réservation peut laisser un avis.",
      );
    }
    if (booking.status !== 'COMPLETED') {
      throw new BadRequestException(
        'La prestation doit être terminée avant de laisser un avis.',
      );
    }

    const review = await this.prisma.review.create({
      data: {
        bookingId: dto.bookingId,
        authorId,
        talentProfileId: booking.talentProfileId,
        rating: dto.rating,
        comment: dto.comment,
      },
    });

    await this.recomputeRating(booking.talentProfileId);
    await this.notifications.notify(
      booking.talentProfile.userId,
      'REVIEW_RECEIVED',
      'Nouvel avis reçu',
      `Un client vous a laissé un avis ${dto.rating}/5${dto.comment ? ` : « ${dto.comment.slice(0, 280)} »` : '.'}`,
      'EMAIL',
      { reviewId: review.id },
      { ctaPath: '/artiste/avis', ctaLabel: 'Voir mes avis' },
    );
    return review;
  }

  findByTalent(talentProfileId: string) {
    return this.prisma.review.findMany({
      where: { talentProfileId },
      include: { author: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async recomputeRating(talentProfileId: string) {
    const aggregate = await this.prisma.review.aggregate({
      where: { talentProfileId },
      _avg: { rating: true },
      _count: true,
    });
    await this.prisma.talentProfile.update({
      where: { id: talentProfileId },
      data: {
        ratingAverage: aggregate._avg.rating ?? 0,
        ratingCount: aggregate._count,
      },
    });
  }
}
