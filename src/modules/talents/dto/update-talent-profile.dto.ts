import { PartialType } from '@nestjs/mapped-types';
import { CreateTalentProfileDto } from './create-talent-profile.dto';

export class UpdateTalentProfileDto extends PartialType(
  CreateTalentProfileDto,
) {}
