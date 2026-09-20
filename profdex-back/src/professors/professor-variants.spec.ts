import {
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
