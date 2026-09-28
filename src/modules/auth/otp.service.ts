import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

const OTP_SALT_ROUNDS = 10;
const OTP_LENGTH = 6;

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  private generateCode(): string {
    const min = 10 ** (OTP_LENGTH - 1);
    const max = 10 ** OTP_LENGTH - 1;
    return String(Math.floor(min + Math.random() * (max - min + 1)));
  }

  async issue(userId: string, email: string, firstName: string) {
    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, OTP_SALT_ROUNDS);
    const expiryMinutes = this.config.get<number>('otp.expiryMinutes')!;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60_000);

    await this.prisma.emailVerificationCode.create({
      data: { userId, codeHash, expiresAt },
    });

    try {
      await this.mail.sendOtpEmail(email, firstName, code);
    } catch {
      // L'email n'est pas parti — l'utilisateur pourra en redemander un via /auth/resend-otp.
    }
  }

  async resend(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.isEmailVerified) {
      // On ne révèle pas si le compte existe ou est déjà vérifié.
      return { success: true };
    }

    const cooldownSeconds = this.config.get<number>(
      'otp.resendCooldownSeconds',
    )!;
    const latest = await this.prisma.emailVerificationCode.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    if (
      latest &&
      Date.now() - latest.createdAt.getTime() < cooldownSeconds * 1000
    ) {
      throw new BadRequestException(
        'Veuillez patienter avant de redemander un code.',
      );
    }

    await this.issue(user.id, user.email, user.firstName);
    return { success: true };
  }

  async verify(email: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException('Compte introuvable.');
    }
    if (user.isEmailVerified) {
      return user;
    }

    const record = await this.prisma.emailVerificationCode.findFirst({
      where: { userId: user.id, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!record || record.expiresAt < new Date()) {
      throw new BadRequestException('Code expiré, demandez-en un nouveau.');
    }

    const maxAttempts = this.config.get<number>('otp.maxAttempts')!;
    if (record.attempts >= maxAttempts) {
      throw new BadRequestException(
        'Trop de tentatives, demandez un nouveau code.',
      );
    }

    const matches = await bcrypt.compare(code, record.codeHash);
    if (!matches) {
      await this.prisma.emailVerificationCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Code invalide.');
    }

    await this.prisma.$transaction([
      this.prisma.emailVerificationCode.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { isEmailVerified: true },
      }),
    ]);

    return user;
  }
}
