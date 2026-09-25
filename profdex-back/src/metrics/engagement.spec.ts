import {
  ENGAGEMENT_POINTS,
  EVENT_TYPES,
  INTERACTION_SOURCE_LABELS,
  INTERACTION_WEIGHTS,
  isClientReportable,
  isEventType,
  pointsFor,
} from './engagement';

/**
 * O catálogo de eventos é tabela, não código — e tabela quebra em silêncio.
 * Estes testes fixam as três invariantes que ninguém percebe quebrando: todo
 * evento tem peso, todo evento tem rótulo, e o que o servidor sabe sozinho o
 * cliente não pode declarar.
 */
describe('catálogo de eventos de engajamento', () => {
  it('todo evento tem pontos, interações e rótulo', () => {
    for (const type of EVENT_TYPES) {
      expect(ENGAGEMENT_POINTS[type]).toBeDefined();
      expect(INTERACTION_WEIGHTS[type]).toBeDefined();
      expect(INTERACTION_SOURCE_LABELS[type]).toBeTruthy();
    }
  });

  it('não reconhece tipo fora do catálogo', () => {
    expect(isEventType('rare_captured')).toBe(true);
    expect(isEventType('rare_unlocked')).toBe(true);
    expect(isEventType('professor_roubado')).toBe(false);
  });
});

/**
 * Professor raro (tarefa 15).
 *
 * `rare_captured` vale 140 pontos, o que faz dele o alvo óbvio de quem abre o
 * DevTools — e ele nasce de um fato que só o servidor conhece: a ficha rara
 * validada contra `rare_unlocks`, dentro da transação da captura.
 */
describe('eventos de professor raro', () => {
  it('os dois são recusados na ingestão do cliente', () => {
    expect(isClientReportable('rare_captured')).toBe(false);
    expect(isClientReportable('rare_unlocked')).toBe(false);
  });

  /**
   * A aritmética do 3×: uma captura comum inédita vale 70
   * (`professor_discovered` 20 + `professor_captured` 50). O raro grava os
   * mesmos dois MAIS `rare_captured`, totalizando 210.
   */
  it('a captura de um raro vale exatamente 3× uma captura comum inédita', () => {
    const comum =
      pointsFor('professor_discovered') + pointsFor('professor_captured');
    const raro = comum + pointsFor('rare_captured');

    expect(comum).toBe(70);
    expect(raro).toBe(210);
    expect(raro).toBe(comum * 3);
  });

  /** Destravar não pontua: os 5 acertos já pagaram 5 × (10 + 25). */
  it('destravar o tema não pontua — o esforço já foi pago pelos acertos', () => {
    expect(pointsFor('rare_unlocked')).toBe(0);
  });

  /**
   * Interações ficam em 0 nos dois pela mesma lógica de `battle_won` e
   * `quiz_correct`: o gesto já foi contado. Os 5 acertos vieram como 5
   * `quiz_answered`, e a captura do raro como um `professor_captured`.
   */
  it('nenhum dos dois conta interação duas vezes', () => {
    expect(INTERACTION_WEIGHTS.rare_unlocked).toBe(0);
    expect(INTERACTION_WEIGHTS.rare_captured).toBe(0);
  });
});
