import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { AuthContextService } from '../auth/auth-context.service';
import { AuthContext } from '../common/auth/auth-context';
import { REALTIME_NAMESPACE, Rooms } from '../common/realtime/realtime.module';
import { TrackingService } from './tracking.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tokenFrom(socket: Socket): string | undefined {
  const auth = socket.handshake.auth as { token?: unknown } | undefined;
  if (typeof auth?.token === 'string') return auth.token;
  const header = socket.handshake.headers.authorization;
  return typeof header === 'string' && header.toLowerCase().startsWith('bearer ')
    ? header.slice(7)
    : undefined;
}

/**
 * Socket.IO entry point. The access token (handshake `auth.token` or Authorization header) is
 * verified in middleware before the connection is accepted; clients are joined to
 * organization:{id} and user:{id} and may subscribe to trip:{id} rooms they are allowed to track.
 */
@WebSocketGateway({ namespace: REALTIME_NAMESPACE, cors: { origin: true, credentials: true } })
export class TrackingGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(TrackingGateway.name);

  constructor(
    private readonly authContext: AuthContextService,
    private readonly tracking: TrackingService,
  ) {}

  afterInit(namespace: Namespace): void {
    namespace.use((socket, next) => {
      const token = tokenFrom(socket);
      if (!token) return next(new Error('UNAUTHORIZED'));
      this.authContext
        .fromAccessToken(token)
        .then((auth) => {
          if (!auth.organizationId) throw new Error('no active organization');
          socket.data.auth = auth;
          next();
        })
        .catch((err: Error) => {
          this.logger.debug({ err: err.message }, 'Rejected realtime connection');
          next(new Error('UNAUTHORIZED'));
        });
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    const auth = client.data.auth as AuthContext;
    await client.join([Rooms.organization(auth.organizationId!), Rooms.user(auth.userId)]);
  }

  @SubscribeMessage('trip.subscribe')
  async subscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { tripId?: string }) {
    const auth = client.data.auth as AuthContext | undefined;
    if (!auth || !body?.tripId || !UUID.test(body.tripId))
      return { ok: false, code: 'BAD_REQUEST' };
    try {
      await this.tracking.assertTripAccess(auth, body.tripId);
    } catch {
      return { ok: false, code: 'NOT_FOUND' };
    }
    await client.join(Rooms.trip(body.tripId));
    return { ok: true, tripId: body.tripId };
  }

  @SubscribeMessage('trip.unsubscribe')
  async unsubscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { tripId?: string }) {
    if (body?.tripId && UUID.test(body.tripId)) await client.leave(Rooms.trip(body.tripId));
    return { ok: true };
  }
}
