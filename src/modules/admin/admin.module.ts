import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [BookingsModule, NotificationsModule, MailModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
