import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { tierOf } from './elo';

export const PAGE_SIZE = 25;

export interface RankingEntry {
  position: number;
  id: string;
  name: string;
  rating: number;
  tier: string;
  wins: number;
  losses: number;
  draws: number;
}

/**
 * Uma linha dos ladders de coleção (capturas e dex). Formato deliberadamente
 * paralelo ao de batalha — a tela troca de aba sem trocar de componente.
 */
export interface CollectionEntry {
  position: number;
  id: string;
  name: string;
  /** Exemplares resgatados, ou professores distintos no ranking de dex. */
  total: number;
  /** Percentual da dex completa. `null` no ranking de capturas. */
  percent: number | null;
}

/** Agregado por aluno, antes de virar posição no ladder. */
interface CollectionRow {
  userId: string;
  total: number;
  /**
   * Data da captura mais recente. É o desempate: com o mesmo total, quem
   * chegou lá primeiro fica na frente (`capturedAt` mais antigo).
   */
  ultimaEm: number;
}

// Só entra no ladder quem já jogou — 1000 alunos parados em 1000 pontos não
// são ranking, são cadastro.
const PLAYED = {
  OR: [
    { battleWins: { gt: 0 } },
    { battleLosses: { gt: 0 } },
    { battleDraws: { gt: 0 } },
  ],
};

/**
 * Leaderboard global de batalha. Paginado (a tela pede mais páginas conforme
 * rola) e sempre acompanhado da posição do próprio usuário — quem está em 400º
 * não se acha na lista, mas se vê no rodapé.
 */
@Injectable()
export class RankingsService {
  constructor(private prisma: PrismaService) {}

  async battleLeaderboard(userId: string, page: number) {
    const skip = (page - 1) * PAGE_SIZE;

    const [rows, total, self] = await Promise.all([
      this.prisma.user.findMany({
        where: PLAYED,
        // Desempate estável: mesma pontuação → mais vitórias primeiro; depois
        // ordem de cadastro, para a lista não "dançar" entre reloads.
        orderBy: [
          { battleRating: 'desc' },
          { battleWins: 'desc' },
          { createdAt: 'asc' },
        ],
        skip,
        take: PAGE_SIZE,
        select: {
          id: true,
          name: true,
          battleRating: true,
          battleWins: true,
          battleLosses: true,
          battleDraws: true,
        },
      }),
      this.prisma.user.count({ where: PLAYED }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          battleRating: true,
          battleWins: true,
          battleLosses: true,
          battleDraws: true,
        },
      }),
    ]);

    const entries: RankingEntry[] = rows.map((u, i) => ({
      position: skip + i + 1,
      id: u.id,
      name: u.name,
      rating: u.battleRating,
      tier: tierOf(u.battleRating),
      wins: u.battleWins,
      losses: u.battleLosses,
      draws: u.battleDraws,
    }));

    // Posição do usuário (competition ranking): 1 + quantos têm rating maior.
    // Fora do ladder (nunca jogou) → position null.
    let me: (RankingEntry & { played: boolean }) | null = null;
    if (self) {
      const played = self.battleWins + self.battleLosses + self.battleDraws > 0;
      const ahead = played
        ? await this.prisma.user.count({
            where: {
              AND: [PLAYED, { battleRating: { gt: self.battleRating } }],
            },
          })
        : 0;
      me = {
        position: played ? ahead + 1 : 0,
        played,
        id: self.id,
        name: self.name,
        rating: self.battleRating,
        tier: tierOf(self.battleRating),
        wins: self.battleWins,
        losses: self.battleLosses,
        draws: self.battleDraws,
      };
    }

    return { entries, me, page, pageSize: PAGE_SIZE, total };
  }

  /**
   * Ladder de capturas: quantos exemplares o aluno resgatou. Conta as fichas,
   * não os professores — dois Erons capturados em QRs diferentes são dois
   * exemplares, e é isso que o aluno vê na coleção.
   */
  async capturesLeaderboard(userId: string, page: number) {
    const grupos = await this.prisma.capture.groupBy({
      by: ['userId'],
      _count: { _all: true },
      _max: { capturedAt: true },
    });

    const linhas: CollectionRow[] = grupos.map((g) => ({
      userId: g.userId,
      total: g._count._all,
      ultimaEm: g._max.capturedAt?.getTime() ?? 0,
    }));

    return this.montarLadder(userId, page, linhas, null);
  }

  /**
   * Ladder de dex: quantos professores DISTINTOS o aluno já viu, com o
   * percentual da coleção completa. Repetir o mesmo professor não avança aqui —
   * é o ranking de quem foi atrás de todos os estandes, não de quem juntou mais
   * fichas.
   */
  async dexLeaderboard(userId: string, page: number) {
    const [pares, professores] = await Promise.all([
      // `groupBy` por (aluno, professor): o Prisma não faz COUNT(DISTINCT), e
      // dobrar o número de linhas é barato — no máximo alunos × professores.
      this.prisma.capture.groupBy({
        by: ['userId', 'professorId'],
        _max: { capturedAt: true },
      }),
      this.prisma.professor.count(),
    ]);

    const porAluno = new Map<string, CollectionRow>();
    for (const par of pares) {
      const atual = porAluno.get(par.userId) ?? {
        userId: par.userId,
        total: 0,
        ultimaEm: 0,
      };
      atual.total += 1;
      atual.ultimaEm = Math.max(
        atual.ultimaEm,
        par._max.capturedAt?.getTime() ?? 0,
      );
      porAluno.set(par.userId, atual);
    }

    return this.montarLadder(userId, page, [...porAluno.values()], professores);
  }

  /**
   * Ordena, pagina e acha a posição do próprio aluno.
   *
   * A ordenação é em memória de propósito: o ladder de dex precisa de um
   * COUNT(DISTINCT) que o `groupBy` do Prisma não expressa, e resolver os dois
   * do mesmo jeito mantém posição e desempate idênticos entre as abas. O
   * conjunto é uma linha por aluno COM captura — na escala do evento, centenas.
   *
   * `dexTotal` é o número de professores cadastrados; `null` no ladder de
   * capturas, onde percentual não significa nada (não há teto).
   */
  private async montarLadder(
    userId: string,
    page: number,
    linhas: CollectionRow[],
    dexTotal: number | null,
  ) {
    // Desempate estável: mesmo total → quem chegou lá primeiro; depois o id,
    // para a lista não "dançar" entre reloads.
    const ordenadas = [...linhas].sort(
      (a, b) =>
        b.total - a.total ||
        a.ultimaEm - b.ultimaEm ||
        a.userId.localeCompare(b.userId),
    );

    const skip = (page - 1) * PAGE_SIZE;
    const pagina = ordenadas.slice(skip, skip + PAGE_SIZE);
    const indiceProprio = ordenadas.findIndex((l) => l.userId === userId);

    // Um findMany só: os nomes da página, mais o do próprio aluno quando ele
    // está fora dela.
    const ids = new Set(pagina.map((l) => l.userId));
    if (indiceProprio >= 0) ids.add(userId);
    const usuarios = await this.prisma.user.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, name: true },
    });
    const nomes = new Map(usuarios.map((u) => [u.id, u.name]));

    const monta = (
      linha: CollectionRow,
      position: number,
    ): CollectionEntry => ({
      position,
      id: linha.userId,
      name: nomes.get(linha.userId) ?? 'Aluno',
      total: linha.total,
      percent: dexTotal
        ? Math.round((linha.total / dexTotal) * 1000) / 10
        : null,
    });

    const entries = pagina.map((linha, i) => monta(linha, skip + i + 1));

    // Fora do ladder (nenhuma captura) → `ranked: false`, e a tela mostra o
    // convite em vez de uma posição inventada.
    const me =
      indiceProprio >= 0
        ? {
            ...monta(ordenadas[indiceProprio], indiceProprio + 1),
            ranked: true,
          }
        : {
            position: 0,
            id: userId,
            name: '',
            total: 0,
            percent: dexTotal ? 0 : null,
            ranked: false,
          };

    return {
      entries,
      me,
      page,
      pageSize: PAGE_SIZE,
      total: ordenadas.length,
      dexTotal,
    };
  }
}
