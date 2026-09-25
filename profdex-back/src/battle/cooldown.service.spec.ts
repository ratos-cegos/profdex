import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  CooldownService,
  PAIR_COOLDOWN_MS,
  pairKeyOf,
} from './cooldown.service';

describe('pairKeyOf', () => {
  it('is canonical regardless of argument order', () => {
    expect(pairKeyOf('bia', 'ana')).toBe('ana:bia');
    expect(pairKeyOf('ana', 'bia')).toBe('ana:bia');
  });
});

describe('CooldownService', () => {
  const findFirst = jest.fn();
  const prisma = { battle: { findFirst } } as unknown as PrismaService;
  // O cooldown da dupla é configurável no painel; o serviço lê o valor a cada
  // chamada. Aqui ele devolve o padrão histórico de 12h.
  const settings = {
    battlePairCooldownMs: jest.fn().mockResolvedValue(PAIR_COOLDOWN_MS),
  };
  const service = new CooldownService(
    prisma,
    settings as unknown as SettingsService,
  );

  beforeEach(() => findFirst.mockReset());

  it('queries by canonical pair key, counting finished and abandoned only', async () => {
    findFirst.mockResolvedValue(null);

    const result = await service.availableAt('bia', 'ana');

    expect(result).toBeNull();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          pairKey: 'ana:bia',
          status: { in: ['finished', 'abandoned'] },
        }),
      }),
    );
  });

  it('returns finishedAt + 12h when the pair battled recently', async () => {
    const finishedAt = new Date(Date.now() - 60 * 60 * 1000); // 1h atrás
    findFirst.mockResolvedValue({ finishedAt });

    const result = await service.availableAt('ana', 'bia');

    expect(result).toEqual(new Date(finishedAt.getTime() + PAIR_COOLDOWN_MS));
  });
});
