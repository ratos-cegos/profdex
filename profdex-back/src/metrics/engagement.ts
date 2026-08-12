/**
 * Catálogo de interações e quanto cada uma vale.
 *
 * A régua é deliberadamente "inflada" em relação a uma rede social: aqui uma
 * interação não é um clique de curtida — capturar um professor exige estar
 * fisicamente diante do QR, e uma batalha consome minutos dos dois jogadores.
 * Os pesos refletem esse custo, senão o placar viraria contagem de logins.
 */

export const EVENT_TYPES = [
  'screen_view',
  'scan_open',
  'professor_discovered',
  'professor_captured',
  'battle_invite_sent',
  'battle_started',
  'battle_finished',
  'battle_won',
  'ranking_viewed',
  'guide_opened',
  'collection_completed',
  'quiz_answered',
  'quiz_correct',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

const EVENT_TYPE_SET: ReadonlySet<string> = new Set(EVENT_TYPES);

export function isEventType(value: string): value is EventType {
  return EVENT_TYPE_SET.has(value);
}

/**
 * Eventos que só o SERVIDOR registra.
 *
 * A ingestão (`POST /metrics/events`) aceita qualquer tipo que o app mandar —
 * sem esta lista, um aluno com o DevTools aberto forjaria capturas e batalhas
 * e lideraria o ranking de engajamento sem sair da cadeira. Estes eventos
 * nascem de fatos que o servidor conhece: a captura validada, o fim da
 * batalha, a resposta do quiz na bancada.
 */
const SERVER_ONLY_EVENTS: ReadonlySet<EventType> = new Set([
  'professor_discovered',
  'professor_captured',
  'battle_invite_sent',
  'battle_started',
  'battle_finished',
  'battle_won',
  'collection_completed',
  'quiz_answered',
  'quiz_correct',
]);

/** O app pode declarar este evento? */
export function isClientReportable(type: EventType): boolean {
  return !SERVER_ONLY_EVENTS.has(type);
}

/** Pontos por evento. Zero = registrado para análise, mas não pontua. */
export const ENGAGEMENT_POINTS: Record<EventType, number> = {
  screen_view: 0, // volume alto demais para pontuar; serve para navegação
  scan_open: 0, // abrir a câmera é intenção, não conquista
  professor_discovered: 20,
  professor_captured: 50,
  battle_invite_sent: 5,
  battle_started: 0, // a conclusão é que vale (evita farm de convite aceito)
  battle_finished: 80,
  battle_won: 30, // somado ao battle_finished
  ranking_viewed: 0,
  guide_opened: 0,
  collection_completed: 200,
  quiz_answered: 10, // encarar a bancada já vale, mesmo errando
  quiz_correct: 25, // somado ao quiz_answered
};

/** Bônus por iniciar a primeira sessão do dia. */
export const DAILY_SESSION_POINTS = 5;

/** Ponto por minuto ativo, com teto diário — ver TIME_POINTS_DAILY_CAP. */
export const POINTS_PER_ACTIVE_MINUTE = 1;

/**
 * Teto de pontos por tempo em um dia. Sem ele, deixar a aba aberta renderia
 * mais que jogar — e o ranking de engajamento mediria paciência, não uso.
 */
export const TIME_POINTS_DAILY_CAP = 60;

export function pointsFor(type: EventType): number {
  return ENGAGEMENT_POINTS[type];
}

// ── Interações ──────────────────────────────────────────────────────────────
//
// Número único para o relatório do evento: "quantas interações o app gerou?".
//
// É uma régua DIFERENTE do `engagementScore`, e de propósito. O score compara
// alunos entre si e por isso precisa de teto e de peso alto no que é difícil.
// A contagem de interações mede volume de atividade — a unidade é a curtida de
// uma rede social, e a pergunta é quantas delas cada gesto aqui equivale.
//
// Uma captura exige atravessar o campus até um QR: vale 15. Uma batalha
// completa consome minutos dos dois jogadores: vale 25 para cada lado. Trocar
// de tela vale 1, como um clique qualquer.

/** Quantas interações cada evento representa. */
export const INTERACTION_WEIGHTS: Record<EventType, number> = {
  screen_view: 1,
  scan_open: 2,
  professor_discovered: 5,
  professor_captured: 15,
  battle_invite_sent: 2,
  battle_started: 5,
  // `battle_won` não pontua: ele é gravado JUNTO com o `battle_finished` do
  // vencedor, e contar os dois faria a mesma batalha valer mais para um lado.
  battle_finished: 25,
  battle_won: 0,
  ranking_viewed: 1,
  guide_opened: 1,
  collection_completed: 50,
  quiz_answered: 10,
  quiz_correct: 0, // já contado no quiz_answered
};

/** Tamanho do bloco de tempo de uso convertido em interações. */
export const TIME_BLOCK_MINUTES = 10;

/**
 * Interações creditadas a cada bloco de tempo ATIVO (aba visível).
 *
 * Vale pouco por minuto de propósito: tempo aberto é presença, não atividade.
 * Se pesasse como uma captura, o total mediria quem esqueceu o app aberto.
 */
export const INTERACTIONS_PER_TIME_BLOCK = 5;

export function interactionsFor(type: EventType): number {
  return INTERACTION_WEIGHTS[type];
}

/** Rótulo de cada fonte de interação no painel. */
export const INTERACTION_SOURCE_LABELS: Record<EventType, string> = {
  screen_view: 'Telas visitadas',
  scan_open: 'Câmera aberta',
  professor_discovered: 'Professores descobertos',
  professor_captured: 'Professores capturados',
  battle_invite_sent: 'Convites de batalha',
  battle_started: 'Batalhas iniciadas',
  battle_finished: 'Batalhas concluídas',
  battle_won: 'Vitórias',
  ranking_viewed: 'Ranking consultado',
  guide_opened: 'Guia consultado',
  collection_completed: 'Coleções completadas',
  quiz_answered: 'Quiz respondido na bancada',
  quiz_correct: 'Quiz acertado',
};
