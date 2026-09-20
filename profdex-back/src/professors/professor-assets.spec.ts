import {
  assertValidAsset,
  assetFileName,
  assetUrl,
  AssetValidationError,
  MAX_GLB_BYTES,
  MAX_PNG_BYTES,
  UploadedAsset,
} from './professor-assets';

const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const GLB_HEADER = Buffer.from('glTF');

function png(over: Partial<UploadedAsset> = {}): UploadedAsset {
  const buffer = Buffer.concat([PNG_HEADER, Buffer.alloc(16)]);
  return {
    originalname: 'sprite.png',
    mimetype: 'image/png',
    size: buffer.length,
    buffer,
    ...over,
  };
}

function glb(over: Partial<UploadedAsset> = {}): UploadedAsset {
  const buffer = Buffer.concat([GLB_HEADER, Buffer.alloc(16)]);
  return {
    originalname: 'modelo.glb',
    mimetype: 'model/gltf-binary',
    size: buffer.length,
    buffer,
    ...over,
  };
}

describe('validação da arte enviada', () => {
  it('aceita um PNG e um GLB de verdade', () => {
    expect(() => assertValidAsset('spriteFront', png())).not.toThrow();
    expect(() => assertValidAsset('spriteBack', png())).not.toThrow();
    expect(() => assertValidAsset('model', glb())).not.toThrow();
  });

  it('aceita o GLB que o navegador manda como octet-stream', () => {
    // A maioria dos navegadores não conhece `model/gltf-binary`.
    expect(() =>
      assertValidAsset('model', glb({ mimetype: 'application/octet-stream' })),
    ).not.toThrow();
  });

  it('recusa PNG acima de 2 MB', () => {
    expect(() =>
      assertValidAsset('spriteFront', png({ size: MAX_PNG_BYTES + 1 })),
    ).toThrow(AssetValidationError);
    expect(() =>
      assertValidAsset('spriteFront', png({ size: MAX_PNG_BYTES + 1 })),
    ).toThrow(/limite é 2,0 MB/);
  });

  it('recusa GLB acima de 5 MB', () => {
    expect(() =>
      assertValidAsset('model', glb({ size: MAX_GLB_BYTES + 1 })),
    ).toThrow(/limite é 5,0 MB/);
  });

  /**
   * O teste que justifica a leitura dos bytes: extensão e mime são escolhidos
   * por quem envia, então um executável renomeado passa pelos dois.
   */
  it('recusa um .exe renomeado para .png, com mime forjado', () => {
    const executavel: UploadedAsset = {
      originalname: 'inocente.png',
      mimetype: 'image/png',
      size: 64,
      buffer: Buffer.from('MZ\x90\x00\x03'), // cabeçalho de PE/DOS
    };

    expect(() => assertValidAsset('spriteFront', executavel)).toThrow(
      /não é um .png de verdade/,
    );
  });

  it('recusa PNG com extensão trocada e GLB que não é GLB', () => {
    expect(() =>
      assertValidAsset('spriteFront', png({ originalname: 'sprite.jpg' })),
    ).toThrow(/precisa ser um arquivo .png/);
    expect(() =>
      assertValidAsset('model', glb({ buffer: png().buffer })),
    ).toThrow(/não é um .glb de verdade/);
  });

  it('recusa arquivo menor que a própria assinatura', () => {
    expect(() =>
      assertValidAsset('spriteFront', png({ buffer: Buffer.from([0x89]) })),
    ).toThrow(AssetValidationError);
  });

  /**
   * O nome gravado sai SÓ do slug. Sem isto, um `originalname` com `../`
   * escreveria fora do volume de uploads.
   */
  it('ignora o nome enviado pelo cliente ao nomear o arquivo', () => {
    expect(assetFileName('eron', 'spriteFront')).toBe('eron-frente.png');
    expect(assetFileName('eron', 'spriteBack')).toBe('eron-costas.png');
    expect(assetFileName('eron', 'model')).toBe('eron.glb');
    expect(assetFileName('eron', 'spriteFront')).not.toContain('..');
  });

  it('a URL guardada carrega a versão, para o cache não servir a arte antiga', () => {
    expect(assetUrl('eron', 'spriteFront', 42)).toBe(
      '/uploads/eron-frente.png?v=42',
    );
    expect(assetUrl('eron', 'model', 7)).toBe('/uploads/eron.glb?v=7');
  });
});
