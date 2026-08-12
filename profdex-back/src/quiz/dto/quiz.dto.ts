import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { QUIZ_THEMES } from '../quiz.constants';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class StartQuizDto {
  @IsString()
  @Transform(trim)
  @Length(1, 40)
  matricula!: string;

  @IsIn(QUIZ_THEMES)
  theme!: string;
}

export class AnswerQuizDto {
  @IsString()
  @Length(1, 100)
  sessionId!: string;

  /**
   * Índice da alternativa escolhida, na ordem em que o tablet a exibiu.
   * Ausente = o operador desistiu ou o tempo acabou sem resposta.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9)
  answerIndex?: number;
}

export class QuizAttemptsQueryDto {
  @IsOptional()
  @IsIn(QUIZ_THEMES)
  theme?: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @Length(1, 40)
  matricula?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  correct?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(0)
  offset?: number;
}
