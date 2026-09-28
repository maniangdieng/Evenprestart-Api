import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

/**
 * Rôles qu'une inscription publique peut demander. Les comptes ADMIN et
 * SUPER_ADMIN ne se créent que depuis le Back-Office (POST /admin/users).
 */
export const PUBLIC_REGISTRATION_ROLES = ['CLIENT', 'ARTIST'] as const;
export type PublicRegistrationRole = (typeof PUBLIC_REGISTRATION_ROLES)[number];

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsIn(PUBLIC_REGISTRATION_ROLES, {
    message: 'Le rôle doit être CLIENT ou ARTIST.',
  })
  role?: PublicRegistrationRole;
}
