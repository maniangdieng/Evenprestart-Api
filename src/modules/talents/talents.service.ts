import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTalentProfileDto } from './dto/create-talent-profile.dto';
import { UpdateTalentProfileDto } from './dto/update-talent-profile.dto';
import { SearchTalentsDto } from './dto/search-talents.dto';

const PUBLIC_INCLUDE = {
  categories: { include: { category: true } },
  media: { orderBy: { position: Prisma.SortOrder.asc } },
  packages: true,
} satisfies Prisma.TalentProfileInclude;

@Injectable()
export class TalentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async createProfile(userId: string, dto: CreateTalentProfileDto) {
    const existing = await this.prisma.talentProfile.findUnique({
      where: { userId },
    });
    if (existing) {
      throw new ConflictException('Ce compte a déjà un profil talent.');
    }

    const { categoryIds, ...data } = dto;
    const profile = await this.prisma.talentProfile.create({
      data: {
        ...data,
        userId,
        categories: {
          create: categoryIds.map((categoryId) => ({ categoryId })),
        },
      },
      include: PUBLIC_INCLUDE,
    });

    await this.notifications.notifyAdmins(
      'SYSTEM',
      'Nouveau profil à valider',
      `${profile.stageName} a créé un profil talent en attente de validation.`,
      { talentProfileId: profile.id },
      'EMAIL',
      { ctaPath: `/admin/profils/${profile.id}`, ctaLabel: 'Examiner le profil' },
    );

    return profile;
  }

  async findById(id: string) {
    const profile = await this.prisma.talentProfile.findUnique({
      where: { id },
      include: PUBLIC_INCLUDE,
    });
    if (!profile) {
      throw new NotFoundException('Profil talent introuvable.');
    }
    return profile;
  }

  findByUserId(userId: string) {
    return this.prisma.talentProfile.findUnique({
      where: { userId },
      include: PUBLIC_INCLUDE,
    });
  }

  /**
   * Front-Office search (cahier des charges 4.A) — filtres catégorie, budget,
   * localisation et disponibilité. Le matching avancé (back-office 4.C) sera
   * branché ici dans une itération ultérieure.
   */
  async search(filters: SearchTalentsDto) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;

    const where: Prisma.TalentProfileWhereInput = {
      isPublished: true,
      ...(filters.categorySlug && {
        categories: { some: { category: { slug: filters.categorySlug } } },
      }),
      ...(filters.location && {
        location: { contains: filters.location, mode: 'insensitive' },
      }),
      ...((filters.budgetMin || filters.budgetMax) && {
        basePriceFrom: {
          ...(filters.budgetMin && { gte: filters.budgetMin }),
          ...(filters.budgetMax && { lte: filters.budgetMax }),
        },
      }),
      ...(filters.availableOn && {
        availabilities: {
          some: {
            date: new Date(filters.availableOn),
            isAvailable: true,
          },
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.talentProfile.findMany({
        where,
        include: PUBLIC_INCLUDE,
        orderBy: { ratingAverage: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.talentProfile.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async update(userId: string, dto: UpdateTalentProfileDto) {
    const { categoryIds, ...data } = dto;
    await this.prisma.talentProfile.update({
      where: { userId },
      data,
    });
    if (categoryIds) {
      await this.prisma.talentProfileCategory.deleteMany({
        where: { talentProfile: { userId } },
      });
      const profile = await this.prisma.talentProfile.findUniqueOrThrow({
        where: { userId },
      });
      await this.prisma.talentProfileCategory.createMany({
        data: categoryIds.map((categoryId) => ({
          talentProfileId: profile.id,
          categoryId,
        })),
      });
    }
    return this.findByUserId(userId);
  }

  updateCoverImage(userId: string, coverImageUrl: string) {
    return this.prisma.talentProfile.update({
      where: { userId },
      data: { coverImageUrl },
      include: PUBLIC_INCLUDE,
    });
  }

  async attachMedia(
    talentProfileId: string,
    kind: 'IMAGE' | 'VIDEO',
    url: string,
    publicId?: string,
  ) {
    const position = await this.prisma.media.count({
      where: { talentProfileId },
    });
    return this.prisma.media.create({
      data: { talentProfileId, kind, url, publicId, position },
    });
  }

  async deleteMedia(userId: string, mediaId: string) {
    const profile = await this.prisma.talentProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException('Profil talent introuvable.');
    }
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
    });
    if (!media || media.talentProfileId !== profile.id) {
      throw new NotFoundException('Média introuvable.');
    }
    await this.prisma.media.delete({ where: { id: mediaId } });
    return media;
  }
}
