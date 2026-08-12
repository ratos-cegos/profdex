import { Module } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard';
import { MetricsModule } from '../metrics/metrics.module';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';

/**
 * Quiz de bancada do evento. Depende do MetricsModule porque a resposta do
 * aluno é um evento de engajamento registrado pelo servidor.
 */
@Module({
  imports: [MetricsModule],
  controllers: [QuizController],
  providers: [QuizService, AdminGuard],
})
export class QuizModule {}
