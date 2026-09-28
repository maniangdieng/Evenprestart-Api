import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MessagesService } from './messages.service';
import { SupportMessageDto } from './dto/support-message.dto';

@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  // ============ SUPPORT (client/artiste <-> admin) ============

  @UseGuards(RolesGuard)
  @Roles('CLIENT', 'ARTIST')
  @Post('support')
  sendSupportMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SupportMessageDto,
  ) {
    return this.messagesService.sendSupportMessage(user.userId, dto.content);
  }

  @UseGuards(RolesGuard)
  @Roles('CLIENT', 'ARTIST')
  @Get('support/mine')
  findMySupportConversation(@CurrentUser() user: AuthenticatedUser) {
    return this.messagesService.findMySupportConversation(user.userId);
  }

  @UseGuards(RolesGuard)
  @Roles('CLIENT', 'ARTIST')
  @Get('support/mine/unread-count')
  countMyUnreadSupportMessages(@CurrentUser() user: AuthenticatedUser) {
    return this.messagesService.countMyUnreadSupportMessages(user.userId);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get('support')
  listSupportConversations() {
    return this.messagesService.listSupportConversations();
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get('support/unread-count')
  countTotalUnreadSupportMessages() {
    return this.messagesService.countTotalUnreadSupportMessages();
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('support/open/:userId')
  openSupportConversationWith(@Param('userId') userId: string) {
    return this.messagesService.openSupportConversationWith(userId);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get('support/:conversationId')
  getSupportConversation(@Param('conversationId') conversationId: string) {
    return this.messagesService.getSupportConversation(conversationId);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('support/:conversationId/reply')
  replyToSupportConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Body() dto: SupportMessageDto,
  ) {
    return this.messagesService.replyToSupportConversation(
      user.userId,
      conversationId,
      dto.content,
    );
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch('support/:conversationId/close')
  closeSupportConversation(@Param('conversationId') conversationId: string) {
    return this.messagesService.closeSupportConversation(conversationId);
  }
}
