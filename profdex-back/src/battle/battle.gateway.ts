import { Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { extractSessionTokenFromCookieHeader } from '../auth/auth-session';
import { getAllowedOrigins } from '../config/http-security';
import { BattleRoomService } from './battle-room.service';
import { CooldownService } from './cooldown.service';
import { Invite, InviteService } from './invite.service';
import { PresenceService, PresenceStatus } from './presence.service';

/** Identidade autenticada anexada ao socket após o handshake. */
export interface SocketUser {
  id: string;
  matricula: string;
  name: string;
}

interface SessionPayload {
  sub: string;
  matricula: string;
  name: string;
}

/** Resposta (ack) dos comandos do cliente — sempre { ok } para a UI reagir. */
type Ack =
  | { ok: true; [key: string]: unknown }
  | { ok: false; message: string };

/**
 * Sala de quem está COM A LISTA DE JOGADORES ABERTA.
 *
 * Antes, todo evento de presença ia para o namespace inteiro: com N online, uma
 * entrada custava N mensagens e uma rodada de batalha custava 4N (dois status no
 * início, dois no fim). O custo crescia com o quadrado da população — e o pior
 * caso era a reconexão em massa depois de um blip de Wi-Fi.
 *
 * Como a UI só mostra a lista dentro de um modal, quem está com ele fechado não
 * precisa de nada disso. Entra na sala no `lobby:subscribe` e sai no
 * `lobby:unsubscribe`; fora dela o cliente recebe apenas o total, e ainda
 * assim com throttle. Ver docs/CARGA-PVP.md.
 */
const LOBBY_ROOM = 'lobby';

/** Teto de linhas por resposta de lista/busca — o resto se acha pela busca. */
const LOBBY_PAGE_SIZE = 50;

/** Janela mínima entre dois broadcasts de contagem para o namespace inteiro. */
const COUNT_THROTTLE_MS = 2000;

/** Sala privada de um usuário — cobre todas as abas dele com um emit só. */
const userRoom = (userId: string) => `user:${userId}`;

// `path` fica sob /api porque o cookie de sessão é emitido com `path: '/api'`
// — no path padrão (/socket.io) o navegador nem enviaria o cookie e todo
// handshake cairia como anônimo. De quebra, em dev o proxy `/api` do Vite já
// cobre o handshake sem regra nova (só precisa de `ws: true`).
//
// CORS: `origin` como callback avaliado por handshake — no boot do módulo o
// dotenv do ConfigModule ainda não rodou, então ler o env aqui em cima
// congelaria a lista errada. Só importa em produção cross-origin; em dev o
// front fala com o próprio Vite (same-origin) e o navegador não bloqueia.
@WebSocketGateway({
  namespace: '/battle',
  path: '/api/socket.io',
  cors: {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Sem header Origin = cliente não-navegador (testes, curl): permitido —
      // a autenticação de verdade é a sessão no handshake, não o CORS.
      if (!origin) return callback(null, true);
      callback(null, getAllowedOrigins(process.env).includes(origin));
    },
    credentials: true,
  },
})
export class BattleGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(BattleGateway.name);

  /** Agrupa os broadcasts de contagem — ver scheduleCountBroadcast. */
  private countTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly jwt: JwtService,
    private readonly presence: PresenceService,
    private readonly invites: InviteService,
    private readonly cooldown: CooldownService,
    private readonly rooms: BattleRoomService,
  ) {
    // O serviço de salas notifica jogadores por aqui — sem depender do socket.
    this.rooms.configure({
      emitToUser: (userId, event, payload) =>
        this.emitToUser(userId, event, payload),
      onRoomClosed: (userIds) => {
        for (const id of userIds) this.setStatus(id, 'disponivel');
      },
    });
  }

  /** Sem isso o timer pendente segura o processo no desligamento. */
  onModuleDestroy(): void {
    if (this.countTimer) clearTimeout(this.countTimer);
    this.countTimer = null;
  }

  // ── Conexão / presença ────────────────────────────────────────────────────

  handleConnection(client: Socket) {
    const user = this.authenticate(client);
    if (!user) {
      // O cliente recebe o motivo antes do corte para não reconectar em loop
      // com uma sessão que nunca vai passar.
      client.emit('error:unauthorized', {
        message: 'Sessão inválida ou expirada',
      });
      client.disconnect(true);
      return;
    }

    (client.data as { user?: SocketUser }).user = user;
    // Sala própria: emitToUser vira um emit só, mesmo com várias abas abertas.
    void client.join(userRoom(user.id));
    const { firstSocket } = this.presence.join(client.id, user);

    // Só o total. A lista completa custa O(N) por conexão e é o que fazia a
    // reconexão em massa derrubar o servidor — ela agora só vai para quem
    // pedir explicitamente (lobby:subscribe).
    client.emit('lobby:count', { total: this.presence.count() });
    if (firstSocket) {
      this.server.to(LOBBY_ROOM).emit('lobby:update', {
        type: 'join',
        user: this.presence.getUser(user.id),
      });
      this.scheduleCountBroadcast();
    }

    // Reconexão no meio de uma batalha: restaura o status (o join acima entrou
    // como 'disponivel') e entrega o snapshot para a UI se reconstruir.
    if (this.rooms.hasActiveRoom(user.id)) {
      this.setStatus(user.id, 'em_batalha');
      const snapshot = this.rooms.resync(user.id);
      if (snapshot) client.emit('battle:resync', snapshot);
    }
  }

  handleDisconnect(client: Socket) {
    const user = this.userOf(client);
    if (!user) return; // conexão recusada no handshake — nunca entrou no lobby
    // (nos handlers de mensagem `userOf` nunca é undefined: sem autenticação o
    // socket é desconectado antes de qualquer @SubscribeMessage rodar)

    const { lastSocket } = this.presence.leave(client.id, user.id);
    if (!lastSocket) return;

    this.server.to(LOBBY_ROOM).emit('lobby:update', {
      type: 'leave',
      userId: user.id,
    });
    this.scheduleCountBroadcast();

    // Quem saiu não pode segurar convites: avisa a outra ponta de cada um.
    for (const invite of this.invites.cancelAllFor(user.id)) {
      const counterpart =
        invite.fromId === user.id ? invite.toId : invite.fromId;
      this.emitToUser(counterpart, 'invite:cancelled', {
        inviteId: invite.id,
        reason: 'offline',
      });
    }
  }

  // ── Lista de jogadores (só para quem abriu o modal) ───────────────────────

  /** Abriu a lista: entra na sala e já recebe a primeira página. */
  @SubscribeMessage('lobby:subscribe')
  onLobbySubscribe(@ConnectedSocket() client: Socket): Ack {
    const me = this.userOf(client);
    void client.join(LOBBY_ROOM);
    return {
      ok: true,
      users: this.presence.page(LOBBY_PAGE_SIZE, me.id),
      total: this.presence.count(),
    };
  }

  /** Fechou a lista: para de receber os eventos de presença. */
  @SubscribeMessage('lobby:unsubscribe')
  onLobbyUnsubscribe(@ConnectedSocket() client: Socket): Ack {
    void client.leave(LOBBY_ROOM);
    return { ok: true };
  }

  /**
   * Busca por nome no servidor. Antes o cliente filtrava a lista inteira que já
   * tinha em mãos — o que só era possível porque recebia todo mundo.
   */
  @SubscribeMessage('lobby:search')
  onLobbySearch(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Ack {
    const me = this.userOf(client);
    const term = this.readString(body, 'term') ?? '';
    return {
      ok: true,
      users: this.presence.search(term, LOBBY_PAGE_SIZE, me.id),
      total: this.presence.count(),
    };
  }

  // ── Convites ──────────────────────────────────────────────────────────────

  @SubscribeMessage('invite:send')
  async onInviteSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<Ack> {
    const me = this.userOf(client);
    const toUserId = this.readString(body, 'toUserId');
    if (!toUserId) return { ok: false, message: 'Convite inválido.' };

    const target = this.presence.getUser(toUserId);
    if (!target)
      return { ok: false, message: 'Esse jogador não está mais online.' };
    if (target.status !== 'disponivel') {
      return { ok: false, message: `${target.name} está em batalha.` };
    }
    if (this.presence.getUser(me.id)?.status !== 'disponivel') {
      return { ok: false, message: 'Você já está em batalha.' };
    }

    const availableAt = await this.cooldown.availableAt(me.id, toUserId);
    if (availableAt) {
      return {
        ok: false,
        message: `Vocês já batalharam nas últimas 12h — liberado em ${this.formatRemaining(availableAt)}.`,
      };
    }

    const result = this.invites.create(me.id, toUserId, (invite) =>
      this.onInviteExpired(invite),
    );
    if (!result.ok) return result;

    this.emitToUser(toUserId, 'invite:received', {
      inviteId: result.invite.id,
      from: { id: me.id, name: me.name },
      expiresAt: result.invite.expiresAt,
    });
    return {
      ok: true,
      invite: {
        inviteId: result.invite.id,
        to: { id: target.id, name: target.name },
        expiresAt: result.invite.expiresAt,
      },
    };
  }

  @SubscribeMessage('invite:accept')
  onInviteAccept(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Ack {
    const me = this.userOf(client);
    const inviteId = this.readString(body, 'inviteId');
    if (!inviteId) return { ok: false, message: 'Convite inválido.' };

    const invite = this.invites.takeAsTarget(inviteId, me.id);
    if (!invite) return { ok: false, message: 'Esse convite não existe mais.' };

    const inviter = this.presence.getUser(invite.fromId);
    if (!inviter || inviter.status !== 'disponivel') {
      return { ok: false, message: 'Quem convidou não está mais disponível.' };
    }
    if (this.presence.getUser(me.id)?.status !== 'disponivel') {
      return { ok: false, message: 'Você já está em batalha.' };
    }

    // Nasce a sala: seleção às cegas de professor com 60s de prazo.
    const { battleId, pickDeadline } = this.rooms.create(
      { userId: inviter.id, name: inviter.name },
      { userId: me.id, name: me.name },
    );
    this.setStatus(invite.fromId, 'em_batalha');
    this.setStatus(me.id, 'em_batalha');
    this.emitToUser(invite.fromId, 'battle:start', {
      battleId,
      pickDeadline,
      opponent: { id: me.id, name: me.name },
    });
    this.emitToUser(me.id, 'battle:start', {
      battleId,
      pickDeadline,
      opponent: { id: inviter.id, name: inviter.name },
    });

    this.logger.log(
      `Convite aceito: ${invite.fromId} vs ${me.id} (${battleId})`,
    );
    return { ok: true, battleId };
  }

  // ── Batalha ───────────────────────────────────────────────────────────────

  @SubscribeMessage('battle:pick')
  async onBattlePick(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<Ack> {
    const me = this.userOf(client);
    // O exemplar, não o professor: é ele que carrega tipos e deck.
    const captureId = this.readString(body, 'captureId');
    if (!captureId) return { ok: false, message: 'Escolha inválida.' };
    return this.rooms.pick(me.id, captureId);
  }

  @SubscribeMessage('battle:move')
  onBattleMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Ack {
    const me = this.userOf(client);
    const moveId = this.readString(body, 'moveId');
    if (!moveId) return { ok: false, message: 'Golpe inválido.' };
    return this.rooms.move(me.id, moveId);
  }

  @SubscribeMessage('battle:resync')
  onBattleResync(@ConnectedSocket() client: Socket): Ack {
    const me = this.userOf(client);
    const snapshot = this.rooms.resync(me.id);
    if (!snapshot)
      return { ok: false, message: 'Nenhuma batalha em andamento.' };
    client.emit('battle:resync', snapshot);
    return { ok: true };
  }

  @SubscribeMessage('invite:decline')
  onInviteDecline(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Ack {
    const me = this.userOf(client);
    const inviteId = this.readString(body, 'inviteId');
    if (!inviteId) return { ok: false, message: 'Convite inválido.' };

    const invite = this.invites.takeAsTarget(inviteId, me.id);
    if (!invite) return { ok: false, message: 'Esse convite não existe mais.' };

    this.emitToUser(invite.fromId, 'invite:cancelled', {
      inviteId: invite.id,
      reason: 'declined',
    });
    return { ok: true };
  }

  private onInviteExpired(invite: Invite): void {
    const payload = { inviteId: invite.id };
    this.emitToUser(invite.fromId, 'invite:expired', payload);
    this.emitToUser(invite.toId, 'invite:expired', payload);
  }

  // ── Auxiliares ────────────────────────────────────────────────────────────

  /**
   * Emite para TODOS os sockets (abas) de um usuário — um emit só, via sala
   * privada. Antes era um `.to(socketId).emit()` por aba, e cada chamada
   * re-serializava o payload do zero.
   */
  private emitToUser(userId: string, event: string, payload: unknown): void {
    this.server.to(userRoom(userId)).emit(event, payload);
  }

  private setStatus(userId: string, status: PresenceStatus): void {
    if (!this.presence.setStatus(userId, status)) return;
    // Só quem está de olho na lista precisa saber que alguém entrou em batalha.
    this.server.to(LOBBY_ROOM).emit('lobby:update', {
      type: 'status',
      userId,
      status,
    });
  }

  /**
   * O total vai para todo mundo (a tela de batalha mostra "N jogadores" sem
   * abrir a lista), mas agrupado numa janela: numa rampa de entrada são
   * centenas de mudanças por segundo, e o número na tela não precisa desse
   * tanto de precisão.
   */
  private scheduleCountBroadcast(): void {
    if (this.countTimer) return;
    this.countTimer = setTimeout(() => {
      this.countTimer = null;
      this.server.emit('lobby:count', { total: this.presence.count() });
    }, COUNT_THROTTLE_MS);
  }

  /**
   * Identidade anexada no handshake. Nos handlers de mensagem nunca é
   * undefined — socket sem sessão é desconectado antes de processar mensagens;
   * o único caminho com ausência real é o handleDisconnect de um handshake
   * recusado, que checa explicitamente.
   */
  private userOf(client: Socket): SocketUser {
    return (client.data as { user?: SocketUser }).user as SocketUser;
  }

  private readString(body: unknown, key: string): string | null {
    if (typeof body !== 'object' || body === null) return null;
    const value = (body as Record<string, unknown>)[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private formatRemaining(until: Date): string {
    const totalMin = Math.max(
      1,
      Math.ceil((until.getTime() - Date.now()) / 60000),
    );
    const hours = Math.floor(totalMin / 60);
    const minutes = totalMin % 60;
    return hours > 0
      ? `${hours}h${String(minutes).padStart(2, '0')}`
      : `${minutes}min`;
  }

  private authenticate(client: Socket): SocketUser | null {
    const token = extractSessionTokenFromCookieHeader(
      client.handshake.headers.cookie,
    );
    if (!token) return null;

    try {
      const payload = this.jwt.verify<SessionPayload>(token);
      return {
        id: payload.sub,
        matricula: payload.matricula,
        name: payload.name,
      };
    } catch {
      this.logger.debug('Handshake com sessão inválida recusado');
      return null;
    }
  }
}
