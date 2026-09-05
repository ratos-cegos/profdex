import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from '../password.constants';

/**
 * Dados que o aluno preenche depois de escolher a conta Google.
 *
 * Note que NÃO existe campo de papel/role aqui: ele é derivado do domínio do
 * e-mail dentro do ticket assinado. Aceitar isso do cliente permitiria que
 * qualquer um se cadastrasse como administrador.
 */
export class CompleteGoogleSignupDto {
  @IsString()
  @IsNotEmpty()
  ticket: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  matricula: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  password: string;
}

export class ForgotPasswordDto {
  /** Matrícula ou e-mail institucional. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  identifier: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  token: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  password: string;
}
