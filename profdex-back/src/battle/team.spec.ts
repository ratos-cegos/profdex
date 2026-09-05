import { createCombatant, STATUS } from './engine/engine';
import { buildMoveset } from './engine/moves';
import {
  benchCombatant,
  hasAlive,
  isAlive,
  nextAliveIndex,
  ownMemberView,
  publicMemberView,
  teamHp,
  TeamMember,
} from './team';

const membro = (name: string, hp?: number): TeamMember => {
  const combatant = createCombatant({
    name,
    types: ['algoritmos'],
    moves: buildMoveset(['algoritmos']),
  });
  if (hp !== undefined) combatant.hp = hp;
  return {
    captureId: `cap-${name}`,
    professor: { id: `p-${name}`, slug: name, name },
    types: ['algoritmos'],
    moves: combatant.moves,
    combatant,
  };
};

describe('benchCombatant', () => {
  it('mantém HP e o status que o professor carrega', () => {
    const c = membro('mario', 40).combatant;
    c.status = { kind: STATUS.QUEIMADURA, turns: 3 };

    benchCombatant(c);

    expect(c.hp).toBe(40);
    expect(c.status).toEqual({ kind: STATUS.QUEIMADURA, turns: 3 });
  });

  // Trocar não pode virar cura: se paralisia saísse na troca, ser paralisado
  // deixaria de custar algo e o status perderia sentido.
  it('mantém paralisia', () => {
    const c = membro('mario').combatant;
    c.status = { kind: STATUS.PARALISIA, turns: 2 };

    benchCombatant(c);

    expect(c.status?.kind).toBe(STATUS.PARALISIA);
  });

  // Confusão é "está tonto agora", não uma condição do professor.
  it('limpa confusão', () => {
    const c = membro('mario').combatant;
    c.status = { kind: STATUS.CONFUSAO, turns: 2 };

    benchCombatant(c);

    expect(c.status).toBeNull();
  });

  // Sem isto, sair e voltar preservaria o combo inteiro — e `usage`, que
  // alimenta grow/accuracyGain, cresceria para sempre.
  it('zera tudo que foi construído em campo', () => {
    const c = membro('mario').combatant;
    c.stages = { rigor: 3, didatica: -2, raciocinio: 1 };
    c.shields = [{ mode: 'block', amount: 1, turns: 2 }] as never;
    c.timedBuffs = [{ stat: 'rigor', delta: 2, turns: 3 }] as never;
    c.regen = [{ stat: 'didatica', delta: 1, turns: 5 }] as never;
    c.debuffImmuneTurns = 2;
    c.forceMiss = true;
    c.usage = { 'algum-golpe': 4 };
    c.lastAttackId = 'algum-golpe';

    benchCombatant(c);

    expect(c.stages).toEqual({ rigor: 0, didatica: 0, raciocinio: 0 });
    expect(c.shields).toEqual([]);
    expect(c.timedBuffs).toEqual([]);
    expect(c.regen).toEqual([]);
    expect(c.debuffImmuneTurns).toBe(0);
    expect(c.forceMiss).toBe(false);
    expect(c.usage).toEqual({});
    expect(c.lastAttackId).toBeNull();
  });
});

describe('leitura do time', () => {
  it('teamHp soma os vivos e conta caído como zero', () => {
    // HP negativo é comum: o último golpe passa do zero.
    const time = [membro('a', 50), membro('b', -12), membro('c', 30)];

    expect(teamHp(time)).toBe(80);
  });

  it('hasAlive vê o time inteiro, não só quem está em campo', () => {
    expect(hasAlive([membro('a', 0), membro('b', 1)])).toBe(true);
    expect(hasAlive([membro('a', 0), membro('b', -3)])).toBe(false);
  });

  it('nextAliveIndex pula o ativo e os caídos', () => {
    const time = [membro('a', 10), membro('b', 0), membro('c', 40)];

    expect(nextAliveIndex(time, 0)).toBe(2);
    expect(nextAliveIndex(time, 2)).toBe(0);
    expect(nextAliveIndex([membro('a', 10)], 0)).toBe(-1);
  });
});

describe('visões do exemplar', () => {
  // O preview revela professor e tipos porque é neles que a escolha de lead se
  // apoia. IVs e golpes ficariam com peso maior na cabeça do jogador do que no
  // combate — e entregam a leitura da partida.
  it('a visão pública não leva captureId, IVs nem golpes', () => {
    const view = publicMemberView(membro('mario', 60));

    expect(Object.keys(view).sort()).toEqual(
      ['fainted', 'hp', 'maxHp', 'professor', 'types'].sort(),
    );
  });

  it('a visão do dono acrescenta o captureId, que é como ele escolhe', () => {
    expect(ownMemberView(membro('mario'))).toHaveProperty(
      'captureId',
      'cap-mario',
    );
  });

  it('não vaza HP negativo para a UI', () => {
    expect(publicMemberView(membro('mario', -30)).hp).toBe(0);
    expect(isAlive(membro('mario', -30))).toBe(false);
  });
});
