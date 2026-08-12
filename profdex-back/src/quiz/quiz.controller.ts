import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AnswerQuizDto,
  QuizAttemptsQueryDto,
  StartQuizDto,
} from './dto/quiz.dto';
import { QuizService } from './quiz.service';

interface AuthedRequest extends Request {
  user: { id: string; matricula: string; name: string };
}

/**
 * Quiz de bancada — TODAS as rotas exigem administrador.
 *
 * Quem opera é o admin no tablet do estande; o aluno é identificado pela
 * matrícula digitada, não por uma sessão dele. Por isso o `user` do request é
 * sempre o operador, e o aluno vem no corpo.
 *
 * Isso não contradiz "admin só acompanha métricas": o quiz é operação de
 * evento, presencial, e não dá ao administrador nenhum poder sobre a conta do
 * aluno — nem captura professor por ele, nem altera pontuação.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/quiz')
export class QuizController {
  constructor(private quiz: QuizService) {}

  /** Temas com questões e os professores que cada um libera. */
  @Get('themes')
  themes() {
    return this.quiz.themes();
  }

  /** Cartão do aluno: nome, cooldowns em curso e histórico resumido. */
  @Get('aluno')
  aluno(@Query('matricula') matricula: string) {
    return this.quiz.aluno(matricula ?? '');
  }

  /** Sorteia a questão e abre a janela de 60s. */
  @Post('start')
  @HttpCode(HttpStatus.OK)
  start(@Body() dto: StartQuizDto) {
    return this.quiz.start(dto.matricula, dto.theme);
  }

  /** Confere, registra a tentativa e devolve o gabarito. */
  @Post('answer')
  @HttpCode(HttpStatus.OK)
  answer(@Req() request: AuthedRequest, @Body() dto: AnswerQuizDto) {
    return this.quiz.answer(request.user.id, dto.sessionId, dto.answerIndex);
  }

  @Get('attempts')
  attempts(@Query() query: QuizAttemptsQueryDto) {
    return this.quiz.attempts(query);
  }

  @Get('stats')
  stats() {
    return this.quiz.stats();
  }
}
