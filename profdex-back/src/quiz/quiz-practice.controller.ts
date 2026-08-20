import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { QuizPracticeQueryDto } from './dto/quiz-practice.dto';
import { QuizPracticeService } from './quiz-practice.service';

/**
 * Quiz Treino — rotas do ALUNO, fora de `/admin/quiz/*`.
 *
 * Só `JwtAuthGuard`: quem está autenticado é o próprio aluno praticando. Não dá
 * para pendurar isso no `QuizController` porque lá a guarda é de classe
 * (`JwtAuthGuard, AdminGuard`) e, no Nest, `@UseGuards` de método SOMA à da
 * classe em vez de substituir — não existe "tirar o AdminGuard só nesta rota".
 *
 * Treinar não pontua, não captura e não entra em `quiz_attempts`; o placar
 * oficial e o cooldown da bancada ficam intocados.
 */
@UseGuards(JwtAuthGuard)
@Controller('quiz/treino')
export class QuizPracticeController {
  constructor(private treino: QuizPracticeService) {}

  /** Os 9 temas com a contagem de questões, para montar a grade de escolha. */
  @Get('themes')
  temas() {
    return this.treino.temas();
  }

  /** Uma rodada de questões do tema, já com o gabarito. */
  @Get('questions')
  questoes(@Query() query: QuizPracticeQueryDto) {
    return this.treino.questoes(query.theme, query.limit);
  }
}
