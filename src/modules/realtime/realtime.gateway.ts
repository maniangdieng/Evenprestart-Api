import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

interface JwtPayload {
  sub: string;
  email: string;
  role: AuthenticatedUser['role'];
}

/**
 * Canal temps réel unique pour la messagerie et les notifications
 * (cahier des charges 5.1/5.2). Chaque utilisateur rejoint une room
 * privée `user:{userId}` et une room `role:{ROLE}` pour recevoir ses
 * événements — l'identité vient du JWT d'accès, jamais d'une valeur
 * fournie par le client (sinon n'importe qui pourrait rejoindre la room
 * d'un autre utilisateur et lire ses notifications/messages).
 */
@WebSocketGateway({ cors: { origin: '*' }, namespace: 'realtime' })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.headers.authorization?.toString().replace(/^Bearer\s+/i, ''));

    if (!token) {
      this.logger.warn(`Connexion refusée (pas de token) — socket ${client.id}`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
      client.data.userId = payload.sub;
      client.data.role = payload.role;
      client.join(`user:${payload.sub}`);
      client.join(`role:${payload.role}`);
      if (payload.role === 'ADMIN' || payload.role === 'SUPER_ADMIN') {
        client.join('role:ADMIN_TEAM');
      }
    } catch {
      this.logger.warn(`Connexion refusée (token invalide) — socket ${client.id}`);
      client.disconnect(true);
    }
  }

  handleDisconnect() {}

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  /** Diffuse à tous les administrateurs connectés (ADMIN + SUPER_ADMIN). */
  emitToAdmins(event: string, payload: unknown) {
    this.server.to('role:ADMIN_TEAM').emit(event, payload);
  }
}
