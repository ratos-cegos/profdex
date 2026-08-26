import { createCombatant, effectiveStat, performMove, turnOrder, upkeep, IV_BONUS_MAX, ivBonus } from './engine';
import { buildMoveset } from './moves';
import type { BattleState, Move } from './engine';

/**
 * Guarda de balanceamento dos IVs no PvP ranqueado.
 *
 * O PvP é ranqueado por Elo: a diferença entre dois jogadores tem de continuar
 * sendo decisão, não sorte de captura. Este teste simula partidas com o motor
 * real e falha se os IVs voltarem a pesar demais — foi assim que a versão
 * original do recurso foi pega (teto 15 + ordem de turno em degrau davam 64%
 * de vitória para quem tirou o exemplar melhor).
 *
 * A simulação é barata (n=400) para caber no CI; a margem de tolerância abaixo
 * já leva em conta o ruído desse tamanho de amostra.
 */
describe('balanceamento dos IVs', () => {
  jest.setTimeout(60_000);

  const RODADAS = 400;
  /** Acima disto, o IV está decidindo a partida em vez de influenciá-la. */
  const TETO_VITORIA_DO_IV_MAIOR = 60;

  type Ivs = { ivHp: number; ivRigor: number; ivDidatica: number; ivRaciocinio: number };
  const ZERO: Ivs = { ivHp: 0, ivRigor: 0, ivDidatica: 0, ivRaciocinio: 0 };

  // Escolha de golpe uniforme dos dois lados: qualquer heurística introduziria
  // assimetria e mascararia justamente o efeito que queremos medir.
  const golpeAleatorio = (moves: Move[]) => moves[Math.floor(Math.random() * moves.length)];

  function duelar(a: Ivs, b: Ivs): 'A' | 'B' | 'empate' {
    // Espelho perfeito: mesmos tipos e mesmo deck. A única variável é o IV.
    const types = ['logica'];
    const moves = buildMoveset(types);
    const state = {
      player: createCombatant({ name: 'A', types, moves, ivs: a }),
      enemy: createCombatant({ name: 'B', types, moves, ivs: b }),
    } as BattleState;

    for (let turno = 0; turno < 300; turno++) {
      for (const entrada of turnOrder(state, golpeAleatorio(moves), golpeAleatorio(moves))) {
        const up = upkeep(state, entrada.key);
        if (state.player.hp <= 0) return 'B';
        if (state.enemy.hp <= 0) return 'A';
        if (up.canAct && entrada.move) performMove(state, entrada.key, entrada.move);
        if (state.player.hp <= 0) return 'B';
        if (state.enemy.hp <= 0) return 'A';
      }
    }
    return 'empate';
  }

  function taxaDeVitoriaDeA(a: Ivs, b: Ivs): number {
    let vitorias = 0;
    let decididas = 0;
    for (let i = 0; i < RODADAS; i++) {
      const r = duelar(a, b);
      if (r === 'empate') continue;
      decididas++;
      if (r === 'A') vitorias++;
    }
    return (vitorias / decididas) * 100;
  }

  it('converte o IV bruto 0–15 num bônus de no máximo IV_BONUS_MAX', () => {
    expect(ivBonus(0)).toBe(0);
    expect(ivBonus(15)).toBe(IV_BONUS_MAX);
    expect(ivBonus(undefined)).toBe(0);
    // O banco guarda a faixa larga; quem estreita é o motor.
    expect(createCombatant({ name: 'x', types: ['logica'], ivs: { ivHp: 15 } }).maxHp).toBe(125);
  });

  it('não dá iniciativa permanente a quem tem 1 ponto a mais de velocidade', () => {
    // Este é o caso que quebrou antes: com ordem de turno em degrau, 1 ponto
    // de diferença garantia agir primeiro em todos os turnos, e valia ~69%.
    const rapido = createCombatant({ name: 'A', types: ['logica'], ivs: { ...ZERO, ivRaciocinio: 8 } });
    const lento = createCombatant({ name: 'B', types: ['logica'], ivs: { ...ZERO, ivRaciocinio: 7 } });
    const state = { player: rapido, enemy: lento } as BattleState;

    let primeiroDoA = 0;
    for (let i = 0; i < 2000; i++) {
      if (turnOrder(state, null, null)[0].key === 'player') primeiroDoA++;
    }

    // Deve ficar perto de 50%, não em 100%.
    expect(primeiroDoA / 2000).toBeGreaterThan(0.4);
    expect(primeiroDoA / 2000).toBeLessThan(0.6);
  });

  it('mantém a velocidade relevante: 0 vs 15 pende, mas não decide', () => {
    const state = {
      player: createCombatant({ name: 'A', types: ['logica'], ivs: { ...ZERO, ivRaciocinio: 15 } }),
      enemy: createCombatant({ name: 'B', types: ['logica'], ivs: ZERO }),
    } as BattleState;

    // Determinístico de propósito: a probabilidade É a regra, e conferi-la
    // por amostragem tornaria o teste instável (com n=2000 e esperado 0,512,
    // um limite em 0,5 falharia sozinho de vez em quando).
    const ps = effectiveStat(state.player, 'raciocinio');
    const es = effectiveStat(state.enemy, 'raciocinio');
    const probabilidade = ps / (ps + es);

    // Vantagem real (acima de 50%) e limitada (bem longe dos 100% de antes).
    expect(probabilidade).toBeGreaterThan(0.5);
    expect(probabilidade).toBeLessThan(0.53);
    // E os estágios continuam pesando mais que o IV, como deve ser.
    expect(ps).toBeLessThan(1.06);
  });

  it('turnOrder de fato sorteia com essa probabilidade', () => {
    // Guarda de fumaça: garante que a probabilidade acima é mesmo usada, e não
    // apenas calculável. Margem larga, para não virar teste instável.
    const state = {
      player: createCombatant({ name: 'A', types: ['logica'], ivs: { ...ZERO, ivRaciocinio: 15 } }),
      enemy: createCombatant({ name: 'B', types: ['logica'], ivs: ZERO }),
    } as BattleState;

    let primeiroDoA = 0;
    for (let i = 0; i < 4000; i++) {
      if (turnOrder(state, null, null)[0].key === 'player') primeiroDoA++;
    }

    expect(primeiroDoA / 4000).toBeGreaterThan(0.45);
    expect(primeiroDoA / 4000).toBeLessThan(0.58);
  });

  it('no pior caso (15/15/15/15 vs 0/0/0/0) o IV não decide a partida', () => {
    const taxa = taxaDeVitoriaDeA(
      { ivHp: 15, ivRigor: 15, ivDidatica: 15, ivRaciocinio: 15 },
      ZERO,
    );
    expect(taxa).toBeLessThan(70);
  });

  it('entre jogadores aleatórios, o exemplar de IV maior não vence demais', () => {
    // A métrica que importa para o Elo: com dois alunos quaisquer, com que
    // frequência vence quem teve sorte na captura? 50% = irrelevante,
    // 100% = o ranking mede QR, não jogo.
    const sortear = (): Ivs => ({
      ivHp: Math.floor(Math.random() * 16),
      ivRigor: Math.floor(Math.random() * 16),
      ivDidatica: Math.floor(Math.random() * 16),
      ivRaciocinio: Math.floor(Math.random() * 16),
    });
    const soma = (i: Ivs) => i.ivHp + i.ivRigor + i.ivDidatica + i.ivRaciocinio;

    let vitoriasDoMelhor = 0;
    let decididas = 0;
    for (let i = 0; i < RODADAS; i++) {
      const a = sortear();
      const b = sortear();
      if (soma(a) === soma(b)) continue;
      const r = duelar(a, b);
      if (r === 'empate') continue;
      decididas++;
      if ((r === 'A') === soma(a) > soma(b)) vitoriasDoMelhor++;
    }

    const taxa = (vitoriasDoMelhor / decididas) * 100;
    expect(taxa).toBeLessThan(TETO_VITORIA_DO_IV_MAIOR);
  });
});
