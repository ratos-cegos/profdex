import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_PROFESSOR_SELECT } from './public-professor.select';

@Injectable()
export class ProfessorsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string) {
    const [professors, discoveries, captures] = await Promise.all([
      // Só os ATIVOS: desativar um professor no painel o tira da Profdex e do
      // sorteio de captura. Quem já o capturou continua com o exemplar — a
      // coleção do aluno vem de `captures`, que não passa por este filtro.
      //
      // E nunca os RAROS: é este filtro que os tira do `X/Y` sem o front
      // precisar saber que eles existem. O raro tem rota própria (`rares`),
      // que devolve só a contagem e os que o aluno já capturou.
      this.prisma.professor.findMany({
        where: { active: true, rare: false },
        orderBy: { name: 'asc' },
        select: PUBLIC_PROFESSOR_SELECT,
      }),
      this.prisma.discovery.findMany({
        where: { userId },
        select: { professorId: true },
      }),
      this.prisma.capture.findMany({
        where: { userId },
        select: { professorId: true },
      }),
    ]);

    const discoveredIds = new Set(discoveries.map((d) => d.professorId));

    // Quantos exemplares o aluno tem de cada um — o mesmo professor pode ter
    // sido capturado em várias fichas, com combinações de tipos diferentes.
    const capturedCounts = new Map<string, number>();
    for (const { professorId } of captures) {
      capturedCounts.set(
        professorId,
        (capturedCounts.get(professorId) ?? 0) + 1,
      );
    }

    return professors.map((p) => ({
      ...p,
      discovered: discoveredIds.has(p.id),
      captured: capturedCounts.has(p.id),
      capturedCount: capturedCounts.get(p.id) ?? 0,
    }));
  }

  /**
   * Um professor pelo id.
   *
   * Raro que o requisitante NÃO possui vira 404 — não 403, que confirmaria a
   * existência. O id é UUID e não é adivinhável, mas allowlist é allowlist: a
   * regra do repositório é que o que o front não recebe é o que o aluno não
   * descobre, e "esconder na tela" não esconde nada de quem abre o DevTools.
   */
  async findOne(id: string, userId: string) {
    const professor = await this.prisma.professor.findUnique({
      where: { id },
      select: { ...PUBLIC_PROFESSOR_SELECT, rare: true },
    });
    if (!professor) throw new NotFoundException('Professor não encontrado.');

    // `rare` é lido para decidir o acesso e fica FORA da resposta: ele não está
    // na allowlist pública, e vazá-lo diria "este id é um raro" para quem o
    // tivesse obtido de outro jeito.
    const { rare, ...publico } = professor;
    if (rare) {
      const capture = await this.prisma.capture.findFirst({
        where: { userId, professorId: id },
        select: { id: true },
      });
      if (!capture) throw new NotFoundException('Professor não encontrado.');
    }

    return publico;
  }

  /**
   * A seção `✦ Raros` da Profdex: quantos existem e quais o aluno já tem.
   *
   * O que NÃO atravessa a fronteira é o ponto desta rota. De um raro não
   * capturado sai apenas o fato de que ele existe — nem nome, nem tipo, nem URL
   * de arte. "Existe raro" muda o comportamento do aluno (ele volta à bancada);
   * "existe um número desconhecido de raros" não muda nada, e saber o TEMA
   * acabaria com a graça para a fila inteira.
   *
   * O front desenha `total - owned.length` cards bloqueados a partir daqui.
   */
  async findRares(userId: string) {
    const [total, capturas] = await Promise.all([
      this.prisma.professor.count({ where: { rare: true, active: true } }),
      this.prisma.capture.findMany({
        where: { userId, professor: { rare: true, active: true } },
        select: { professor: { select: PUBLIC_PROFESSOR_SELECT } },
        distinct: ['professorId'],
        orderBy: { capturedAt: 'asc' },
      }),
    ]);

    return { total, owned: capturas.map((c) => c.professor) };
  }
}
