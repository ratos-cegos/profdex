import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminCaptureTokensService } from './admin-capture-tokens.service';
import {
  GenerateRareSheetDto,
  GenerateSheetDto,
} from './dto/generate-sheet.dto';

interface AuthedRequest extends Request {
  user: { id: string; matricula: string; name: string };
}

/**
 * Fichas de captura no painel.
 *
 * Diferente do `AdminMetricsController`, aqui existe ESCRITA: gerar ficha é
 * criar direito de captura. O `AdminGuard` é o mesmo que já protege julgar
 * errata e resgatar voucher — ações de peso equivalente. A trava real é o teto
 * de cópias do DTO e a linha de auditoria em `qr_batches`.
 *
 * A revogação de fichas não resgatadas NÃO tem rota: ela invalida papel que já
 * está no bolso de aluno e continua sendo operação de bastidor, só pela CLI
 * (`npm run qr:generate -- --revoke-unredeemed --yes`).
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/capture-tokens')
export class AdminCaptureTokensController {
  constructor(private fichas: AdminCaptureTokensService) {}

  /** Estoque: última tiragem em destaque + fichas vivas por tipo. */
  @Get()
  inventory() {
    return this.fichas.inventory();
  }

  /** Passo 1 dos dois: o plano da tiragem, sem gravar nada. */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(@Body() body: GenerateSheetDto) {
    return this.fichas.preview(body.copies, body.types);
  }

  /**
   * Passo 2: grava a tiragem e devolve a folha pronta.
   *
   * POST e não GET porque a chamada CRIA fichas — e devolve `text/html` porque
   * o cliente abre a resposta numa aba para imprimir. É a única vez que esses
   * QRs existem: o banco só guarda o hash.
   */
  @Post('batch')
  @HttpCode(HttpStatus.CREATED)
  @Header('Content-Type', 'text/html; charset=utf-8')
  async batch(
    @Req() request: AuthedRequest,
    @Body() body: GenerateSheetDto,
  ): Promise<string> {
    const { html } = await this.fichas.generate(
      request.user.id,
      body.copies,
      body.types,
      { allowEmpty: body.allowEmpty ?? false },
    );
    return html;
  }

  /**
   * A pilha de um professor raro. Rota separada da tiragem por tipo de
   * propósito: misturar as duas no mesmo papel acaba com o raro nos primeiros
   * 10 minutos de evento.
   *
   * Vale a mesma regra do `batch`: o banco só guarda o hash, então esta
   * resposta é a ÚNICA oportunidade de ver estes QRs. Ficha rara também não se
   * reimprime.
   */
  @Post('rare-batch')
  @HttpCode(HttpStatus.CREATED)
  @Header('Content-Type', 'text/html; charset=utf-8')
  async rareBatch(
    @Req() request: AuthedRequest,
    @Body() body: GenerateRareSheetDto,
  ): Promise<string> {
    const { html } = await this.fichas.generateRare(
      request.user.id,
      body.professorId,
      body.copies,
    );
    return html;
  }
}
