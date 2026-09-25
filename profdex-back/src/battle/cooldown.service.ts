import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

/**
 * O padrão histórico, usado quando `app_settings` não tem a chave.
 *
 * Deixou de ser a fonte da verdade: o valor que vale é o do painel (ver
 * `SettingsService`), porque o número certo depende de quanta gente está no
 * evento — e isso ninguém sabe antes de abrir o estande.
 */
export const PAIR_COOLDOWN_MS = 12 * 60 * 60 * 1000;

/**
 * Identificador canônico de uma dupla: os dois ids em ordem lexicográfica.
 * Gravado em `battles.pair_key`, permite achar a última batalha da dupla com
 * um índice simples em vez de OR nas duas ordens de coluna.
 */
export function pairKeyOf(a: string, b: string): string {
  return [a, b].sort().join(':');
}

/**
 * Cooldown anti win-trading: cada dupla tem 1 batalha ranqueada a cada 12h.
 * Contam batalhas `finished` e `abandoned` (abandono consome o cooldown, senão
 * abandonar viraria truque para resetar o matchup); `annulled` (crash/deploy
 * no meio) não conta — a dupla não teve batalha de verdade.
 */
@Injectable()
export class CooldownService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  /**
   * Retorna quando a dupla estará liberada, ou null se já pode batalhar.
   *
   * A janela é lida a cada chamada (com cache de 10s no `SettingsService`), e
   * não fixada na subida: diminuir o cooldown no painel precisa liberar duplas
   * que já estavam esperando, sem restart.
   */
  async availableAt(userA: string, userB: string): Promise<Date | null> {
    const janela = await this.settings.battlePairCooldownMs();
    const since = new Date(Date.now() - janela);
    const last = await this.prisma.battle.findFirst({
      where: {
        pairKey: pairKeyOf(userA, userB),
        status: { in: ['finished', 'abandoned'] },
        finishedAt: { gt: since },
      },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true },
    });

    if (!last?.finishedAt) return null;
    return new Date(last.finishedAt.getTime() + janela);
  }
}
