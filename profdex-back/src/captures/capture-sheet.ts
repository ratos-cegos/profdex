/**
 * Geração das fichas de QR de captura.
 *
 * Uma ficha vale UMA captura: quem escanear primeiro leva o exemplar e o papel
 * morre. Por isso a tiragem tem quantidade, e cada ficha é um token próprio.
 *
 * Este módulo é a ÚNICA fonte da folha impressa e do formato do token. Ele é
 * usado por dois caminhos:
 *
 * - `scripts/generate-capture-qr.ts` — a tiragem pela linha de comando, que
 *   grava PNG/SVG/`tokens.txt` numa máquina de operador;
 * - `admin-capture-tokens.service.ts` — a tiragem pelo painel, que não grava
 *   nada em disco e devolve a folha com os QRs embutidos como data-URI.
 *
 * Ter uma cópia por caminho faria as duas folhas divergirem na primeira
 * mudança de layout — e uma delas seria descoberta impressa, em papel.
 *
 * O token em texto puro só existe dentro do QR e do `tokens.txt` da tiragem
 * pela CLI. No banco fica apenas `sha256(token)` (ver capture-token.ts): um
 * vazamento de leitura não pode virar captura infinita. Como consequência
 * deliberada, **uma ficha gerada não pode ser reimpressa**.
 */

import { randomBytes } from 'node:crypto';
import * as QRCode from 'qrcode';
import { hashCaptureToken } from './capture-token';

/**
 * Rótulo só para a folha impressa. Os ids canônicos (e a roda de vantagens)
 * estão em src/battle/engine/types.ts; aqui é apresentação.
 *
 * Os nomes são abreviados de propósito — a legenda do card é uma linha só, e
 * um exemplar de dois tipos junta dois rótulos com " + ". Por isso "Banco" e
 * "Eng. de Software" em vez dos nomes por extenso que o app usa na tela.
 */
export const TYPE_LABEL: Record<string, string> = {
  humanas: 'Humanas',
  matematica: 'Matemática',
  ia: 'IA',
  robotica: 'Robótica',
  arquitetura: 'Arquitetura',
  'engenharia-software': 'Eng. de Software',
  redes: 'Redes',
  banco: 'Banco',
  algoritmos: 'Algoritmos',
};

export function labelFor(types: string[]): string {
  return types.map((t) => TYPE_LABEL[t] ?? t).join(' + ');
}

/**
 * A cor canônica de cada tipo, a mesma da roda no front (`data/types.js`).
 *
 * Cópia deliberada: o back não tem a paleta (o motor guarda só ids), e a folha
 * é impressa — puxar cor de outro pacote em build separado só para pintar papel
 * criaria dependência sem ganho. Se a paleta mudar, muda aqui também.
 */
export const TYPE_COLOR: Record<string, string> = {
  humanas: '#6C4DE0',
  matematica: '#F03E3E',
  ia: '#12B886',
  robotica: '#0CA5B8',
  arquitetura: '#F5A623',
  'engenharia-software': '#495057',
  redes: '#3B5BDB',
  banco: '#E64980',
  algoritmos: '#66BB2E',
};

/** Opções do QR, compartilhadas por PNG, SVG e data-URI: as três saídas de uma
 * mesma ficha têm de ser o mesmo código, com a mesma tolerância a erro. */
export const QR_OPTIONS = {
  errorCorrectionLevel: 'M',
  margin: 2,
  width: 800,
} as const;

/** Teto da tiragem pela CLI. O painel usa um teto próprio, bem menor. */
export const MAX_COPIES_CLI = 200;
/** Teto da tiragem pelo painel: a geração é síncrona dentro do request. */
export const MAX_COPIES_PANEL = 20;

export interface SheetEntry {
  /** O tipo da roda que a ficha vale. Quem sai é sorteado no scan. */
  type: string;
  copy: number;
  /** Nome base do arquivo — usado só pela tiragem em disco (CLI). */
  file: string;
  /** SEGREDO. Só vai para o QR e para o `tokens.txt` da CLI. */
  token: string;
  tokenHash: string;
  /** O conteúdo codificado no QR. */
  payload: string;
}

/**
 * 32 bytes em base64url = 43 caracteres [A-Za-z0-9_-], dentro das regras de
 * CaptureByTokenDto (mín. 32, máx. 256, sem caracteres fora do conjunto).
 */
export function generateCaptureToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Uma entrada por ficha: `tipos × copies`, com token próprio em cada uma. */
export function buildSheetEntries(
  types: string[],
  copies: number,
): SheetEntry[] {
  const entries: SheetEntry[] = [];
  for (const type of types) {
    for (let copy = 1; copy <= copies; copy++) {
      const token = generateCaptureToken();
      entries.push({
        type,
        copy,
        file: `${type}--${copy}`,
        token,
        tokenHash: hashCaptureToken(token),
        payload: `capture:${token}`,
      });
    }
  }
  return entries;
}

/**
 * QR como data-URI **SVG**, para a folha que não grava arquivo.
 *
 * SVG e não PNG por duas razões que apontam para o mesmo lado:
 *
 * - **Impressão.** A folha existe para sair na impressora. Vetor não pixeliza
 *   em nenhum tamanho de papel; o PNG de 800px, sim.
 * - **Custo.** O encoder PNG do `qrcode` é JS puro e escala com a ÁREA: 800×800
 *   custa ~7s por ficha, contra ~1,7ms do SVG. Numa tiragem de 140 fichas isso
 *   é a diferença entre a resposta sair na hora e o request estourar.
 *
 * A CLI continua gravando PNG **e** SVG em arquivo — lá o custo é pago uma vez,
 * fora de um request, e ter o PNG à mão ajuda quem monta a folha noutro editor.
 */
export async function qrSvgDataUrl(payload: string): Promise<string> {
  const svg = await QRCode.toString(payload, { ...QR_OPTIONS, type: 'svg' });
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

/**
 * Tudo que entra na folha passa por aqui. O rótulo do tipo hoje sai de um mapa
 * fixo, mas o id vem do pedido do painel e o `batch` é montado no servidor —
 * escapar impede que um `<` que escape da allowlist injete markup na aba que o
 * admin abre para imprimir.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface RenderSheetOptions {
  batch: string;
  copies: number;
  /**
   * De onde sai o `src` de cada QR. A CLI aponta para o arquivo vizinho
   * (`nome.png`); o painel devolve o data-URI, porque não grava nada.
   */
  srcFor: (entry: SheetEntry) => string;
}

export function renderSheet(
  entries: SheetEntry[],
  { batch, copies, srcFor }: RenderSheetOptions,
): string {
  const cards = entries
    .map((e) => {
      const tipo = escapeHtml(labelFor([e.type]));
      // Cor desconhecida (tipo fora da roda) cai no preto do texto: a ficha sai
      // legível de qualquer jeito em vez de sair com borda invisível.
      const cor = escapeHtml(TYPE_COLOR[e.type] ?? '#111');
      return `    <figure class="card" style="border-color: ${cor}">
      <img src="${srcFor(e)}" alt="QR Code de captura do tipo ${tipo}" />
      <figcaption>
        <strong class="type" style="color: ${cor}">${tipo}</strong>
        <span class="hint">Vale uma captura de um professor deste tipo</span>
        <span class="hint">Ficha ${e.copy}/${copies}</span>
      </figcaption>
    </figure>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>ProfDex — fichas de captura (${escapeHtml(batch)})</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font-family: system-ui, sans-serif; background: #fff; color: #111; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    p.sub { margin: 0 0 24px; color: #555; font-size: 14px; }
    .grid { display: flex; flex-wrap: wrap; gap: 24px; }
    .card { margin: 0; width: 320px; padding: 16px; border: 2px solid #111; border-radius: 12px; text-align: center; break-inside: avoid; }
    .card img { width: 100%; height: auto; display: block; }
    figcaption { margin-top: 12px; display: flex; flex-direction: column; gap: 4px; }
    figcaption strong { font-size: 18px; }
    /* O tipo é a única informação que a bancada precisa ler de longe. */
    .type { font-size: 22px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
    .hint { font-size: 12px; color: #555; }
    @media print { body { padding: 0; } p.sub, h1 { display: none; } }
  </style>
</head>
<body>
  <h1>ProfDex — fichas de captura</h1>
  <p class="sub">Tiragem ${escapeHtml(batch)} — ${entries.length} fichas, ${copies} por tipo. Cada ficha vale uma única captura, e o professor é sorteado no scan.</p>
  <div class="grid">
${cards}
  </div>
</body>
</html>
`;
}

/** Folha com os QRs embutidos — a saída do painel, que não grava arquivo. */
export async function renderSheetInline(
  entries: SheetEntry[],
  batch: string,
  copies: number,
): Promise<string> {
  const srcs = new Map<string, string>();
  for (const entry of entries) {
    srcs.set(entry.file, await qrSvgDataUrl(entry.payload));
  }
  return renderSheet(entries, {
    batch,
    copies,
    srcFor: (e) => srcs.get(e.file) ?? '',
  });
}

/** Identificador da tiragem: instante ISO sem os caracteres proibidos em path. */
export function newBatchId(now: Date = new Date()): string {
  return now.toISOString().replace(/[:.]/g, '-');
}
