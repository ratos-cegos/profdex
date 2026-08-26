import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QUIZ_THEMES } from './quiz.constants';
import { embaralhar, lerAlternativas } from './quiz.service';

/** Quantas questões uma rodada de treino traz, quando o cliente não pede outro número. */
const QUESTOES_POR_RODADA = 10;

/**
 * Quiz Treino — o aluno praticando sozinho, no próprio celular.
 *
 * É deliberadamente o OPOSTO da bancada em três pontos, e cada um deles existe
 * para não contaminar o evento:
 *
 * 1. **Não grava `quiz_attempts`.** Aquela tabela sustenta o cooldown de 10min
 *    e o relatório do painel, e não tem coluna de modo; uma linha de treino ali
 *    bloquearia o tema do aluno na bancada e sujaria as estatísticas do evento.
 *    Além disso `operator_id` é NOT NULL — no treino não existe operador.
 * 2. **Não tem sessão em memória.** A bancada precisa dela para guardar o
 *    gabarito longe do tablet; aqui o gabarito vai junto (ver abaixo), então não
 *    há o que guardar. De quebra, evita esbarrar no `Map` da bancada, cujo
 *    `start()` apaga todas as sessões do mesmo aluno.
 * 3. **O gabarito vai junto com a questão.** No treino não há ponto, captura nem
 *    cooldown — não existe o que burlar, e devolver o índice correto de uma vez
 *    é o que permite corrigir na hora, sem round-trip a cada alternativa.
 *
 * O item 3 é justamente o que obriga o item zero: este serviço lê de
 * `training_questions`, **nunca** de `quiz_questions`. São bancos físicos
 * separados porque uma rota que devolve o gabarito não pode, em hipótese
 * alguma, alcançar a questão que vale captura no evento — um `where` esquecido
 * bastaria para acabar com o quiz da bancada. Ver `docs/QUIZ.md` e o teste
 * `quiz-practice.isolation.spec.ts`, que existe só para garantir isso.
 */
@Injectable()
export class QuizPracticeService {
  constructor(private prisma: PrismaService) {}

  /** Os 9 temas com quantas questões cada um tem disponível para treinar. */
  async temas() {
    const contagens = await this.prisma.trainingQuestion.groupBy({
      by: ['theme'],
      where: { active: true },
      _count: { _all: true },
    });

    const porTema = new Map(contagens.map((c) => [c.theme, c._count._all]));

    return QUIZ_THEMES.map((theme) => ({
      theme,
      questoes: porTema.get(theme) ?? 0,
    }));
  }

  /**
   * Uma rodada de treino: questões sorteadas do tema, sem repetir dentro do
   * lote, com as alternativas embaralhadas e o índice da correta já ajustado
   * para a ordem exibida.
   */
  async questoes(theme: string, limit?: number) {
    const questoes = await this.prisma.trainingQuestion.findMany({
      where: { theme, active: true },
      select: {
        id: true,
        theme: true,
        difficulty: true,
        prompt: true,
        options: true,
        answer: true,
        explanation: true,
      },
    });

    if (!questoes.length) {
      throw new NotFoundException(
        'Esse tema ainda não tem perguntas disponíveis.',
      );
    }

    const quantas = Math.min(limit ?? QUESTOES_POR_RODADA, questoes.length);
    const sorteadas = sortearSemRepetir(questoes, quantas);

    return {
      theme,
      questoes: sorteadas.map((q) => {
        const { options, correctIndex } = embaralhar(
          lerAlternativas(q.options),
          q.answer,
        );
        return {
          id: q.id,
          theme: q.theme,
          difficulty: q.difficulty,
          prompt: q.prompt,
          options,
          correctIndex,
          explanation: q.explanation,
        };
      }),
    };
  }
}

/**
 * Fisher-Yates parcial: embaralha só o começo do array e corta.
 *
 * Sortear com `Math.random()` a cada posição repetiria questão dentro da mesma
 * rodada — e ver a mesma pergunta duas vezes em dez é o tipo de coisa que faz o
 * aluno achar que o banco é menor do que é.
 */
function sortearSemRepetir<T>(itens: T[], quantas: number): T[] {
  const copia = [...itens];
  for (let i = 0; i < quantas; i++) {
    const j = i + Math.floor(Math.random() * (copia.length - i));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, quantas);
}
