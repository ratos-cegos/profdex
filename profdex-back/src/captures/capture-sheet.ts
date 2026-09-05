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
 */
export const TYPE_LABEL: Record<string, string> = {
  logica: 'Lógica',
  calculo: 'Cálculo',
  'ia-ml': 'IA/ML',
  robotica: 'Robótica',
  arquitetura: 'Arquitetura',
  npi: 'NPI',
  redes: 'Redes',
  banco: 'Banco',
  algoritmos: 'Algoritmos',
};

export function labelFor(types: string[]): string {
  return types.map((t) => TYPE_LABEL[t] ?? t).join(' + ');
}

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

export interface SheetVariant {
  id: string;
  typeKey: string;
  types: string[];
  professor: { name: string; slug: string };
}

export interface SheetEntry {
  variantId: string;
  professorName: string;
  professorSlug: string;
  types: string[];
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

/** Uma entrada por ficha: `variantes × copies`, com token próprio em cada uma. */
export function buildSheetEntries(
  variants: SheetVariant[],
  copies: number,
): SheetEntry[] {
  const entries: SheetEntry[] = [];
  for (const v of variants) {
    for (let copy = 1; copy <= copies; copy++) {
      const token = generateCaptureToken();
      entries.push({
        variantId: v.id,
        professorName: v.professor.name,
        professorSlug: v.professor.slug,
        types: v.types,
        copy,
        file: `${v.professor.slug}--${v.typeKey}--${copy}`,
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
 * O nome do professor vem do banco: escapar impede que um `<` no cadastro
 * quebre a folha (ou pior, injete markup na aba aberta pelo painel).
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
      const nome = escapeHtml(e.professorName);
      const tipos = escapeHtml(labelFor(e.types));
      return `    <figure class="card">
      <img src="${srcFor(e)}" alt="QR Code de captura: ${nome} de ${tipos}" />
      <figcaption>
        <strong>Prof. ${nome}</strong>
        <span class="types">${tipos}</span>
        <span class="hint">Ficha ${e.copy}/${copies} — vale uma captura</span>
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
    .types { font-size: 14px; font-weight: 600; color: #111; }
    .hint { font-size: 12px; color: #555; }
    @media print { body { padding: 0; } p.sub, h1 { display: none; } }
  </style>
</head>
<body>
  <h1>ProfDex — fichas de captura</h1>
  <p class="sub">Tiragem ${escapeHtml(batch)} — ${entries.length} fichas, ${copies} por combinação de tipos. Cada ficha vale uma única captura.</p>
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
