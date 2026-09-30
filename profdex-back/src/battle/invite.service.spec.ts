import { INVITE_TTL_MS, InviteService } from './invite.service';

describe('InviteService', () => {
  let service: InviteService;
  const onExpire = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    onExpire.mockClear();
    service = new InviteService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates an invite with a 60s expiry', () => {
    const result = service.create('ana', 'bia', onExpire);
    if (!result.ok) throw new Error('should create');

    expect(result.invite.fromId).toBe('ana');
    expect(result.invite.toId).toBe('bia');
    expect(result.invite.expiresAt).toBe(Date.now() + INVITE_TTL_MS);
  });

  it('expires the invite after the TTL and notifies', () => {
    const result = service.create('ana', 'bia', onExpire);
    if (!result.ok) throw new Error('should create');

    jest.advanceTimersByTime(INVITE_TTL_MS);

    expect(onExpire).toHaveBeenCalledWith(
      expect.objectContaining({
        id: result.invite.id,
        fromId: 'ana',
        toId: 'bia',
      }),
    );
    expect(service.takeAsTarget(result.invite.id, 'bia')).toBeNull();
  });

  it('rejects self-invites and duplicate pending invites', () => {
    expect(service.create('ana', 'ana', onExpire).ok).toBe(false);

    service.create('ana', 'bia', onExpire);
    expect(service.create('ana', 'clara', onExpire).ok).toBe(false); // 1 saída por vez
    expect(service.create('bia', 'ana', onExpire).ok).toBe(false); // espelhado
  });

  it('frees the sender slot after expiry', () => {
    service.create('ana', 'bia', onExpire);
    jest.advanceTimersByTime(INVITE_TTL_MS);

    expect(service.create('ana', 'clara', onExpire).ok).toBe(true);
  });

  it('only the target can take the invite', () => {
    const result = service.create('ana', 'bia', onExpire);
    if (!result.ok) throw new Error('should create');

    expect(service.takeAsTarget(result.invite.id, 'ana')).toBeNull();
    expect(service.takeAsTarget(result.invite.id, 'intrusa')).toBeNull();
    expect(service.takeAsTarget(result.invite.id, 'bia')?.fromId).toBe('ana');
    // consumido: segunda tentativa falha e o timer não dispara depois
    expect(service.takeAsTarget(result.invite.id, 'bia')).toBeNull();
    jest.advanceTimersByTime(INVITE_TTL_MS);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('only the sender can withdraw the invite, and it frees the slot', () => {
    const result = service.create('ana', 'bia', onExpire);
    if (!result.ok) throw new Error('should create');

    expect(service.takeAsSender(result.invite.id, 'bia')).toBeNull();
    expect(service.takeAsSender(result.invite.id, 'intrusa')).toBeNull();
    expect(service.takeAsSender(result.invite.id, 'ana')?.toId).toBe('bia');
    // retirado: some para o alvo, não expira depois e a saída de Ana libera
    expect(service.takeAsSender(result.invite.id, 'ana')).toBeNull();
    expect(service.takeAsTarget(result.invite.id, 'bia')).toBeNull();
    jest.advanceTimersByTime(INVITE_TTL_MS);
    expect(onExpire).not.toHaveBeenCalled();
    expect(service.create('ana', 'clara', onExpire).ok).toBe(true);
  });

  it('cancels everything involving a user who went offline', () => {
    const sent = service.create('ana', 'bia', onExpire);
    service.create('clara', 'ana', onExpire);
    if (!sent.ok) throw new Error('should create');

    const cancelled = service.cancelAllFor('ana');

    expect(cancelled).toHaveLength(2);
    expect(service.takeAsTarget(sent.invite.id, 'bia')).toBeNull();
    // Clara liberada para convidar de novo
    expect(service.create('clara', 'bia', onExpire).ok).toBe(true);
  });

  it('rate limits a sender to 5 invites per minute', () => {
    // Convites recusados/expirados contam na janela — o custo é do envio.
    for (let i = 0; i < 5; i++) {
      const result = service.create('ana', `alvo-${i}`, onExpire);
      if (!result.ok) throw new Error(`should create #${i}`);
      service.takeAsTarget(result.invite.id, `alvo-${i}`); // libera a saída
    }

    expect(service.create('ana', 'alvo-final', onExpire).ok).toBe(false);

    jest.advanceTimersByTime(60 * 1000);
    expect(service.create('ana', 'alvo-final', onExpire).ok).toBe(true);
  });
});
