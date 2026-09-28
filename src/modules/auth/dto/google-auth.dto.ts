import { IsIn, IsOptional, IsString, IsUrl } from 'class-validator';
import {
  PUBLIC_REGISTRATION_ROLES,
  type PublicRegistrationRole,
} from './register.dto';

/**
 * Code d'autorisation renvoyé par Google au front (flux « authorization code »).
 * L'échange contre les jetons se fait ici, côté API, avec le client secret.
 */
export class GoogleAuthDto {
  @IsString()
  code: string;

  /** Doit être identique à la redirect_uri utilisée pour obtenir le code. */
  @IsUrl({ require_tld: false })
  redirectUri: string;

  /** Rôle à attribuer si le compte n'existe pas encore. */
  @IsOptional()
  @IsIn(PUBLIC_REGISTRATION_ROLES, {
    message: 'Le rôle doit être CLIENT ou ARTIST.',
  })
  role?: PublicRegistrationRole;
}
