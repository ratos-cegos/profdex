import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { QUIZ_THEMES } from '../quiz.constants';

/**
 * Consulta do modo treino. O aluno vem da sessão, nunca do corpo/query — quem
 * está autenticado É quem pratica, ao contrário da bancada, onde o operador é o
 * autenticado e o aluno é digitado.
 */
export class QuizPracticeQueryDto {
  @IsIn(QUIZ_THEMES)
  theme!: string;

  /**
   * Quantas questões por rodada. O teto é o tamanho do banco por tema (10), mas
   * aceitamos até 20 para não quebrar se o seed crescer.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
