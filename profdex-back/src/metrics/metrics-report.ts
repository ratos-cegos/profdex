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

/**
 * As cores das séries, tiradas dos tokens de `profdex-front/src/style.css`.
 *
 * Só entram tons que sobrevivem aos DOIS fundos: a tela (superfície `#1a1a1a`)
 * e o papel (branco). É o que descarta os tons `--*-glow` da paleta, que somem
 * no branco, e o `--unifil-orange` puro, que some no escuro.
 *
 * Elas ficam como atributo `fill` no SVG, e não em CSS: o `@media print` troca
 * fundo e texto, mas a cor de uma série é a identidade dela — mudar no papel
 * faria a legenda impressa não corresponder à da tela.
 */
const COR = {
  /** `--ds-orange`. O número-síntese do evento usa a cor da marca. */
  interacoes: '#cba034',
  /** `--ds-blue`. */
  bancada: '#3c7fa1',
  /** `--ds-green`. Acerto é o desfecho bom. */
  acerto: '#549942',
  /** `--unifil-gold`. A mesma cor do contador da Profdex. */
  capturas: '#edaf68',
  /** `--text-muted`: neutro de propósito, é a série de apoio. */
  alunos: '#a8b8c0',
} as const;

export interface SerieHoraria {
  label: string;
  valores: number[];
  cor: string;
}

export interface MetricsReportData {
  geradoEm: Date;
  /** Início da janela (17h do dia escolhido, no fuso do evento). */
  de: Date;
  /** Fim EXCLUSIVO da janela (meia-noite). */
  ate: Date;
  /** Um epoch ms por hora da janela — inclusive as sem registro. */
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
  const dia = formatarDia(data.de);
  const faixa = `${formatarHora(data.de.getTime())}–${formatarFim(data.ate)}`;
  const periodo = `${dia} · ${faixa} · gerado ${formatarMomento(data.geradoEm)}`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>ProfDex — métricas de ${escapeHtml(dia)}</title>
${estilo()}
</head>
<body>
  <header class="topo">
    <h1>PROF<span>DEX</span></h1>
    <p class="subtitulo">Métricas do estande · ${escapeHtml(faixa)}</p>
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
    {
      label: 'Interações',
      valores: data.interacoes.porHora,
      cor: COR.interacoes,
    },
  ])}

  ${grafico('Bancada: respondidas × acertadas', data.horas, [
    { label: 'Respondidas', valores: data.quiz.porHora, cor: COR.bancada },
    { label: 'Acertadas', valores: data.quiz.acertosPorHora, cor: COR.acerto },
  ])}

  ${grafico('Capturas, batalhas e alunos ativos por hora', data.horas, [
    { label: 'Capturas', valores: data.capturas.porHora, cor: COR.capturas },
    { label: 'Batalhas', valores: data.batalhas.porHora, cor: COR.bancada },
    { label: 'Alunos ativos', valores: data.usuarios.porHora, cor: COR.alunos },
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

  // Passo do rótulo conforme a largura disponível: numa janela curta (as 7
  // horas do estande) cabem todas as horas, e omitir alguma obrigaria o leitor
  // a contar barras. Numa janela longa, 24 rótulos colados viram uma tarja
  // preta no papel.
  const passo = horas.length <= 12 ? 1 : 3;
  const rotulos = horas
    .map((t, i) =>
      i % passo === 0
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
      Acumulado do evento inteiro, não só desta janela — é a leitura que mostra
      o peso relativo de cada atividade.
    </p>
  </section>`;
}

// ── Formatação ────────────────────────────────────────────────────────────

const round = (n: number) => Math.round(n * 10) / 10;

function numero(valor: number): string {
  return new Intl.NumberFormat('pt-BR').format(Math.round(valor));
}

/** `29/09/2026` — o dia da janela, no fuso do evento. */
function formatarDia(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/**
 * O fim da faixa, que é EXCLUSIVO.
 *
 * A meia-noite é o começo do dia seguinte: imprimir a hora crua diria "00h" e
 * faria o leitor achar que o relatório virou o dia. Quem fecha um turno diz
 * "até as 24h", e é isso que vai no papel.
 */
function formatarFim(ate: Date): string {
  const hora = formatarHora(ate.getTime());
  return hora === '00h' ? '24h' : hora;
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
 * Estilo do relatório, na identidade do app.
 *
 * Os tokens são os mesmos de `profdex-front/src/style.css` — laranja e dourado
 * da UniFil, superfícies escuras, `Press Start 2P` nos títulos, raios 8/16 —,
 * copiados como literais porque este arquivo é servido pelo BACKEND e não tem
 * acesso ao CSS do front. Mudou a marca lá? Mude aqui também; é o preço de o
 * relatório não depender do bundle do app para imprimir.
 *
 * **Duas peles, uma identidade.** Na tela o relatório é escuro, como o app. No
 * papel ele inverte: fundo branco e texto escuro. Não é abrir mão da
 * identidade — é o contrário. Um fundo `#121418` impresso vira uma folha
 * encharcada de toner, e a maioria dos navegadores descarta o fundo por padrão
 * (`print-color-adjust`), o que produziria texto branco em papel branco: o
 * relatório sairia EM BRANCO. O que atravessa para o papel é o que de fato
 * identifica o app — a fonte pixelada nos títulos, o laranja da marca na régua
 * do cabeçalho, o dourado nos números e as cores das séries, que continuam
 * idênticas às da tela para a legenda impressa bater com a que foi vista.
 *
 * A `Press Start 2P` vem do Google Fonts, a mesma origem que o `index.html` do
 * front já usa. Só nos TÍTULOS e rótulos curtos: ela é larga e ilegível em
 * corpo de texto, e um relatório inteiro nela não se lê de pé, no estande.
 * Com a fonte bloqueada, o fallback é `monospace` e o documento continua
 * perfeitamente legível.
 *
 * `break-inside: avoid` mantém cada gráfico inteiro numa página — meio gráfico
 * no fim da folha é a forma mais rápida de um relatório parecer amador.
 */
function estilo(): string {
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
<style>
  :root {
    --unifil-orange: #995200;
    --unifil-gold: #edaf68;
    --bg-deep: #121418;
    --surface: #1a1a1a;
    --surface-border: #2b2b2b;
    --text-primary: #ffffff;
    --text-muted: #a8b8c0;
    --radius: 8px;
    --radius-lg: 16px;
    --font-pixel: 'Press Start 2P', monospace;
    --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

    /* Trocados inteiros no @media print. Tudo que muda entre tela e papel
       passa por estes quatro — nenhuma regra lá embaixo repete cor solta. */
    --papel: var(--bg-deep);
    --cartao: var(--surface);
    --linha: var(--surface-border);
    --tinta: var(--text-primary);
    --tinta-fraca: var(--text-muted);
  }

  * { box-sizing: border-box; }

  body {
    font-family: var(--font-body);
    max-width: 820px;
    margin: 0 auto;
    padding: 28px 24px 40px;
    color: var(--tinta);
    background: var(--papel);
    line-height: 1.45;
  }

  /* Cabeçalho: régua laranja da marca, título pixelado com o D destacado em
     dourado, como o cabeçalho PROFDEX da coleção. */
  .topo {
    border-bottom: 4px solid var(--unifil-orange);
    padding-bottom: 12px;
    margin-bottom: 6px;
  }
  h1 {
    font-family: var(--font-pixel);
    font-size: 15px;
    line-height: 1.6;
    letter-spacing: .02em;
    margin: 0;
    color: var(--tinta);
  }
  h1 span { color: var(--unifil-gold); }
  /* O subtítulo NÃO é pixelado de propósito: a Press Start 2P é larga demais
     para uma frase, e o cabeçalho da coleção usa exatamente este par —
     logotipo pixelado, texto de apoio em fonte de corpo. */
  .subtitulo {
    font-size: 15px;
    font-weight: 600;
    margin: 10px 0 0;
    color: var(--tinta);
  }
  .periodo {
    color: var(--tinta-fraca);
    font-size: 12px;
    margin: 4px 0 0;
  }

  .dica {
    background: var(--cartao);
    border: 1px solid var(--unifil-orange);
    border-left-width: 4px;
    border-radius: var(--radius);
    padding: 10px 14px;
    font-size: 13px;
    margin: 18px 0 0;
    color: var(--tinta-fraca);
  }
  .dica strong { color: var(--unifil-gold); }

  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(146px, 1fr));
    gap: 12px;
    margin: 20px 0 30px;
  }
  .kpi {
    border: 1px solid var(--linha);
    border-radius: var(--radius-lg);
    background: var(--cartao);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .kpi__rotulo {
    font-family: var(--font-pixel);
    font-size: 7px;
    line-height: 1.7;
    letter-spacing: .04em;
    color: var(--tinta-fraca);
    text-transform: uppercase;
  }
  .kpi__valor {
    font-size: 30px;
    line-height: 1;
    font-weight: 700;
    color: var(--unifil-gold);
    font-variant-numeric: tabular-nums;
  }
  .kpi__valor .de {
    font-size: 17px;
    font-weight: 400;
    color: var(--tinta-fraca);
  }
  .kpi__apoio { font-size: 11px; color: var(--tinta-fraca); }

  .bloco {
    margin: 0 0 28px;
    padding: 16px;
    border: 1px solid var(--linha);
    border-radius: var(--radius-lg);
    background: var(--cartao);
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .bloco h2 {
    font-family: var(--font-pixel);
    font-size: 10px;
    line-height: 1.7;
    margin: 0 0 12px;
    color: var(--unifil-gold);
  }

  svg { width: 100%; height: auto; display: block; }
  .grade { stroke: var(--linha); stroke-width: 1; }
  .eixo { font-size: 10px; fill: var(--tinta-fraca); font-family: var(--font-body); }

  .legenda {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    font-size: 12px;
    color: var(--tinta-fraca);
    margin-bottom: 10px;
  }
  .legenda__item { display: inline-flex; align-items: center; gap: 6px; }
  .legenda__item i {
    width: 11px; height: 11px;
    border-radius: 3px;
    display: inline-block;
  }
  .vazio { font-size: 12px; color: var(--tinta-fraca); margin: 8px 0 0; }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--linha); }
  tr:last-child td { border-bottom: none; }
  th {
    font-family: var(--font-pixel);
    font-size: 7px;
    line-height: 1.8;
    letter-spacing: .04em;
    color: var(--tinta-fraca);
    text-transform: uppercase;
  }
  td { color: var(--tinta); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }

  .nota, .rodape { font-size: 11px; color: var(--tinta-fraca); line-height: 1.6; }
  .nota { margin: 12px 0 0; }
  .rodape { border-top: 1px solid var(--linha); padding-top: 12px; margin-top: 4px; }
  code {
    font-size: 11px;
    background: var(--papel);
    border: 1px solid var(--linha);
    padding: 1px 5px;
    border-radius: 4px;
  }

  @media print {
    :root {
      --papel: #ffffff;
      --cartao: #ffffff;
      --linha: #d4d4d4;
      --tinta: #16181c;
      --tinta-fraca: #5f6b73;
    }
    body { padding: 0; max-width: none; }
    /* A dica do Ctrl+P só faz sentido na tela. */
    .dica { display: none; }
    /* O dourado clareia demais no branco: no papel o destaque é o laranja. */
    .kpi__valor, .bloco h2, h1 span { color: var(--unifil-orange); }
    code { background: #f3f3f3; }
  }
  </style>`;
}
