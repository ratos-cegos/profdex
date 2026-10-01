import { createCombatant, performMove, playerFirstChance, turnOrder, upkeep, IV_BONUS_MAX, ivBonus } from './engine';
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

  it('quem tem mais Velocidade sempre abre o turno', () => {
    // A ordem já foi uma moeda pesada pela Velocidade. Com fichas parecidas
    // ela parecia sorteada, e os alunos liam como "bate primeiro quem aperta
    // primeiro". Agora vale o número da ficha, por menor que seja a diferença.
    expect(playerFirstChance(duelistas(8, 7))).toBe(1);
    expect(playerFirstChance(duelistas(15, 9))).toBe(1);
    expect(playerFirstChance(duelistas(0, 15))).toBe(0);
  });

  it('empate exato de Velocidade é cara ou coroa', () => {
    expect(playerFirstChance(duelistas(9, 9))).toBe(0.5);
  });

  it('buff e debuff de Velocidade contam na ordem', () => {
    // É para isso que existem os golpes de Velocidade do movepool: um estágio
    // vale mais que o IV inteiro, então quem investe o turno compra a
    // iniciativa.
    const acelerado = duelistas(0, 15);
    acelerado.player.stages.raciocinio = 1;
    expect(playerFirstChance(acelerado)).toBe(1);

    const atrasado = duelistas(0, 15);
    atrasado.enemy.stages.raciocinio = -1;
    expect(playerFirstChance(atrasado)).toBe(1);
  });

  it('turnOrder segue a Velocidade, e só sorteia no empate', () => {
    // Guarda de fumaça: garante que a regra acima é a usada de fato.
    const maisRapido = duelistas(15, 0);
    for (let i = 0; i < 200; i++) {
      expect(turnOrder(maisRapido, null, null)[0].key).toBe('player');
    }

    const empatados = duelistas(9, 9);
    const lados = new Set<string>();
    for (let i = 0; i < 200; i++) {
      lados.add(turnOrder(empatados, null, null)[0].key);
    }
    expect([...lados].sort()).toEqual(['enemy', 'player']);
  });

  it('no pior caso (15/15/15/15 vs 0/0/0/0) o IV não decide a partida', () => {
    // Medido com n=6000: ~73% (era ~66% com a ordem sorteada). A iniciativa
    // garantida do exemplar perfeito custa esses pontos, e é o caso extremo:
    // entre alunos quaisquer (teste abaixo) o IV maior vence ~57%. O teto
    // folgado cobre o ruído de n=400.
    const taxa = taxaDeVitoriaDeA(
      { ivHp: 15, ivRigor: 15, ivDidatica: 15, ivRaciocinio: 15 },
      ZERO,
    );
    expect(taxa).toBeLessThan(80);
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
