import { BattleState, createCombatant } from './engine';
import { CATEGORY, EFFECT, Move } from './moves';
import { chooseBotMove } from './bot';

/**
 * Golpes de mentira, montados à mão: usar o catálogo real amarraria o teste a
 * quais golpes existem hoje, e a regra sob teste é a de ESCOLHA, não a tabela.
 */
const golpe = (over: Partial<Move> & { id: string }): Move => ({
  name: over.id,
  type: 'ia',
  category: CATEGORY.ATAQUE,
  power: 40,
  accuracy: 100,
  raw: '',
  description: '',
  effects: [],
  ...over,
});

const ATAQUE_NEUTRO = golpe({ id: 'neutro', type: 'ia' });
// A roda: 'matematica' é super-efetivo contra 'ia' (ver engine/types.ts).
const ATAQUE_SUPER = golpe({ id: 'super', type: 'matematica' });
const CURA = golpe({
  id: 'cura',
  category: CATEGORY.CURA,
  power: null,
  effects: [{ kind: EFFECT.HEAL, fraction: 0.3 }],
});
const UTILITARIO = golpe({
  id: 'util',
  category: CATEGORY.BUFF,
  power: null,
});

function estado(moves: Move[], { hp }: { hp?: number } = {}): BattleState {
  const bot = createCombatant({ name: 'Chefe', types: ['redes'], moves });
  if (hp !== undefined) bot.hp = hp;
  return {
    player: createCombatant({
      name: 'Aluno',
      types: ['ia'], // alvo fraco a 'matematica'
      moves: [ATAQUE_NEUTRO],
    }),
    enemy: bot,
  };
}

/** Sorteio determinístico: devolve os valores na ordem pedida. */
const rngFixo = (...valores: number[]) => {
  let i = 0;
  return () => valores[Math.min(i++, valores.length - 1)];
};

describe('chooseBotMove', () => {
  it('prefere o golpe super-efetivo quando a moeda de 75% cai a favor', () => {
    const state = estado([ATAQUE_NEUTRO, ATAQUE_SUPER]);

    // 0.5 < 0.75 → entra no ramo do super-efetivo; o 0 escolhe o primeiro (e
    // único) da lista filtrada.
    expect(chooseBotMove(state, 'enemy', rngFixo(0.5, 0))?.id).toBe('super');
  });

  it('cai no ataque comum quando a moeda do super-efetivo não sai', () => {
    const state = estado([ATAQUE_NEUTRO, ATAQUE_SUPER]);

    // 0.9 > 0.75 → não usa o super. Sem utilitário no deck a lista está vazia,
    // então `utils.length &&` curto-circuita e a moeda de 25% NÃO chega a ser
    // consultada — por isso o segundo valor já é o do sorteio final, e o 0
    // escolhe o primeiro dos ataques.
    const escolhido = chooseBotMove(state, 'enemy', rngFixo(0.9, 0));
    expect(escolhido?.id).toBe('neutro');
  });

  /**
   * Abaixo de 30% de vida ele tende a se curar. É o que faz o chefe parecer
   * que está lutando pela vida em vez de trocar dano até cair — e é a razão de
   * a raid não ser só uma corrida de dano.
   */
  it('se cura quando está abaixo de 30% e a moeda de 60% cai a favor', () => {
    const state = estado([ATAQUE_SUPER, CURA], { hp: 10 }); // de 120

    expect(chooseBotMove(state, 'enemy', rngFixo(0.1, 0))?.id).toBe('cura');
  });

  it('com vida cheia não se cura, mesmo tendo cura no deck', () => {
    const state = estado([ATAQUE_SUPER, CURA]);

    // O primeiro valor seria a moeda da cura — aqui ela nem é consultada,
    // porque o `hp` não passou do corte. 0.5 entra no super-efetivo.
    expect(chooseBotMove(state, 'enemy', rngFixo(0.5, 0))?.id).toBe('super');
  });

  it('usa utilitário na fatia de 25% quando não há super-efetivo', () => {
    const state = estado([ATAQUE_NEUTRO, UTILITARIO]);

    // Sem super-efetivo no deck, o primeiro ramo nem consulta a moeda; 0.1 <
    // 0.25 leva ao utilitário.
    expect(chooseBotMove(state, 'enemy', rngFixo(0.1, 0))?.id).toBe('util');
  });

  it('devolve null quando o combatente não tem golpe nenhum', () => {
    expect(chooseBotMove(estado([]), 'enemy')).toBeNull();
  });

  /**
   * O lado é PARÂMETRO, não `enemy` fixo. Amarrar a função a um lado a
   * deixaria inútil para qualquer outro uso e intestável do lado oposto.
   */
  it('funciona para o lado `player` também, mirando o `enemy`', () => {
    const state: BattleState = {
      player: createCombatant({
        name: 'Bot',
        types: ['redes'],
        moves: [ATAQUE_NEUTRO, ATAQUE_SUPER],
      }),
      enemy: createCombatant({
        name: 'Alvo',
        types: ['ia'],
        moves: [ATAQUE_NEUTRO],
      }),
    };

    expect(chooseBotMove(state, 'player', rngFixo(0.5, 0))?.id).toBe('super');
  });
});
