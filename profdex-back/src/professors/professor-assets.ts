/**
 * A arte de um professor: validação e nomeação dos arquivos enviados no painel.
 *
 * Upload é a superfície de ataque mais exposta que este backend tem, e as três
 * regras abaixo não são negociáveis (ver .codex/SECURITY_CHECKLIST.md):
 *
 * 1. **O nome do arquivo NUNCA vem do cliente.** Ele é derivado do slug, que o
 *    servidor normaliza para `[a-z0-9-]` (ver slug.ts). Sem isso, um
 *    `../../etc/cron.d/x` no `originalname` escreve fora do volume.
 * 2. **O `mimetype` declarado não é prova de nada** — é um header que o cliente
 *    escolhe. Quem decide é o conteúdo: os primeiros bytes do arquivo.
 * 3. **Teto de tamanho por tipo**, conferido depois do parse. O limite do
 *    Multer é único por requisição, e PNG e GLB têm tetos diferentes.
 *
 * Módulo puro: sem Nest, sem filesystem, sem Multer. É a regra mais delicada do
 * cadastro e precisa ser testável sem subir nada.
 */

export const MAX_PNG_BYTES = 2 * 1024 * 1024;
export const MAX_GLB_BYTES = 5 * 1024 * 1024;

/** O maior arquivo que qualquer campo aceita — o teto que o Multer recebe. */
export const MAX_UPLOAD_BYTES = Math.max(MAX_PNG_BYTES, MAX_GLB_BYTES);

/** Os três campos de arte. A chave é o nome do campo no formulário. */
export const ASSET_FIELDS = ['spriteFront', 'spriteBack', 'model'] as const;
export type AssetField = (typeof ASSET_FIELDS)[number];

interface AssetSpec {
  /** Sufixo do arquivo gravado: `<slug><suffix>`. */
  suffix: string;
  maxBytes: number;
  /** Mimes que o navegador costuma declarar para este formato. */
  mimes: string[];
  /** Assinatura no início do arquivo. É ela que decide, não o mime. */
  magic: number[];
  /** Nome do campo como o admin o vê na mensagem de erro. */
  label: string;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// "glTF" — todo .glb começa por este header de 4 bytes (glTF 2.0, §4.4.1).
const GLB_MAGIC = [0x67, 0x6c, 0x54, 0x46];

export const ASSET_SPECS: Record<AssetField, AssetSpec> = {
  spriteFront: {
    suffix: '-frente.png',
    maxBytes: MAX_PNG_BYTES,
    mimes: ['image/png'],
    magic: PNG_MAGIC,
    label: 'sprite de frente',
  },
  spriteBack: {
    suffix: '-costas.png',
    maxBytes: MAX_PNG_BYTES,
    mimes: ['image/png'],
    magic: PNG_MAGIC,
    label: 'sprite de costas',
  },
  model: {
    suffix: '.glb',
    maxBytes: MAX_GLB_BYTES,
    // O navegador raramente conhece `model/gltf-binary` e manda
    // `application/octet-stream`. A extensão e os bytes mágicos cobrem o resto.
    mimes: ['model/gltf-binary', 'application/octet-stream', ''],
    magic: GLB_MAGIC,
    label: 'modelo 3D',
  },
};

/** O mínimo que precisamos de um arquivo do Multer (memoryStorage). */
export interface UploadedAsset {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Erro de validação de arte, com a mensagem que o admin lê na tela. */
export class AssetValidationError extends Error {}

// Uma casa decimal: com arredondamento inteiro, um arquivo de 2,04 MB produzia
// "tem 2 MB e o limite é 2 MB" — a mensagem que parece um bug do servidor.
const MB = (bytes: number) =>
  `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;

/**
 * Confere um arquivo enviado. Lança `AssetValidationError` com a razão exata —
 * "não foi possível enviar" no meio do evento custa uma ida à bancada.
 */
export function assertValidAsset(field: AssetField, file: UploadedAsset): void {
  const spec = ASSET_SPECS[field];
  const extensao = spec.suffix.slice(spec.suffix.lastIndexOf('.'));

  if (!file.originalname.toLowerCase().endsWith(extensao)) {
    throw new AssetValidationError(
      `O ${spec.label} precisa ser um arquivo ${extensao}.`,
    );
  }

  if (!spec.mimes.includes(file.mimetype ?? '')) {
    throw new AssetValidationError(
      `O ${spec.label} chegou como "${file.mimetype}", que não é um ${extensao} válido.`,
    );
  }

  if (file.size > spec.maxBytes) {
    throw new AssetValidationError(
      `O ${spec.label} tem ${MB(file.size)} e o limite é ${MB(spec.maxBytes)}.`,
    );
  }

  // A checagem que importa: extensão e mime são escolhidos por quem envia.
  if (!comecaCom(file.buffer, spec.magic)) {
    throw new AssetValidationError(
      `O ${spec.label} não é um ${extensao} de verdade — o conteúdo do arquivo ` +
        'não bate com a extensão.',
    );
  }
}

function comecaCom(buffer: Buffer, magic: number[]): boolean {
  if (!buffer || buffer.length < magic.length) return false;
  return magic.every((byte, i) => buffer[i] === byte);
}

/**
 * O nome com que o arquivo é gravado no volume. Só o slug entra — o
 * `originalname` é usado apenas para conferir a extensão, nunca para nomear.
 */
export function assetFileName(slug: string, field: AssetField): string {
  return `${slug}${ASSET_SPECS[field].suffix}`;
}

/**
 * A URL pública gravada em `professors`, com versão.
 *
 * O `?v=` existe porque substituir a arte sobrescreve o arquivo com o MESMO
 * nome: sem ele, o navegador (e o cache do service worker, que guarda imagem de
 * professor por 30 dias) continuaria servindo a arte antiga — e o admin
 * concluiria que o upload não funcionou.
 */
export function assetUrl(
  slug: string,
  field: AssetField,
  version: number = Date.now(),
): string {
  return `/uploads/${assetFileName(slug, field)}?v=${version}`;
}
