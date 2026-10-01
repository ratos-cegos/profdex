import { createCombatant } from './engine/engine';
import { efeitosVisiveis } from './efeitos-visiveis';

const combatente = () =>
  createCombatant({ name: 'Prof', types: ['redes'], maxHp: 120 });

describe('efeitosVisiveis', () => {
  it('num combatente limpo, tudo é nulo ou zero', () => {
    expect(efeitosVisiveis(combatente())).toEqual({
      statusKind: null,
      statusTurns: null,
      stages: { rigor: 0, didatica: 0, raciocinio: 0 },
      escudo: null,
    });
  });

  it('manda o status CRU, não o rótulo traduzido', () => {
    // Quem escreve "Travado" é o front: a arena de treino roda o motor no
    // cliente e teria de repetir a tradução se ela nascesse aqui.
    const c = combatente();
    c.status = { kind: 'paralisia', turns: 3, power: 8 };

    const efeitos = efeitosVisiveis(c);

    expect(efeitos.statusKind).toBe('paralisia');
    expect(efeitos.statusTurns).toBe(3);
  });

  it('manda os três estágios, inclusive os negativos', () => {
    const c = combatente();
    c.stages = { rigor: 2, didatica: -1, raciocinio: 0 };

    expect(efeitosVisiveis(c).stages).toEqual({
      rigor: 2,
      didatica: -1,
      raciocinio: 0,
    });
  });

  it('os estágios são CÓPIA: o motor muta o objeto a cada turno', () => {
    // Mandando a referência, o payload mudaria depois de montado.
    const c = combatente();
    const efeitos = efeitosVisiveis(c);

    c.stages.rigor = 5;

    expect(efeitos.stages.rigor).toBe(0);
  });

  it('o escudo é o ÚLTIMO da pilha — o que o próximo golpe consome', () => {
    // `applyDamageWithShields` consome o mais recente. Mandar a pilha inteira
    // descreveria uma defesa que o motor não dá.
    const c = combatente();
    c.shields.push({ mode: 'reduce', amount: 0.5, turns: 2 });
    c.shields.push({ mode: 'block', amount: 1, turns: 2 });

    expect(efeitosVisiveis(c).escudo).toBe('block');
  });

  it('sem escudo na pilha, escudo é null', () => {
    const c = combatente();
    c.shields.push({ mode: 'block', amount: 1, turns: 2 });
    c.shields.pop();

    expect(efeitosVisiveis(c).escudo).toBeNull();
  });
});
