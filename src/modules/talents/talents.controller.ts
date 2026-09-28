import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MediaService } from '../media/media.service';
import { TalentsService } from './talents.service';
import { CreateTalentProfileDto } from './dto/create-talent-profile.dto';
import { UpdateTalentProfileDto } from './dto/update-talent-profile.dto';
import { SearchTalentsDto } from './dto/search-talents.dto';

@Controller('talents')
export class TalentsController {
  constructor(
    private readonly talentsService: TalentsService,
    private readonly mediaService: MediaService,
  ) {}

  @Public()
  @Get()
  search(@Query() query: SearchTalentsDto) {
    return this.talentsService.search(query);
  }

  @UseGuards(RolesGuard)
  @Roles('ARTIST')
  @Get('me')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.talentsService.findByUserId(user.userId);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.talentsService.findById(id);
  }

  @UseGuards(RolesGuard)
  @Roles('ARTIST')
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTalentProfileDto,
  ) {
    return this.talentsService.createProfile(user.userId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ARTIST')
  @Patch('me')
  updateMine(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTalentProfileDto,
  ) {
    return this.talentsService.update(user.userId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ARTIST')
  @Post('me/media')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (_req, file, callback) => {
        if (!/^(image|video)\//.test(file.mimetype)) {
          callback(
            new BadRequestException('Seuls les fichiers image ou vidéo sont acceptés.'),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  async uploadMedia(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Fichier manquant.');
    }
    const profile = await this.talentsService.findByUserId(user.userId);
    if (!profile) {
      throw new Error('Profil talent introuvable pour cet utilisateur.');
    }
    const isVideo = file.mimetype.startsWith('video');
    const result = await this.mediaService.uploadBuffer(
      file.buffer,
      'talent-media',
      isVideo ? 'video' : 'image',
    );
    return this.talentsService.attachMedia(
      profile.id,
      isVideo ? 'VIDEO' : 'IMAGE',
      result.secure_url,
      result.public_id,
    );
  }

  @UseGuards(RolesGuard)
  @Roles('ARTIST')
  @Post('me/cover')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, callback) => {
        if (!/^image\//.test(file.mimetype)) {
          callback(new BadRequestException('Seuls les fichiers image sont acceptés.'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  async uploadCover(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Fichier manquant.');
    }
    const result = await this.mediaService.uploadBuffer(file.buffer, 'talent-media', 'image');
    return this.talentsService.updateCoverImage(user.userId, result.secure_url);
  }

  @UseGuards(RolesGuard)
  @Roles('ARTIST')
  @Delete('me/media/:mediaId')
  async deleteMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('mediaId') mediaId: string,
  ) {
    const media = await this.talentsService.deleteMedia(user.userId, mediaId);
    if (media.publicId) {
      await this.mediaService.destroy(media.publicId).catch(() => {});
    }
    return { success: true };
  }
}
