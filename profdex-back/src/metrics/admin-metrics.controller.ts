import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminMetricsService } from './admin-metrics.service';

/**
 * Painel administrativo — SOMENTE LEITURA.
 *
 * Todas as rotas são GET e não existe nenhum endpoint de escrita aqui: ser
 * administrador dá acesso a acompanhar métricas e absolutamente nada além do
 * que um aluno comum pode fazer.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/metrics')
export class AdminMetricsController {
  constructor(private metrics: AdminMetricsService) {}

  @Get('overview')
  overview() {
    return this.metrics.overview();
  }

  /**
   * Série horária. `metric` aceita os nomes gerados pelo rollup:
   * `logged_users`, `active_users`, `sessions_started`, `active_minutes`
   * e `event_<tipo>` (ex.: `event_professor_captured`).
   */
  @Get('series')
  series(
    @Query('metric', new DefaultValuePipe('logged_users')) metric: string,
    @Query('hours', new DefaultValuePipe(24), ParseIntPipe) hours: number,
  ) {
    return this.metrics.series(metric, hours);
  }

  /** Total de interações do evento e a composição desse número. */
  @Get('interactions')
  interactions() {
    return this.metrics.interactions();
  }

  @Get('funnel')
  funnel() {
    return this.metrics.funnel();
  }

  @Get('engagement')
  engagement(
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit: number,
  ) {
    return this.metrics.engagement(limit);
  }

  @Get('retention')
  retention() {
    return this.metrics.retentionD1();
  }
}
