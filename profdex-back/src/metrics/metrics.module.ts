import { Module } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminMetricsController } from './admin-metrics.controller';
import { AdminMetricsService } from './admin-metrics.service';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { RollupService } from './rollup.service';

/**
 * Métricas de uso: ingestão (aluno) e leitura agregada (admin).
 *
 * `MetricsService` é exportado porque o resto do app registra eventos por ele —
 * a captura de professor e o fim de batalha, por exemplo, são gravados no
 * servidor, não pelo cliente, para não dependerem de um front honesto.
 */
@Module({
  controllers: [MetricsController, AdminMetricsController],
  providers: [MetricsService, RollupService, AdminMetricsService, AdminGuard],
  exports: [MetricsService],
})
export class MetricsModule {}
