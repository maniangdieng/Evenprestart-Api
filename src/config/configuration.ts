export default () => {
  // URL publique du front, utilisée pour les liens dans les emails.
  const webUrl =
    process.env.APP_WEB_URL ??
    process.env.CORS_ORIGIN?.split(',')[0] ??
    'http://localhost:3000';

  return {
    env: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3001', 10),
    apiPrefix: process.env.API_PREFIX ?? 'api',
    // Liste d'origines séparées par des virgules. Le « / » final est retiré :
    // le navigateur envoie son origine sans slash et la comparaison CORS est
    // exacte (« https://site.app/ » refuserait « https://site.app »).
    corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    webUrl,

    database: {
      url: process.env.DATABASE_URL,
    },

    redis: {
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    },

    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
      accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
      refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    },

    oauth: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      },
      facebook: {
        appId: process.env.FACEBOOK_APP_ID,
        appSecret: process.env.FACEBOOK_APP_SECRET,
      },
    },

    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.CLOUDINARY_API_SECRET,
    },

    payments: {
      wave: { apiKey: process.env.WAVE_API_KEY },
      orangeMoney: { apiKey: process.env.ORANGE_MONEY_API_KEY },
      freeMoney: { apiKey: process.env.FREE_MONEY_API_KEY },
      stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      },
      paypal: {
        clientId: process.env.PAYPAL_CLIENT_ID,
        clientSecret: process.env.PAYPAL_CLIENT_SECRET,
      },
    },

    notifications: {
      sendgridApiKey: process.env.SENDGRID_API_KEY,
      resendApiKey: process.env.RESEND_API_KEY,
      brevoApiKey: process.env.BREVO_API_KEY,
      mailFrom: process.env.MAIL_FROM ?? 'no-reply@eventprestart.sn',
      mailFromName: process.env.MAIL_FROM_NAME ?? "Event Prest'Art",
      // Logo affiché en tête des emails : doit être une URL publique en HTTPS
      // (les clients mail ne peuvent pas joindre localhost).
      mailLogoUrl:
        process.env.MAIL_LOGO_URL ||
        `${webUrl.replace(/\/$/, '')}/brand/logo-icon.png`,
      twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        fromNumber: process.env.TWILIO_FROM_NUMBER,
      },
    },

    otp: {
      expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES ?? '10', 10),
      maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS ?? '5', 10),
      resendCooldownSeconds: parseInt(
        process.env.OTP_RESEND_COOLDOWN_SECONDS ?? '60',
        10,
      ),
    },
  };
};
