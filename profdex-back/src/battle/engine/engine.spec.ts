import {
  createCombatant,
  performMove,
  turnOrder,
  upkeep,
  STATUS,
} from './engine';
import { buildMoveset, CATEGORY, getMoveById, MOVE_BY_ID } from './moves';
import { typeMultiplier } from './types';
import { typesForProfessor } from './professor-types';

describe('engine (port do battleEngine.js)', () => {
  const attack = getMoveById('modus-ponta-pe')!; // 70 · sempre acerta · sem efeitos

  function makeState() {
    return {
      player: createCombatant({
        name: 'A',
        types: ['logica'],
        moves: [attack],
      }),
      enemy: createCombatant({
        name: 'B',
        types: ['robotica'],
        moves: [attack],
      }),
    };
  }

  afterEach(() => jest.restoreAllMocks());

  it('applies capture IVs to HP and battle stats', () => {
    // O banco guarda 0–15, mas o combate usa 0–IV_BONUS_MAX (5): num modo
    // ranqueado, a sorte da captura influencia, não decide. Ver iv-balance.spec.
    const combatant = createCombatant({
      name: 'IV',
      types: ['logica'],
      ivs: { ivHp: 15, ivRigor: 12, ivDidatica: 8, ivRaciocinio: 4 },
    });
    expect(combatant.maxHp).toBe(125); // 120 + 5
    expect(combatant.baseStats.rigor).toBeCloseTo(104); // 12/15 * 5
    expect(combatant.baseStats.didatica).toBeCloseTo(102.667); // 8/15 * 5
    expect(combatant.baseStats.raciocinio).toBeCloseTo(101.333); // 4/15 * 5
  });

  it('deals deterministic damage with STAB and neutral effectiveness', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999); // variance ~1, sem crit de status
    const state = makeState();

    const events = performMove(state, 'player', attack);

    // 70 poder × 0.4 escala × 1.5 STAB (lógica→lógica) × ~1 variância = ~42
    const damage = events.find((e) => e.type === 'damage');
    expect(damage).toBeDefined();
    expect(state.enemy.hp).toBeLessThan(state.enemy.maxHp);
    expect(events[0]).toEqual({
      type: 'message',
      text: 'A usou Modus Ponta-Pé!',
    });
  });

  it('resolves speed ties with a coin flip (PvP fairness)', () => {
    const state = makeState();

    jest.spyOn(Math, 'random').mockReturnValue(0.1); // < 0.5 → player primeiro
    expect(turnOrder(state, attack, attack)[0].key).toBe('player');

    jest.spyOn(Math, 'random').mockReturnValue(0.9); // > 0.5 → enemy primeiro
    expect(turnOrder(state, attack, attack)[0].key).toBe('enemy');
  });

  it('applies burn damage on upkeep and expires it', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999);
    const state = makeState();
    state.player.status = { kind: STATUS.QUEIMADURA, turns: 1, power: 8 };

    const { events, canAct } = upkeep(state, 'player');

    expect(canAct).toBe(true);
    expect(state.player.hp).toBe(state.player.maxHp - 8);
    expect(
      events.some((e) => e.type === 'damage' && e.target === 'player'),
    ).toBe(true);
    expect(state.player.status).toBeNull();
  });

  it('emits faint when hp reaches zero', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999);
    const state = makeState();
    state.enemy.hp = 1;

    const events = performMove(state, 'player', attack);

    expect(state.enemy.hp).toBe(0);
    expect(events.some((e) => e.type === 'faint' && e.target === 'enemy')).toBe(
      true,
    );
  });

  it('block shield consumes the hit without damage', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999);
    const state = makeState();
    state.enemy.shields.push({ mode: 'block', amount: 1, turns: 1 });

    performMove(state, 'player', attack);

    expect(state.enemy.hp).toBe(state.enemy.maxHp);
    expect(state.enemy.shields).toHaveLength(0);
  });
});

describe('dados portados (paridade com o front)', () => {
  it('keeps the full movepool (9 tipos × 8 golpes)', () => {
    expect(MOVE_BY_ID.size).toBe(72);
  });

  it('type wheel: 2 seguintes fortes, 2 anteriores fracos', () => {
    expect(typeMultiplier('logica', ['calculo'])).toBe(2);
    expect(typeMultiplier('logica', ['ia-ml'])).toBe(2);
    expect(typeMultiplier('logica', ['algoritmos'])).toBe(0.5);
    expect(typeMultiplier('logica', ['robotica'])).toBe(1);
    // tipo duplo: produto (4× no melhor caso)
    expect(typeMultiplier('logica', ['calculo', 'ia-ml'])).toBe(4);
  });

  it('resolves professor types by slug with stable fallback', () => {
    expect(typesForProfessor({ slug: 'eron' })).toEqual([
      'arquitetura',
      'ia-ml',
    ]);
    expect(typesForProfessor({ slug: 'mario' })).toEqual(['algoritmos']);
    const fallback = typesForProfessor({ slug: 'desconhecido-xyz' });
    expect(fallback).toHaveLength(1);
    expect(typesForProfessor({ slug: 'desconhecido-xyz' })).toEqual(fallback);
  });

  it('buildMoveset returns 4 moves with at least one utility', () => {
    for (let i = 0; i < 20; i++) {
      const deck = buildMoveset(['arquitetura', 'ia-ml']);
      expect(deck).toHaveLength(4);
      expect(deck.some((m) => m.category !== CATEGORY.ATAQUE)).toBe(true);
    }
  });
});
