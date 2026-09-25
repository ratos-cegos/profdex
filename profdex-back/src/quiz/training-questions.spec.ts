import { TRAINING_QUESTIONS } from '../../prisma/training-questions';
import { QUIZ_QUESTIONS } from '../../prisma/quiz-questions';
import { QUIZ_DIFFICULTIES, QUIZ_THEMES } from './quiz.constants';
import {
  MARGEM_RESPOSTA_MAIS_LONGA,
  TETO_RAZAO_MEDIA,
  TETO_VISIVELMENTE_LONGA,
  excessoDaResposta,
  fatiaVisivelmenteLonga,
  razaoMediaDeTamanho,
} from './option-balance';

/**
 * Sanidade do banco de treino, verificada no CI.
 *
 * O arquivo é grande e pode ser regenerado por IA
 * (`npm run gen:quiz-treino`), então a revisão humana é por amostragem. Estes
 * testes cobrem o que a amostragem não pega: formato quebrado que apareceria
 * na tela do aluno, e — o que mais importa — questão oficial vazando para o
 * treino, que é a coisa que a tabela separada existe para impedir.
 */
describe('banco de questões do Quiz Treino', () => {
  const MINIMO_POR_TEMA = 30;

  it('não repete nenhum enunciado do banco OFICIAL', () => {
    // A unicidade do Prisma é por tabela, então um enunciado repetido entre os
    // dois bancos não daria erro no seed — vazaria em silêncio. O aluno veria
    // a questão da bancada, com o gabarito, antes de chegar no estande.
    const oficiais = new Set(QUIZ_QUESTIONS.map((q) => q.prompt.trim().toLowerCase()));
    const colisoes = TRAINING_QUESTIONS.filter((q) =>
      oficiais.has(q.prompt.trim().toLowerCase()),
    ).map((q) => q.prompt);

    expect(colisoes).toEqual([]);
  });

  it('não repete enunciado dentro do próprio banco', () => {
    // O enunciado é a chave única de `training_questions`: duplicata quebra o seed.
    const chaves = TRAINING_QUESTIONS.map((q) => q.prompt.trim().toLowerCase());
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it(`tem pelo menos ${MINIMO_POR_TEMA} questões por tema, nos 9 temas`, () => {
    const contagem = new Map<string, number>();
    for (const q of TRAINING_QUESTIONS) {
      contagem.set(q.theme, (contagem.get(q.theme) ?? 0) + 1);
    }
    const magros = QUIZ_THEMES.filter(
      (tema) => (contagem.get(tema) ?? 0) < MINIMO_POR_TEMA,
    );
    expect(magros).toEqual([]);
  });

  it('tem formato válido em todas as questões', () => {
    const invalidas = TRAINING_QUESTIONS.filter(
      (q) =>
        !(QUIZ_THEMES as readonly string[]).includes(q.theme) ||
        !(QUIZ_DIFFICULTIES as readonly string[]).includes(q.difficulty) ||
        q.prompt.trim().length === 0 ||
        q.prompt.length > 220 ||
        q.options.length !== 4 ||
        q.options.some((o) => o.trim().length === 0) ||
        new Set(q.options.map((o) => o.trim().toLowerCase())).size !== 4 ||
        !Number.isInteger(q.answer) ||
        q.answer < 0 ||
        q.answer >= q.options.length ||
        q.explanation.trim().length === 0,
    ).map((q) => q.prompt);

    expect(invalidas).toEqual([]);
  });

  // ── Equilíbrio das alternativas ────────────────────────────────────────────
  // A mesma regra do banco oficial (ver `option-balance.ts`). Aqui ela pesa
  // ainda mais: o treino é regenerado por IA, e modelo de linguagem tende a
  // caprichar na alternativa certa e despachar as erradas.

  it('não deixa a resposta certa se destacar pelo tamanho', () => {
    const entregues = TRAINING_QUESTIONS.filter(
      (q) => excessoDaResposta(q) > MARGEM_RESPOSTA_MAIS_LONGA,
    ).map((q) => `${q.prompt} (+${excessoDaResposta(q)} caracteres)`);

    expect(entregues).toEqual([]);
  });

  it('mantém o banco inteiro longe do padrão "a maior é a certa"', () => {
    expect(fatiaVisivelmenteLonga(TRAINING_QUESTIONS)).toBeLessThanOrEqual(
      TETO_VISIVELMENTE_LONGA,
    );
    expect(razaoMediaDeTamanho(TRAINING_QUESTIONS)).toBeLessThanOrEqual(
      TETO_RAZAO_MEDIA,
    );
  });
});
