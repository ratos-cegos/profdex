import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AbrirErrataDto,
  CorrigirQuestaoDto,
  ListarErrataQueryDto,
  ResolverErrataDto,
} from './dto/errata.dto';
import { ErrataService } from './errata.service';

interface AuthedRequest extends Request {
  user: { id: string; matricula: string; name: string };
}

/**
 * Errata — TODAS as rotas exigem administrador.
 *
 * Esta é a primeira escrita administrativa do painel (o resto é leitura, ver
 * docs/METRICAS.md) e a única superfície que devolve o GABARITO de uma questão.
 * Por isso a tela correspondente vive dentro do AdminLayout e a bancada
 * (`/admin/quiz/bancada`, virada para o aluno) não tem link para cá.
 *
 * Nenhuma rota aceita autoria pelo corpo: quem abriu e quem julgou saem sempre
 * de `request.user`.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/errata')
export class ErrataController {
  constructor(private errata: ErrataService) {}

  /** Abre a contestação: código de 4 dígitos + matrícula do aluno. */
  @Post()
  abrir(@Req() request: AuthedRequest, @Body() dto: AbrirErrataDto) {
    return this.errata.abrir(request.user.id, dto);
  }

  /** Fila de revisão. `?status=aberta` é o que a tela pede por padrão. */
  @Get()
  listar(@Query() query: ListarErrataQueryDto) {
    return this.errata.listar(query.status);
  }

  /** Julga: procedente emite o voucher e anula a tentativa. */
  @Patch(':id')
  resolver(
    @Req() request: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: ResolverErrataDto,
  ) {
    return this.errata.resolver(request.user.id, id, dto);
  }
}

/**
 * Correção da questão em si.
 *
 * Mora no módulo de errata, e não no de quiz, porque é o passo final do mesmo
 * fluxo: o admin só edita uma questão porque uma contestação mostrou que ela
 * está errada. Manter as duas coisas juntas é o que faz a regra "corrigir não
 * reprocessa tentativa" ficar escrita ao lado de quem a aplica.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/quiz/questions')
export class QuizQuestionsAdminController {
  constructor(private errata: ErrataService) {}

  @Patch(':id')
  corrigir(@Param('id') id: string, @Body() dto: CorrigirQuestaoDto) {
    return this.errata.corrigirQuestao(id, dto);
  }
}
