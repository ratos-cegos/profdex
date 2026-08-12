import { TYPE_CYCLE } from '../battle/engine/types';

/**
 * Temas do quiz = tipos da roda de batalha. Não é coincidência: o aluno que
 * acerta uma questão de "banco" é mandado capturar um professor de "banco",
 * então as duas listas TÊM de ser a mesma.
 */
export const QUIZ_THEMES = TYPE_CYCLE;

export function isQuizTheme(value: string): boolean {
  return (QUIZ_THEMES as readonly string[]).includes(value);
}

export const QUIZ_DIFFICULTIES = ['facil', 'media', 'dificil'] as const;
export type QuizDifficulty = (typeof QUIZ_DIFFICULTIES)[number];

/** Tempo de resposta mostrado no tablet. */
export const ANSWER_WINDOW_MS = 60_000;

/**
 * Folga aceita além da janela.
 *
 * O relógio que vale é o do servidor, mas entre o clique e o request existem
 * rede e renderização. Sem a folga, quem responde no último segundo seria
 * marcado como "tempo esgotado" por causa da latência — injusto e péssimo de
 * explicar para o aluno parado na bancada.
 */
export const ANSWER_GRACE_MS = 3_000;

/** Cooldown por aluno e por tema. */
export const THEME_COOLDOWN_MS = 10 * 60_000;

/** Quantas questões recentes evitar repetir para o mesmo aluno no tema. */
export const AVOID_LAST_QUESTIONS = 5;
