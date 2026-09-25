export const CAPTURE_RNG = Symbol('CAPTURE_RNG');
export type RandomSource = () => number;

export interface CaptureIvs {
  ivHp: number;
  ivRigor: number;
  ivDidatica: number;
  ivRaciocinio: number;
}

/** O teto de um IV: quatro deles é o que `starsFromIvs` lê como 5 estrelas. */
export const IV_MAX = 15;

export interface RollCaptureIvsOptions {
  /**
   * Exemplar de professor RARO: nasce no teto, sem sorteio (tarefa 16, decisão
   * 1). Estrela **é** IV neste jogo, então não existe "5 estrelas decorativas"
   * — a ficha mostra 5 porque os quatro atributos são 15 de verdade.
   *
   * Isto reverte a decisão 13 da tarefa 15, conscientemente (decisão 2): o raro
   * é no máximo 1/3 de um time e a conta é de 1 por aluno, então ele nunca é um
   * trunfo isolado no Elo.
   */
  rare?: boolean;
}

export function rollCaptureIvs(
  random: RandomSource,
  { rare = false }: RollCaptureIvsOptions = {},
): CaptureIvs {
  // Sai ANTES de tocar no RNG, de propósito: sortear e descartar deixaria a
  // distribuição da captura comum dependente da ordem das chamadas, e o teste
  // de sorteio passaria a quebrar por causa de uma captura rara em outro teste.
  if (rare) {
    return {
      ivHp: IV_MAX,
      ivRigor: IV_MAX,
      ivDidatica: IV_MAX,
      ivRaciocinio: IV_MAX,
    };
  }
  const roll = () => Math.max(0, Math.min(IV_MAX, Math.floor(random() * 16)));
  return {
    ivHp: roll(),
    ivRigor: roll(),
    ivDidatica: roll(),
    ivRaciocinio: roll(),
  };
}

export function starsFromIvs(ivs: CaptureIvs): number {
  const sum = ivs.ivHp + ivs.ivRigor + ivs.ivDidatica + ivs.ivRaciocinio;
  return Math.round((sum / 60) * 10) / 2;
}
