import { createCombatant, effectiveStat, performMove, playerFirstChance, turnOrder, upkeep, IV_BONUS_MAX, ivBonus } from './engine';
import { buildMoveset } from './moves';
import type { Move } from './moves';
import type { BattleState } from './engine';

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
    const types = ['humanas'];
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
    expect(createCombatant({ name: 'x', types: ['humanas'], ivs: { ivHp: 15 } }).maxHp).toBe(125);
  });

  const duelistas = (ivA: number, ivB: number): BattleState =>
    ({
      player: createCombatant({ name: 'A', types: ['humanas'], ivs: { ...ZERO, ivRaciocinio: ivA } }),
      enemy: createCombatant({ name: 'B', types: ['humanas'], ivs: { ...ZERO, ivRaciocinio: ivB } }),
    }) as BattleState;

  it('não dá iniciativa permanente a quem tem 1 ponto a mais de velocidade', () => {
    // Este é o caso que quebrou antes: com ordem de turno em degrau, 1 ponto
    // de diferença garantia agir primeiro em todos os turnos, e valia ~69%.
    // Mesmo com o expoente, 1 ponto continua sendo quase uma moeda justa — é a
    // diferença GRANDE que precisa ser sentida, não qualquer diferença.
    const probabilidade = playerFirstChance(duelistas(8, 7));
    expect(probabilidade).toBeGreaterThan(0.5);
    expect(probabilidade).toBeLessThan(0.55);
  });

  it('o raro de velocidade perfeita abre o turno contra um comum bom', () => {
    // A regressão que trouxe esta mudança: aluno com raro de IV 15 (Velocidade
    // 105) relatando que um comum de IV 9 (103) batia primeiro. Com a razão
    // crua eram 50,5% — cara ou coroa sobre uma faixa de atributo que vai só de
    // 100 a 105. Se este número voltar para perto de 50%, a Velocidade voltou a
    // ser decorativa e o guia de batalha voltou a mentir.
    expect(playerFirstChance(duelistas(15, 9))).toBeGreaterThan(0.57);
  });

  it('mantém a velocidade relevante: 0 vs 15 pende forte, mas não é absoluto', () => {
    const state = duelistas(15, 0);

    // Determinístico de propósito: a probabilidade É a regra, e conferi-la
    // por amostragem tornaria o teste instável.
    const probabilidade = playerFirstChance(state);

    // Vantagem que o jogador sente, sem virar o degrau de antes (100%).
    expect(probabilidade).toBeGreaterThan(0.7);
    expect(probabilidade).toBeLessThan(0.8);
    // O ATRIBUTO continua curto: quem estica a faixa é o expoente, não o IV.
    expect(effectiveStat(state.player, 'raciocinio')).toBeLessThan(1.06);
  });

  it('um estágio de buff pesa mais que o IV inteiro', () => {
    // É para isso que existem os nove golpes de Velocidade do movepool: quem
    // investe um turno em acelerar (ou em atrasar o outro) compra a iniciativa,
    // e isso tem de valer mais do que a sorte da captura.
    const state = duelistas(0, 15);
    state.player.stages.raciocinio = 1;
    expect(playerFirstChance(state)).toBeGreaterThan(0.9);
  });

  it('turnOrder de fato sorteia com essa probabilidade', () => {
    // Guarda de fumaça: garante que a probabilidade acima é mesmo usada, e não
    // apenas calculável. Margem larga, para não virar teste instável.
    const state = duelistas(15, 0);

    let primeiroDoA = 0;
    for (let i = 0; i < 4000; i++) {
      if (turnOrder(state, null, null)[0].key === 'player') primeiroDoA++;
    }

    expect(primeiroDoA / 4000).toBeGreaterThan(0.69);
    expect(primeiroDoA / 4000).toBeLessThan(0.79);
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
