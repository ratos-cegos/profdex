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

/**
 * Proporção alvo de dificuldade, a mesma do seed (4 fáceis / 3 médias / 3
 * difíceis por tema).
 *
 * O sorteio escolhe a DIFICULDADE por estes pesos antes de escolher a questão,
 * renormalizando entre as dificuldades que ainda têm questão disponível. Sortear
 * uniformemente sobre o pool daria outra coisa: quem já respondeu as fáceis
 * cairia num pool quase só de difíceis e o quiz endureceria sozinho ao longo do
 * dia, justo para quem mais participou.
 */
export const QUIZ_DIFFICULTY_MIX: Readonly<Record<QuizDifficulty, number>> = {
  facil: 4,
  media: 3,
  dificil: 3,
};

/**
 * Fatia do fim da fila considerada quando o aluno já viu TODAS as questões do
 * tema: sorteia dentro do terço visto há mais tempo. Repetir a mais antiga
 * sempre seria previsível; repetir qualquer uma traria de volta a que ele
 * acabou de responder.
 */
export const REPEAT_OLDEST_FRACTION = 3;

/** RNG do quiz. Injetado para o teste conseguir fixar sorteio e embaralho. */
export const QUIZ_RNG = Symbol('QUIZ_RNG');
export type RandomSource = () => number;
