import {
  ensureProfessorVariants,
  ensureVariantsForProfessor,
  variantsForProfessor,
} from './professor-variants';

describe('variantes de um professor', () => {
  it('um tipo rende uma variante; dois rendem três', () => {
    expect(variantsForProfessor({ types: ['algoritmos'] })).toEqual([
      { typeKey: 'algoritmos', types: ['algoritmos'] },
    ]);

    expect(
      variantsForProfessor({ types: ['arquitetura', 'ia'] }).map(
        (v) => v.typeKey,
      ),
    ).toEqual(['arquitetura', 'ia', 'arquitetura+ia']);
  });

  it('a ordem em que os tipos foram marcados não muda as variantes', () => {
    expect(variantsForProfessor({ types: ['ia', 'arquitetura'] })).toEqual(
      variantsForProfessor({ types: ['arquitetura', 'ia'] }),
    );
  });

  it('professor sem tipo não gera variante nenhuma', () => {
    expect(variantsForProfessor({ types: [] })).toEqual([]);
  });

  /**
   * Professor cadastrado pelo painel precisa nascer com variante: sem ela, ele
   * NUNCA entra no sorteio de captura (ver captures/capture-lottery.ts) e nada
   * na tela diria o motivo.
   */
  it('cria as três variantes de um professor de dois tipos ao cadastrar', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const db = { professorVariant: { createMany } };

    const criadas = await ensureVariantsForProfessor(db as never, 'prof-1', [
      'arquitetura',
      'ia',
    ]);

    expect(criadas).toBe(3);
    expect(createMany).toHaveBeenCalledTimes(3);
    expect(createMany.mock.calls.map(([arg]) => arg.data.typeKey)).toEqual([
      'arquitetura',
      'ia',
      'arquitetura+ia',
    ]);
  });

  it('editar de 1 para 2 tipos ACRESCENTA sem tocar na variante existente', async () => {
    // `skipDuplicates` faz o Prisma devolver 0 para a que já existe.
    const createMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 0 }) // "arquitetura" já estava lá
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const db = { professorVariant: { createMany } };

    const criadas = await ensureVariantsForProfessor(db as never, 'prof-1', [
      'arquitetura',
      'ia',
    ]);

    expect(criadas).toBe(2);
    expect(
      createMany.mock.calls.every(([arg]) => arg.skipDuplicates === true),
    ).toBe(true);
  });

  /**
   * Reduzir de dois tipos para um NÃO pode apagar a variante dupla: pode haver
   * ficha impressa ou exemplar no bolso de um aluno apontando para ela. Ela só
   * deixa de ser sorteada, porque o sorteio filtra pelos tipos atuais.
   */
  it('editar de 2 para 1 tipo não apaga nada', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 0 });
    const deleteMany = jest.fn();
    const db = { professorVariant: { createMany, deleteMany } };

    await ensureVariantsForProfessor(db as never, 'prof-1', ['arquitetura']);

    expect(deleteMany).not.toHaveBeenCalled();
    expect(createMany).toHaveBeenCalledTimes(1);
  });
});

/**
 * O raro tem UMA variante, a combinação completa (tarefa 15, decisão 1).
 *
 * Ele não passa pelo sorteio — a ficha rara aponta direto para a variante — e
 * cada variante a mais seria outra pilha de papel a imprimir e outra entrada a
 * explicar na mesa.
 */
describe('variantes de um professor RARO', () => {
  it('dois tipos rendem UMA variante, a dupla — não três', () => {
    expect(
      variantsForProfessor({ types: ['matematica', 'ia'], rare: true }),
    ).toEqual([{ typeKey: 'ia+matematica', types: ['matematica', 'ia'] }]);
  });

  it('um tipo rende a mesma variante única do professor comum', () => {
    expect(variantsForProfessor({ types: ['redes'], rare: true })).toEqual([
      { typeKey: 'redes', types: ['redes'] },
    ]);
  });

  it('raro sem tipo não gera variante nenhuma', () => {
    expect(variantsForProfessor({ types: [], rare: true })).toEqual([]);
  });

  it('cadastrar um raro de dois tipos cria uma variante só', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const db = { professorVariant: { createMany } };

    const criadas = await ensureVariantsForProfessor(
      db as never,
      'raro-1',
      ['matematica', 'ia'],
      { rare: true },
    );

    expect(criadas).toBe(1);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0][0].data.typeKey).toBe('ia+matematica');
  });

  /**
   * O bootstrap varre o elenco INTEIRO a cada subida. Sem ler `rare` no
   * `select`, a primeira execução daria três variantes ao raro — e como este
   * módulo só cria e nunca apaga, as duas extras ficariam lá para sempre.
   */
  it('o bootstrap repetido não cria variante extra para o raro', async () => {
    const createMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 }) // 1ª passada: cria a dupla
      .mockResolvedValue({ count: 0 }); // 2ª em diante: já existe
    const db = {
      professor: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'raro-1', types: ['matematica', 'ia'], rare: true },
          ]),
      },
      professorVariant: { createMany },
    };

    expect(await ensureProfessorVariants(db as never)).toBe(1);
    expect(await ensureProfessorVariants(db as never)).toBe(0);
    expect(createMany).toHaveBeenCalledTimes(2);
    expect(
      createMany.mock.calls.every(
        ([arg]) => arg.data.typeKey === 'ia+matematica',
      ),
    ).toBe(true);
  });
});
