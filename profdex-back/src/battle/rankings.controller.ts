import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RankingsService } from './rankings.service';

@UseGuards(JwtAuthGuard)
@Controller('rankings')
export class RankingsController {
  constructor(private rankings: RankingsService) {}

  @Get('battle')
  battle(
    @Request() req: { user: { id: string } },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    return this.rankings.battleLeaderboard(req.user.id, Math.max(1, page));
  }

  /** Quem resgatou mais exemplares. */
  @Get('captures')
  captures(
    @Request() req: { user: { id: string } },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    return this.rankings.capturesLeaderboard(req.user.id, Math.max(1, page));
  }

  /** Quem tem mais professores DISTINTOS — o ranking de completar a dex. */
  @Get('dex')
  dex(
    @Request() req: { user: { id: string } },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    return this.rankings.dexLeaderboard(req.user.id, Math.max(1, page));
  }
}
