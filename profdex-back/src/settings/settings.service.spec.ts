import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from './settings.service';

function criarPrisma(linhas: { key: string; value: string }[] = []) {
  const guardadas = [...linhas];
  return {
    guardadas,
    appSetting: {
      findMany: jest.fn(() => Promise.resolve(guardadas)),
      upsert: jest.fn(({ where, create, update }: any) => {
        const atual = guardadas.find((l) => l.key === where.key);
        if (atual) atual.value = update.value;
        else guardadas.push(create);
        return Promise.resolve({});
      }),
    },
  };
}

const criar = (prisma: ReturnType<typeof criarPrisma>) =>
  new SettingsService(prisma as unknown as PrismaService);

describe('SettingsService', () => {
  it('sem nenhuma linha gravada, entrega os padrões', async () => {
    const service = criar(criarPrisma());

    await expect(service.all()).resolves.toEqual({
      themeCooldownMinutes: 10,
      quizGlobalRepeatWindow: 10,
      battlePairCooldownHours: 12,
      raidHpMultiplier: 4,
      raidLegendaryIv: 15,
      raidTurnCap: 60,
      raidCooldownMinutes: 30,
      raidOpensAt: '2026-10-01T19:00:00-03:00',
      captureQrMode: 'ficha',
    });
  });

  it('converte para milissegundos nas unidades certas', async () => {
    const service = criar(
      criarPrisma([
        { key: 'quiz.theme_cooldown_minutes', value: '3' },
        { key: 'battle.pair_cooldown_hours', value: '2' },
      ]),
    );

    await expect(service.themeCooldownMs()).resolves.toBe(3 * 60_000);
    await expect(service.battlePairCooldownMs()).resolves.toBe(2 * 60 * 60_000);
  });

  /**
   * O cache não é enfeite: estes valores são lidos no caminho de TODA tentativa
   * de quiz e de todo convite de batalha. Sem ele seria uma consulta a mais por
   * request, para um dado que muda uma ou duas vezes no evento inteiro.
   */
  it('não vai ao banco duas vezes dentro da janela do cache', async () => {
    const prisma = criarPrisma();
    const service = criar(prisma);

    await service.all();
    await service.all();
    await service.themeCooldownMs();

    expect(prisma.appSetting.findMany).toHaveBeenCalledTimes(1);
  });

  /** Quem acabou de salvar precisa ver o efeito já, não daqui a 10 segundos. */
  it('a escrita invalida o cache na hora', async () => {
    const prisma = criarPrisma();
    const service = criar(prisma);

    expect(await service.get('themeCooldownMinutes')).toBe(10);
    await service.update({ themeCooldownMinutes: 2 }, 'admin-1');

    expect(await service.get('themeCooldownMinutes')).toBe(2);
  });

  it('o PATCH parcial não mexe no que não veio', async () => {
    const prisma = criarPrisma();
    const service = criar(prisma);

    await service.update({ themeCooldownMinutes: 5 }, 'admin-1');

    expect(prisma.appSetting.upsert).toHaveBeenCalledTimes(1);
    await expect(service.all()).resolves.toEqual({
      themeCooldownMinutes: 5,
      quizGlobalRepeatWindow: 10,
      battlePairCooldownHours: 12,
      raidHpMultiplier: 4,
      raidLegendaryIv: 15,
      raidTurnCap: 60,
      raidCooldownMinutes: 30,
      raidOpensAt: '2026-10-01T19:00:00-03:00',
      captureQrMode: 'ficha',
    });
  });

  /**
   * A abertura da raid, ida e volta pelo painel.
   *
   * O que este teste trava é a GRAVAÇÃO: o painel manda `2026-10-01T20:30` (sem
   * fuso, que é o que o `datetime-local` envia) e o banco tem de receber a forma
   * canônica. Com o servidor de produção em UTC, gravar o texto cru deixaria
   * `raidOpensAtMs` três horas fora do combinado.
   */
  it('grava a abertura da raid com o fuso do evento explícito', async () => {
    const prisma = criarPrisma();
    const service = criar(prisma);

    await expect(service.raidOpensAtMs()).resolves.toBe(
      Date.parse('2026-10-01T22:00:00Z'),
    );

    await service.update({ raidOpensAt: '2026-10-01T20:30' }, 'admin-1');

    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'raid.opens_at' },
        create: {
          key: 'raid.opens_at',
          value: '2026-10-01T20:30:00-03:00',
        },
      }),
    );
    await expect(service.raidOpensAtMs()).resolves.toBe(
      Date.parse('2026-10-01T23:30:00Z'),
    );
  });

  /**
   * `31/02` passa por qualquer regex de formato e o `Date` o transformaria em 2
   * de março sem avisar. Recusar alto é o que impede a raid de "não abrir" no dia
   * do evento com o operador jurando que configurou certo.
   */
  it('data inexistente é recusada antes de qualquer escrita', async () => {
    const prisma = criarPrisma();
    const service = criar(prisma);

    await expect(
      service.update({ raidOpensAt: '2026-02-30T19:00' }, 'admin-1'),
    ).rejects.toThrow(/data e hora inválidas/i);
    expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
  });

  /**
   * Um erro de leitura não pode virar 500 no meio de uma tentativa que o aluno
   * já respondeu. O padrão é o degrau seguro.
   */
  it('banco fora do ar cai no padrão em vez de derrubar a bancada', async () => {
    const prisma = criarPrisma();
    prisma.appSetting.findMany.mockRejectedValue(new Error('sem conexão'));
    const service = criar(prisma);

    await expect(service.themeCooldownMs()).resolves.toBe(10 * 60_000);
  });

  it('valor absurdo gravado à mão é trazido para dentro da faixa', async () => {
    const service = criar(
      criarPrisma([{ key: 'quiz.theme_cooldown_minutes', value: '9999' }]),
    );

    await expect(service.get('themeCooldownMinutes')).resolves.toBe(120);
  });

  /**
   * O modo de entrega do QR é o primeiro ajuste não-numérico. Ele passa pelo
   * mesmo cache e pela mesma invalidação — trocar de `ficha` para `tela` no
   * painel tem de valer na bancada sem restart, como os cooldowns já valem.
   */
  it('lê e grava o modo de entrega do QR, invalidando o cache', async () => {
    const prisma = criarPrisma();
    const service = criar(prisma);

    expect(await service.captureQrMode()).toBe('ficha');

    await service.update({ captureQrMode: 'tela' }, 'admin-1');

    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'capture.qr_mode' } }),
    );
    expect(await service.captureQrMode()).toBe('tela');
  });

  it('modo inválido gravado à mão cai em ficha', async () => {
    const service = criar(
      criarPrisma([{ key: 'capture.qr_mode', value: 'papel' }]),
    );

    await expect(service.captureQrMode()).resolves.toBe('ficha');
  });
});
