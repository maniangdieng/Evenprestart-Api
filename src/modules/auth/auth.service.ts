import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { OtpService } from './otp.service';
import { MailService } from '../mail/mail.service';

const REFRESH_SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly otp: OtpService,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Un compte existe déjà avec cet email.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role ?? 'CLIENT',
      },
    });

    // Les comptes artiste doivent vérifier leur email par OTP avant de
    // recevoir des tokens de session — les autres rôles gardent le
    // parcours existant (connexion immédiate après inscription).
    if (user.role === 'ARTIST') {
      await this.otp.issue(user.id, user.email, user.firstName);
      return { requiresVerification: true as const, email: user.email };
    }

    void this.mail.sendWelcomeEmail(user);
    return this.issueTokens(user.id, user.email, user.role);
  }

  async verifyEmail(email: string, code: string) {
    const user = await this.otp.verify(email, code);
    // `verify` renvoie l'utilisateur tel qu'avant validation : on n'envoie
    // la bienvenue qu'à la première vérification, pas à chaque rappel.
    if (!user.isEmailVerified) {
      void this.mail.sendWelcomeEmail(user);
    }
    return this.issueTokens(user.id, user.email, user.role);
  }

  async resendOtp(email: string) {
    return this.otp.resend(email);
  }

  async validateCredentials(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Identifiants invalides.');
    }
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Identifiants invalides.');
    }
    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.validateCredentials(dto.email, dto.password);
    if (user.role === 'ARTIST' && !user.isEmailVerified) {
      throw new UnauthorizedException(
        'Vérifiez votre email avant de vous connecter. Demandez un nouveau code si besoin.',
      );
    }
    return this.issueTokens(user.id, user.email, user.role);
  }

  /**
   * Connexion / inscription via Google (flux « authorization code »). Le code
   * est échangé ici avec le client secret, puis l'ID token est vérifié
   * (signature, audience, expiration) avant de faire confiance à l'email.
   */
  async loginWithGoogle(dto: GoogleAuthDto) {
    const clientId = this.config.get<string>('oauth.google.clientId');
    const clientSecret = this.config.get<string>('oauth.google.clientSecret');
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        "La connexion Google n'est pas encore configurée.",
      );
    }

    const client = new OAuth2Client({ clientId, clientSecret, redirectUri: dto.redirectUri });
    let profile: TokenPayload | undefined;
    try {
      const { tokens } = await client.getToken(dto.code);
      if (!tokens.id_token) throw new Error('id_token manquant');
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
      profile = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Connexion Google refusée, veuillez réessayer.');
    }
    if (!profile?.email || !profile.email_verified) {
      throw new UnauthorizedException("Votre adresse Google n'est pas vérifiée.");
    }

    const email = profile.email.toLowerCase();
    let user =
      (await this.prisma.user.findFirst({
        where: { authProvider: 'GOOGLE', providerId: profile.sub },
      })) ?? (await this.prisma.user.findUnique({ where: { email } }));

    if (user) {
      if (!user.isActive) {
        throw new UnauthorizedException('Ce compte a été désactivé.');
      }
      // Compte existant (créé par email/mot de passe) : on le relie à Google.
      // Google ayant vérifié l'adresse, l'email du compte est considéré vérifié.
      if (!user.providerId || !user.isEmailVerified) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            providerId: user.providerId ?? profile.sub,
            isEmailVerified: true,
            avatarUrl: user.avatarUrl ?? profile.picture ?? null,
          },
        });
      }
    } else {
      user = await this.prisma.user.create({
        data: {
          email,
          firstName: profile.given_name ?? email.split('@')[0],
          lastName: profile.family_name ?? '',
          role: dto.role ?? 'CLIENT',
          authProvider: 'GOOGLE',
          providerId: profile.sub,
          avatarUrl: profile.picture ?? null,
          isEmailVerified: true,
        },
      });
      void this.mail.sendWelcomeEmail(user);
    }

    return this.issueTokens(user.id, user.email, user.role);
  }

  async refresh(userId: string, presentedToken: string) {
    const candidates = await this.prisma.refreshToken.findMany({
      where: { userId, revoked: false, expiresAt: { gt: new Date() } },
    });

    const match = await this.findMatchingToken(candidates, presentedToken);
    if (!match) {
      throw new UnauthorizedException('Session invalide, reconnectez-vous.');
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    await this.prisma.refreshToken.update({
      where: { id: match.id },
      data: { revoked: true },
    });

    return this.issueTokens(user.id, user.email, user.role);
  }

  async logout(userId: string, presentedToken: string) {
    const candidates = await this.prisma.refreshToken.findMany({
      where: { userId, revoked: false },
    });
    const match = await this.findMatchingToken(candidates, presentedToken);
    if (match) {
      await this.prisma.refreshToken.update({
        where: { id: match.id },
        data: { revoked: true },
      });
    }
  }

  private async findMatchingToken(
    candidates: { id: string; tokenHash: string }[],
    presentedToken: string,
  ) {
    for (const candidate of candidates) {
      if (await bcrypt.compare(presentedToken, candidate.tokenHash)) {
        return candidate;
      }
    }
    return null;
  }

  private async issueTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<string>('jwt.accessExpiresIn') as never,
    });

    const refreshExpiresIn = this.config.get<string>('jwt.refreshExpiresIn')!;
    const refreshToken = this.jwt.sign(
      { sub: userId, email },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: refreshExpiresIn as never,
      },
    );

    const tokenHash = await bcrypt.hash(refreshToken, REFRESH_SALT_ROUNDS);
    const decoded = this.jwt.decode(refreshToken) as { exp: number };
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(decoded.exp * 1000),
      },
    });

    return { accessToken, refreshToken };
  }
}
