/**
 * Catálogo dos ajustes que o painel pode mudar com o evento no ar.
 *
 * Módulo PURO: sem Prisma, sem relógio. Faixa e padrão são regra de domínio e
 * precisam ser testáveis sem banco — e é a faixa que impede um dedo escorregado
 * de digitar "600" e congelar a bancada por dez horas.
 *
 * O que entra aqui: número de operação, cujo valor certo depende do tamanho da
 * fila e ninguém sabe antes de abrir o estande. O que NÃO entra: regra que muda
 * o significado do dado — os 5 acertos do professor raro continuam constante de
 * código, porque um raro que exige 7 e outro 5 é regra que ninguém explica de
 * pé, na fila (tarefa 15, decisão 3).
 */

export interface SettingSpec {
  /** Chave em `app_settings`. */
  key: string;
  /** Valor usado quando a linha não existe — o comportamento histórico. */
  default: number;
  min: number;
  max: number;
  /** Rótulo e unidade para o painel. */
  label: string;
  unit: string;
  help: string;
}

export const SETTINGS = {
  /**
   * Espera por aluno e por tema na bancada.
   *
   * O teto de 120 não é capricho: o cooldown também é o TTL das questões
   * descartadas em memória (ver QuizService.descartadas), e um valor absurdo
   * faria esse mapa crescer o evento inteiro.
   */
  themeCooldownMinutes: {
    key: 'quiz.theme_cooldown_minutes',
    default: 10,
    min: 1,
    max: 120,
    label: 'Cooldown de tema',
    unit: 'minutos',
    help:
      'Quanto o aluno espera para tentar o MESMO tema de novo na bancada. ' +
      'Vale por aluno e por tema — ele pode ir para outro tema na hora. ' +
      'Diminuir acelera a fila; aumentar faz a tiragem de fichas durar mais.',
  },
  /**
   * Espera da DUPLA entre batalhas ranqueadas. É a trava anti win-trading:
   * sem ela, dois amigos alternando vitórias sobem o Elo sem jogar com mais
   * ninguém. Por isso o mínimo é 1h e não zero.
   */
  battlePairCooldownHours: {
    key: 'battle.pair_cooldown_hours',
    default: 12,
    min: 1,
    max: 72,
    label: 'Cooldown de batalha entre a mesma dupla',
    unit: 'horas',
    help:
      'Quanto a MESMA dupla espera para outra batalha ranqueada. É a trava ' +
      'anti win-trading: dois amigos alternando vitórias inflariam o Elo sem ' +
      'jogar com mais ninguém. Não afeta batalhar com outras pessoas.',
  },
} as const satisfies Record<string, SettingSpec>;

export type SettingName = keyof typeof SETTINGS;

export const SETTING_NAMES = Object.keys(SETTINGS) as SettingName[];

/**
 * Lê um valor de texto do banco como número dentro da faixa.
 *
 * Fora da faixa ou ilegível cai no PADRÃO em vez de explodir: esta função roda
 * no caminho de toda tentativa de quiz e de todo convite de batalha, e um
 * registro corrompido não pode derrubar o evento. Quem valida a entrada é o
 * DTO, na fronteira — aqui é a última rede.
 */
export function parseSetting(name: SettingName, raw: string | null): number {
  const spec = SETTINGS[name];
  // Texto vazio conta como AUSENTE, e não como zero: `Number('')` é 0, que é
  // finito e passaria direto para o clamp — uma linha vazia no banco viraria
  // o mínimo (1 minuto) em silêncio, em vez do padrão.
  if (raw === null || raw.trim() === '') return spec.default;

  const valor = Number(raw);
  if (!Number.isFinite(valor)) return spec.default;
  return clampSetting(name, Math.round(valor));
}

export function clampSetting(name: SettingName, valor: number): number {
  const spec = SETTINGS[name];
  return Math.min(Math.max(valor, spec.min), spec.max);
}

export function isInRange(name: SettingName, valor: number): boolean {
  const spec = SETTINGS[name];
  return Number.isInteger(valor) && valor >= spec.min && valor <= spec.max;
}
