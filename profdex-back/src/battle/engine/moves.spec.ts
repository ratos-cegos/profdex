import {
  buildMoveset,
  CATEGORY,
  getMoveById,
  MOVES_BY_TYPE,
  MOVE_BY_ID,
} from './moves';
import { TYPE_CYCLE } from './types';

/**
 * O movepool é organizado POR TIPO, e é `buildMoveset` que transforma o pool
 * num deck de 4. O risco de um tipo novo é sutil: se o bloco não existir,
 * `buildMoveset` devolve lista vazia e o exemplar entra na arena sem nenhum
 * golpe — sem erro, sem log, só um combatente que não consegue agir.
 */
describe('movepool', () => {
  it('tem 8 golpes para cada um dos 9 tipos da roda', () => {
    for (const tipo of TYPE_CYCLE) {
      expect(MOVES_BY_TYPE[tipo]).toHaveLength(8);
    }
    expect(Object.keys(MOVES_BY_TYPE)).toHaveLength(9);
    expect(MOVE_BY_ID.size).toBe(72);
  });

  it('não repete id de golpe em lugar nenhum', () => {
    // O id do golpe é gravado em `Capture.moves`. Dois golpes com o mesmo id
    // fariam o MOVE_BY_ID perder um deles em silêncio, e a captura que apontava
    // para o perdido passaria a usar o outro.
    const ids = Object.values(MOVES_BY_TYPE).flatMap((l) => l.map((m) => m.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('todo golpe tem tipo, categoria válida e poder coerente com a categoria', () => {
    const categorias = Object.values(CATEGORY) as string[];

    for (const [tipo, golpes] of Object.entries(MOVES_BY_TYPE)) {
      for (const golpe of golpes) {
        expect(golpe.type).toBe(tipo);
        expect(categorias).toContain(golpe.category);
        expect(golpe.accuracy).toBeGreaterThan(0);
        expect(golpe.accuracy).toBeLessThanOrEqual(1);

        if (golpe.category === CATEGORY.ATAQUE) {
          expect(golpe.power).toBeGreaterThan(0);
        } else {
          expect(golpe.power).toBeNull();
        }
      }
    }
  });

  it('cada tipo tem ataque E utilitário — é o que buildMoveset pressupõe', () => {
    // `buildMoveset` sorteia `size - 1` ataques e 1 utilitário, e completa com o
    // resto do pool quando faltam ataques. O piso real é 2 (IA tem só
    // "Descida Ladeira Abaixo" e "Decoreba"); abaixo disso o deck viraria quase
    // só utilitário e o combatente não conseguiria fechar a partida.
    for (const tipo of TYPE_CYCLE) {
      const golpes = MOVES_BY_TYPE[tipo];
      expect(
        golpes.filter((m) => m.category === CATEGORY.ATAQUE).length,
      ).toBeGreaterThanOrEqual(2);
      expect(golpes.some((m) => m.category !== CATEGORY.ATAQUE)).toBe(true);
    }
  });

  it('buildMoveset devolve 4 golpes com ao menos 1 utilitário, para todo tipo', () => {
    for (const tipo of TYPE_CYCLE) {
      for (let i = 0; i < 20; i++) {
        const deck = buildMoveset([tipo]);
        expect(deck).toHaveLength(4);
        expect(deck.some((m) => m.category !== CATEGORY.ATAQUE)).toBe(true);
        expect(new Set(deck.map((m) => m.id)).size).toBe(4);
      }
    }
  });

  it('os tipos novos entram na arena com deck completo', () => {
    for (const tipo of ['humanas', 'engenharia-software']) {
      const deck = buildMoveset([tipo]);
      expect(deck).toHaveLength(4);
      expect(deck.every((m) => m.type === tipo)).toBe(true);
      expect(deck.some((m) => m.category !== CATEGORY.ATAQUE)).toBe(true);
    }
  });

  it('getMoveById devolve null para golpe que não existe mais', () => {
    // Os 16 golpes de Lógica e NPI foram descartados junto com os tipos. O
    // `null` é o contrato de que `captures.service` depende para filtrar um
    // moveset gravado antes da troca.
    expect(getMoveById('modus-ponta-pe')).toBeNull();
    expect(getMoveById('deu-merge')).toBeNull();
    expect(getMoveById('multa-da-lgpd')).not.toBeNull();
  });
});
