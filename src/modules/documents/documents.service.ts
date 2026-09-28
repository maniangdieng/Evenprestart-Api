import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { DocumentType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaService } from '../media/media.service';

const TYPE_LABELS: Record<DocumentType, string> = {
  QUOTE: 'DEVIS',
  CONTRACT: 'CONTRAT DE BOOKING',
  INVOICE_PROFORMA: 'FACTURE PRO-FORMA',
  INVOICE_FINAL: 'FACTURE',
};

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
  ) {}

  /**
   * Génère un PDF (contrat/facture) à partir des données de réservation
   * (cahier des charges 4.C) et l'archive sur Cloudinary.
   */
  async generate(bookingId: string, type: DocumentType) {
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { talentProfile: true, client: true },
    });

    const number = `${type}-${Date.now()}`;
    const buffer = await this.renderPdf(booking, type, number);
    const upload = await this.mediaService.uploadBuffer(
      buffer,
      'documents',
      'auto',
    );

    return this.prisma.document.create({
      data: {
        bookingId,
        type,
        number,
        fileUrl: upload.secure_url,
      },
    });
  }

  private renderPdf(
    booking: {
      id: string;
      eventDate: Date;
      location: string;
      subtotalAmount: unknown;
      serviceFeeAmount: unknown;
      totalAmount: unknown;
      talentProfile: { stageName: string };
      client: { firstName: string; lastName: string };
    },
    type: DocumentType,
    number: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).text("EVENT PREST'ART", { align: 'right' });
      doc.moveDown();
      doc.fontSize(16).text(TYPE_LABELS[type]);
      doc.fontSize(10).text(`N° ${number}`);
      doc.moveDown();
      doc
        .fontSize(11)
        .text(`Client : ${booking.client.firstName} ${booking.client.lastName}`)
        .text(`Talent : ${booking.talentProfile.stageName}`)
        .text(`Date de l'événement : ${booking.eventDate.toLocaleDateString('fr-FR')}`)
        .text(`Lieu : ${booking.location}`);
      doc.moveDown();
      doc
        .text(`Sous-total : ${booking.subtotalAmount} XOF`)
        .text(`Frais de service : ${booking.serviceFeeAmount} XOF`)
        .fontSize(13)
        .text(`Total : ${booking.totalAmount} XOF`, { underline: true });

      doc.end();
    });
  }
}
