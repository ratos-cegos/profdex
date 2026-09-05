import { Module } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard';
import {
  ErrataController,
  QuizQuestionsAdminController,
} from './errata.controller';
import { ErrataService } from './errata.service';
import { VouchersController } from './vouchers.controller';

/**
 * Errata e vouchers de captura (ver docs/QUIZ.md).
 *
 * Módulo próprio, e não uma extensão do QuizModule, por coesão: o QuizService
 * já passa das 300 linhas recomendadas e a errata tem um ciclo de vida
 * inteiramente seu — abre na bancada, é julgada no painel, vira voucher e morre
 * num check na mesa. O que os dois compartilham é só o banco de questões.
 */
@Module({
  controllers: [
    ErrataController,
    QuizQuestionsAdminController,
    VouchersController,
  ],
  providers: [ErrataService, AdminGuard],
})
export class ErrataModule {}
