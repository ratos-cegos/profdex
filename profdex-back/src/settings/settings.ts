/**
 * Catálogo dos ajustes que o painel pode mudar com o evento no ar.
 *
 * Módulo PURO: sem Prisma, sem relógio. Faixa e padrão são regra de domínio e
 * precisam ser testáveis sem banco — e é a faixa que impede um dedo escorregado
 * de digitar "600" e congelar a bancada por dez horas.
 *
 * O que entra aqui: decisão de operação cujo valor certo depende do tamanho da
 * fila e ninguém sabe antes de abrir o estande. O que NÃO entra: regra que muda
 * o significado do dado — os 5 acertos do professor raro continuam constante de
 * código, porque um raro que exige 7 e outro 5 é regra que ninguém explica de
 * pé, na fila (tarefa 15, decisão 3).
 *
 * São DOIS tipos de ajuste, e o `kind` é o discriminante:
 *
 * - `number` — os dois cooldowns, usados como número (`* 60_000`). Virar tudo
 *   `string` para acomodar o terceiro espalharia `Number(...)` por todo código
 *   que lê cooldown.
 * - `enum` — uma escolha entre opções fixas, como o modo de entrega do QR.
 *   `AppSetting.value` já é `String` no schema, então isto não custa migração:
 *   o que muda é o catálogo e quem o lê.
 */

interface SettingBase {
  /** Chave em `app_settings`. */
  key: string;
  /** Rótulo e texto de apoio para o painel. */
  label: string;
  help: string;
}

/** Ajuste numérico com faixa: os dois cooldowns. */
export interface NumberSetting extends SettingBase {
  kind: 'number';
  /** Valor usado quando a linha não existe — o comportamento histórico. */
  default: number;
  min: number;
  max: number;
  unit: string;
}

/** Ajuste de escolha fechada. Sem `unit`: "ficha" não se mede em nada. */
export interface EnumSetting extends SettingBase {
  kind: 'enum';
  options: readonly string[];
  default: string;
}

export type SettingSpec = NumberSetting | EnumSetting;

export const SETTINGS = {
  /**
   * Espera por aluno e por tema na bancada.
   *
   * O teto de 120 não é capricho: o cooldown também é o TTL das questões
   * descartadas em memória (ver QuizService.descartadas), e um valor absurdo
   * faria esse mapa crescer o evento inteiro.
   */
  themeCooldownMinutes: {
    kind: 'number',
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
   * Quantas aplicações do tema uma questão fica fora do sorteio de TODOS.
   *
   * A bancada é UMA e a fila assiste: quem está atrás lê o enunciado e as
   * alternativas do aluno da frente. O filtro por aluno não alcança isso.
   *
   * É janela por CONTAGEM, e não bloqueio absoluto (decisão 1): bloquear de vez
   * esgotaria um tema de 40 questões em 40 aplicações, e aí o tema inteiro
   * cairia no modo "repete a mais antiga" — levando junto o filtro pessoal.
   *
   * `min: 0` é o interruptor de emergência: banco esgotando no meio do evento
   * se resolve zerando isto na hora, sem deploy.
   */
  quizGlobalRepeatWindow: {
    kind: 'number',
    key: 'quiz.global_repeat_window',
    default: 10,
    min: 0,
    max: 50,
    label: 'Janela sem repetir na fila',
    unit: 'aplicações',
    help:
      'Quantas aplicações do tema uma questão fica fora do sorteio para ' +
      'TODOS os alunos. A fila assiste quem está respondendo. 0 desliga.',
  },
  /**
   * Espera da DUPLA entre batalhas ranqueadas. É a trava anti win-trading:
   * sem ela, dois amigos alternando vitórias sobem o Elo sem jogar com mais
   * ninguém. Por isso o mínimo é 1h e não zero.
   */
  battlePairCooldownHours: {
    kind: 'number',
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
  /**
   * O corpo do lendário, em múltiplos dos 120 de HP de um professor normal.
   *
   * Este é o dial de dificuldade da raid inteira. A conta: o aluno leva até 3
   * exemplares (~375 de HP somado), então 2× ele passa quase sempre, 3× é moeda
   * justa e 4× exige tipo favorável e jogar bem.
   *
   * Ele tensiona a regra do topo deste arquivo — é regra de jogo, não só de
   * operação. Entra assim mesmo, e o motivo é datado: ninguém sabe se 4× é
   * justo até ver os vinte primeiros alunos tentarem, e a alternativa seria
   * descobrir que errou e precisar de um deploy no meio do evento para
   * consertar. O que continua sendo constante de código é o que muda o
   * SIGNIFICADO do resultado (quem vence no teto, o que consome cooldown).
   */
  raidHpMultiplier: {
    kind: 'number',
    key: 'raid.hp_multiplier',
    default: 4,
    min: 1,
    max: 10,
    label: 'Vida do lendário',
    unit: '× a vida de um professor',
    help:
      'Quantas vezes a vida de um professor normal (120) o lendário tem. ' +
      'O aluno leva até 3 exemplares, então 2× ele passa fácil, 3× é ' +
      'equilibrado e 4× exige jogar bem. Vale só para a próxima tentativa: ' +
      'raid já em andamento mantém o valor com que começou.',
  },
  /**
   * Os IVs do lendário na raid, iguais nos quatro atributos.
   *
   * Separado do multiplicador de propósito: HP e atributos são dois eixos de
   * dificuldade diferentes. Baixar os IVs deixa o chefe mais fraco sem encurtar
   * a luta; baixar o HP encurta a luta sem enfraquecê-lo.
   *
   * O teto é 15 porque é a escala do banco (o motor reescala para 0–5).
   */
  raidLegendaryIv: {
    kind: 'number',
    key: 'raid.legendary_iv',
    default: 15,
    min: 0,
    max: 15,
    label: 'Atributos do lendário',
    unit: 'de 15 em cada atributo',
    help:
      'Os IVs do chefe na raid, iguais nos quatro atributos. 15 é o máximo. ' +
      'Não mexe no exemplar que o aluno leva ao vencer, que é sempre 15.',
  },
  /**
   * Teto de turnos da raid. Maior que o do PvP (40) porque um chefe de 480 de
   * HP leva ~35 turnos para cair numa luta honesta — com o teto do PvP, o
   * relógio decidiria raids que o jogo ainda não tinha decidido.
   */
  raidTurnCap: {
    kind: 'number',
    key: 'raid.turn_cap',
    default: 60,
    min: 20,
    max: 200,
    label: 'Teto de turnos da raid',
    unit: 'turnos',
    help:
      'Quantos turnos a raid pode durar. No teto, o LENDÁRIO vence — ele ' +
      'resistiu. Suba se as raids estiverem acabando no relógio em vez de no ' +
      'nocaute.',
  },
  /**
   * Espera entre tentativas de raid, por aluno.
   *
   * `min: 0` é o interruptor de emergência, como na janela do quiz: se a fila
   * da raid estiver vazia e você quiser que os alunos insistam, zere isto.
   */
  raidCooldownMinutes: {
    kind: 'number',
    key: 'raid.cooldown_minutes',
    default: 30,
    min: 0,
    max: 240,
    label: 'Cooldown entre tentativas de raid',
    unit: 'minutos',
    help:
      'Quanto o aluno espera depois de PERDER uma raid. Conta do fim da ' +
      'tentativa. Vitória não gera espera (não há segunda captura), e queda ' +
      'de rede ou restart do servidor não consomem. 0 desliga.',
  },
  /**
   * Como a ficha de QR chega ao aluno que acertou.
   *
   * O padrão é `ficha`, que é o comportamento histórico: a mesa entrega o papel
   * sorteado da pilha. No modo `tela` o acerto gera na hora um QR vinculado ao
   * aluno (`capture_tokens.assignedToId`), que ele escaneia ali mesmo.
   *
   * A escolha depende de quantas fichas foram impressas e de como a fila está
   * andando — não pode virar deploy. **Papel já impresso continua valendo nos
   * dois modos** (decisão 12): são tokens independentes no banco, e o que está
   * no bolso do aluno não pode virar lixo por causa de um clique no painel.
   */
  captureQrMode: {
    kind: 'enum',
    key: 'capture.qr_mode',
    options: ['ficha', 'tela'] as const,
    default: 'ficha',
    label: 'Entrega do QR de captura',
    help:
      'ficha: a mesa entrega o papel sorteado da pilha. tela: o acerto ' +
      'gera na hora um QR vinculado ao aluno, que ele escaneia ali. ' +
      'Fichas já impressas continuam valendo nos dois modos.',
  },
} as const satisfies Record<string, SettingSpec>;

export type SettingName = keyof typeof SETTINGS;

export const SETTING_NAMES = Object.keys(SETTINGS) as SettingName[];

/**
 * O tipo do valor de cada ajuste, derivado do próprio catálogo.
 *
 * Um ajuste enum devolve a UNIÃO LITERAL das opções, não `string`: quem lê
 * `captureQrMode` recebe `'ficha' | 'tela'` e um `=== 'tel'` não compila.
 */
type ValueOf<S> = S extends { kind: 'enum'; options: readonly (infer O)[] }
  ? O
  : number;

export type SettingValue<N extends SettingName> = ValueOf<(typeof SETTINGS)[N]>;

export type SettingValues = { [N in SettingName]: SettingValue<N> };

/** Só os ajustes numéricos — é a eles que faixa e clamp fazem sentido. */
export type NumberSettingName = {
  [N in SettingName]: (typeof SETTINGS)[N] extends { kind: 'number' }
    ? N
    : never;
}[SettingName];

/**
 * Lê um valor de texto do banco já no tipo do ajuste.
 *
 * Valor ilegível cai no PADRÃO em vez de explodir — número fora da faixa é
 * grampeado, opção fora da lista vira o padrão. Esta função roda no caminho de
 * toda tentativa de quiz e de todo convite de batalha, e um registro corrompido
 * não pode derrubar o evento. Quem valida a entrada é o DTO, na fronteira;
 * aqui é a última rede.
 */
export function parseSetting<N extends SettingName>(
  name: N,
  raw: string | null,
): SettingValue<N> {
  const spec: SettingSpec = SETTINGS[name];

  // Texto vazio conta como AUSENTE, e não como zero: `Number('')` é 0, que é
  // finito e passaria direto para o clamp — uma linha vazia no banco viraria
  // o mínimo (1 minuto) em silêncio, em vez do padrão.
  if (raw === null || raw.trim() === '') return spec.default as SettingValue<N>;

  if (spec.kind === 'enum') {
    const escolha = raw.trim();
    return (
      spec.options.includes(escolha) ? escolha : spec.default
    ) as SettingValue<N>;
  }

  const valor = Number(raw);
  if (!Number.isFinite(valor)) return spec.default as SettingValue<N>;
  return clamp(spec, Math.round(valor)) as SettingValue<N>;
}

export function clampSetting(name: NumberSettingName, valor: number): number {
  return clamp(SETTINGS[name], valor);
}

export function isInRange(name: NumberSettingName, valor: number): boolean {
  const spec = SETTINGS[name];
  return Number.isInteger(valor) && valor >= spec.min && valor <= spec.max;
}

function clamp(spec: NumberSetting, valor: number): number {
  return Math.min(Math.max(valor, spec.min), spec.max);
}
