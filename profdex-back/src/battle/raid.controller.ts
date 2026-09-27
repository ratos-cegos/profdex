import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RaidService } from './raid.service';

/**
 * O estado da raid para a Profdex desenhar (ou não) o card do lendário.
 *
 * REST e não socket de propósito: a Profdex é a primeira tela do app e não
 * abre conexão de batalha. Obrigá-la a conectar no `/battle` só para saber se
 * existe um card a mais custaria um WebSocket por aluno que nunca vai batalhar.
 *
 * A batalha em si é toda por socket, como o PvP — esta rota não inicia nada.
 */
@UseGuards(JwtAuthGuard)
@Controller('raid')
export class RaidController {
  constructor(private raid: RaidService) {}

  @Get('status')
  status(@Request() req: { user: { id: string } }) {
    return this.raid.status(req.user.id);
  }
}
