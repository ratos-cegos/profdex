import { Module } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard';
import { MetricsModule } from '../metrics/metrics.module';
import { QuizPracticeController } from './quiz-practice.controller';
import { QuizPracticeService } from './quiz-practice.service';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';

/**
 * Quiz de bancada do evento. Depende do MetricsModule porque a resposta do
 * aluno é um evento de engajamento registrado pelo servidor.
 *
 * O mesmo módulo serve o Quiz Treino (`/quiz/treino`), que compartilha o banco
 * de questões mas nada do fluxo administrativo: sem cooldown, sem tentativa
 * persistida e sem AdminGuard.
 */
@Module({
  imports: [MetricsModule],
  controllers: [QuizController, QuizPracticeController],
  providers: [QuizService, QuizPracticeService, AdminGuard],
})
export class QuizModule {}
