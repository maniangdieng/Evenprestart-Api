import {
  EmailDetail,
  formatAmount,
  formatEventDate,
} from '../mail/mail.templates';

/**
 * Destinataire du récapitulatif : l'artiste ne voit que son cachet
 * (sous-total), jamais le prix payé par le client ni la commission.
 */
export type BookingAudience = 'client' | 'artist' | 'admin';

/** Récapitulatif d'une réservation affiché dans les emails. */
export function bookingDetails(
  booking: {
    eventDate: Date;
    location: string;
    subtotalAmount: unknown;
    totalAmount: unknown;
    servicePackage?: { name: string } | null;
  },
  audience: BookingAudience,
): EmailDetail[] {
  const amounts: EmailDetail[] =
    audience === 'artist'
      ? [['Votre cachet', formatAmount(booking.subtotalAmount)]]
      : audience === 'admin'
        ? [
            ['Cachet artiste', formatAmount(booking.subtotalAmount)],
            ['Total client', formatAmount(booking.totalAmount)],
          ]
        : [['Montant total', formatAmount(booking.totalAmount)]];

  return [
    ['Date', formatEventDate(booking.eventDate)],
    ['Lieu', booking.location],
    ...(booking.servicePackage
      ? ([['Formule', booking.servicePackage.name]] as EmailDetail[])
      : []),
    ...amounts,
  ];
}
