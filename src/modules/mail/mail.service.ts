import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailContent, renderEmail } from './mail.templates';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

export interface MailRecipient {
  email: string;
  name?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  private get brandName() {
    return this.config.get<string>('notifications.mailFromName')!;
  }

  /** URL absolue vers le front (pour les boutons d'action des emails). */
  webUrl(path = '/') {
    const base = this.config.get<string>('webUrl')!.replace(/\/$/, '');
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }

  /**
   * Envoie un email transactionnel via l'API Brevo.
   * Lève une erreur si Brevo refuse l'envoi — les appelants non critiques
   * doivent passer par `sendSafe` pour ne pas bloquer l'action métier.
   */
  async send(
    to: MailRecipient,
    subject: string,
    content: EmailContent,
    tags: string[] = [],
  ) {
    const apiKey = this.config.get<string>('notifications.brevoApiKey');
    if (!apiKey) {
      this.logger.warn(
        `BREVO_API_KEY manquant — email non envoyé à ${to.email} : "${subject}"`,
      );
      return;
    }

    const response = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: {
          email: this.config.get<string>('notifications.mailFrom'),
          name: this.brandName,
        },
        to: [{ email: to.email, name: to.name }],
        subject,
        htmlContent: renderEmail(content, {
          name: this.brandName,
          logoUrl: this.config.get<string>('notifications.mailLogoUrl')!,
          webUrl: this.webUrl('/'),
        }),
        tags,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(`Échec de l'envoi Brevo (${response.status}): ${body}`);
      throw new Error(`Échec de l'envoi de l'email "${subject}".`);
    }
  }

  /** Variante non bloquante : journalise l'échec au lieu de le propager. */
  async sendSafe(
    to: MailRecipient,
    subject: string,
    content: EmailContent,
    tags: string[] = [],
  ) {
    try {
      await this.send(to, subject, content, tags);
    } catch (error) {
      this.logger.error(
        `Email "${subject}" non délivré à ${to.email}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  // ============ EMAILS DE COMPTE ============

  async sendOtpEmail(to: string, firstName: string, code: string) {
    const expiryMinutes = this.config.get<number>('otp.expiryMinutes');
    if (!this.config.get<string>('notifications.brevoApiKey')) {
      this.logger.warn(`Code de vérification pour ${to} : ${code}`);
    }
    await this.send(
      { email: to, name: firstName },
      `Votre code de vérification ${this.brandName}`,
      {
        heading: `Bienvenue ${firstName}`,
        paragraphs: [
          `Voici votre code de vérification pour activer votre compte artiste ${this.brandName} :`,
        ],
        highlight: code,
        footnote: `Ce code expire dans ${expiryMinutes} minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
      },
      ['otp'],
    );
  }

  sendWelcomeEmail(user: { email: string; firstName: string; role: string }) {
    const isArtist = user.role === 'ARTIST';
    return this.sendSafe(
      { email: user.email, name: user.firstName },
      `Bienvenue sur ${this.brandName} !`,
      {
        heading: 'Votre compte est prêt',
        greeting: `Bonjour ${user.firstName},`,
        paragraphs: isArtist
          ? [
              `Merci d'avoir rejoint ${this.brandName}. Complétez votre profil talent (présentation, galerie, formules) : il sera examiné par notre équipe puis publié.`,
              'Vous recevrez un email à chaque nouvelle demande de réservation.',
            ]
          : [
              `Merci d'avoir rejoint ${this.brandName}. Découvrez les artistes et prestataires disponibles et réservez-les pour vos événements en quelques clics.`,
            ],
        cta: isArtist
          ? {
              label: 'Compléter mon profil',
              url: this.webUrl('/artiste/parametres'),
            }
          : { label: 'Découvrir les talents', url: this.webUrl('/decouvrir') },
      },
      ['welcome'],
    );
  }

  sendAccountCreatedByAdmin(user: {
    email: string;
    firstName: string;
    role: string;
  }) {
    return this.sendSafe(
      { email: user.email, name: user.firstName },
      `Un compte ${this.brandName} a été créé pour vous`,
      {
        heading: 'Votre compte a été créé',
        greeting: `Bonjour ${user.firstName},`,
        paragraphs: [
          `Un administrateur ${this.brandName} vient de créer votre compte avec l'adresse ${user.email}.`,
          "Votre mot de passe vous sera communiqué par l'administrateur. Pensez à le changer après votre première connexion.",
        ],
        cta: { label: 'Se connecter', url: this.webUrl('/connexion') },
      },
      ['account'],
    );
  }

  sendAccountStatusEmail(
    user: { email: string; firstName: string },
    isActive: boolean,
  ) {
    return this.sendSafe(
      { email: user.email, name: user.firstName },
      isActive ? 'Votre compte a été réactivé' : 'Votre compte a été suspendu',
      {
        heading: isActive ? 'Compte réactivé' : 'Compte suspendu',
        greeting: `Bonjour ${user.firstName},`,
        paragraphs: isActive
          ? [
              'Votre compte a été réactivé. Vous pouvez de nouveau vous connecter.',
            ]
          : [
              "Votre compte a été suspendu par l'équipe d'administration. Pour toute question, contactez-nous.",
            ],
        cta: isActive
          ? { label: 'Se connecter', url: this.webUrl('/connexion') }
          : { label: 'Nous contacter', url: this.webUrl('/contact') },
      },
      ['account'],
    );
  }
}
