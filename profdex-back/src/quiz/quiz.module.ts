import { Module } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard';
import { MetricsModule } from '../metrics/metrics.module';
import { QuizPracticeController } from './quiz-practice.controller';
import { QuizPracticeService } from './quiz-practice.service';
import { QUIZ_RNG } from './quiz.constants';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';

/**
 * Quiz de bancada do evento. Depende do MetricsModule porque a resposta do
 * aluno é um evento de engajamento registrado pelo servidor.
 *
 * O mesmo módulo serve o Quiz Treino (`/quiz/treino`), que não compartilha
 * NADA com a bancada além do vocabulário de temas: banco de questões próprio
 * (`training_questions`), sem cooldown, sem tentativa persistida e sem
 * AdminGuard. A separação dos bancos é o que permite o treino devolver o
 * gabarito ao cliente sem entregar o do evento — ver `docs/QUIZ.md`.
 */
@Module({
  imports: [MetricsModule],
  controllers: [QuizController, QuizPracticeController],
  providers: [
    QuizService,
    QuizPracticeService,
    AdminGuard,
    { provide: QUIZ_RNG, useValue: Math.random },
  ],
})
export class QuizModule {}
