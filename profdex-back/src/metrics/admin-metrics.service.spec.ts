import { PrismaService } from '../prisma/prisma.service';
import { AdminMetricsService } from './admin-metrics.service';

function createSubject(rows: { metric: string; value: number }[]) {
  const prisma = {
    metricHourly: { findMany: jest.fn().mockResolvedValue(rows) },
    quizAttempt: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
    capture: { count: jest.fn(), findMany: jest.fn() },
    appEvent: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
  };
  const service = new AdminMetricsService(prisma as unknown as PrismaService);
  return { prisma, service };
}

/**
 * O relatório do dia — o que vira PDF. As asserções aqui são sobre a FONTE de
 * cada número, não sobre o layout: é a fonte errada que produziu os dois bugs
 * que este relatório existe para não repetir.
 */
describe('AdminMetricsService.reportDoDia', () => {
  const DIA = '2026-09-29';
  /** 17h de 29/09 em São Paulo = 20:00 UTC. É o primeiro balde da janela. */
  const PRIMEIRO_BALDE = new Date('2026-09-29T20:00:00Z');

  function criar(linhas: { metric: string; value: number }[] = []) {
    const bucket = PRIMEIRO_BALDE;
    const prisma = {
      metricHourly: {
        findMany: jest
          .fn()
          .mockResolvedValue(linhas.map((l) => ({ ...l, bucket }))),
      },
      battle: { count: jest.fn().mockResolvedValue(88) },
      raidAttempt: { count: jest.fn().mockResolvedValue(9) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const service = new AdminMetricsService(prisma as unknown as PrismaService);
    return { prisma, service };
  }

  /**
   * `battle_finished` é gravado uma vez POR JOGADOR. Contar o evento mostrava o
   * dobro das batalhas — e esse número ia impresso para a coordenação.
   */
  it('conta batalhas na tabela `battles`, não no evento (que vem dobrado)', async () => {
    const { prisma, service } = criar([
      { metric: 'event_battle_finished', value: 176 },
    ]);

    const relatorio = await service.reportDoDia(DIA);

    expect(relatorio.batalhas.total).toBe(88);
    expect(prisma.battle.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'finished' }),
      }),
    );
    // A série horária vem do evento e por isso é dividida por 2.
    expect(relatorio.batalhas.porBalde).toContain(88);
  });

  it('separa respondidas de acertadas e calcula a taxa da bancada', async () => {
    const { service } = criar([
      { metric: 'event_quiz_answered', value: 200 },
      { metric: 'event_quiz_answered', value: 120 },
      { metric: 'event_quiz_correct', value: 210 },
    ]);

    const { quiz } = await service.reportDoDia(DIA);

    expect(quiz.respondidas).toBe(320);
    expect(quiz.acertadas).toBe(210);
    expect(quiz.taxa).toBe(65.6);
  });

  /** Sem bancada nenhuma, `0/0` viraria `NaN` no meio do PDF. */
  it('não inventa taxa de acerto quando ninguém respondeu', async () => {
    const { service } = criar();

    await expect(service.reportDoDia(DIA)).resolves.toMatchObject({
      quiz: { respondidas: 0, acertadas: 0, taxa: 0 },
    });
  });

  /**
   * A janela é o turno do estande — 17h às 24h —, não o dia inteiro: sete
   * baldes, e todos presentes mesmo sem registro, porque uma hora vazia é
   * informação sobre o ritmo do evento.
   */
  it('devolve as 7 horas do estande, inclusive as vazias', async () => {
    const { service } = criar();

    const relatorio = await service.reportDoDia(DIA);

    expect(relatorio.baldes).toHaveLength(7);
    expect(relatorio.interacoes.porBalde).toHaveLength(7);
    expect(relatorio.usuarios.porBalde).toHaveLength(7);
    expect(new Date(relatorio.baldes[0])).toEqual(PRIMEIRO_BALDE);
    expect(relatorio.de).toEqual(PRIMEIRO_BALDE);
    expect(relatorio.ate).toEqual(new Date('2026-09-30T03:00:00Z'));
  });

  /**
   * A janela precisa recortar dos DOIS lados. Só com `gte`, um relatório de
   * terça somaria o evento inteiro dali para a frente — e o número impresso
   * cresceria a cada dia sem ninguém notar.
   *
   * O `OR` com uma faixa só é o formato que o consolidado da semana exige (lá
   * são sete) e que o dia passou a usar junto, para os dois períodos dividirem
   * um caminho só — ver `AdminMetricsService.relatorio`.
   */
  it('recorta a janela nos dois extremos, não só no início', async () => {
    const { prisma, service } = criar();

    await service.reportDoDia(DIA);

    const dentro = {
      gte: PRIMEIRO_BALDE,
      lt: new Date('2026-09-30T03:00:00Z'),
    };
    expect(prisma.metricHourly.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ bucket: dentro }] } }),
    );
    expect(prisma.battle.count).toHaveBeenCalledWith({
      where: { status: 'finished', OR: [{ finishedAt: dentro }] },
    });
    expect(prisma.raidAttempt.count).toHaveBeenCalledWith({
      where: { OR: [{ endedAt: dentro }] },
    });
  });

  /**
   * A data vira string de instante e vai para o `where` do Prisma. Com lixo,
   * `new Date(...)` é `Invalid Date`, o filtro recebe `NaN` e o relatório sai
   * vazio sem ninguém entender por quê — melhor recusar alto.
   */
  it('recusa data fora do formato AAAA-MM-DD', async () => {
    const { service } = criar();

    await expect(service.reportDoDia('ontem')).rejects.toThrow(/AAAA-MM-DD/);
    await expect(service.reportDoDia('29/09/2026')).rejects.toThrow(
      /AAAA-MM-DD/,
    );
  });

  /** O turno é derivado das interações pelo mesmo peso que o rollup usou. */
  it('reconstrói a contagem de turnos a partir das interações de turno', async () => {
    const { service } = criar([{ metric: 'interactions_turns', value: 3100 }]);

    const relatorio = await service.reportDoDia(DIA);

    expect(relatorio.batalhas.turnos).toBe(3100);
    expect(relatorio.interacoes.deTurnos).toBe(3100);
  });

  it('marca a escala como horária — uma barra por hora do estande', async () => {
    const { service } = criar();

    await expect(service.reportDoDia(DIA)).resolves.toMatchObject({
      escala: 'hora',
    });
  });
});

/**
 * O consolidado da semana. A promessa única deste relatório é **somar o mesmo que
 * os sete relatórios diários**, e é ela que as asserções aqui protegem: alguém
 * vai conferir na calculadora, somando os PDFs do dia.
 */
describe('AdminMetricsService.reportDaSemana', () => {
  const DIA_FINAL = '2026-09-29';
  /** 17h de 29/09 em São Paulo = 20:00 UTC — o início da ÚLTIMA janela. */
  const ULTIMO_TURNO = new Date('2026-09-29T20:00:00Z');
  /** Seis dias antes: 17h de 23/09, o início da PRIMEIRA. */
  const PRIMEIRO_TURNO = new Date('2026-09-23T20:00:00Z');

  function criar(linhas: { metric: string; value: number; bucket: Date }[]) {
    const prisma = {
      metricHourly: { findMany: jest.fn().mockResolvedValue(linhas) },
      battle: { count: jest.fn().mockResolvedValue(600) },
      raidAttempt: { count: jest.fn().mockResolvedValue(70) },
      $queryRaw: jest.fn().mockResolvedValue([{ total: 410 }]),
    };
    const service = new AdminMetricsService(prisma as unknown as PrismaService);
    return { prisma, service };
  }

  /** Uma hora qualquer DENTRO do turno do dia `n` da janela (0 = o mais antigo). */
  const dentroDoDia = (n: number, hora = 0) =>
    new Date(PRIMEIRO_TURNO.getTime() + n * 86_400_000 + hora * 3_600_000);

  it('cobre os sete turnos, do mais antigo ao dia escolhido', async () => {
    const { service } = criar([]);

    const relatorio = await service.reportDaSemana(DIA_FINAL);

    expect(relatorio.escala).toBe('dia');
    expect(relatorio.baldes).toHaveLength(7);
    expect(relatorio.de).toEqual(PRIMEIRO_TURNO);
    // O fim é a meia-noite DEPOIS do dia escolhido: 00h de 30/09 = 03:00 UTC.
    expect(relatorio.ate).toEqual(new Date('2026-09-30T03:00:00Z'));
    expect(new Date(relatorio.baldes[0])).toEqual(PRIMEIRO_TURNO);
    expect(new Date(relatorio.baldes[6])).toEqual(ULTIMO_TURNO);
  });

  /**
   * Um balde por DIA, não por hora: as sete horas de um turno caem todas na
   * mesma barra. É o que torna o gráfico legível com 7 dias em vez de 49 barras.
   */
  it('soma as horas de um turno num balde só, o do dia', async () => {
    const { service } = criar([
      { metric: 'interactions', value: 100, bucket: dentroDoDia(0, 0) },
      { metric: 'interactions', value: 20, bucket: dentroDoDia(0, 3) },
      { metric: 'interactions', value: 7, bucket: dentroDoDia(6, 6) },
    ]);

    const relatorio = await service.reportDaSemana(DIA_FINAL);

    expect(relatorio.interacoes.porBalde).toEqual([120, 0, 0, 0, 0, 0, 7]);
    expect(relatorio.interacoes.total).toBe(127);
  });

  /**
   * **A asserção central.** A hora morta entre dois turnos (o campus dormindo)
   * não pode entrar em soma nenhuma: se entrasse, o consolidado deixaria de bater
   * com a soma dos sete diários e as duas contas perderiam a credibilidade
   * juntas. Batalha é o caso real — ela acontece do celular, a qualquer hora.
   */
  it('ignora o que caiu fora do turno do estande', async () => {
    const madrugada = new Date(PRIMEIRO_TURNO.getTime() + 10 * 3_600_000); // 3h
    const { service } = criar([
      { metric: 'interactions', value: 500, bucket: dentroDoDia(0) },
      { metric: 'interactions', value: 999, bucket: madrugada },
    ]);

    const relatorio = await service.reportDaSemana(DIA_FINAL);

    expect(relatorio.interacoes.total).toBe(500);
    expect(relatorio.interacoes.porBalde).toEqual([500, 0, 0, 0, 0, 0, 0]);
  });

  /** As sete faixas vão ao banco como sete, recortadas nos dois extremos. */
  it('pede ao banco as sete janelas, não um bloco contínuo de sete dias', async () => {
    const { prisma, service } = criar([]);

    await service.reportDaSemana(DIA_FINAL);

    const faixas = (
      prisma.metricHourly.findMany.mock.calls[0][0] as {
        where: { OR: { bucket: { gte: Date; lt: Date } }[] };
      }
    ).where.OR;
    expect(faixas).toHaveLength(7);
    expect(faixas[0].bucket.gte).toEqual(PRIMEIRO_TURNO);
    expect(faixas[6].bucket.gte).toEqual(ULTIMO_TURNO);
    // Cada faixa tem 7 horas — o turno —, nunca as 24 do dia.
    for (const { bucket } of faixas) {
      expect(bucket.lt.getTime() - bucket.gte.getTime()).toBe(7 * 3_600_000);
    }
    expect(prisma.battle.count).toHaveBeenCalledWith({
      where: { status: 'finished', OR: expect.arrayContaining([]) },
    });
  });

  /**
   * Alunos DISTINTOS na semana, nunca a soma dos sete dias: quem veio quarta e
   * quinta é um aluno, não dois. É a única coisa do consolidado que não fecha por
   * soma, e o rodapé do PDF avisa justamente por isso.
   */
  it('conta alunos distintos na semana, numa consulta só', async () => {
    const { prisma, service } = criar([]);

    const relatorio = await service.reportDaSemana(DIA_FINAL);

    expect(relatorio.usuarios.total).toBe(410);
    // UMA consulta com as sete faixas dentro, não uma por dia: sete contagens
    // somadas dariam a plateia errada (repetiriam quem voltou) além de custarem
    // sete idas ao banco.
    const deUsuarios = prisma.$queryRaw.mock.calls.filter(([q]) =>
      String((q as { sql?: string }).sql ?? '').includes('user_sessions'),
    );
    expect(deUsuarios).toHaveLength(1);
    // As faixas viajam como PARÂMETROS, nunca interpoladas no texto: 7 janelas ×
    // 2 instantes × os 2 lados do `UNION` (sessões e eventos) = 28.
    expect((deUsuarios[0][0] as { values: unknown[] }).values).toHaveLength(28);
  });

  it('recusa data fora do formato AAAA-MM-DD', async () => {
    const { service } = criar([]);

    await expect(service.reportDaSemana('semana passada')).rejects.toThrow(
      /AAAA-MM-DD/,
    );
  });
});

describe('AdminMetricsService.practiceQuiz', () => {
  it('reads only the pre-aggregated table — never the raw audit trail', async () => {
    const { prisma, service } = createSubject([]);

    await service.practiceQuiz();

    expect(prisma.metricHourly.findMany).toHaveBeenCalledTimes(1);
    // O painel não pode varrer app_events (regra documentada no schema)...
    expect(prisma.appEvent.findMany).not.toHaveBeenCalled();
    expect(prisma.appEvent.groupBy).not.toHaveBeenCalled();
    // ...nem encostar nas tabelas da competição oficial.
    expect(prisma.quizAttempt.count).not.toHaveBeenCalled();
    expect(prisma.quizAttempt.findMany).not.toHaveBeenCalled();
    expect(prisma.quizAttempt.groupBy).not.toHaveBeenCalled();
    expect(prisma.capture.count).not.toHaveBeenCalled();
  });

  it('sums the hourly buckets of a theme into one total', async () => {
    const { service } = createSubject([
      { metric: 'practice_answered_banco', value: 4 },
      { metric: 'practice_answered_banco', value: 6 },
      { metric: 'practice_correct_banco', value: 3 },
      { metric: 'practice_correct_banco', value: 2 },
    ]);

    const r = await service.practiceQuiz();
    const banco = r.porTema.find((t) => t.tema === 'banco');

    expect(banco).toMatchObject({ respostas: 10, acertos: 5, taxa: 50 });
    expect(r.total).toBe(10);
    expect(r.taxa).toBe(50);
  });

  it('always returns all nine themes, so a zero is visible as a zero', async () => {
    const { service } = createSubject([
      { metric: 'practice_answered_redes', value: 1 },
    ]);

    const r = await service.practiceQuiz();

    expect(r.porTema).toHaveLength(9);
    // Sem resposta nenhuma a taxa é null, não 0% — que significaria "erraram
    // todas" e é uma leitura completamente diferente.
    expect(r.porTema.find((t) => t.tema === 'humanas')).toMatchObject({
      respostas: 0,
      taxa: null,
    });
  });

  it('reports no accuracy at all when nothing was practised', async () => {
    const { service } = createSubject([]);

    const r = await service.practiceQuiz();

    expect(r.total).toBe(0);
    expect(r.taxa).toBeNull();
  });

  it('clamps the window so a huge `days` cannot widen the scan', async () => {
    const { service } = createSubject([]);

    expect((await service.practiceQuiz(9999)).dias).toBe(30);
    expect((await service.practiceQuiz(0)).dias).toBe(1);
  });
});
