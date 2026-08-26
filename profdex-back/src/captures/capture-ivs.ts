export const CAPTURE_RNG = Symbol('CAPTURE_RNG');
export type RandomSource = () => number;

export interface CaptureIvs {
  ivHp: number;
  ivRigor: number;
  ivDidatica: number;
  ivRaciocinio: number;
}

export function rollCaptureIvs(random: RandomSource): CaptureIvs {
  const roll = () => Math.max(0, Math.min(15, Math.floor(random() * 16)));
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
