import {
  BattleState,
  Combatant,
  createCombatant,
  performMove,
  STATUS,
  upkeep,
} from './engine';
import { getMoveById, Move, STAT } from './moves';

/**
 * Cobre os seis consertos da revisão de efeitos.
 *
 * Todos eram invisíveis: nada quebrava, nada logava, e cada um deles passou por
 * aqui sem teste porque o comportamento errado era *silencioso*. O caso mais
 * grave — os cinco golpes de `CATEGORY.STATUS` serem no-op — sobreviveu a uma
 * suíte de 200 testes porque ninguém tinha escrito "este golpe faz algo".
 */

function golpe(id: string): Move {
  const m = getMoveById(id);
  if (!m) throw new Error(`golpe inexistente no movepool: ${id}`);
  return m;
}

function arena(init?: {
  playerTypes?: string[];
  enemyTypes?: string[];
}): BattleState {
  return {
    player: createCombatant({
      name: 'Aluno',
      types: init?.playerTypes ?? ['redes'],
    }),
    enemy: createCombatant({
      name: 'Chefe',
      types: init?.enemyTypes ?? ['redes'],
    }),
  };
}

/** `chance(p)` é `Math.random() < p`: 0 aprova tudo, 0.999 recusa quase tudo. */
function fixaSorteio(valor: number) {
  return jest.spyOn(Math, 'random').mockReturnValue(valor);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('golpes de categoria STATUS', () => {
  // A regressão original: `power: null` mandava os cinco para `resolveUtility`,
  // que não tinha caso para PARALYZE/CONFUSE/DOT e caía no `default: break`.
  // Gastavam o turno, imprimiam "usou X!" e não faziam absolutamente nada —
  // enquanto o MoveButton prometia "Pode travar (100%)" ao jogador.
  const esperado: Array<[string, string]> = [
    ['letra-miuda', STATUS.QUEIMADURA],
    ['soma-que-nao-fecha', STATUS.QUEIMADURA],
    ['viajou-na-maionese', STATUS.CONFUSAO],
    ['esquentou-os-motores', STATUS.QUEIMADURA],
    ['abraco-mortal', STATUS.PARALISIA],
  ];

  it.each(esperado)('%s aplica %s no alvo', (id, kind) => {
    fixaSorteio(0);
    const state = arena();

    performMove(state, 'player', golpe(id));

    expect(state.enemy.status).not.toBeNull();
    expect(state.enemy.status?.kind).toBe(kind);
  });

  it('erram quando a precisão falha, em vez de acertar sempre', () => {
    // O preço de o golpe passar a funcionar: `resolveUtility` não tinha
    // nenhuma rolagem de precisão, então controle garantido seria de graça.
    fixaSorteio(0.99);
    const state = arena();

    const eventos = performMove(state, 'player', golpe('abraco-mortal'));

    expect(state.enemy.status).toBeNull();
    expect(eventos).toContainEqual({
      type: 'message',
      text: 'Aluno errou o golpe!',
    });
  });

  it('avisam quando o alvo já está sob outro efeito', () => {
    fixaSorteio(0);
    const state = arena();
    state.enemy.status = { kind: STATUS.QUEIMADURA, turns: 3, power: 8 };

    const eventos = performMove(state, 'player', golpe('abraco-mortal'));

    expect(state.enemy.status.kind).toBe(STATUS.QUEIMADURA);
    expect(eventos).toContainEqual({
      type: 'message',
      text: 'Chefe já está sob outro efeito!',
    });
  });
});

describe('escudos', () => {
  it('expiram com o tempo em vez de durar a partida inteira', () => {
    // `Shield.turns` era gravado e nunca decrementado.
    fixaSorteio(0);
    const state = arena();

    performMove(state, 'player', golpe('bloqueio-na-porta'));
    expect(state.player.shields).toHaveLength(1);

    upkeep(state, 'player');
    expect(state.player.shields).toHaveLength(1); // cobre o golpe do adversário

    upkeep(state, 'player');
    expect(state.player.shields).toHaveLength(0);
  });

  it('refletir divide o golpe: o defensor também toma dano', () => {
    // Antes: `dealt: 0` E contra-ataque. Escudo melhor que bloqueio puro, de
    // graça e (sem prazo) para sempre — o "reflete invencível".
    fixaSorteio(0);
    const state = arena();

    performMove(state, 'enemy', golpe('direito-de-resposta'));
    const hpAtacanteAntes = state.player.hp;
    performMove(state, 'player', golpe('entrega-garantida'));

    expect(state.enemy.hp).toBeLessThan(state.enemy.maxHp);
    expect(state.player.hp).toBeLessThan(hpAtacanteAntes);
  });
});

describe('statGrowPerTurn', () => {
  it('escala e depois decai, em vez de ser permanente', () => {
    // `growPerTurn(rigor, +1, 4)` entregava +4 estágios definitivos (×3,0 de
    // ataque) por um único turno de setup: o maior desequilíbrio do movepool.
    fixaSorteio(0);
    const state = arena();

    performMove(state, 'player', golpe('puxao-de-sinapse'));

    const picos: number[] = [];
    for (let i = 0; i < 10; i++) {
      upkeep(state, 'player');
      picos.push(state.player.stages[STAT.RIGOR]);
    }

    expect(Math.max(...picos)).toBeLessThanOrEqual(3);
    expect(state.player.stages[STAT.RIGOR]).toBe(0);
  });
});

describe('comboBonus', () => {
  // A condição era "existe qualquer efeito no campo", contando estágio positivo
  // e escudo do PRÓPRIO atacante. Com estágio permanente, bastava um buff no
  // turno 1 para o bônus valer o resto da partida.
  function danoDoCombo(afligido: boolean): number {
    fixaSorteio(0);
    const state = arena();
    if (afligido) {
      state.enemy.status = { kind: STATUS.QUEIMADURA, turns: 3, power: 8 };
    }
    const hpAntes = state.enemy.hp;
    performMove(state, 'player', golpe('junta-a-treta'));
    return hpAntes - state.enemy.hp;
  }

  it('não vale nada contra alvo saudável', () => {
    expect(danoDoCombo(true)).toBeGreaterThan(danoDoCombo(false));
  });

  it('vale o multiplicador cheio contra alvo debilitado', () => {
    const semEfeito = danoDoCombo(false);
    const comEfeito = danoDoCombo(true);
    // `comboBonus()` é ×1,5; a queimadura do alvo não mexe na Defesa dele.
    expect(comEfeito / semEfeito).toBeCloseTo(1.5, 1);
  });
});

describe('weakPoint', () => {
  it('tem teto: contra 4× não multiplica para 6×', () => {
    fixaSorteio(0);
    // `algoritmos` é 2× contra `humanas` e contra `matematica`; o alvo de tipo
    // duplo multiplica para 4×. O atacante é `redes` para não haver STAB.
    const state = arena({
      playerTypes: ['redes'],
      enemyTypes: ['humanas', 'matematica'],
    });
    const hpAntes = state.enemy.hp;

    performMove(state, 'player', golpe('menor-caminho-pra-dor'));

    // power 60 × DAMAGE_SCALE 0.4 × efetividade 4 (com teto) × variância 0.85
    const comTeto = Math.round(60 * 0.4 * 4 * 0.85);
    const semTeto = Math.round(60 * 0.4 * 4 * 1.5 * 0.85);
    expect(hpAntes - state.enemy.hp).toBe(comTeto);
    expect(hpAntes - state.enemy.hp).toBeLessThan(semTeto);
  });

  it('continua valendo no caso comum de 2×', () => {
    fixaSorteio(0);
    const state = arena({ playerTypes: ['redes'], enemyTypes: ['humanas'] });
    const hpAntes = state.enemy.hp;

    performMove(state, 'player', golpe('menor-caminho-pra-dor'));

    // 2× × 1,5 = 3×, abaixo do teto de 4×.
    expect(hpAntes - state.enemy.hp).toBe(Math.round(60 * 0.4 * 3 * 0.85));
  });
});

describe('buff e debuff', () => {
  it('expiram e revertem o estágio', () => {
    // Prazo padrão era 0 = permanente pelo resto da estada em campo.
    fixaSorteio(0);
    const state = arena();

    performMove(state, 'player', golpe('ponto-de-maximo'));
    expect(state.player.stages[STAT.RIGOR]).toBe(1);

    const alvo: Combatant = state.player;
    for (let i = 0; i < 5; i++) upkeep(state, 'player');

    expect(alvo.stages[STAT.RIGOR]).toBe(0);
  });
});
