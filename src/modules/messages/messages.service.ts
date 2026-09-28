import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';

const PARTICIPANT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  avatarUrl: true,
  role: true,
} as const;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
  ) {}

  // ============ MESSAGERIE DE SUPPORT (client/artiste <-> admin) ============
  // Seul canal de discussion de la plateforme : client et artiste échangent
  // uniquement avec l'équipe Event Prest'Art, jamais entre eux.

  private async getOrCreateSupportConversation(participantId: string) {
    return this.prisma.conversation.upsert({
      where: { participantId },
      update: {},
      create: { participantId },
    });
  }

  /**
   * Un admin ouvre (ou retrouve) le fil d'un client ou d'un artiste pour lui
   * écrire en premier — ex. pour négocier une réservation avec l'artiste.
   */
  async openSupportConversationWith(participantId: string) {
    const participant = await this.prisma.user.findUnique({
      where: { id: participantId },
      select: { role: true },
    });
    if (!participant || !['CLIENT', 'ARTIST'].includes(participant.role)) {
      throw new NotFoundException('Client ou artiste introuvable.');
    }
    return this.getOrCreateSupportConversation(participantId);
  }

  /** Le client ou l'artiste envoie un message à l'équipe admin. */
  async sendSupportMessage(participantId: string, content: string) {
    const conversation = await this.getOrCreateSupportConversation(participantId);

    const [message] = await this.prisma.$transaction([
      this.prisma.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          authorId: participantId,
          isAdminReply: false,
          content,
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date(), status: 'OPEN' },
      }),
    ]);

    this.realtime.emitToAdmins('support:message', {
      conversationId: conversation.id,
      message,
    });
    await this.notifications.notifyAdmins(
      'NEW_MESSAGE',
      'Nouveau message support',
      content.slice(0, 140),
      { conversationId: conversation.id },
    );

    return message;
  }

  /** Fil de discussion support du client/artiste connecté. */
  async findMySupportConversation(participantId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { participantId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) return null;

    await this.prisma.conversationMessage.updateMany({
      where: { conversationId: conversation.id, isAdminReply: true, readAt: null },
      data: { readAt: new Date() },
    });

    return conversation;
  }

  async countMyUnreadSupportMessages(participantId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { participantId },
      select: { id: true },
    });
    if (!conversation) return 0;
    return this.prisma.conversationMessage.count({
      where: { conversationId: conversation.id, isAdminReply: true, readAt: null },
    });
  }

  /** Vue admin : toutes les conversations de support, triées par activité récente. */
  async listSupportConversations() {
    const conversations = await this.prisma.conversation.findMany({
      include: {
        participant: { select: PARTICIPANT_SELECT },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    const unreadCounts = await this.prisma.conversationMessage.groupBy({
      by: ['conversationId'],
      where: { isAdminReply: false, readAt: null },
      _count: true,
    });
    const unreadByConversation = new Map(
      unreadCounts.map((row) => [row.conversationId, row._count]),
    );

    return conversations.map(({ messages, ...conversation }) => ({
      ...conversation,
      lastMessage: messages[0] ?? null,
      unreadCount: unreadByConversation.get(conversation.id) ?? 0,
    }));
  }

  async countTotalUnreadSupportMessages() {
    return this.prisma.conversationMessage.count({
      where: { isAdminReply: false, readAt: null },
    });
  }

  /** Vue admin : fil complet d'une conversation, marque les messages participant comme lus. */
  async getSupportConversation(conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participant: { select: PARTICIPANT_SELECT },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation introuvable.');
    }

    await this.prisma.conversationMessage.updateMany({
      where: { conversationId, isAdminReply: false, readAt: null },
      data: { readAt: new Date() },
    });

    return conversation;
  }

  /** Un administrateur répond dans le fil — n'importe quel admin peut répondre. */
  async replyToSupportConversation(adminId: string, conversationId: string, content: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participant: { select: { role: true } } },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation introuvable.');
    }

    const [message] = await this.prisma.$transaction([
      this.prisma.conversationMessage.create({
        data: { conversationId, authorId: adminId, isAdminReply: true, content },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    this.realtime.emitToUser(conversation.participantId, 'support:message', {
      conversationId,
      message,
    });
    await this.notifications.notify(
      conversation.participantId,
      'NEW_MESSAGE',
      "Réponse de l'équipe PREST'ART",
      content.slice(0, 1000),
      'EMAIL',
      { conversationId },
      // Seuls les artistes ont un espace de messagerie dédié côté front.
      conversation.participant.role === 'ARTIST'
        ? { ctaPath: '/artiste/messages', ctaLabel: 'Répondre' }
        : { ctaPath: '/contact', ctaLabel: 'Nous contacter' },
    );

    return message;
  }

  async closeSupportConversation(conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation introuvable.');
    }
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { status: 'CLOSED' },
    });
  }
}
