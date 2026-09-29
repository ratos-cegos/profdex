import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  MATRICULA_LONGA_MSG,
  MATRICULA_MAX_DIGITOS,
  MATRICULA_SO_DIGITOS_MSG,
  MATRICULA_VAZIA_MSG,
  normalizarMatricula,
} from '../../users/matricula';
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

  /**
   * Normalizada e SÓ DÍGITOS, porque é o que a bancada do quiz consegue
   * digitar. Antes aceitava qualquer texto, e o e-mail que o autofill do
   * celular oferece neste campo virava uma conta que a bancada nunca achava.
   * Ver `users/matricula.ts`.
   */
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizarMatricula(value) : value,
  )
  @IsNotEmpty({ message: MATRICULA_VAZIA_MSG })
  @Matches(/^[0-9]+$/, { message: MATRICULA_SO_DIGITOS_MSG })
  @MaxLength(MATRICULA_MAX_DIGITOS, { message: MATRICULA_LONGA_MSG })
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
