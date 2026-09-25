import { IV_MAX, rollCaptureIvs, starsFromIvs } from './capture-ivs';

describe('rollCaptureIvs', () => {
  /** RNG de mentira que CONTA os saques — é o que o raro não pode consumir. */
  function rng(valores: number[]) {
    let i = 0;
    const source = () => {
      i += 1;
      return valores[(i - 1) % valores.length];
    };
    return { source, saques: () => i };
  }

  it('sorteia os quatro atributos na faixa 0–15', () => {
    const { source } = rng([0, 0.5, 0.99, 0.25]);

    expect(rollCaptureIvs(source)).toEqual({
      ivHp: 0,
      ivRigor: 8,
      ivDidatica: 15,
      ivRaciocinio: 4,
    });
  });

  it('consome exatamente um saque por atributo', () => {
    const { source, saques } = rng([0.5]);

    rollCaptureIvs(source);

    expect(saques()).toBe(4);
  });

  /** Decisão 1 da tarefa 16: estrela é IV, não enfeite de ficha. */
  it('com `rare` devolve 15 nos quatro, que é 5 estrelas cheias', () => {
    const { source } = rng([0]);

    const ivs = rollCaptureIvs(source, { rare: true });

    expect(ivs).toEqual({
      ivHp: IV_MAX,
      ivRigor: IV_MAX,
      ivDidatica: IV_MAX,
      ivRaciocinio: IV_MAX,
    });
    expect(starsFromIvs(ivs)).toBe(5);
  });

  /**
   * O detalhe que sustenta o teste de distribuição acima: se o raro sorteasse e
   * descartasse, a sequência do RNG passaria a depender de quantos raros foram
   * capturados antes — e o comum quebraria por um motivo que não é dele.
   */
  it('o raro NÃO consome o RNG', () => {
    const { source, saques } = rng([0.5]);

    rollCaptureIvs(source, { rare: true });

    expect(saques()).toBe(0);
  });

  it('`rare: false` é o mesmo que não passar opção nenhuma', () => {
    const a = rng([0.1, 0.3, 0.7, 0.9]);
    const b = rng([0.1, 0.3, 0.7, 0.9]);

    expect(rollCaptureIvs(a.source, { rare: false })).toEqual(
      rollCaptureIvs(b.source),
    );
  });
});

describe('starsFromIvs', () => {
  it('conta meia estrela por vez, do zero ao teto', () => {
    const iguais = (v: number) => ({
      ivHp: v,
      ivRigor: v,
      ivDidatica: v,
      ivRaciocinio: v,
    });

    expect(starsFromIvs(iguais(0))).toBe(0);
    expect(starsFromIvs(iguais(8))).toBe(2.5);
    expect(starsFromIvs(iguais(IV_MAX))).toBe(5);
  });
});
