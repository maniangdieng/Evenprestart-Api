import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DocumentsService } from './documents.service';

class GenerateDocumentDto {
  @IsString()
  bookingId: string;

  @IsEnum(DocumentType)
  type: DocumentType;
}

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post()
  generate(@Body() dto: GenerateDocumentDto) {
    return this.documentsService.generate(dto.bookingId, dto.type);
  }
}
