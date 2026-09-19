import {
  sortearVariante,
  type CandidateVariant,
  type OwnedCapture,
} from './capture-lottery';
import type { RandomSource } from './capture-ivs';

/**
 * Tema IA com três professores, um deles de dois tipos — o cenário do exemplo
 * da spec. As cinco variantes abaixo são todas as que CONTÊM `ia`; quem monta a
 * lista é o serviço, então aqui elas já chegam filtradas.
 */
const A_IA: CandidateVariant = { id: 'a-ia', professorId: 'A', types: ['ia'] };
const B_IA: CandidateVariant = { id: 'b-ia', professorId: 'B', types: ['ia'] };
const B_IA_ARQ: CandidateVariant = {
  id: 'b-ia-arq',
  professorId: 'B',
  types: ['ia', 'arquitetura'],
};
const C_IA: CandidateVariant = { id: 'c-ia', professorId: 'C', types: ['ia'] };
const C_IA_ROB: CandidateVariant = {
  id: 'c-ia-rob',
  professorId: 'C',
  types: ['ia', 'robotica'],
};
const TODAS = [A_IA, B_IA, B_IA_ARQ, C_IA, C_IA_ROB];

/** RNG de roteiro: devolve os valores na ordem dada e depois repete o último. */
function rngFixo(...valores: number[]): RandomSource {
  let i = 0;
  return () => valores[Math.min(i++, valores.length - 1)];
}

const possuir = (...ids: [string, string][]): OwnedCapture[] =>
  ids.map(([professorId, variantId]) => ({ professorId, variantId }));

describe('sortearVariante', () => {
  it('devolve null quando o tipo não tem nenhum professor', () => {
    // O chamador PRECISA tratar isso sem consumir a ficha: o aluno perderia o
    // papel e o direito de captura de uma vez só.
    expect(sortearVariante([], [], rngFixo(0))).toBeNull();
  });

  describe('faixa 1 — professor inédito', () => {
    it('dá três professores DISTINTOS nas três primeiras capturas', () => {
      const jaTem: OwnedCapture[] = [];
      const saíram: string[] = [];

      for (let i = 0; i < 3; i++) {
        // 0.99 empurra o sorteio para o fim de cada lista, cobrindo o
        // arredondamento da borda.
        const escolhida = sortearVariante(TODAS, jaTem, rngFixo(0.99))!;
        expect(escolhida).not.toBeNull();
        saíram.push(escolhida.professorId);
        jaTem.push({
          professorId: escolhida.professorId,
          variantId: escolhida.id,
        });
      }

      expect(new Set(saíram).size).toBe(3);
      expect([...saíram].sort()).toEqual(['A', 'B', 'C']);
    });

    it('nunca repete um professor enquanto houver inédito', () => {
      // Já tem A e B: só C é inédito, então C sai obrigatoriamente, qualquer
      // que seja o sorteio.
      const jaTem = possuir(['A', 'a-ia'], ['B', 'b-ia']);
      for (const r of [0, 0.25, 0.5, 0.75, 0.99]) {
        expect(sortearVariante(TODAS, jaTem, rngFixo(r))!.professorId).toBe('C');
      }
    });

    it('pode entregar a combinação dupla já na primeira captura', () => {
      // Sorteado o professor C (2º e último inédito depois de A e B), a segunda
      // rolagem escolhe entre as variantes DELE: `c-ia` e `c-ia-rob`.
      const jaTem = possuir(['A', 'a-ia'], ['B', 'b-ia']);
      const escolhida = sortearVariante(TODAS, jaTem, rngFixo(0, 0.99))!;

      expect(escolhida.id).toBe('c-ia-rob');
      expect(C_IA_ROB.types).toContain('robotica');
    });

    it('sorteia o professor primeiro, não a variante', () => {
      // A tem 1 variante e C tem 2. Se o sorteio fosse direto na lista de
      // variantes, C teria o dobro da chance de A. Com a primeira rolagem em 0
      // sai o primeiro PROFESSOR inédito (A), não a primeira variante.
      const escolhida = sortearVariante(TODAS, [], rngFixo(0, 0))!;
      expect(escolhida.professorId).toBe('A');
    });
  });

  describe('faixa 2 — variante inédita', () => {
    it('sorteia só entre as combinações que faltam', () => {
      // Um exemplar de cada professor: a faixa 1 acabou. Faltam `b-ia-arq` e
      // `c-ia-rob`.
      const jaTem = possuir(['A', 'a-ia'], ['B', 'b-ia'], ['C', 'c-ia']);

      expect(sortearVariante(TODAS, jaTem, rngFixo(0))!.id).toBe('b-ia-arq');
      expect(sortearVariante(TODAS, jaTem, rngFixo(0.99))!.id).toBe('c-ia-rob');
    });

    it('conta o já-tenho por VARIANTE, não por professor', () => {
      // Dois exemplares do mesmo professor B não fecham o tema: `b-ia-arq`
      // continua faltando e é a única candidata junto das de A e C.
      const jaTem = possuir(
        ['A', 'a-ia'],
        ['B', 'b-ia'],
        ['B', 'b-ia'],
        ['C', 'c-ia'],
        ['C', 'c-ia-rob'],
      );
      for (const r of [0, 0.5, 0.99]) {
        expect(sortearVariante(TODAS, jaTem, rngFixo(r))!.id).toBe('b-ia-arq');
      }
    });
  });

  describe('faixa 3 — repetição', () => {
    const coleçãoCompleta = possuir(
      ['A', 'a-ia'],
      ['B', 'b-ia'],
      ['B', 'b-ia-arq'],
      ['C', 'c-ia'],
      ['C', 'c-ia-rob'],
    );

    it('só repete depois que TODAS as variantes do tema saíram', () => {
      expect(sortearVariante(TODAS, coleçãoCompleta, rngFixo(0))!.id).toBe(
        'a-ia',
      );
      expect(sortearVariante(TODAS, coleçãoCompleta, rngFixo(0.99))!.id).toBe(
        'c-ia-rob',
      );
    });

    it('sorteia uniformemente entre todas as variantes do tema', () => {
      const vistas = TODAS.map(
        (_, i) =>
          sortearVariante(TODAS, coleçãoCompleta, rngFixo(i / TODAS.length))!.id,
      );
      expect(vistas).toEqual(TODAS.map((v) => v.id));
    });
  });

  it('é determinístico com RNG fixo', () => {
    const jaTem = possuir(['A', 'a-ia']);
    const primeira = sortearVariante(TODAS, jaTem, rngFixo(0.4, 0.7));
    const segunda = sortearVariante(TODAS, jaTem, rngFixo(0.4, 0.7));
    expect(primeira).toEqual(segunda);
  });

  it('nunca devolve variante fora das candidatas', () => {
    // Professor inativo não chega aqui: quem filtra é a consulta do serviço.
    // O que este módulo garante é que ele não inventa nada fora da lista.
    const soDoB = [B_IA, B_IA_ARQ];
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const escolhida = sortearVariante(soDoB, [], rngFixo(r, r))!;
      expect(soDoB.map((v) => v.id)).toContain(escolhida.id);
      expect(escolhida.professorId).toBe('B');
    }
  });
});
