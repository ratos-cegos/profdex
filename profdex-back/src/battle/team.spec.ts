import { createCombatant, STATUS } from './engine/engine';
import { EFFECT, buildMoveset } from './engine/moves';
import {
  benchCombatant,
  hasAlive,
  isAlive,
  movimentosAcumuladosVisiveis,
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
    professor: {
      id: `p-${name}`,
      slug: name,
      name,
      // A arte não muda nenhuma regra de time, mas é obrigatória no tipo de
      // propósito: foi omiti-la que fez o chefe da raid aparecer com a sprite
      // de outro professor (ver BattleProfessor).
      spriteFrontUrl: `/uploads/${name}-frente.png`,
      spriteBackUrl: `/uploads/${name}-costas.png`,
      modelUrl: `/uploads/${name}.glb`,
      pixelArt: false,
    },
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

  it('guarda os estágios de atributo e os usos de golpes acumulativos', () => {
    const c = membro('mario').combatant;
    c.stages = { rigor: 3, didatica: -2, raciocinio: 1 };
    c.usage = { 'algum-golpe': 4 };

    benchCombatant(c);

    expect(c.stages).toEqual({ rigor: 3, didatica: -2, raciocinio: 1 });
    expect(c.usage).toEqual({ 'algum-golpe': 4 });
  });

  it('limpa efeitos temporários de campo ao sair', () => {
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

    expect(c.stages).toEqual({ rigor: 3, didatica: -2, raciocinio: 1 });
    expect(c.shields).toEqual([]);
    expect(c.timedBuffs).toEqual([]);
    expect(c.regen).toEqual([]);
    expect(c.debuffImmuneTurns).toBe(0);
    expect(c.forceMiss).toBe(false);
    expect(c.usage).toEqual({ 'algum-golpe': 4 });
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
  // Estado já visível na batalha é público; IVs e golpes continuam privados.
  it('a visão pública mostra efeitos sem vazar captureId, IVs ou golpes', () => {
    const view = publicMemberView(membro('mario', 60));

    expect(Object.keys(view).sort()).toEqual(
      [
        'escudo',
        'fainted',
        'hp',
        'maxHp',
        'professor',
        'stages',
        'statusKind',
        'statusTurns',
        'types',
      ].sort(),
    );
    expect(view).not.toHaveProperty('moves');
    expect(view).not.toHaveProperty('movimentosAcumulados');
  });

  it('a visão do dono acrescenta o captureId, que é como ele escolhe', () => {
    expect(ownMemberView(membro('mario'))).toHaveProperty(
      'captureId',
      'cap-mario',
    );
  });

  it('mostra ao dono os bônus guardados em golpes acumulativos', () => {
    const member = membro('mario');
    member.moves = [
      {
        id: 'gradiente',
        name: 'Gradiente descendente',
        type: 'algoritmos',
        category: 'ataque',
        power: 75,
        accuracy: 0.75,
        effects: [
          { kind: EFFECT.GROW, inc: 15 },
          { kind: EFFECT.ACCURACY_GAIN, inc: 0.08 },
        ],
      } as TeamMember['moves'][number],
    ];
    member.combatant.usage.gradiente = 2;

    expect(ownMemberView(member).movimentosAcumulados).toEqual([
      {
        moveId: 'gradiente',
        name: 'Gradiente descendente',
        usos: 2,
        bonusPoder: 30,
        bonusPrecisao: 16,
      },
    ]);
  });

  it('resume apenas os golpes acumulativos que já foram usados', () => {
    const member = membro('mario');
    member.moves = [
      {
        id: 'gradiente',
        name: 'Gradiente descendente',
        type: 'algoritmos',
        category: 'ataque',
        power: 75,
        accuracy: 0.75,
        effects: [{ kind: EFFECT.GROW, inc: 15 }],
      } as TeamMember['moves'][number],
      {
        id: 'outro',
        name: 'Outro golpe',
        type: 'algoritmos',
        category: 'ataque',
        power: 20,
        accuracy: 1,
        effects: [{ kind: EFFECT.GROW, inc: 10 }],
      } as TeamMember['moves'][number],
    ];
    member.combatant.usage.gradiente = 1;

    expect(movimentosAcumuladosVisiveis(member)).toEqual([
      {
        moveId: 'gradiente',
        name: 'Gradiente descendente',
        usos: 1,
        bonusPoder: 15,
        bonusPrecisao: 0,
      },
    ]);
  });

  it('não vaza HP negativo para a UI', () => {
    expect(publicMemberView(membro('mario', -30)).hp).toBe(0);
    expect(isAlive(membro('mario', -30))).toBe(false);
  });
});
