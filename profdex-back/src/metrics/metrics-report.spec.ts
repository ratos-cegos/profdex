import { buildMetricsReport, MetricsReportData } from './metrics-report';

/**
 * A janela do estande em 29/09/2026: das 17h à meia-noite em São Paulo, que em
 * UTC é 20:00 do dia 29 até 03:00 do dia 30. São 7 baldes.
 */
const DE = new Date('2026-09-29T20:00:00Z');
const ATE = new Date('2026-09-30T03:00:00Z');
const HORAS = Array.from({ length: 7 }, (_, i) => DE.getTime() + i * 3_600_000);

const zeros = () => new Array(7).fill(0) as number[];

function dados(over: Partial<MetricsReportData> = {}): MetricsReportData {
  return {
    geradoEm: new Date('2026-09-29T23:32:00Z'), // 20h32 em São Paulo
    de: DE,
    ate: ATE,
    escala: 'hora',
    baldes: HORAS,
    interacoes: {
      total: 18420,
      deTempo: 1200,
      deTurnos: 3100,
      porBalde: zeros().map((_, i) => (i === 3 ? 900 : 100)),
    },
    quiz: {
      respondidas: 320,
      acertadas: 210,
      taxa: 65.6,
      porBalde: zeros().map((_, i) => (i === 3 ? 40 : 5)),
      acertosPorBalde: zeros().map((_, i) => (i === 3 ? 28 : 3)),
    },
    capturas: { total: 540, raros: 12, porBalde: zeros() },
    batalhas: { total: 88, raids: 9, turnos: 3100, porBalde: zeros() },
    usuarios: { total: 137, porBalde: zeros() },
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

    // O primeiro balde é 20:00 UTC, que em São Paulo é 17h.
    expect(html).toContain('>17h<');
    expect(html).toContain('29/09 às 20h32'); // geradoEm, 23:32 UTC
  });

  /**
   * A janela é o turno do estande, não o dia inteiro: 17 horas de campus
   * dormindo diluem a taxa de acerto da bancada e o pico de batalhas.
   */
  it('anuncia o dia e a faixa de 17h às 24h no cabeçalho', () => {
    const html = buildMetricsReport(dados());

    expect(html).toContain('17h–24h');
    expect(html).toContain('29/09/2026');
    expect(html).toContain('<title>ProfDex — métricas de 29/09/2026</title>');
  });

  /**
   * O fim da janela é EXCLUSIVO e cai na meia-noite. Imprimir a hora crua diria
   * "00h" e faria o leitor achar que o relatório virou o dia.
   */
  it('mostra o fim da janela como 24h, nunca como 00h', () => {
    const html = buildMetricsReport(dados());

    expect(html).not.toContain('17h–00h');
  });

  /** Com 7 barras cabem todas as horas; omitir alguma faria contar barra. */
  it('rotula todas as horas quando a janela é curta', () => {
    const html = buildMetricsReport(dados());

    for (const hora of ['17h', '18h', '19h', '20h', '21h', '22h', '23h']) {
      expect(html).toContain(`>${hora}<`);
    }
  });

  /**
   * Uma janela sem registro nenhum acontece (madrugada, dia anterior ao
   * evento). O relatório precisa sair assim mesmo: dizer "não houve" é
   * informação, quebrar com `NaN` no meio da folha não é.
   */
  it('não quebra com tudo zerado', () => {
    const html = buildMetricsReport(
      dados({
        interacoes: { total: 0, deTempo: 0, deTurnos: 0, porBalde: zeros() },
        quiz: {
          respondidas: 0,
          acertadas: 0,
          taxa: 0,
          porBalde: zeros(),
          acertosPorBalde: zeros(),
        },
        capturas: { total: 0, raros: 0, porBalde: zeros() },
        batalhas: { total: 0, raids: 0, turnos: 0, porBalde: zeros() },
        usuarios: { total: 0, porBalde: zeros() },
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

  /**
   * A identidade do app, com os tokens de `profdex-front/src/style.css`. Eles
   * são literais aqui (o backend não enxerga o CSS do front), então é este
   * teste que denuncia se o relatório sair com a cara de qualquer outra coisa.
   */
  it('usa a paleta e a fonte da marca', () => {
    const html = buildMetricsReport(dados());

    expect(html).toContain('#995200'); // --unifil-orange
    expect(html).toContain('#edaf68'); // --unifil-gold
    expect(html).toContain('#121418'); // --bg-deep
    expect(html).toContain('#2b2b2b'); // --surface-border
    expect(html).toContain('Press+Start+2P');
    expect(html).toContain('PROF<span>DEX</span>');
  });

  /**
   * Na tela o relatório é escuro como o app; no papel ele inverte.
   *
   * Não é abrir mão da identidade — é o que a preserva: a maioria dos
   * navegadores descarta o fundo ao imprimir, e um tema escuro sem esta
   * inversão sairia como texto branco em papel branco, ou seja, em branco.
   */
  it('inverte para papel branco no `@media print`, sem perder as cores das séries', () => {
    const html = buildMetricsReport(dados());

    // Só o bloco, não o resto do documento: ele mora no `<head>`, e cortar até
    // o fim pegaria o `<body>` inteiro — com todos os `fill=` do SVG junto.
    // E `@media print {` com a chave, porque o texto sem ela também aparece num
    // comentário do CSS, antes do bloco de verdade.
    const print = html.slice(
      html.indexOf('@media print {'),
      html.indexOf('</style>'),
    );
    expect(print).toContain('--papel: #ffffff');
    expect(print).toContain('--tinta: #16181c');
    // A cor de cada série é atributo do SVG e NÃO muda entre tela e papel: a
    // legenda impressa precisa bater com a que a pessoa viu na tela.
    expect(print).not.toContain('fill=');
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

/**
 * O consolidado da semana sai da MESMA função, só com `escala: 'dia'`. O que
 * muda é o eixo, o título do período e o aviso do rodapé — e cada um deles já
 * seria um jeito de o papel mentir sobre o que está mostrando.
 */
describe('buildMetricsReport no consolidado da semana', () => {
  /** 17h de 23/09 em São Paulo = 20:00 UTC. Sete turnos até 29/09. */
  const PRIMEIRO_TURNO = new Date('2026-09-23T20:00:00Z');
  const DIAS = Array.from(
    { length: 7 },
    (_, i) => PRIMEIRO_TURNO.getTime() + i * 86_400_000,
  );

  const naSemana = (over: Partial<MetricsReportData> = {}) =>
    buildMetricsReport(
      dados({
        escala: 'dia',
        de: PRIMEIRO_TURNO,
        ate: new Date('2026-09-30T03:00:00Z'),
        baldes: DIAS,
        ...over,
      }),
    );

  /**
   * A data embaixo da barra, nunca a hora: com `escala: 'dia'` cada barra é um
   * turno inteiro, e "17h" ali diria que o gráfico é de um dia só.
   */
  it('rotula o eixo com as datas dos sete dias', () => {
    const html = naSemana();

    for (const dia of ['23/09', '24/09', '27/09', '29/09']) {
      expect(html).toContain(`>${dia}<`);
    }
    // A hora não aparece como rótulo de barra em lugar nenhum do eixo.
    expect(html).not.toContain('>17h<');
  });

  /**
   * `ate` é EXCLUSIVO e cai na meia-noite. Sem descontar, o título diria "a
   * 30/09" — um dia que não entrou em número nenhum da folha.
   */
  it('anuncia a faixa de dias coberta, sem invadir o dia seguinte', () => {
    const html = naSemana();

    expect(html).toContain('23/09/2026 a 29/09/2026');
    expect(html).toContain(
      '<title>ProfDex — métricas de 23/09/2026 a 29/09/2026</title>',
    );
    expect(html).not.toContain('30/09/2026');
  });

  /**
   * A faixa de horas sozinha faria a semana parecer um bloco contínuo de sete
   * dias. Ela é a janela de CADA dia — e o `×` é o que diz isso.
   */
  it('diz que são sete turnos de 17h às 24h, não um bloco contínuo', () => {
    const html = naSemana();

    expect(html).toContain('7 dias × 17h–24h');
  });

  it('troca "por hora" por "por dia" nos títulos dos gráficos', () => {
    const html = naSemana();

    expect(html).toContain('Interações por dia');
    expect(html).toContain('Capturas, batalhas e presença por dia');
    expect(html).not.toContain('por hora');
  });

  /**
   * `active_users` é "alunos distintos NAQUELA HORA". Somar as sete horas de um
   * turno numa barra de dia faz quem ficou das 18h às 21h contar quatro vezes —
   * chamar isso de "alunos ativos" inflaria a plateia em três a cinco vezes num
   * papel que vai para a coordenação. A barra continua útil (é a forma da
   * semana); só não pode usar o nome de gente.
   */
  it('não chama de "alunos ativos" a barra que é aluno×hora', () => {
    const html = naSemana();

    expect(html).toContain('Presença (aluno×hora)');
    expect(html).not.toContain('Alunos ativos');
    // E o rodapé diz onde está a plateia de verdade.
    expect(html).toContain('aluno×hora, não gente');
  });

  /** Numa barra de HORA a série é exatamente "alunos ativos" — e segue assim. */
  it('mantém "alunos ativos" no relatório de um dia', () => {
    const html = buildMetricsReport(dados());

    expect(html).toContain('Alunos ativos');
    expect(html).not.toContain('aluno×hora');
  });

  /**
   * O aviso que evita o relatório parecer defeituoso: tudo fecha por soma com os
   * sete diários, MENOS alunos no evento, que é contagem de distintos. Vai no
   * rodapé porque o rodapé imprime — a dúvida nasce com o papel na mão.
   */
  it('explica no rodapé o que fecha por soma e o que não fecha', () => {
    const html = naSemana();

    expect(html).toContain('Consolidado de 7 dias');
    expect(html).toContain('Alunos no evento é a exceção');
    expect(html).toContain('DISTINTOS');
  });

  /** O relatório de um dia não pode carregar o aviso do consolidado. */
  it('não mostra o aviso do consolidado no relatório de um dia', () => {
    const html = buildMetricsReport(dados());

    expect(html).not.toContain('Consolidado de');
    expect(html).not.toContain('Alunos no evento é a exceção');
  });

  it('não quebra com a semana inteira zerada', () => {
    const html = naSemana({
      interacoes: { total: 0, deTempo: 0, deTurnos: 0, porBalde: zeros() },
      quiz: {
        respondidas: 0,
        acertadas: 0,
        taxa: 0,
        porBalde: zeros(),
        acertosPorBalde: zeros(),
      },
      capturas: { total: 0, raros: 0, porBalde: zeros() },
      batalhas: { total: 0, raids: 0, turnos: 0, porBalde: zeros() },
      usuarios: { total: 0, porBalde: zeros() },
      fontes: [],
    });

    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
    expect(html).toContain('Sem registros nesta janela.');
  });
});
