import {
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminMetricsService } from './admin-metrics.service';
import { buildMetricsReport } from './metrics-report';

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

  /**
   * Relatório de um DIA do evento — das 17h à meia-noite —, em HTML pronto
   * para o "Salvar como PDF" do navegador.
   *
   * `text/html` e não um PDF binário, no mesmo padrão da folha de fichas: ver a
   * explicação inteira em `metrics-report.ts`. Continua atrás do `AdminGuard`,
   * como todo o resto do painel — o relatório mostra o evento inteiro.
   *
   * `date` é `AAAA-MM-DD` e vem do seletor do painel. Sem o parâmetro, o dia é
   * HOJE no fuso do evento: é o caso de quem abre o relatório no fim da feira,
   * e fazer esse alguém digitar a data de hoje seria pedir cerimônia à toa.
   */
  @Get('report')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async report(@Query('date') date?: string): Promise<string> {
    return buildMetricsReport(
      await this.metrics.reportDoDia(date || hojeNoEvento()),
    );
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

  /**
   * Métricas do Quiz Treino. Rota separada de propósito: o treino não pontua,
   * não captura e não entra no ranking, então não pode dividir payload com as
   * métricas oficiais do evento.
   */
  @Get('practice-quiz')
  practiceQuiz(
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
  ) {
    return this.metrics.practiceQuiz(days);
  }

  @Get('retention')
  retention() {
    return this.metrics.retentionD1();
  }

  /**
   * Professores raros: quem capturou, quanto cada raro andou, e quem está a um
   * acerto de destravar.
   *
   * Aqui pode mostrar tudo — inclusive progresso, que a bancada não mostra. O
   * painel vive no `AdminLayout` e nunca fica virado para aluno; é justamente
   * ele a mitigação da bancada não ter aviso prévio (tarefa 15, decisão 16).
   */
  @Get('rares')
  rares() {
    return this.metrics.rares();
  }

  /**
   * A raid do lendário. Mesma justificativa da seção de raros para viver só
   * aqui — e uma a mais: a ordem de quem capturou primeiro vale um prêmio
   * físico, e publicá-la no app durante o evento desmotivaria todo mundo que
   * ainda não venceu (tarefa 18, decisão 20).
   */
  @Get('raid')
  raid() {
    return this.metrics.raid();
  }
}

/**
 * Hoje no fuso do evento, como `AAAA-MM-DD`.
 *
 * `en-CA` porque é o locale cujo formato de data já é ISO — evita remontar a
 * string a partir de partes. O fuso é explícito porque o servidor de produção
 * roda em UTC: às 22h de São Paulo lá já é o dia seguinte, e o relatório
 * abriria vazio justamente no fim da feira, que é quando ele é pedido.
 */
function hojeNoEvento(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
