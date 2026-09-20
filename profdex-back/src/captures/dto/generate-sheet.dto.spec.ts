// `@Type` grava metadata do decorator; sem este import o class-transformer
// não encontra `Reflect.getMetadata` e a suíte nem carrega. O main.ts já o
// importa em produção, então isto é dívida só do ambiente de teste.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TYPE_CYCLE } from '../../battle/engine/types';
import { MAX_COPIES_PANEL } from '../capture-sheet';
import { GenerateSheetDto } from './generate-sheet.dto';

describe('GenerateSheetDto', () => {
  const errorsFor = (payload: unknown) =>
    validate(plainToInstance(GenerateSheetDto, payload));

  it('aceita uma tiragem sem filtro de tipo', async () => {
    await expect(errorsFor({ copies: 3 })).resolves.toHaveLength(0);
  });

  it('aceita os tipos da roda', async () => {
    await expect(
      errorsFor({ copies: 1, types: [...TYPE_CYCLE] }),
    ).resolves.toHaveLength(0);
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

  // A allowlist é o que impede a tiragem de imprimir ficha de um tipo que o
  // sorteio nunca vai resolver — papel que só devolve erro para o aluno.
  it.each([
    ['tipo que saiu da roda', ['logica']],
    ['tipo inexistente', ['nao-existe']],
    ['id antigo renomeado', ['ia-ml']],
    ['tipo válido junto de um inválido', ['ia', 'npi']],
  ])('recusa %s', async (_caso, types) => {
    expect(await errorsFor({ copies: 1, types })).not.toHaveLength(0);
  });

  it('recusa mais tipos do que a roda tem', async () => {
    const demais = Array.from({ length: TYPE_CYCLE.length + 1 }, () => 'ia');
    expect(await errorsFor({ copies: 1, types: demais })).not.toHaveLength(0);
  });
});
