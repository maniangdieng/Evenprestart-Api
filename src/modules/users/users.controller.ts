import {
  BadRequestException,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MediaService } from '../media/media.service';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly mediaService: MediaService,
  ) {}

  @Get('me')
  async me(@CurrentUser() currentUser: AuthenticatedUser) {
    const { passwordHash: _passwordHash, ...user } =
      await this.usersService.findById(currentUser.userId);
    return user;
  }

  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, callback) => {
        if (!/^image\//.test(file.mimetype)) {
          callback(new BadRequestException('Seuls les fichiers image sont acceptés.'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  async uploadAvatar(
    @CurrentUser() currentUser: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Fichier manquant.');
    }
    const result = await this.mediaService.uploadBuffer(file.buffer, 'avatars', 'image');
    const { passwordHash: _passwordHash, ...user } = await this.usersService.updateAvatar(
      currentUser.userId,
      result.secure_url,
    );
    return user;
  }
}
