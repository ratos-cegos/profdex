// `@Type` grava metadata do decorator; sem este import o class-transformer
// não encontra `Reflect.getMetadata` e a suíte nem carrega. O main.ts já o
// importa em produção, então isto é dívida só do ambiente de teste.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MAX_COPIES_PANEL } from '../capture-sheet';
import { GenerateSheetDto } from './generate-sheet.dto';

describe('GenerateSheetDto', () => {
  const errorsFor = (payload: unknown) =>
    validate(plainToInstance(GenerateSheetDto, payload));

  it('aceita uma tiragem sem filtro de variante', async () => {
    await expect(errorsFor({ copies: 3 })).resolves.toHaveLength(0);
  });

  it('aceita o teto do painel', async () => {
    await expect(errorsFor({ copies: MAX_COPIES_PANEL })).resolves.toHaveLength(
      0,
    );
  });

  // O teto existe porque a geração é síncrona dentro do request: passar dele
  // não é "muito papel", é resposta que não volta.
  it.each([0, -1, 1.5, MAX_COPIES_PANEL + 1, 200, 'três'])(
    'recusa copies inválido: %p',
    async (copies) => {
      expect(await errorsFor({ copies })).not.toHaveLength(0);
    },
  );

  it('recusa variantId que não é uuid', async () => {
    expect(
      await errorsFor({ copies: 1, variantIds: ['nao-e-uuid'] }),
    ).not.toHaveLength(0);
  });
});
