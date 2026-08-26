import { TRAINING_QUESTIONS } from '../../prisma/training-questions';
import { QUIZ_QUESTIONS } from '../../prisma/quiz-questions';
import { QUIZ_DIFFICULTIES, QUIZ_THEMES } from './quiz.constants';

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
  const MINIMO_POR_TEMA = 15;

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

  it('tem pelo menos 15 questões por tema, em todos os 9 temas', () => {
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
});
