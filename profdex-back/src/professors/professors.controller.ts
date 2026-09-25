import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProfessorsService } from './professors.service';

@UseGuards(JwtAuthGuard)
@Controller('professors')
export class ProfessorsController {
  constructor(private professors: ProfessorsService) {}

  @Get()
  findAll(@Request() req: { user: { id: string } }) {
    return this.professors.findAll(req.user.id);
  }

  /**
   * Antes de `:id`, e isso não é estilo: o Nest casa as rotas na ordem de
   * declaração, e depois do parâmetro esta rota nunca seria alcançada —
   * "rares" chegaria como um id.
   */
  @Get('rares')
  findRares(@Request() req: { user: { id: string } }) {
    return this.professors.findRares(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.professors.findOne(id, req.user.id);
  }
}
