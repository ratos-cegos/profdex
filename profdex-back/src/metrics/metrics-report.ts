import { escapeHtml } from '../mail/escape-html';

/**
 * O relatório de 24 horas, em HTML pronto para imprimir.
 *
 * **Por que HTML e não PDF binário.** O projeto já imprime assim: as fichas de
 * QR saem como `text/html` com `@media print` e o organizador usa o "Salvar como
 * PDF" do navegador (ver `captures/capture-sheet.ts`). Gerar PDF de verdade
 * exigiria Chromium (puppeteer) ou uma engine de layout dentro da imagem Docker
 * — centenas de MB e um processo a mais competindo com o PvP na mesma t3.micro,
 * para produzir o mesmo papel.
 *
 * Módulo PURO: recebe os números prontos e devolve string. Sem Prisma, sem
 * relógio — o teste do relatório não monta banco nenhum.
 *
 * Os gráficos são **SVG inline**, sem biblioteca: é o que imprime sem depender
 * de JavaScript rodando na hora do `Ctrl+P` (um `<canvas>` desenhado por script
 * sai em branco em algumas impressões) e o que mantém o arquivo autocontido.
 */

/** Fuso do evento — o servidor de produção roda em UTC. */
const FUSO = 'America/Sao_Paulo';

export interface SerieHoraria {
  label: string;
  valores: number[];
  cor: string;
}

export interface MetricsReportData {
  geradoEm: Date;
  de: Date;
  /** Os 24 inícios de hora, em epoch ms. */
  horas: number[];
  interacoes: {
    total: number;
    deTempo: number;
    deTurnos: number;
    porHora: number[];
  };
  quiz: {
    respondidas: number;
    acertadas: number;
    taxa: number;
    porHora: number[];
    acertosPorHora: number[];
  };
  capturas: { total: number; raros: number; porHora: number[] };
  batalhas: {
    total: number;
    raids: number;
    turnos: number;
    porHora: number[];
  };
  usuarios: { total: number; porHora: number[] };
  /** De onde vieram as interações, já ordenado e com percentual. */
  fontes: { fonte: string; interacoes: number; pct: number }[];
}

export function buildMetricsReport(data: MetricsReportData): string {
  const periodo = `${formatarMomento(data.de)} — ${formatarMomento(data.geradoEm)}`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>ProfDex — métricas das últimas 24h</title>
${estilo()}
</head>
<body>
  <header class="topo">
    <h1>ProfDex — métricas das últimas 24 horas</h1>
    <p class="periodo">${escapeHtml(periodo)}</p>
  </header>

  <p class="dica">
    Para salvar em PDF: <strong>Ctrl+P</strong> (ou ⌘+P) e escolha
    "Salvar como PDF" no destino.
  </p>

  <section class="kpis">
    ${kpi('Interações', numero(data.interacoes.total), 'total ponderado do período')}
    ${kpi('Alunos no evento', numero(data.usuarios.total), 'usaram o app ou a bancada')}
    ${kpi(
      'Perguntas na bancada',
      `${numero(data.quiz.acertadas)}<span class="de">/${numero(data.quiz.respondidas)}</span>`,
      `${data.quiz.taxa}% de acerto`,
    )}
    ${kpi('Professores capturados', numero(data.capturas.total), `${numero(data.capturas.raros)} raro(s)`)}
    ${kpi(
      'Batalhas',
      numero(data.batalhas.total),
      `${numero(data.batalhas.turnos)} turnos · ${numero(data.batalhas.raids)} raid(s)`,
    )}
  </section>

  ${grafico('Interações por hora', data.horas, [
    { label: 'Interações', valores: data.interacoes.porHora, cor: '#c62828' },
  ])}

  ${grafico('Bancada: respondidas × acertadas', data.horas, [
    { label: 'Respondidas', valores: data.quiz.porHora, cor: '#1565c0' },
    { label: 'Acertadas', valores: data.quiz.acertosPorHora, cor: '#2e7d32' },
  ])}

  ${grafico('Capturas, batalhas e alunos ativos por hora', data.horas, [
    { label: 'Capturas', valores: data.capturas.porHora, cor: '#ef6c00' },
    { label: 'Batalhas', valores: data.batalhas.porHora, cor: '#6a1b9a' },
    { label: 'Alunos ativos', valores: data.usuarios.porHora, cor: '#00838f' },
  ])}

  ${tabelaDeFontes(data)}

  <footer class="rodape">
    Interações são uma régua PONDERADA, não cliques: uma captura exige estar
    diante do QR, uma rodada de bancada custa fila e operador, e cada turno de
    batalha conta. Os pesos estão em <code>src/metrics/engagement.ts</code>.
  </footer>
</body>
</html>`;
}

// ── Blocos ────────────────────────────────────────────────────────────────

function kpi(rotulo: string, valor: string, apoio: string): string {
  return `<div class="kpi">
      <span class="kpi__rotulo">${escapeHtml(rotulo)}</span>
      <strong class="kpi__valor">${valor}</strong>
      <span class="kpi__apoio">${escapeHtml(apoio)}</span>
    </div>`;
}

/**
 * Gráfico de barras agrupadas, em SVG.
 *
 * Uma escala só para todas as séries do mesmo gráfico: escalas independentes
 * fariam duas barras de alturas iguais representarem números diferentes, que é
 * a forma mais fácil de um relatório mentir sem ninguém perceber.
 *
 * Com tudo zerado o gráfico ainda é desenhado (eixo, rótulos e a nota de
 * "sem dados"): uma hora vazia é informação sobre o evento, e omitir o bloco
 * faria parecer que a métrica não existe.
 */
function grafico(
  titulo: string,
  horas: number[],
  series: SerieHoraria[],
): string {
  const L = 44; // espaço do eixo Y
  const W = 720;
  const H = 190;
  const base = H - 26; // linha do zero
  const topo = 12;

  const maximo = Math.max(1, ...series.flatMap((s) => s.valores));
  const largura = (W - L - 8) / horas.length;
  const larguraBarra = Math.max(2, (largura - 4) / series.length);
  const y = (valor: number) => base - (valor / maximo) * (base - topo);

  const barras = series
    .map((serie, indiceSerie) =>
      serie.valores
        .map((valor, i) => {
          const altura = base - y(valor);
          if (altura <= 0) return '';
          const x = L + i * largura + 2 + indiceSerie * larguraBarra;
          return `<rect x="${round(x)}" y="${round(y(valor))}" width="${round(larguraBarra)}" height="${round(altura)}" fill="${serie.cor}"><title>${escapeHtml(serie.label)}: ${valor}</title></rect>`;
        })
        .join(''),
    )
    .join('');

  // Rótulo a cada 3 horas: 24 rótulos colados viram uma tarja preta no papel.
  const rotulos = horas
    .map((t, i) =>
      i % 3 === 0
        ? `<text class="eixo" x="${round(L + i * largura + largura / 2)}" y="${H - 10}" text-anchor="middle">${formatarHora(t)}</text>`
        : '',
    )
    .join('');

  const linhas = [0, 0.5, 1]
    .map((f) => {
      const valor = Math.round(maximo * f);
      return `<line class="grade" x1="${L}" y1="${round(y(valor))}" x2="${W - 8}" y2="${round(y(valor))}" />
      <text class="eixo" x="${L - 6}" y="${round(y(valor)) + 4}" text-anchor="end">${numero(valor)}</text>`;
    })
    .join('');

  const legenda = series
    .map(
      (s) =>
        `<span class="legenda__item"><i style="background:${s.cor}"></i>${escapeHtml(s.label)}</span>`,
    )
    .join('');

  const vazio = series.every((s) => s.valores.every((v) => v === 0));

  return `<section class="bloco">
    <h2>${escapeHtml(titulo)}</h2>
    <div class="legenda">${legenda}</div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(titulo)}">
      ${linhas}
      ${barras}
      ${rotulos}
    </svg>
    ${vazio ? '<p class="vazio">Sem registros nesta janela.</p>' : ''}
  </section>`;
}

function tabelaDeFontes(data: MetricsReportData): string {
  if (!data.fontes.length) return '';
  const linhas = data.fontes
    .map(
      (f) => `<tr>
        <td>${escapeHtml(f.fonte)}</td>
        <td class="num">${numero(f.interacoes)}</td>
        <td class="num">${f.pct}%</td>
      </tr>`,
    )
    .join('');

  return `<section class="bloco">
    <h2>De onde vieram as interações</h2>
    <table>
      <thead><tr><th>Fonte</th><th class="num">Interações</th><th class="num">%</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    <p class="nota">
      Acumulado do evento inteiro, não só das 24h — é a leitura que mostra o
      peso relativo de cada atividade.
    </p>
  </section>`;
}

// ── Formatação ────────────────────────────────────────────────────────────

const round = (n: number) => Math.round(n * 10) / 10;

function numero(valor: number): string {
  return new Intl.NumberFormat('pt-BR').format(Math.round(valor));
}

/** `14h` — a hora no fuso do evento. */
function formatarHora(epochMs: number): string {
  const hora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    hour: '2-digit',
    hour12: false,
  }).format(new Date(epochMs));
  return `${hora}h`;
}

/** `29/09 às 14h32`, no fuso do evento. */
function formatarMomento(date: Date): string {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const parte = (tipo: string) =>
    partes.find((p) => p.type === tipo)?.value ?? '';
  return `${parte('day')}/${parte('month')} às ${parte('hour')}h${parte('minute')}`;
}

/**
 * Estilo do papel.
 *
 * `@media print` esconde a dica do Ctrl+P (ela não faz sentido no papel) e tira
 * o fundo cinza, que torraria tinta e sairia como um bloco sujo na maioria das
 * impressoras. `break-inside: avoid` mantém cada gráfico inteiro numa página —
 * meio gráfico no fim da folha é a forma mais rápida de um relatório parecer
 * amador.
 */
function estilo(): string {
  return `<style>
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    max-width: 780px; margin: 0 auto; padding: 24px;
    color: #1a1a1a; background: #fff;
  }
  .topo { border-bottom: 3px solid #c62828; padding-bottom: 10px; margin-bottom: 4px; }
  h1 { font-size: 21px; margin: 0; }
  .periodo { color: #666; font-size: 13px; margin: 4px 0 0; }
  .dica {
    background: #fff8e1; border: 1px solid #ffe082; border-radius: 6px;
    padding: 8px 12px; font-size: 13px; margin: 16px 0;
  }
  .kpis {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    gap: 10px; margin: 18px 0 26px;
  }
  .kpi {
    border: 1px solid #e0e0e0; border-radius: 8px; padding: 10px 12px;
    display: flex; flex-direction: column; gap: 2px;
  }
  .kpi__rotulo { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #666; }
  .kpi__valor { font-size: 26px; line-height: 1.1; }
  .kpi__valor .de { font-size: 16px; color: #888; font-weight: 400; }
  .kpi__apoio { font-size: 11px; color: #888; }
  .bloco { margin: 0 0 26px; break-inside: avoid; page-break-inside: avoid; }
  .bloco h2 { font-size: 15px; margin: 0 0 6px; }
  svg { width: 100%; height: auto; }
  .grade { stroke: #e8e8e8; stroke-width: 1; }
  .eixo { font-size: 10px; fill: #888; }
  .legenda { display: flex; gap: 14px; font-size: 12px; color: #555; margin-bottom: 4px; }
  .legenda__item { display: inline-flex; align-items: center; gap: 5px; }
  .legenda__item i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
  .vazio { font-size: 12px; color: #999; margin: 2px 0 0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #eee; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #666; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .nota, .rodape { font-size: 11px; color: #888; line-height: 1.5; }
  .rodape { border-top: 1px solid #eee; padding-top: 10px; margin-top: 8px; }
  code { font-size: 11px; background: #f5f5f5; padding: 1px 4px; border-radius: 3px; }
  @media print {
    body { padding: 0; max-width: none; }
    .dica { display: none; }
    .kpi { border-color: #bbb; }
  }
  </style>`;
}
