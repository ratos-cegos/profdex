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
      battlePairCooldownHours: 12,
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
      battlePairCooldownHours: 12,
    });
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
});
