import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BuscarVouchersQueryDto } from './dto/errata.dto';
import { ErrataService } from './errata.service';

interface AuthedRequest extends Request {
  user: { id: string; matricula: string; name: string };
}

/**
 * Vouchers de captura.
 *
 * Único controller do módulo com rota de ALUNO (`/me`), e por isso o AdminGuard
 * é aplicado rota a rota em vez de na classe. A rota do aluno não aceita
 * `userId` nem matrícula: ela lê o principal da sessão, ponto — do contrário
 * bastaria trocar um id na URL para ver o voucher de outra pessoa.
 */
@UseGuards(JwtAuthGuard)
@Controller('vouchers')
export class VouchersController {
  constructor(private errata: ErrataService) {}

  /** Os vouchers disponíveis do próprio aluno — o sino da ProfDex. */
  @Get('me')
  meus(@Req() request: AuthedRequest) {
    return this.errata.meusVouchers(request.user.id);
  }

  /** Busca por matrícula, para o operador dar o check na mesa. */
  @UseGuards(AdminGuard)
  @Get()
  buscar(@Query() query: BuscarVouchersQueryDto) {
    return this.errata.vouchersDoAluno(query.matricula);
  }

  /** Check do operador: marca como usado. Resgatar de novo dá 409. */
  @UseGuards(AdminGuard)
  @Post(':id/redeem')
  @HttpCode(HttpStatus.OK)
  resgatar(@Req() request: AuthedRequest, @Param('id') id: string) {
    return this.errata.resgatar(request.user.id, id);
  }
}
