import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  /** KPIs du Back-Office (cahier des charges 4.C). */
  async getDashboardStats() {
    const [revenue, bookingsCount, completedCount, openDisputes, topTalents] =
      await Promise.all([
        this.prisma.booking.aggregate({
          where: { status: { in: ['PAID', 'COMPLETED'] } },
          _sum: { totalAmount: true, serviceFeeAmount: true },
        }),
        this.prisma.booking.count(),
        this.prisma.booking.count({ where: { status: 'COMPLETED' } }),
        this.prisma.dispute.count({ where: { status: 'OPEN' } }),
        this.prisma.talentProfile.findMany({
          orderBy: [{ ratingAverage: 'desc' }, { ratingCount: 'desc' }],
          take: 5,
          select: { id: true, stageName: true, ratingAverage: true, ratingCount: true },
        }),
      ]);

    const conversionRate =
      bookingsCount === 0 ? 0 : (completedCount / bookingsCount) * 100;

    return {
      totalRevenue: revenue._sum.totalAmount ?? 0,
      totalCommission: revenue._sum.serviceFeeAmount ?? 0,
      bookingsCount,
      completedCount,
      conversionRate,
      openDisputes,
      topTalents,
    };
  }

  listPendingProfiles() {
    return this.prisma.talentProfile.findMany({
      where: { isVerified: false },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });
  }

  async validateProfile(id: string) {
    const profile = await this.prisma.talentProfile.update({
      where: { id },
      data: { isVerified: true, isPublished: true, verifiedAt: new Date() },
    });
    await this.notifications.notify(
      profile.userId,
      'PROFILE_VALIDATED',
      'Profil validé',
      'Félicitations ! Votre profil talent a été validé par notre équipe et est maintenant visible publiquement. Vous pouvez dès à présent recevoir des demandes de réservation.',
      'EMAIL',
      { talentProfileId: profile.id },
      { ctaPath: `/talents/${profile.id}`, ctaLabel: 'Voir mon profil public' },
    );
    return profile;
  }

  listDisputes() {
    return this.prisma.dispute.findMany({
      where: { status: 'OPEN' },
      include: { booking: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async resolveDispute(id: string, resolution: string) {
    const dispute = await this.prisma.dispute.update({
      where: { id },
      data: { status: 'RESOLVED', resolution, resolvedAt: new Date() },
      include: {
        booking: { include: { talentProfile: { select: { userId: true } } } },
      },
    });
    await Promise.all([
      this.notifications.notify(
        dispute.booking.clientId,
        'DISPUTE_UPDATE',
        'Litige résolu',
        `Votre litige a été résolu : ${resolution}`,
        'EMAIL',
        { disputeId: dispute.id },
      ),
      this.notifications.notify(
        dispute.booking.talentProfile.userId,
        'DISPUTE_UPDATE',
        'Litige résolu',
        `Le litige concernant votre réservation a été résolu : ${resolution}`,
        'EMAIL',
        { disputeId: dispute.id },
        { ctaPath: '/artiste/reservations', ctaLabel: 'Voir mes réservations' },
      ),
    ]);
    return dispute;
  }

  async listUsers(filters: { role?: UserRole; search?: string }) {
    const users = await this.prisma.user.findMany({
      where: {
        ...(filters.role && { role: filters.role }),
        ...(filters.search && {
          OR: [
            { firstName: { contains: filters.search, mode: 'insensitive' } },
            { lastName: { contains: filters.search, mode: 'insensitive' } },
            { email: { contains: filters.search, mode: 'insensitive' } },
          ],
        }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatarUrl: true,
        isActive: true,
        createdAt: true,
        talentProfile: { select: { id: true, stageName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return users;
  }

  async createUser(dto: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: UserRole;
    phone?: string;
  }) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Un compte existe déjà avec cet email.');
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const { passwordHash: _passwordHash, ...user } = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        phone: dto.phone,
        isEmailVerified: true,
        isActive: true,
      },
    });
    void this.mail.sendAccountCreatedByAdmin(user);
    return user;
  }

  async setUserRole(id: string, role: UserRole) {
    const { passwordHash: _passwordHash, ...user } = await this.prisma.user.update({
      where: { id },
      data: { role },
    });
    return user;
  }

  async setUserActive(id: string, isActive: boolean) {
    const { passwordHash: _passwordHash, ...user } = await this.prisma.user.update({
      where: { id },
      data: { isActive },
    });
    void this.mail.sendAccountStatusEmail(user, isActive);
    return user;
  }

  listBookings(filters: { status?: BookingStatus }) {
    return this.prisma.booking.findMany({
      where: { ...(filters.status && { status: filters.status }) },
      include: {
        // Coordonnées des deux parties : c'est l'équipe qui les contacte.
        talentProfile: {
          select: {
            id: true,
            stageName: true,
            user: {
              select: { id: true, email: true, phone: true, firstName: true },
            },
          },
        },
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        servicePackage: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProfileDetail(id: string) {
    const profile = await this.prisma.talentProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true, phone: true, createdAt: true },
        },
        categories: { include: { category: true } },
        media: { orderBy: { position: 'asc' } },
        packages: true,
      },
    });
    if (!profile) {
      throw new NotFoundException('Profil talent introuvable.');
    }
    return profile;
  }
}
