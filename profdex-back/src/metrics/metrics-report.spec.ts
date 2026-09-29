import { buildMetricsReport, MetricsReportData } from './metrics-report';

/** 24 horas a partir de 29/09/2026 00h (03:00 UTC = 00h em São Paulo). */
const HORAS = Array.from(
  { length: 24 },
  (_, i) => Date.parse('2026-09-29T03:00:00Z') + i * 3_600_000,
);

const zeros = () => new Array(24).fill(0) as number[];

function dados(over: Partial<MetricsReportData> = {}): MetricsReportData {
  return {
    geradoEm: new Date('2026-09-29T20:32:00Z'),
    de: new Date('2026-09-29T03:00:00Z'),
    horas: HORAS,
    interacoes: {
      total: 18420,
      deTempo: 1200,
      deTurnos: 3100,
      porHora: zeros().map((_, i) => (i === 12 ? 900 : 100)),
    },
    quiz: {
      respondidas: 320,
      acertadas: 210,
      taxa: 65.6,
      porHora: zeros().map((_, i) => (i === 12 ? 40 : 5)),
      acertosPorHora: zeros().map((_, i) => (i === 12 ? 28 : 3)),
    },
    capturas: { total: 540, raros: 12, porHora: zeros() },
    batalhas: { total: 88, raids: 9, turnos: 3100, porHora: zeros() },
    usuarios: { total: 137, porHora: zeros() },
    fontes: [
      { fonte: 'Quiz respondido na bancada', interacoes: 6400, pct: 34.7 },
      { fonte: 'Turnos de batalha (PvP e raid)', interacoes: 3100, pct: 16.8 },
    ],
    ...over,
  };
}

describe('buildMetricsReport', () => {
  it('traz os cinco números pedidos, formatados em pt-BR', () => {
    const html = buildMetricsReport(dados());

    expect(html).toContain('18.420'); // interações
    expect(html).toContain('137'); // alunos
    expect(html).toContain('210'); // acertadas
    expect(html).toContain('320'); // respondidas
    expect(html).toContain('65.6% de acerto');
    expect(html).toContain('540'); // capturas
    expect(html).toContain('88'); // batalhas
  });

  it('mostra os turnos de batalha ao lado do total de batalhas', () => {
    const html = buildMetricsReport(dados());

    expect(html).toContain('3.100 turnos');
    expect(html).toContain('9 raid(s)');
  });

  /**
   * SVG inline, sem biblioteca e sem script: um `<canvas>` desenhado por
   * JavaScript sai em branco em parte das impressões, e o relatório existe para
   * virar papel.
   */
  it('desenha os gráficos como SVG inline, sem script nenhum', () => {
    const html = buildMetricsReport(dados());

    expect(html).toContain('<svg');
    expect(html).toContain('<rect');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<canvas');
  });

  it('formata as horas no fuso do evento, não em UTC', () => {
    const html = buildMetricsReport(dados());

    // O primeiro balde é 03:00 UTC, que em São Paulo é meia-noite.
    expect(html).toContain('>00h<');
    expect(html).toContain('29/09 às 17h32'); // geradoEm, 20:32 UTC
  });

  /**
   * Uma janela sem registro nenhum acontece (madrugada, dia anterior ao
   * evento). O relatório precisa sair assim mesmo: dizer "não houve" é
   * informação, quebrar com `NaN` no meio da folha não é.
   */
  it('não quebra com tudo zerado', () => {
    const html = buildMetricsReport(
      dados({
        interacoes: { total: 0, deTempo: 0, deTurnos: 0, porHora: zeros() },
        quiz: {
          respondidas: 0,
          acertadas: 0,
          taxa: 0,
          porHora: zeros(),
          acertosPorHora: zeros(),
        },
        capturas: { total: 0, raros: 0, porHora: zeros() },
        batalhas: { total: 0, raids: 0, turnos: 0, porHora: zeros() },
        usuarios: { total: 0, porHora: zeros() },
        fontes: [],
      }),
    );

    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
    expect(html).toContain('Sem registros nesta janela.');
  });

  /** A dica do Ctrl+P não faz sentido no papel. */
  it('esconde a dica de impressão no `@media print`', () => {
    const html = buildMetricsReport(dados());

    expect(html).toContain('@media print');
    expect(html).toMatch(/@media print[\s\S]*\.dica \{ display: none; \}/);
  });

  it('escapa o nome da fonte vindo do banco', () => {
    const html = buildMetricsReport(
      dados({
        fontes: [{ fonte: '<script>x</script>', interacoes: 1, pct: 1 }],
      }),
    );

    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>x</script>');
  });
});
