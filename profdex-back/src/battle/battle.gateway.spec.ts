import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { BattleGateway } from './battle.gateway';
import { BattleRoomService } from './battle-room.service';
import { CooldownService } from './cooldown.service';
import { InviteService } from './invite.service';
import { PresenceService } from './presence.service';
import { RatingService } from './rating.service';

/**
 * O gateway com a presença, os convites e as salas de VERDADE — só o banco, a
 * sessão e o socket.io são dublês. O que este spec cobre são as regras que
 * vivem na junção dessas peças, e que nenhum serviço isolado enxerga: o convite
 * que não pode nascer sem exemplar dos dois lados, e a reconexão que precisa
 * responder mesmo quando não há nada para contar.
 */
describe('BattleGateway', () => {
  let gateway: BattleGateway;
  let presence: PresenceService;
  let invites: InviteService;
  let rooms: BattleRoomService;

  /** Emissões para salas do socket.io (`user:<id>` e `lobby`). */
  let toRoom: { room: string; event: string; payload: unknown }[];

  const ana = { id: 'user-ana', matricula: '1', name: 'Ana' };
  const bia = { id: 'user-bia', matricula: '2', name: 'Bia' };

  /** Quantos exemplares cada um tem — o que `capture.count` responde. */
  let exemplares: Record<string, number>;

  const captureCount = jest.fn(({ where }: { where: { userId: string } }) =>
    Promise.resolve(exemplares[where.userId] ?? 0),
  );
  const battleFindFirst = jest.fn().mockResolvedValue(null); // sem cooldown

  const prisma = {
    capture: { count: captureCount },
    battle: {
      findFirst: battleFindFirst,
      create: jest.fn(),
      update: jest.fn(),
    },
    battleSlot: { updateMany: jest.fn() },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  } as unknown as PrismaService;

  /** Socket autenticado como `user`, com as emissões diretas registradas. */
  const fakeClient = (user: { id: string; name: string }) => {
    const emitted: { event: string; payload: unknown }[] = [];
    return {
      id: `sock-${user.id}`,
      data: {},
      handshake: { headers: { cookie: 'profdex_session=token' } },
      join: jest.fn(),
      leave: jest.fn(),
      disconnect: jest.fn(),
      emit: jest.fn((event: string, payload: unknown) => {
        emitted.push({ event, payload });
        return true;
      }),
      emitted,
    };
  };
  type FakeClient = ReturnType<typeof fakeClient>;
  const asSocket = (client: FakeClient) => client as unknown as Socket;

  const eventsFor = (userId: string, event: string) =>
    toRoom.filter((e) => e.room === `user:${userId}` && e.event === event);

  /** Conecta o socket com a identidade que o `jwt.verify` dublê vai devolver. */
  const connect = (user: { id: string; matricula: string; name: string }) => {
    const client = fakeClient(user);
    jwtVerify.mockReturnValueOnce({
      sub: user.id,
      matricula: user.matricula,
      name: user.name,
    });
    gateway.handleConnection(asSocket(client));
    return client;
  };

  const jwtVerify = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    toRoom = [];
    exemplares = { [ana.id]: 2, [bia.id]: 2 };
    captureCount.mockClear();
    jwtVerify.mockReset();

    presence = new PresenceService();
    invites = new InviteService();
    rooms = new BattleRoomService(
      prisma,
      { applyResult: jest.fn() } as unknown as RatingService,
      { record: jest.fn() } as unknown as MetricsService,
    );

    gateway = new BattleGateway(
      { verify: jwtVerify } as unknown as JwtService,
      presence,
      invites,
      new CooldownService(prisma, {
        battlePairCooldownMs: () => Promise.resolve(12 * 60 * 60 * 1000),
      } as never),
      rooms,
      prisma,
    );
    gateway.server = {
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          toRoom.push({ room, event, payload });
          return true;
        },
      }),
      emit: jest.fn(),
    } as unknown as Server;
  });

  afterEach(() => {
    gateway.onModuleDestroy();
    jest.useRealTimers();
  });

  // ── 14.1: convite sem professor ────────────────────────────────────────────

  describe('convite sem exemplar', () => {
    it('recusa o envio de quem não capturou nada', async () => {
      const sockAna = connect(ana);
      connect(bia);
      exemplares[ana.id] = 0;

      const ack = await gateway.onInviteSend(asSocket(sockAna), {
        toUserId: bia.id,
      });

      expect(ack).toEqual({
        ok: false,
        message: expect.stringContaining('ainda não capturou'),
      });
      expect(eventsFor(bia.id, 'invite:received')).toHaveLength(0);
      expect(invites.outgoingOf(ana.id)).toBeNull();
    });

    it('recusa o envio para quem não tem time — com o nome do alvo', async () => {
      const sockAna = connect(ana);
      connect(bia);
      exemplares[bia.id] = 0;

      const ack = await gateway.onInviteSend(asSocket(sockAna), {
        toUserId: bia.id,
      });

      expect(ack).toEqual({
        ok: false,
        message: 'Bia ainda não tem professores para batalhar.',
      });
      expect(eventsFor(bia.id, 'invite:received')).toHaveLength(0);
    });

    /**
     * A checagem do aceite é a que importa: é a última antes de a sala nascer,
     * e entre o envio e o aceite passam até 60 segundos. Sem ela os dois
     * entravam em `picking`, ninguém confirmava time, e ambos ficavam presos
     * como `em_batalha` até o timeout.
     */
    it('recusa o aceite quando o convidante ficou sem exemplar no meio', async () => {
      const sockAna = connect(ana);
      const sockBia = connect(bia);
      await gateway.onInviteSend(asSocket(sockAna), { toUserId: bia.id });
      const inviteId = invites.outgoingOf(ana.id)!.id;
      exemplares[ana.id] = 0; // perdeu o time entre o envio e o aceite

      const ack = await gateway.onInviteAccept(asSocket(sockBia), { inviteId });

      expect(ack).toEqual({
        ok: false,
        message: 'Ana ainda não tem professores para batalhar.',
      });
      expect(rooms.hasActiveRoom(ana.id)).toBe(false);
      expect(rooms.hasActiveRoom(bia.id)).toBe(false);
      expect(presence.getUser(ana.id)?.status).toBe('disponivel');
      expect(presence.getUser(bia.id)?.status).toBe('disponivel');
      expect(eventsFor(ana.id, 'battle:start')).toHaveLength(0);
    });

    it('recusa o aceite de quem não capturou nada, sem consumir o convite', async () => {
      const sockAna = connect(ana);
      const sockBia = connect(bia);
      await gateway.onInviteSend(asSocket(sockAna), { toUserId: bia.id });
      const inviteId = invites.outgoingOf(ana.id)!.id;
      exemplares[bia.id] = 0;

      const ack = await gateway.onInviteAccept(asSocket(sockBia), { inviteId });

      expect(ack).toEqual({
        ok: false,
        message: expect.stringContaining('ainda não capturou'),
      });
      expect(rooms.hasActiveRoom(bia.id)).toBe(false);
      // O convite continua de pé: quem capturar dentro dos 60s aceita normal.
      expect(invites.incomingFor(bia.id)).toHaveLength(1);
    });

    it('deixa aceitar quem capturou durante os 60s do convite', async () => {
      const sockAna = connect(ana);
      const sockBia = connect(bia);
      exemplares[bia.id] = 0;
      // O envio ainda é recusado…
      await gateway.onInviteSend(asSocket(sockAna), { toUserId: bia.id });
      expect(invites.outgoingOf(ana.id)).toBeNull();

      exemplares[bia.id] = 1; // …Bia captura e o convite seguinte passa
      await gateway.onInviteSend(asSocket(sockAna), { toUserId: bia.id });
      const inviteId = invites.outgoingOf(ana.id)!.id;
      const ack = await gateway.onInviteAccept(asSocket(sockBia), { inviteId });

      expect(ack).toEqual({ ok: true, battleId: expect.any(String) });
      expect(rooms.hasActiveRoom(bia.id)).toBe(true);
      expect(presence.getUser(ana.id)?.status).toBe('em_batalha');
      expect(eventsFor(bia.id, 'battle:start')).toHaveLength(1);
    });
  });

  // ── 14.4 (P1): a reconexão sempre recebe resposta ─────────────────────────

  describe('reconexão', () => {
    it('emite `battle:resync` com phase idle quando não há sala', () => {
      const client = connect(ana);

      const resync = client.emitted.filter((e) => e.event === 'battle:resync');
      expect(resync).toHaveLength(1);
      expect(resync[0].payload).toEqual({ phase: 'idle' });
    });

    it('entrega o snapshot da sala e restaura o status de quem volta', async () => {
      const sockAna = connect(ana);
      const sockBia = connect(bia);
      await gateway.onInviteSend(asSocket(sockAna), { toUserId: bia.id });
      await gateway.onInviteAccept(asSocket(sockBia), {
        inviteId: invites.outgoingOf(ana.id)!.id,
      });
      gateway.handleDisconnect(asSocket(sockAna));

      const voltou = connect(ana);

      expect(presence.getUser(ana.id)?.status).toBe('em_batalha');
      expect(
        voltou.emitted.find((e) => e.event === 'battle:resync')?.payload,
      ).toMatchObject({ phase: 'picking' });
    });

    it('o resync a pedido responde mesmo sem batalha em andamento', () => {
      const client = connect(ana);
      client.emitted.length = 0;

      const ack = gateway.onBattleResync(asSocket(client));

      expect(ack).toEqual({ ok: true });
      expect(client.emitted).toEqual([
        { event: 'battle:resync', payload: { phase: 'idle' } },
      ]);
    });
  });

  // ── 14.3: o convite sobrevive ao blip de rede ─────────────────────────────

  it('devolve os convites vivos ao cliente que reconectou', async () => {
    const sockAna = connect(ana);
    const sockBia = connect(bia);
    await gateway.onInviteSend(asSocket(sockAna), { toUserId: bia.id });

    expect(gateway.onInvitePending(asSocket(sockBia))).toEqual({
      ok: true,
      incoming: [
        {
          inviteId: expect.any(String),
          from: { id: ana.id, name: 'Ana' },
          expiresAt: expect.any(Number),
        },
      ],
      outgoing: null,
    });
    expect(gateway.onInvitePending(asSocket(sockAna))).toMatchObject({
      ok: true,
      incoming: [],
      outgoing: { to: { id: bia.id, name: 'Bia' } },
    });
  });
});
