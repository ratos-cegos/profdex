import {
  effectiveness,
  typeIdFromSeed,
  typeMultiplier,
  NEUTRAL,
  NOT_EFFECTIVE,
  SUPER_EFFECTIVE,
  TYPE_CYCLE,
} from './types';

/**
 * A roda é a única regra que o motor NÃO escreve à mão: forte e fraco saem da
 * posição no array. Isso é bom — uma reordenação se propaga sozinha — e é
 * perigoso pelo mesmo motivo: reordenar sem querer troca todos os matchups do
 * jogo em silêncio, e ninguém percebe até alguém reclamar que "Humanas está
 * apanhando de quem não devia".
 */
describe('roda de tipos', () => {
  const N = TYPE_CYCLE.length;

  it('tem exatamente 9 tipos, na ordem acordada', () => {
    expect(TYPE_CYCLE).toEqual([
      'humanas',
      'matematica',
      'ia',
      'robotica',
      'arquitetura',
      'engenharia-software',
      'redes',
      'banco',
      'algoritmos',
    ]);
  });

  it('é 2× contra os 2 seguintes e 0,5× contra os 2 anteriores, nos 9', () => {
    for (let i = 0; i < N; i++) {
      const atacante = TYPE_CYCLE[i];

      expect(effectiveness(atacante, TYPE_CYCLE[(i + 1) % N])).toBe(
        SUPER_EFFECTIVE,
      );
      expect(effectiveness(atacante, TYPE_CYCLE[(i + 2) % N])).toBe(
        SUPER_EFFECTIVE,
      );
      expect(effectiveness(atacante, TYPE_CYCLE[(i - 1 + N) % N])).toBe(
        NOT_EFFECTIVE,
      );
      expect(effectiveness(atacante, TYPE_CYCLE[(i - 2 + N) % N])).toBe(
        NOT_EFFECTIVE,
      );

      // O resto é neutro — inclusive contra o próprio tipo.
      for (const distancia of [0, 3, 4, 5, 6]) {
        expect(effectiveness(atacante, TYPE_CYCLE[(i + distancia) % N])).toBe(
          NEUTRAL,
        );
      }
    }
  });

  it('os dois tipos novos herdam os matchups da vaga que ocuparam', () => {
    expect(effectiveness('humanas', 'matematica')).toBe(SUPER_EFFECTIVE);
    expect(effectiveness('algoritmos', 'humanas')).toBe(SUPER_EFFECTIVE);
    expect(effectiveness('engenharia-software', 'redes')).toBe(SUPER_EFFECTIVE);
    expect(effectiveness('arquitetura', 'engenharia-software')).toBe(
      SUPER_EFFECTIVE,
    );
  });

  it('nenhum id da roda antiga responde', () => {
    // Um id morto não dá erro: cai no NEUTRAL de quem não está na roda. É
    // justamente por passar despercebido que o teste existe — uma captura
    // gravada com `ia-ml` lutaria sem nenhuma vantagem de tipo, e o jogo
    // continuaria rodando como se estivesse certo.
    for (const morto of ['logica', 'npi', 'calculo', 'ia-ml']) {
      expect((TYPE_CYCLE as readonly string[]).includes(morto)).toBe(false);
      for (const vivo of TYPE_CYCLE) {
        expect(effectiveness(morto, vivo)).toBe(NEUTRAL);
        expect(effectiveness(vivo, morto)).toBe(NEUTRAL);
      }
    }
  });

  it('tipo duplo multiplica: 4× no melhor caso, 0,25× no pior', () => {
    expect(typeMultiplier('humanas', ['matematica', 'ia'])).toBe(4);
    expect(typeMultiplier('robotica', ['matematica', 'ia'])).toBe(0.25);
  });

  it('typeIdFromSeed devolve sempre um tipo da roda, e o mesmo para a mesma semente', () => {
    for (const semente of ['eron', 'mario', 'prof-x', '', 'ácentõs']) {
      const tipo = typeIdFromSeed(semente);
      expect(TYPE_CYCLE).toContain(tipo);
      expect(typeIdFromSeed(semente)).toBe(tipo);
    }
  });
});
