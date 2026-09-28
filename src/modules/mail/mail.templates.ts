// Gabarits HTML des emails transactionnels Event Prest'Art.
// Mise en page en tableaux + styles inline : c'est ce que les clients mail
// (Gmail, Outlook…) rendent de façon fiable, les <style> étant souvent ignorés.

export type EmailDetail = [label: string, value: string];

/** Identité visuelle appliquée à tous les emails. */
export interface EmailBrand {
  name: string;
  /** URL publique HTTPS du logo (carré, fond transparent ou rond). */
  logoUrl: string;
  webUrl: string;
}

// Couleurs de la charte (cf. web/src/app/globals.css).
const NAVY = '#0b1022';
const LIME = '#c7e23f';

export interface EmailContent {
  heading: string;
  greeting?: string;
  paragraphs: string[];
  details?: EmailDetail[];
  cta?: { label: string; url: string };
  /** Bloc mis en avant (ex. code OTP). Inséré tel quel après échappement. */
  highlight?: string;
  footnote?: string;
}

export function formatEventDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Dakar',
  });
}

export function formatAmount(amount: unknown, currency = 'XOF'): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderEmail(content: EmailContent, brand: EmailBrand): string {
  const brandName = brand.name;
  // Texte d'aperçu affiché sous l'objet dans la boîte de réception et dans
  // les notifications mobiles ; masqué dans le corps de l'email.
  const preheader = escapeHtml(
    (content.paragraphs[0] ?? content.heading).slice(0, 140),
  );

  const greeting = content.greeting
    ? `<p style="margin:0 0 16px;">${escapeHtml(content.greeting)}</p>`
    : '';

  const paragraphs = content.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;line-height:1.55;">${escapeHtml(p)}</p>`,
    )
    .join('');

  const highlight = content.highlight
    ? `<p style="margin:8px 0 24px;font-size:32px;font-weight:bold;letter-spacing:8px;color:#0b1022;">${escapeHtml(content.highlight)}</p>`
    : '';

  const details = content.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;border-collapse:collapse;background:#f6f7fb;border-radius:8px;">
        ${content.details
          .map(
            ([label, value]) => `<tr>
              <td style="padding:10px 16px;color:#667085;font-size:13px;width:40%;">${escapeHtml(label)}</td>
              <td style="padding:10px 16px;font-size:14px;font-weight:600;">${escapeHtml(value)}</td>
            </tr>`,
          )
          .join('')}
      </table>`
    : '';

  const cta = content.cta
    ? `<p style="margin:8px 0 24px;">
        <a href="${escapeHtml(content.cta.url)}" style="display:inline-block;background:${LIME};color:${NAVY};text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;">${escapeHtml(content.cta.label)}</a>
      </p>`
    : '';

  const footnote = content.footnote
    ? `<p style="margin:0;color:#667085;font-size:12px;line-height:1.5;">${escapeHtml(content.footnote)}</p>`
    : '';

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light only">
    <title>${escapeHtml(content.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef0f5;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f5;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#14171f;">
          <tr><td align="center" style="background:${NAVY};padding:28px 28px 22px;">
            <a href="${escapeHtml(brand.webUrl)}" style="text-decoration:none;">
              <img src="${escapeHtml(brand.logoUrl)}" width="64" height="64" alt="${escapeHtml(brandName)}" style="display:block;width:64px;height:64px;border:0;border-radius:50%;margin:0 auto;">
              <div style="margin-top:12px;color:${LIME};font-size:15px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;">${escapeHtml(brandName)}</div>
            </a>
          </td></tr>
          <tr><td style="padding:28px;">
            <h1 style="margin:0 0 20px;font-size:22px;color:${NAVY};">${escapeHtml(content.heading)}</h1>
            ${greeting}${paragraphs}${highlight}${details}${cta}${footnote}
          </td></tr>
          <tr><td align="center" style="padding:18px 28px;background:#f6f7fb;color:#98a2b3;font-size:11px;line-height:1.6;">
            Cet email vous a été envoyé automatiquement par ${escapeHtml(brandName)}. Merci de ne pas y répondre directement.<br>
            <a href="${escapeHtml(brand.webUrl)}" style="color:#667085;">${escapeHtml(brand.webUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
