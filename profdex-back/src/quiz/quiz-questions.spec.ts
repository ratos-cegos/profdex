import { QUIZ_QUESTIONS } from '../../prisma/quiz-questions';
import {
  QUIZ_DIFFICULTIES,
  QUIZ_DIFFICULTY_MIX,
  QUIZ_THEMES,
} from './quiz.constants';

/**
 * Sanidade do banco OFICIAL, verificada no CI.
 *
 * O tamanho do banco deixou de ser detalhe quando o sorteio passou a excluir
 * tudo que o aluno já respondeu no tema: um tema magro faz o aluno esgotar as
 * inéditas e cair no modo de repetição no meio do evento. E como o sorteio
 * escolhe primeiro a DIFICULDADE (ver `QUIZ_DIFFICULTY_MIX`), um tema sem
 * nenhuma questão de uma das faixas silenciosamente muda o perfil do quiz.
 */
describe('banco de questões do quiz de bancada', () => {
  const MINIMO_POR_TEMA = 20;

  it(`tem pelo menos ${MINIMO_POR_TEMA} questões em cada um dos 9 temas`, () => {
    const contagem = new Map<string, number>();
    for (const q of QUIZ_QUESTIONS) {
      contagem.set(q.theme, (contagem.get(q.theme) ?? 0) + 1);
    }
    const magros = QUIZ_THEMES.filter(
      (tema) => (contagem.get(tema) ?? 0) < MINIMO_POR_TEMA,
    );

    expect(magros).toEqual([]);
  });

  it('cobre as três dificuldades em todos os temas', () => {
    const vazios: string[] = [];
    for (const tema of QUIZ_THEMES) {
      const doTema = QUIZ_QUESTIONS.filter((q) => q.theme === tema);
      for (const dificuldade of Object.keys(QUIZ_DIFFICULTY_MIX)) {
        if (!doTema.some((q) => q.difficulty === dificuldade)) {
          vazios.push(`${tema}/${dificuldade}`);
        }
      }
    }

    expect(vazios).toEqual([]);
  });

  it('não repete enunciado — é a chave única de quiz_questions', () => {
    const chaves = QUIZ_QUESTIONS.map((q) => q.prompt.trim().toLowerCase());
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it('tem formato válido em todas as questões', () => {
    // Um `answer` fora da faixa só apareceria na bancada, na frente do aluno:
    // o gabarito viraria `undefined` e nenhuma alternativa contaria como certa.
    const invalidas = QUIZ_QUESTIONS.filter(
      (q) =>
        !(QUIZ_THEMES as readonly string[]).includes(q.theme) ||
        !(QUIZ_DIFFICULTIES as readonly string[]).includes(q.difficulty) ||
        q.prompt.trim().length === 0 ||
        q.options.length !== 4 ||
        q.options.some((o) => o.trim().length === 0) ||
        new Set(q.options.map((o) => o.trim().toLowerCase())).size !== 4 ||
        !Number.isInteger(q.answer) ||
        q.answer < 0 ||
        q.answer >= q.options.length,
    ).map((q) => q.prompt);

    expect(invalidas).toEqual([]);
  });
});
